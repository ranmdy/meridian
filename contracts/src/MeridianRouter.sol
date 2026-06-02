// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IMeridianRouter} from "./IMeridianRouter.sol";

/// @title MeridianRouter
/// @notice Non-custodial cross-chain DeFi strategy executor.
///         Deployed once per supported chain. Funds flow through atomically —
///         Meridian never holds funds beyond the duration of a single transaction
///         (except during cross-chain bridge wait periods).
///
/// @dev Security properties:
///      - No admin withdrawal functions — owner can only update relayer, fee config,
///        and the protocol allowlist.
///      - emergencyExit returns exactly the per-strategy tracked amount to SOURCE wallet,
///        never the full contract balance, never to destination.
///      - destinationSignature is bound to msg.sender + deadline — cannot be reused by
///        a different user or after expiry.
///      - All external calls are gated by an on-chain protocol allowlist (approvedProtocols).
///      - All external calls wrapped with ReentrancyGuard.
///      - Slippage enforced via minOutput on every SWAP step.
///      - Strategy deadline reverts stale submissions.
///      - Step failure triggers graceful fund-return rather than full revert, so the
///        StrategyFailed event is reliably emitted.
///      - Full steps array is hashed at submission and re-verified by the relayer on
///        continuation — relayer cannot supply different steps than the user signed.
contract MeridianRouter is IMeridianRouter, ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Protocol execution fee in basis points (0.08% = 8 bps).
    /// @notice Fee for direct strategies (no creator): 8 bps (0.08%) to treasury.
    uint256 public constant FEE_BPS = 8;

    /// @notice Creator share for marketplace strategies: 2 bps (0.02%) to creator.
    uint256 public constant CREATOR_FEE_BPS = 2;

    /// @notice Meridian share for marketplace strategies: 3 bps (0.03%) to treasury.
    ///         Total marketplace fee = CREATOR_FEE_BPS + MERIDIAN_FEE_BPS = 5 bps (0.05%).
    uint256 public constant MERIDIAN_FEE_BPS = 3;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Maximum steps per strategy — prevents gas-limit DoS.
    uint256 public constant MAX_STEPS = 20;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Address authorized to call continueStrategy (cross-chain relayer).
    address public relayer;

    /// @notice Treasury address that receives execution fees.
    address public treasury;

    /// @notice Allowlist of external protocol contracts the router may call.
    ///         Only owner can add/remove. Prevents arbitrary external call abuse.
    mapping(address => bool) public approvedProtocols;

    /// @notice Per-strategy execution state.
    struct StrategyState {
        address user;               // original depositor
        address sourceAsset;        // token deposited (for reference / events)
        uint256 sourceAmount;       // initial working amount (post-fee, for reference)
        address currentAsset;       // current working asset — updated after each swap/bridge
        uint256 currentAmount;      // current working amount — updated after each step
        uint256 currentStep;        // next step to execute
        uint256 totalSteps;         // total steps in strategy
        bool isActive;
        bool isFailed;
        address destinationWallet;
        bytes32 stepsHash;          // keccak256(abi.encode(steps)) — verified by relayer
    }

    mapping(bytes32 => StrategyState) private _strategies;

    // strategyId → step index → amount out (for audit trail)
    mapping(bytes32 => mapping(uint256 => uint256)) private _stepOutputs;

    // Per-user nonce — used in strategyId derivation so IDs are deterministic
    // and collision-free across blocks and time.
    mapping(address => uint256) public userNonces;

    // ─── Errors ───────────────────────────────────────────────────────────────

    error DeadlineExpired();
    error InvalidDestinationSignature();
    error ZeroAddress();
    error ZeroAmount();
    error StepsLimitExceeded();
    error StrategyNotActive();
    /// @dev Replaces StrategyAlreadyActive. Fires if the strategyId was ever initialized
    ///      (active, completed, or failed) — prevents slot reuse and history corruption.
    error StrategyUsed();
    error NotRelayer();
    error NotStrategyOwner();
    error SlippageExceeded(uint256 received, uint256 minimum);
    error InvalidStepIndex();
    error StepsHashMismatch();
    error FeeTransferFailed();
    error UnsupportedStepType();
    error ETHAmountMismatch();
    error ProtocolNotApproved(address protocol);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _relayer   Initial relayer address.
    /// @param _treasury  Address that receives the 0.08% execution fee.
    constructor(address _relayer, address _treasury) Ownable(msg.sender) {
        if (_relayer == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        relayer = _relayer;
        treasury = _treasury;
    }

    // ─── Core: executeStrategy ────────────────────────────────────────────────

    /// @inheritdoc IMeridianRouter
    /// @notice Initiates execution of a multi-step DeFi strategy.
    /// @dev    Pulls `strategy.sourceAmount` of `strategy.sourceAsset` from `msg.sender`,
    ///         deducts the 0.08% protocol fee, then begins synchronous step execution.
    ///         Pauses at the first BRIDGE step and waits for the off-chain relayer to call
    ///         `continueStrategy` after the bridge transaction confirms on the destination chain.
    ///
    ///         The destination signature is bound to msg.sender and strategy.deadline —
    ///         it cannot be reused by a different user or after the deadline passes.
    ///
    ///         All step protocol addresses must be in the approvedProtocols allowlist.
    ///         Steps beyond MAX_STEPS are rejected to prevent gas-limit DoS.
    // State is written before external calls (CEI). Mid-loop state updates in _executeStepsFrom
    // are intentional to track per-step progress for emergencyExit. nonReentrant on this function
    // and continueStrategy prevents any reentrant call from reaching _executeStepsFrom.
    // slither-disable-start reentrancy-eth,reentrancy-no-eth,reentrancy-benign
    function executeStrategy(Strategy calldata strategy)
        external
        payable
        override
        nonReentrant
    {
        // 1. Deadline check
        if (block.timestamp > strategy.deadline) revert DeadlineExpired();

        // 2. Basic input validation
        if (strategy.destinationWallet == address(0)) revert ZeroAddress();
        if (strategy.sourceAmount == 0) revert ZeroAmount();
        if (strategy.steps.length == 0) revert ZeroAmount();
        if (strategy.steps.length > MAX_STEPS) revert StepsLimitExceeded();

        // 3. Destination wallet ownership verification — bound to msg.sender + deadline
        //    to prevent signature reuse across users or time.
        if (!_verifyDestination(
            strategy.destinationWallet,
            strategy.destinationSignature,
            msg.sender,
            strategy.deadline
        )) {
            revert InvalidDestinationSignature();
        }

        // 4. Derive deterministic strategyId using a per-user nonce.
        //    The nonce is incremented here so the ID is unique even if all other
        //    params repeat (e.g. same user, same deadline, same amounts).
        bytes32 strategyId = _deriveStrategyId(msg.sender, strategy);

        // 5. Prevent replay — reject if this slot was ever initialized.
        //    Checks user != address(0) rather than isActive so completed/failed
        //    strategies cannot be overwritten.
        if (_strategies[strategyId].user != address(0)) revert StrategyUsed();

        // 6. Pull source asset from user
        if (strategy.sourceAsset == address(0)) {
            // Native ETH
            if (msg.value != strategy.sourceAmount) revert ETHAmountMismatch();
        } else {
            IERC20(strategy.sourceAsset).safeTransferFrom(
                msg.sender, address(this), strategy.sourceAmount
            );
        }

        // 7. Deduct execution fee upfront.
        //    Direct strategies (creator == address(0)): full 8 bps to treasury.
        //    Marketplace strategies (creator != address(0)): 2 bps to creator + 3 bps to treasury.
        bool isMarketplace = strategy.creator != address(0);
        uint256 fee = isMarketplace
            ? (strategy.sourceAmount * (CREATOR_FEE_BPS + MERIDIAN_FEE_BPS)) / BPS_DENOMINATOR
            : (strategy.sourceAmount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 workingAmount = strategy.sourceAmount - fee;

        // 8. Record strategy state before any external calls (CEI: checks-effects-interactions).
        //    State is written here so that any reentrant call (even if nonReentrant allows it
        //    via a different entry point) sees a fully-initialized strategy slot and cannot
        //    corrupt or replay it.
        _strategies[strategyId] = StrategyState({
            user: msg.sender,
            sourceAsset: strategy.sourceAsset,
            sourceAmount: workingAmount,
            currentAsset: strategy.sourceAsset,
            currentAmount: workingAmount,
            currentStep: 0,
            totalSteps: strategy.steps.length,
            isActive: true,
            isFailed: false,
            destinationWallet: strategy.destinationWallet,
            stepsHash: keccak256(abi.encode(strategy.steps))
        });

        emit StrategyStarted(
            strategyId,
            msg.sender,
            strategy.sourceAmount,
            strategy.sourceAsset,
            strategy.destinationWallet
        );

        // 9. Transfer fee to treasury / creator (external call — after state write).
        _transferFee(strategyId, strategy.sourceAsset, fee, strategy.creator);

        // 10. Execute synchronous steps until a BRIDGE step is reached
        _executeStepsFrom(strategyId, strategy.steps, 0, workingAmount);
    }
    // slither-disable-end reentrancy-eth,reentrancy-no-eth,reentrancy-benign

    // ─── Core: continueStrategy ───────────────────────────────────────────────

    /// @inheritdoc IMeridianRouter
    /// @notice Called by the off-chain relayer after a bridge step confirms on the destination chain.
    /// @dev    Only the registered `relayer` address can call this function.
    ///         `stepIndex` must equal `state.currentStep` to prevent out-of-order execution.
    ///         `steps` is verified against the stored stepsHash — the relayer cannot substitute
    ///         different steps than the user originally submitted.
    ///         `bridgedAmount` is the actual amount received on this chain after bridge fees/slippage.
    // Same rationale as executeStrategy: mid-loop state updates track per-step progress.
    // onlyRelayer + nonReentrant prevent unauthorized or reentrant calls.
    // slither-disable-start reentrancy-eth,reentrancy-no-eth,reentrancy-benign
    function continueStrategy(
        bytes32 strategyId,
        uint256 stepIndex,
        Step[] calldata steps,
        uint256 bridgedAmount
    )
        external
        override
        onlyRelayer
        nonReentrant
    {
        StrategyState storage state = _strategies[strategyId];
        if (!state.isActive || state.isFailed) revert StrategyNotActive();
        if (stepIndex != state.currentStep) revert InvalidStepIndex();

        // Verify the relayer is supplying the exact same steps the user originally signed.
        if (keccak256(abi.encode(steps)) != state.stepsHash) revert StepsHashMismatch();

        // Update the working amount to reflect what actually arrived post-bridge.
        state.currentAmount = bridgedAmount;

        // Apply the bridge step's declared output asset (if the bridge changes the asset).
        // stepIndex points to the step AFTER the bridge; the bridge is at stepIndex - 1.
        if (stepIndex > 0 && steps[stepIndex - 1].outputAsset != address(0)) {
            state.currentAsset = steps[stepIndex - 1].outputAsset;
        }

        // Continue execution from the step after the bridge.
        // _executeStepsFrom manages state.currentStep internally.
        _executeStepsFrom(strategyId, steps, stepIndex, bridgedAmount);
    }
    // slither-disable-end reentrancy-eth,reentrancy-no-eth,reentrancy-benign

    // ─── Core: emergencyExit ──────────────────────────────────────────────────

    /// @inheritdoc IMeridianRouter
    /// @notice Immediately terminates a stuck strategy and returns funds to the original depositor.
    /// @dev    Only callable by the original strategy owner (`state.user`).
    ///         Returns `state.currentAmount` of `state.currentAsset` — exactly what the
    ///         strategy currently holds — NEVER the full contract balance and NEVER to
    ///         the destination wallet.
    ///         Uses CEI pattern — state is updated before the external transfer.
    ///
    ///         If the strategy is paused mid-bridge (funds are in the bridge protocol
    ///         on another chain), `state.currentAmount` reflects the pre-bridge balance.
    ///         In production bridge adapters should zero `state.currentAmount` once
    ///         funds leave the router, so this call returns 0 in that case.
    function emergencyExit(bytes32 strategyId)
        external
        override
        nonReentrant
    {
        StrategyState storage state = _strategies[strategyId];

        // Only the original depositor can trigger emergency exit
        if (msg.sender != state.user) revert NotStrategyOwner();
        if (!state.isActive) revert StrategyNotActive();

        // Capture per-strategy tracked values before state change
        uint256 amount = state.currentAmount;
        address asset  = state.currentAsset;

        // Mark as failed / inactive and zero the tracked amount before external call (CEI)
        state.isActive = false;
        state.isFailed = true;
        state.currentAmount = 0;

        // Return the per-strategy tracked amount to SOURCE wallet — NEVER full balance,
        // NEVER to destination wallet.
        if (amount > 0) {
            if (asset == address(0)) {
                (bool ok,) = state.user.call{value: amount}("");
                require(ok, "ETH return failed");
            } else {
                IERC20(asset).safeTransfer(state.user, amount);
            }
        }

        emit EmergencyExitTriggered(strategyId, state.user, amount);
    }

    // ─── View ──────────────────────────────────────────────────────────────────

    /// @inheritdoc IMeridianRouter
    function strategyStatus(bytes32 strategyId)
        external
        view
        override
        returns (uint256 currentStep, bool isActive, bool isFailed)
    {
        StrategyState storage s = _strategies[strategyId];
        return (s.currentStep, s.isActive, s.isFailed);
    }

    // ─── Admin (no user-fund access) ─────────────────────────────────────────

    /// @notice Update the authorized relayer address.
    /// @dev    Owner-only. Does NOT affect in-flight strategies — only future
    ///         `continueStrategy` calls. Rotate immediately if relayer key is compromised.
    function setRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        address old = relayer;
        relayer = newRelayer;
        emit RelayerUpdated(old, newRelayer);
    }

    /// @notice Update the fee treasury address.
    /// @dev    Owner-only. Fees already collected are unaffected.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    /// @notice Add or remove a protocol from the execution allowlist.
    /// @dev    Owner-only. Only approved protocols can be called as step targets.
    ///         This is the primary defense against arbitrary external call attacks.
    /// @param protocol The protocol contract address to approve or revoke.
    /// @param approved True to allow, false to revoke.
    function setProtocolApproved(address protocol, bool approved) external onlyOwner {
        if (protocol == address(0)) revert ZeroAddress();
        approvedProtocols[protocol] = approved;
        emit ProtocolApprovalUpdated(protocol, approved);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @notice Execute steps sequentially starting at `fromIndex`.
    ///         Pauses (returns) if a BRIDGE step is reached.
    ///         On step failure: marks strategy failed, emits StrategyFailed,
    ///         returns the current tracked amount to the user, then returns.
    /// @dev    Slither flags reentrancy-eth / reentrancy-no-eth here because state variables
    ///         (currentStep, currentAmount, currentAsset) are updated BETWEEN external calls
    ///         inside the loop. This is intentional: progress must be tracked per-step so that
    ///         emergencyExit returns the correct mid-execution amount. All external calls are
    ///         gated by the approvedProtocols allowlist, and executeStrategy / continueStrategy
    ///         are both nonReentrant — no reentrant call can reach this function.
    // slither-disable-start reentrancy-eth,reentrancy-no-eth,reentrancy-benign
    function _executeStepsFrom(
        bytes32 strategyId,
        Step[] calldata steps,
        uint256 fromIndex,
        uint256 amountIn
    ) internal {
        StrategyState storage state = _strategies[strategyId];
        uint256 currentAmount = amountIn;

        for (uint256 i = fromIndex; i < steps.length; i++) {
            Step calldata step = steps[i];

            if (step.stepType == StepType.BRIDGE) {
                // Pause here — relayer will call continueStrategy after confirmation.
                // Update state so emergencyExit during the bridge wait returns the correct amount.
                state.currentStep = i + 1;
                state.currentAmount = currentAmount;
                if (step.outputAsset != address(0)) {
                    state.currentAsset = step.outputAsset;
                }
                _stepOutputs[strategyId][i] = currentAmount;
                emit StepExecuted(strategyId, i, StepType.BRIDGE, step.protocol, currentAmount);
                return;
            }

            // Protocol approval check — skip for address(0) (SETTLE steps have no protocol).
            if (step.protocol != address(0) && !approvedProtocols[step.protocol]) {
                revert ProtocolNotApproved(step.protocol);
            }

            (bool stepOk, uint256 amountOut) = _executeStep(strategyId, i, step, currentAmount);

            if (!stepOk) {
                _failStrategy(strategyId, state, i, currentAmount, "StepFailed");
                return;
            }

            if (amountOut < step.minOutput) {
                _failStrategy(strategyId, state, i, currentAmount, "SlippageExceeded");
                return;
            }

            // Update per-strategy state after each successful step (CEI: state before emit)
            _stepOutputs[strategyId][i] = amountOut;
            state.currentAmount = amountOut;
            if (step.outputAsset != address(0)) {
                state.currentAsset = step.outputAsset;
            }
            state.currentStep = i + 1;
            currentAmount = amountOut;

            emit StepExecuted(strategyId, i, step.stepType, step.protocol, amountOut);
        }

        // All steps complete — settle to destination
        _settle(strategyId, state, currentAmount);
    }
    // slither-disable-end reentrancy-eth,reentrancy-no-eth,reentrancy-benign

    /// @notice Mark a strategy as failed, return current funds to user, and emit StrategyFailed.
    /// @dev    Called from `_executeStepsFrom` on step failure or slippage breach.
    ///         Follows CEI: state updated and event emitted before external transfer.
    function _failStrategy(
        bytes32 strategyId,
        StrategyState storage state,
        uint256 failedStepIndex,
        uint256 currentAmount,
        string memory reason
    ) internal {
        // CEI: update state before external transfer
        state.isActive = false;
        state.isFailed = true;
        state.currentAmount = 0;

        emit StrategyFailed(strategyId, failedStepIndex, reason);

        // Return current tracked amount to the original depositor
        if (currentAmount > 0) {
            if (state.currentAsset == address(0)) {
                // Returns funds to original depositor on step failure; user address set at strategy creation.
                // slither-disable-next-line calls-loop
                (bool ok,) = state.user.call{value: currentAmount}("");
                require(ok, "ETH return failed");
            } else {
                IERC20(state.currentAsset).safeTransfer(state.user, currentAmount);
            }
        }
    }

    /// @notice Dispatch a single step to the appropriate executor.
    /// @return ok        True if the step succeeded.
    /// @return amountOut The amount of output asset received.
    function _executeStep(
        bytes32, /* strategyId */
        uint256, /* stepIndex */
        Step calldata step,
        uint256 amountIn
    ) internal returns (bool ok, uint256 amountOut) {
        if (step.stepType == StepType.SWAP) {
            return _executeSwap(step, amountIn);
        } else if (step.stepType == StepType.LEND) {
            return _executeLend(step, amountIn);
        } else if (step.stepType == StepType.STAKE) {
            return _executeStake(step, amountIn);
        } else if (step.stepType == StepType.SETTLE) {
            return (true, amountIn); // pass-through; real settlement happens in _settle
        }
        revert UnsupportedStepType();
    }

    /// @dev Phase 0 stub — replaced by Uniswap/Curve adapters in Phase 1.
    ///      Caller (via _executeStepsFrom) must have verified approvedProtocols[step.protocol].
    function _executeSwap(Step calldata step, uint256 amountIn)
        internal
        returns (bool, uint256)
    {
        // External call to an allowlisted protocol adapter — approvedProtocols enforced in _executeStep.
        // slither-disable-next-line calls-loop
        (bool ok, bytes memory result) = step.protocol.call(
            abi.encodePacked(step.params, amountIn)
        );
        if (!ok) return (false, 0);
        return (true, abi.decode(result, (uint256)));
    }

    /// @dev Phase 0 stub — replaced by Aave/Compound adapters in Phase 1.
    ///      Caller (via _executeStepsFrom) must have verified approvedProtocols[step.protocol].
    function _executeLend(Step calldata step, uint256 amountIn)
        internal
        returns (bool, uint256)
    {
        // External call to an allowlisted protocol adapter — approvedProtocols enforced in _executeStep.
        // slither-disable-next-line calls-loop
        (bool ok, bytes memory result) = step.protocol.call(
            abi.encodePacked(step.params, amountIn)
        );
        if (!ok) return (false, 0);
        return (true, abi.decode(result, (uint256)));
    }

    /// @dev Phase 0 stub — replaced by GMX/Pendle adapters in Phase 1.
    ///      Caller (via _executeStepsFrom) must have verified approvedProtocols[step.protocol].
    function _executeStake(Step calldata step, uint256 amountIn)
        internal
        returns (bool, uint256)
    {
        // External call to an allowlisted protocol adapter — approvedProtocols enforced in _executeStep.
        // slither-disable-next-line calls-loop
        (bool ok, bytes memory result) = step.protocol.call(
            abi.encodePacked(step.params, amountIn)
        );
        if (!ok) return (false, 0);
        return (true, abi.decode(result, (uint256)));
    }

    /// @notice Transfer final amount to the verified destination wallet.
    /// @dev    Uses state.currentAsset — not state.sourceAsset — so the correct asset
    ///         is settled even after SWAP steps that changed the working token.
    function _settle(
        bytes32 strategyId,
        StrategyState storage state,
        uint256 finalAmount
    ) internal {
        // CEI: update state before external transfer
        state.isActive = false;
        state.currentAmount = 0;

        address asset = state.currentAsset;

        if (asset == address(0)) {
            (bool ok,) = state.destinationWallet.call{value: finalAmount}("");
            require(ok, "ETH settle failed");
        } else {
            IERC20(asset).safeTransfer(state.destinationWallet, finalAmount);
        }

        emit StrategyCompleted(
            strategyId,
            state.destinationWallet,
            asset,
            finalAmount
        );
    }

    /// @notice Verify that `destination` signed the canonical verification message.
    /// @dev    The message includes:
    ///           - destination address (prevents destination substitution)
    ///           - chainid (prevents cross-chain replay)
    ///           - user/msg.sender (prevents reuse by a different initiator)
    ///           - deadline (limits signature validity window to this strategy's deadline)
    ///         Together these four fields ensure the signature is single-use in practice.
    function _verifyDestination(
        address destination,
        bytes calldata signature,
        address user,
        uint256 deadline
    )
        internal
        view
        returns (bool)
    {
        bytes32 message = keccak256(
            abi.encodePacked(
                "Meridian destination verification\n",
                "Chain: ",
                block.chainid,
                "\n",
                "I confirm this wallet is mine: ",
                destination,
                "\nUser: ",
                user,
                "\nDeadline: ",
                deadline
            )
        );
        // tryRecover returns (address, RecoverError, bytes32). Third value (errorArg) is intentionally
        // discarded — err captures the failure mode.
        // slither-disable-next-line unused-return
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(
            MessageHashUtils.toEthSignedMessageHash(message),
            signature
        );
        if (err != ECDSA.RecoverError.NoError) return false;
        return recovered == destination;
    }

    /// @notice Derive a unique strategy ID from sender + strategy contents + per-user nonce.
    /// @dev    Uses `userNonces[user]++` (post-increment) so the nonce value used in the
    ///         hash is the one BEFORE incrementing. Each call produces a fresh, predictable
    ///         ID that users can compute off-chain given their current nonce.
    function _deriveStrategyId(address user, Strategy calldata strategy)
        internal
        returns (bytes32)
    {
        uint256 nonce = userNonces[user]++;
        return keccak256(
            abi.encode(
                user,
                strategy.sourceAsset,
                strategy.sourceAmount,
                strategy.destinationWallet,
                strategy.deadline,
                block.chainid,
                nonce
            )
        );
    }

    /// @notice Transfer the protocol fee to treasury (direct) or split between creator and treasury (marketplace).
    /// @param strategyId The strategy identifier, used in the FeeDistributed event.
    /// @param asset      The asset being transferred (address(0) = native ETH).
    /// @param fee        Total fee amount to distribute.
    /// @param creator    address(0) for direct strategies; non-zero for marketplace templates.
    function _transferFee(bytes32 strategyId, address asset, uint256 fee, address creator) internal {
        if (fee == 0) return;

        uint256 creatorFee;
        uint256 treasuryFee;

        if (creator != address(0)) {
            // Marketplace split: 2 bps creator, 3 bps treasury (out of the 5 bps total).
            // fee = sourceAmount * 5 / 10000, so:
            //   creatorFee  = fee * 2/5 = fee * CREATOR_FEE_BPS  / (CREATOR_FEE_BPS + MERIDIAN_FEE_BPS)
            //   treasuryFee = fee * 3/5 = fee * MERIDIAN_FEE_BPS / (CREATOR_FEE_BPS + MERIDIAN_FEE_BPS)
            creatorFee  = (fee * CREATOR_FEE_BPS)  / (CREATOR_FEE_BPS + MERIDIAN_FEE_BPS);
            treasuryFee = fee - creatorFee; // remainder avoids rounding dust
        } else {
            // Direct strategy: full fee to treasury.
            treasuryFee = fee;
        }

        if (asset == address(0)) {
            // `treasury` is an owner-controlled address set at construction and updatable only
            // by the owner via setTreasury(). Sending ETH to it is intentional. This function
            // is only called from executeStrategy (nonReentrant) so reentrancy is not a risk.
            if (treasuryFee > 0) {
                // slither-disable-next-line arbitrary-send-eth
                (bool ok,) = treasury.call{value: treasuryFee}("");
                if (!ok) revert FeeTransferFailed();
            }
            if (creatorFee > 0) {
                // slither-disable-next-line arbitrary-send-eth
                (bool ok2,) = creator.call{value: creatorFee}("");
                if (!ok2) revert FeeTransferFailed();
            }
        } else {
            if (treasuryFee > 0) IERC20(asset).safeTransfer(treasury, treasuryFee);
            if (creatorFee  > 0) IERC20(asset).safeTransfer(creator,  creatorFee);
        }

        emit FeeDistributed(strategyId, treasury, treasuryFee, creator, creatorFee);
    }

    /// @notice Accept ETH for native strategies.
    receive() external payable {}
}

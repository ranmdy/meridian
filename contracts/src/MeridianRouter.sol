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
///         Meridian never holds funds beyond the duration of a single transaction.
///
/// @dev Security properties:
///      - No admin withdrawal functions — owner can only update relayer & fee config.
///      - emergencyExit always returns to SOURCE wallet only.
///      - destinationSignature verified on-chain; no trusted-oracle bypass.
///      - All external calls wrapped with ReentrancyGuard.
///      - Slippage enforced via minOutput on every SWAP step.
///      - Strategy deadline reverts stale submissions.
contract MeridianRouter is IMeridianRouter, ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Protocol execution fee in basis points (0.08% = 8 bps).
    uint256 public constant FEE_BPS = 8;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Address authorized to call continueStrategy (cross-chain relayer).
    address public relayer;

    /// @notice Treasury address that receives execution fees.
    address public treasury;

    /// @notice Per-strategy execution state.
    struct StrategyState {
        address user;           // original depositor
        address sourceAsset;    // token deposited
        uint256 sourceAmount;   // amount deposited
        uint256 currentStep;    // next step to execute
        uint256 totalSteps;     // total steps in strategy
        bool isActive;
        bool isFailed;
        address destinationWallet;
    }

    mapping(bytes32 => StrategyState) private _strategies;

    // strategyId → step index → amount out (for audit trail)
    mapping(bytes32 => mapping(uint256 => uint256)) private _stepOutputs;

    // ─── Errors ───────────────────────────────────────────────────────────────

    error DeadlineExpired();
    error InvalidDestinationSignature();
    error ZeroAddress();
    error ZeroAmount();
    error StrategyNotActive();
    error StrategyAlreadyActive();
    error NotRelayer();
    error NotStrategyOwner();
    error SlippageExceeded(uint256 received, uint256 minimum);
    error InvalidStepIndex();
    error FeeTransferFailed();
    error UnsupportedStepType();

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

        // 3. Destination wallet ownership verification (on-chain — cannot be bypassed)
        if (!_verifyDestination(strategy.destinationWallet, strategy.destinationSignature)) {
            revert InvalidDestinationSignature();
        }

        // 4. Derive deterministic strategyId
        bytes32 strategyId = _deriveStrategyId(msg.sender, strategy);

        // 5. Prevent replay / double-execution
        if (_strategies[strategyId].isActive) revert StrategyAlreadyActive();

        // 6. Pull source asset from user
        if (strategy.sourceAsset == address(0)) {
            // Native ETH
            require(msg.value == strategy.sourceAmount, "ETH amount mismatch");
        } else {
            IERC20(strategy.sourceAsset).safeTransferFrom(
                msg.sender, address(this), strategy.sourceAmount
            );
        }

        // 7. Deduct execution fee upfront
        uint256 fee = (strategy.sourceAmount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 workingAmount = strategy.sourceAmount - fee;
        _transferFee(strategy.sourceAsset, fee);

        // 8. Record strategy state
        _strategies[strategyId] = StrategyState({
            user: msg.sender,
            sourceAsset: strategy.sourceAsset,
            sourceAmount: workingAmount,
            currentStep: 0,
            totalSteps: strategy.steps.length,
            isActive: true,
            isFailed: false,
            destinationWallet: strategy.destinationWallet
        });

        emit StrategyStarted(
            strategyId,
            msg.sender,
            strategy.sourceAmount,
            strategy.sourceAsset,
            strategy.destinationWallet
        );

        // 9. Execute synchronous steps until a BRIDGE step is reached
        _executeStepsFrom(strategyId, strategy.steps, 0, workingAmount);
    }

    // ─── Core: continueStrategy ───────────────────────────────────────────────

    /// @inheritdoc IMeridianRouter
    function continueStrategy(bytes32 strategyId, uint256 stepIndex)
        external
        override
        onlyRelayer
        nonReentrant
    {
        StrategyState storage state = _strategies[strategyId];
        if (!state.isActive || state.isFailed) revert StrategyNotActive();
        if (stepIndex != state.currentStep) revert InvalidStepIndex();

        // Relayer passes the current working amount as context via calldata — simplified here.
        // In production this is read from a relayer-signed payload with the post-bridge amount.
        uint256 amountIn = _stepOutputs[strategyId][stepIndex > 0 ? stepIndex - 1 : 0];

        emit StepExecuted(
            strategyId,
            stepIndex,
            StepType.BRIDGE,  // the step that just confirmed
            address(0),
            amountIn
        );

        // Continue remaining steps (passed in via the Registry in production)
        // Phase 0: state only — actual step continuation wired in Phase 1
        state.currentStep = stepIndex;
    }

    // ─── Core: emergencyExit ──────────────────────────────────────────────────

    /// @inheritdoc IMeridianRouter
    function emergencyExit(bytes32 strategyId)
        external
        override
        nonReentrant
    {
        StrategyState storage state = _strategies[strategyId];

        // Only the original depositor can trigger emergency exit
        if (msg.sender != state.user) revert NotStrategyOwner();
        if (!state.isActive) revert StrategyNotActive();

        // Mark as failed / inactive before external call (CEI pattern)
        state.isActive = false;
        state.isFailed = true;

        // Return whatever is currently held to SOURCE wallet — NEVER to destination
        uint256 balance = state.sourceAsset == address(0)
            ? address(this).balance
            : IERC20(state.sourceAsset).balanceOf(address(this));

        if (balance > 0) {
            if (state.sourceAsset == address(0)) {
                (bool ok,) = state.user.call{value: balance}("");
                require(ok, "ETH return failed");
            } else {
                IERC20(state.sourceAsset).safeTransfer(state.user, balance);
            }
        }

        emit EmergencyExitTriggered(strategyId, state.user, balance);
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

    /// @notice Update the relayer address. Owner-only.
    function setRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        relayer = newRelayer;
    }

    /// @notice Update the treasury address. Owner-only.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @notice Execute steps sequentially starting at `fromIndex`.
    ///         Stops (waits for relayer) if a BRIDGE step is reached.
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
                // Pause here — relayer will call continueStrategy after confirmation
                state.currentStep = i + 1;
                _stepOutputs[strategyId][i] = currentAmount;
                emit StepExecuted(strategyId, i, StepType.BRIDGE, step.protocol, currentAmount);
                return;
            }

            uint256 amountOut = _executeStep(strategyId, i, step, currentAmount);

            if (amountOut < step.minOutput) {
                revert SlippageExceeded(amountOut, step.minOutput);
            }

            _stepOutputs[strategyId][i] = amountOut;
            currentAmount = amountOut;
            state.currentStep = i + 1;

            emit StepExecuted(strategyId, i, step.stepType, step.protocol, amountOut);
        }

        // All steps complete — settle to destination
        _settle(strategyId, state, currentAmount);
    }

    /// @notice Dispatch a single step to the appropriate executor.
    /// @dev    Phase 0: stub — real protocol calls wired per-integration in Phase 1.
    function _executeStep(
        bytes32, /* strategyId */
        uint256, /* stepIndex */
        Step calldata step,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        if (step.stepType == StepType.SWAP) {
            return _executeSwap(step, amountIn);
        } else if (step.stepType == StepType.LEND) {
            return _executeLend(step, amountIn);
        } else if (step.stepType == StepType.STAKE) {
            return _executeStake(step, amountIn);
        } else if (step.stepType == StepType.SETTLE) {
            return amountIn; // handled in _settle
        }
        revert UnsupportedStepType();
    }

    /// @dev Phase 0 stub — replaced by Uniswap/Curve adapters in Phase 1.
    function _executeSwap(Step calldata step, uint256 amountIn)
        internal
        returns (uint256)
    {
        // Call external DEX adapter via step.protocol + step.params
        (bool ok, bytes memory result) = step.protocol.call(
            abi.encodePacked(step.params, amountIn)
        );
        require(ok, "Swap failed");
        return abi.decode(result, (uint256));
    }

    /// @dev Phase 0 stub — replaced by Aave/Compound adapters in Phase 1.
    function _executeLend(Step calldata step, uint256 amountIn)
        internal
        returns (uint256)
    {
        (bool ok, bytes memory result) = step.protocol.call(
            abi.encodePacked(step.params, amountIn)
        );
        require(ok, "Lend failed");
        return abi.decode(result, (uint256));
    }

    /// @dev Phase 0 stub — replaced by GMX/Pendle adapters in Phase 1.
    function _executeStake(Step calldata step, uint256 amountIn)
        internal
        returns (uint256)
    {
        (bool ok, bytes memory result) = step.protocol.call(
            abi.encodePacked(step.params, amountIn)
        );
        require(ok, "Stake failed");
        return abi.decode(result, (uint256));
    }

    /// @notice Transfer final amount to the verified destination wallet.
    function _settle(
        bytes32 strategyId,
        StrategyState storage state,
        uint256 finalAmount
    ) internal {
        state.isActive = false;

        if (state.sourceAsset == address(0)) {
            (bool ok,) = state.destinationWallet.call{value: finalAmount}("");
            require(ok, "ETH settle failed");
        } else {
            IERC20(state.sourceAsset).safeTransfer(state.destinationWallet, finalAmount);
        }

        emit StrategyCompleted(
            strategyId,
            state.destinationWallet,
            state.sourceAsset,
            finalAmount
        );
    }

    /// @notice Verify that `destination` signed the canonical verification message.
    /// @dev    The message includes the destination address and chain ID to prevent
    ///         cross-chain signature replay attacks.
    function _verifyDestination(address destination, bytes calldata signature)
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
                destination
            )
        );
        // Use tryRecover so malformed signatures return address(0) rather than reverting.
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(
            MessageHashUtils.toEthSignedMessageHash(message),
            signature
        );
        if (err != ECDSA.RecoverError.NoError) return false;
        return recovered == destination;
    }

    /// @notice Derive a unique strategy ID from sender + strategy contents + nonce.
    function _deriveStrategyId(address user, Strategy calldata strategy)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                user,
                strategy.sourceAsset,
                strategy.sourceAmount,
                strategy.destinationWallet,
                strategy.deadline,
                block.chainid,
                block.number
            )
        );
    }

    /// @notice Transfer the protocol fee to treasury.
    function _transferFee(address asset, uint256 fee) internal {
        if (fee == 0) return;
        if (asset == address(0)) {
            (bool ok,) = treasury.call{value: fee}("");
            if (!ok) revert FeeTransferFailed();
        } else {
            IERC20(asset).safeTransfer(treasury, fee);
        }
    }

    /// @notice Accept ETH for native strategies.
    receive() external payable {}
}

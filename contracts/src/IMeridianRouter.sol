// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMeridianRouter
/// @notice Interface for the Meridian cross-chain DeFi strategy router.
///         Funds flow through the router atomically — it is never a custodian.
interface IMeridianRouter {
    // ─── Enums ────────────────────────────────────────────────────────────────

    /// @notice The type of action in a strategy step.
    enum StepType {
        SWAP,
        LEND,
        BRIDGE,
        STAKE,
        SETTLE
    }

    // ─── Structs ──────────────────────────────────────────────────────────────

    /// @notice A single executable step within a strategy.
    /// @param stepType    The category of DeFi action.
    /// @param protocol    Address of the external protocol to interact with.
    /// @param params      ABI-encoded protocol-specific parameters.
    /// @param minOutput   Minimum tokens out — reverts if slippage exceeds this.
    /// @param outputAsset The asset produced by this step (address(0) = same asset as input).
    ///                    Required for SWAP and BRIDGE steps that change the working asset.
    struct Step {
        StepType stepType;
        address protocol;
        bytes params;
        uint256 minOutput;
        address outputAsset;
    }

    /// @notice A complete strategy submitted by a user.
    /// @param sourceAsset          Token deposited by the user.
    /// @param sourceAmount         Amount of sourceAsset deposited.
    /// @param steps                Ordered array of execution steps.
    /// @param destinationWallet    Where settled funds are sent.
    /// @param destinationSignature EIP-191 signature from destinationWallet proving ownership,
    ///                             bound to the initiating user (msg.sender) and this deadline.
    /// @param deadline             Unix timestamp after which the strategy auto-reverts.
    /// @param creator              Address of the marketplace strategy creator.
    ///                             address(0) = direct strategy (full 8 bps to treasury).
    ///                             Non-zero = marketplace template: 2 bps to creator, 3 bps to treasury.
    struct Strategy {
        address sourceAsset;
        uint256 sourceAmount;
        Step[] steps;
        address destinationWallet;
        bytes destinationSignature;
        uint256 deadline;
        address creator;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when a strategy begins execution.
    event StrategyStarted(
        bytes32 indexed strategyId,
        address indexed user,
        uint256 amount,
        address sourceAsset,
        address destinationWallet
    );

    /// @notice Emitted after each step completes successfully.
    event StepExecuted(
        bytes32 indexed strategyId,
        uint256 stepIndex,
        StepType stepType,
        address protocol,
        uint256 amountOut
    );

    /// @notice Emitted when all steps finish and funds arrive at destination.
    event StrategyCompleted(
        bytes32 indexed strategyId,
        address indexed destination,
        address asset,
        uint256 finalAmount
    );

    /// @notice Emitted when a step fails and the strategy cannot continue.
    ///         Funds are returned to the original depositor before this event.
    event StrategyFailed(
        bytes32 indexed strategyId,
        uint256 failedStep,
        string reason
    );

    /// @notice Emitted when a user triggers emergency exit.
    event EmergencyExitTriggered(
        bytes32 indexed strategyId,
        address indexed source,
        uint256 amountReturned
    );

    /// @notice Emitted when execution fees are distributed.
    ///         For direct strategies: treasuryFee = full 8 bps, creator = address(0), creatorFee = 0.
    ///         For marketplace strategies: treasuryFee = 3 bps, creator != address(0), creatorFee = 2 bps.
    event FeeDistributed(
        bytes32 indexed strategyId,
        address indexed treasury,
        uint256 treasuryFee,
        address creator,
        uint256 creatorFee
    );

    /// @notice Emitted when the authorized relayer address is updated.
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);

    /// @notice Emitted when the treasury address is updated.
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    /// @notice Emitted when a protocol's approval status changes.
    event ProtocolApprovalUpdated(address indexed protocol, bool approved);

    // ─── Core Functions ───────────────────────────────────────────────────────

    /// @notice Main entry point. User submits a full strategy and it begins executing.
    /// @param strategy The complete strategy definition including destination proof.
    function executeStrategy(Strategy calldata strategy) external payable;

    /// @notice Called by the authorized relayer after a cross-chain bridge confirms.
    /// @param strategyId    Unique identifier of the in-flight strategy.
    /// @param stepIndex     The next step index to execute (equals state.currentStep).
    /// @param steps         The full original step array — verified against the stored stepsHash.
    /// @param bridgedAmount The amount that arrived on this chain after the bridge.
    function continueStrategy(
        bytes32 strategyId,
        uint256 stepIndex,
        Step[] calldata steps,
        uint256 bridgedAmount
    ) external;

    /// @notice Halts execution and returns all recoverable funds to the source wallet.
    ///         Can only be called by the original depositor.
    ///         Always returns to source — never to destination.
    /// @param strategyId Unique identifier of the strategy to exit.
    function emergencyExit(bytes32 strategyId) external;

    // ─── View Functions ───────────────────────────────────────────────────────

    /// @notice Returns the current step index and status of an in-flight strategy.
    function strategyStatus(bytes32 strategyId)
        external
        view
        returns (uint256 currentStep, bool isActive, bool isFailed);
}

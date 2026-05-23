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
    struct Step {
        StepType stepType;
        address protocol;
        bytes params;
        uint256 minOutput;
    }

    /// @notice A complete strategy submitted by a user.
    /// @param sourceAsset          Token deposited by the user.
    /// @param sourceAmount         Amount of sourceAsset deposited.
    /// @param steps                Ordered array of execution steps.
    /// @param destinationWallet    Where settled funds are sent.
    /// @param destinationSignature EIP-191 signature from destinationWallet proving ownership.
    /// @param deadline             Unix timestamp after which the strategy auto-reverts.
    struct Strategy {
        address sourceAsset;
        uint256 sourceAmount;
        Step[] steps;
        address destinationWallet;
        bytes destinationSignature;
        uint256 deadline;
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

    // ─── Core Functions ───────────────────────────────────────────────────────

    /// @notice Main entry point. User submits a full strategy and it begins executing.
    /// @param strategy The complete strategy definition including destination proof.
    function executeStrategy(Strategy calldata strategy) external payable;

    /// @notice Called by the authorized relayer after a cross-chain bridge confirms.
    /// @param strategyId Unique identifier of the in-flight strategy.
    /// @param stepIndex  The next step to execute after bridge confirmation.
    function continueStrategy(bytes32 strategyId, uint256 stepIndex) external;

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

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IProtocolAdapter} from "../IProtocolAdapter.sol";

/// @notice Minimal Across v3 SpokePool interface — only depositV3.
interface ISpokePool {
    /// @notice Deposit tokens into Across for cross-chain transfer.
    function depositV3(
        address depositor,
        address recipient,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 destinationChainId,
        address exclusiveRelayer,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityDeadline,
        bytes calldata message
    ) external payable;
}

/// @title AcrossBridgeAdapter
/// @notice Meridian protocol adapter for Across v3 cross-chain bridges.
///
/// @dev Execution flow:
///      1. Router approves this adapter for `amountIn` of `asset`.
///      2. Router calls `execute(asset, amountIn, params)`.
///      3. Adapter pulls `amountIn` from the router via `safeTransferFrom`.
///      4. Adapter approves the Across SpokePool for `amountIn`.
///      5. Adapter calls `spokePool.depositV3(...)`.
///         Across relayers will fill the order on the destination chain.
///      6. Adapter returns 0 — tokens are in transit, not yet on destination.
///
///      After this step the MeridianRouter pauses (BRIDGE step type).
///      The off-chain relayer monitors for Across FilledV3Relay on the
///      destination chain, then calls continueStrategy on the destination router.
///
/// @dev params layout:
///      `abi.encode(
///         address recipient,        — who receives tokens on destination (destination router)
///         address outputToken,      — token address on destination chain
///         uint256 destinationChainId,
///         uint256 outputAmount,     — minimum output (after bridge fees)
///         uint32  fillDeadline      — unix timestamp deadline for Across relayer to fill
///      )`
///
/// @dev Across v3 SpokePool addresses:
///      - Sepolia (11155111):  0x5ef6C01E11889d86803e0573e9cC7f207D5a5AC3
///      - Mainnet (1):         0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5
///      - Base (8453):         0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64
///      - Arbitrum (42161):    0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A
///      - Polygon (137):       0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096
///      - Optimism (10):       0x6f26Bf09B1C792e3228e5467807a900A503c0281
contract AcrossBridgeAdapter is IProtocolAdapter {
    using SafeERC20 for IERC20;

    error NotRouter();
    error ZeroAddress();
    error InvalidParams();

    /// @notice The Across v3 SpokePool for the chain this adapter is deployed on.
    ISpokePool public immutable spokePool;

    /// @notice The MeridianRouter that is authorized to call this adapter.
    address public immutable router;

    /// @param _spokePool Across v3 SpokePool address on this chain.
    /// @param _router    MeridianRouter address on this chain.
    constructor(address _spokePool, address _router) {
        if (_spokePool == address(0)) revert ZeroAddress();
        if (_router == address(0)) revert ZeroAddress();
        spokePool = ISpokePool(_spokePool);
        router = _router;
    }

    /// @inheritdoc IProtocolAdapter
    /// @notice Deposits `amountIn` of `asset` into Across for cross-chain bridging.
    ///         Returns 0 because tokens are in transit — the router should pause.
    /// @return amountOut Always 0 — actual bridged amount arrives asynchronously.
    function execute(
        address asset,
        uint256 amountIn,
        bytes calldata params
    ) external payable override returns (uint256 amountOut) {
        if (msg.sender != router) revert NotRouter();
        if (params.length < 160) revert InvalidParams();

        (
            address recipient,
            address outputToken,
            uint256 destinationChainId,
            uint256 outputAmount,
            uint32 fillDeadline
        ) = abi.decode(params, (address, address, uint256, uint256, uint32));

        // Pull tokens from the router.
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve the SpokePool for the exact input amount.
        IERC20(asset).safeIncreaseAllowance(address(spokePool), amountIn);

        // Deposit into Across — relayer fills on destination chain.
        spokePool.depositV3(
            address(this),          // depositor (this adapter)
            recipient,              // recipient on destination chain (destination router)
            asset,                  // inputToken (on this chain)
            outputToken,            // outputToken (on destination chain)
            amountIn,               // inputAmount
            outputAmount,           // outputAmount (minimum after fees)
            destinationChainId,
            address(0),             // exclusiveRelayer (none — open to all)
            uint32(block.timestamp),// quoteTimestamp
            fillDeadline,
            0,                      // exclusivityDeadline (none)
            bytes("")               // message (no cross-chain message)
        );

        // Reset approval to zero after deposit completes.
        IERC20(asset).forceApprove(address(spokePool), 0);

        // Return 0 — tokens are in transit. Router pauses at BRIDGE step.
        return 0;
    }
}

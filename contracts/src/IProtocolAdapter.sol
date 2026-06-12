// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IProtocolAdapter
/// @notice Standard interface for all Meridian protocol adapters.
///
/// @dev Execution flow:
///      1. Router approves this adapter for `amountIn` of `asset` (forceApprove).
///      2. Router calls `adapter.execute(asset, amountIn, params)`.
///      3. Adapter pulls `amountIn` from the router via `safeTransferFrom(msg.sender, ...)`.
///      4. Adapter performs the protocol interaction.
///      5. Output tokens are delivered to `msg.sender` (the router), either:
///           a. Directly via the protocol's `onBehalfOf`/`recipient` = router, OR
///           b. Explicitly transferred back to `msg.sender` at the end of `execute`.
///      6. Adapter returns `amountOut` — the amount of output asset sent back to the router.
///
///      If execute reverts at any point (including during transferFrom), the entire
///      call frame reverts atomically — tokens never leave the router. This is the
///      key safety property of the approve-then-call pattern vs transfer-then-call.
///
/// @dev Security:
///      - Adapters must only be callable by the approved router.
///        Add a `router` immutable and `if (msg.sender != router) revert NotRouter()` check.
///      - Adapters should not hold balances between calls. Any leftover dust is a risk.
///      - All approve() calls should use exact amounts (never `type(uint256).max`) to limit
///        exposure if the underlying protocol is exploited.
///      - Function is payable to support native ETH adapters where the router sends
///        ETH via call{value}. ERC-20 adapters can ignore msg.value.
interface IProtocolAdapter {
    /// @notice Execute a single protocol interaction.
    ///
    /// @param asset     The input ERC-20 token address (address(0) = native ETH).
    ///                  For ERC-20: tokens are in the router; the adapter must pull them
    ///                  via `safeTransferFrom(msg.sender, address(this), amountIn)`.
    ///                  For ETH: sent as msg.value with the call.
    /// @param amountIn  Exact amount of `asset` the adapter should pull (ERC-20) or
    ///                  receive as msg.value (ETH).
    /// @param params    ABI-encoded protocol-specific parameters.
    ///                  Each adapter defines its own params layout in its NatSpec.
    ///
    /// @return amountOut Amount of output asset transferred to `msg.sender` (the router).
    ///                   For LEND steps: typically equals `amountIn` (1:1 receipt token).
    ///                   For SWAP steps: the output token amount after slippage.
    function execute(
        address asset,
        uint256 amountIn,
        bytes calldata params
    ) external payable returns (uint256 amountOut);
}

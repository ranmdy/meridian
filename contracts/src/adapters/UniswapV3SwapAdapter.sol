// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IProtocolAdapter} from "../IProtocolAdapter.sol";

/// @notice Minimal Uniswap V3 SwapRouter interface — only exactInputSingle.
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swaps `amountIn` of one token for as much as possible of another token.
    /// @return amountOut The amount of the received token.
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @title UniswapV3SwapAdapter
/// @notice Meridian protocol adapter for Uniswap V3 single-hop swaps.
///
/// @dev Execution flow:
///      1. Router approves this adapter for `amountIn` of `asset`.
///      2. Router calls `execute(asset, amountIn, params)`.
///      3. Adapter pulls `amountIn` from the router via `safeTransferFrom`.
///      4. Adapter approves the Uniswap V3 SwapRouter for `amountIn`.
///      5. Adapter calls `swapRouter.exactInputSingle(...)`.
///         Uniswap sends output tokens DIRECTLY to the router (`recipient` = router).
///      6. Adapter returns `amountOut` — the actual amount received after slippage.
///
/// @dev params layout:
///      `abi.encode(address tokenOut, uint24 fee, uint256 amountOutMinimum)`
///      - tokenOut:          The output token address.
///      - fee:               Uniswap pool fee tier (500 = 0.05%, 3000 = 0.3%, 10000 = 1%).
///      - amountOutMinimum:  Minimum output to accept (slippage protection).
///
/// @dev Supported chains (same SwapRouter02 address on all):
///      - Mainnet (1):         0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45
///      - Sepolia (11155111):  0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E
///      - Arbitrum (42161):    0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45
///      - Base (8453):         0x2626664c2603336E57B271c5C0b26F421741e481
///      - Polygon (137):       0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45
///      - Optimism (10):       0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45
///      Deploy one adapter per chain, each pointing to that chain's SwapRouter.
contract UniswapV3SwapAdapter is IProtocolAdapter {
    using SafeERC20 for IERC20;

    error NotRouter();
    error ZeroAddress();
    error InvalidParams();

    /// @notice The Uniswap V3 SwapRouter for the chain this adapter is deployed on.
    ISwapRouter public immutable swapRouter;

    /// @notice The MeridianRouter that is authorized to call this adapter.
    address public immutable router;

    /// @param _swapRouter Uniswap V3 SwapRouter address on this chain.
    /// @param _router     MeridianRouter address on this chain.
    constructor(address _swapRouter, address _router) {
        if (_swapRouter == address(0)) revert ZeroAddress();
        if (_router == address(0)) revert ZeroAddress();
        swapRouter = ISwapRouter(_swapRouter);
        router = _router;
    }

    /// @inheritdoc IProtocolAdapter
    /// @notice Swaps `amountIn` of `asset` for `tokenOut` via Uniswap V3.
    ///         Output tokens are sent directly to the router.
    /// @return amountOut Actual amount of `tokenOut` received.
    function execute(
        address asset,
        uint256 amountIn,
        bytes calldata params
    ) external payable override returns (uint256 amountOut) {
        if (msg.sender != router) revert NotRouter();

        // Decode protocol-specific params.
        if (params.length < 96) revert InvalidParams();
        (address tokenOut, uint24 fee, uint256 amountOutMinimum) =
            abi.decode(params, (address, uint24, uint256));

        // Pull tokens from the router.
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve the Uniswap SwapRouter for the exact input amount.
        IERC20(asset).safeIncreaseAllowance(address(swapRouter), amountIn);

        // Execute the swap. Output goes directly to the router (msg.sender).
        amountOut = swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn:           asset,
                tokenOut:          tokenOut,
                fee:               fee,
                recipient:         msg.sender, // router
                deadline:          block.timestamp,
                amountIn:          amountIn,
                amountOutMinimum:  amountOutMinimum,
                sqrtPriceLimitX96: 0 // no price limit — rely on amountOutMinimum
            })
        );

        // Reset approval to zero after swap completes.
        IERC20(asset).forceApprove(address(swapRouter), 0);
    }
}

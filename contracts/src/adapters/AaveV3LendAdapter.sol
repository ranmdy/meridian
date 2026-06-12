// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IProtocolAdapter} from "../IProtocolAdapter.sol";

/// @notice Minimal Aave V3 Pool interface — only what the adapter calls.
interface IAaveV3Pool {
    /// @notice Supplies `amount` of `asset` into the Aave V3 pool.
    ///         Mints aTokens directly to `onBehalfOf`.
    /// @param asset        The ERC-20 token to supply.
    /// @param amount       Amount to supply.
    /// @param onBehalfOf   Address that receives the aTokens.
    /// @param referralCode Protocol referral code (use 0).
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;
}

/// @title AaveV3LendAdapter
/// @notice Meridian protocol adapter for Aave V3 lending (supply).
///
/// @dev Execution flow:
///      1. Router approves this adapter for `amountIn` of `asset`.
///      2. Router calls `execute(asset, amountIn, params)`.
///      3. Adapter pulls `amountIn` from the router via `safeTransferFrom`.
///      4. Adapter approves the Aave V3 Pool for `amountIn`.
///      5. Adapter calls `pool.supply(asset, amountIn, router, 0)`.
///         Aave mints aTokens DIRECTLY to the router (`msg.sender` = router = `onBehalfOf`).
///      6. Adapter returns `amountIn` as amountOut (aTokens are 1:1 at deposit time).
///
/// @dev params layout:
///      Unused — pass `0x` from the frontend. Reserved for future extensions
///      (e.g. referral code override, interest rate mode).
///
/// @dev Supported chains:
///      - Sepolia:      pool = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951
///      - Mainnet:      pool = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2
///      - Base:         pool = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
///      - Arbitrum:     pool = 0x794a61358D6845594F94dc1DB02A252b5b4814aD
///      - Polygon:      pool = 0x794a61358D6845594F94dc1DB02A252b5b4814aD
///      Deploy one adapter per chain, each pointing to that chain's Aave V3 Pool proxy.
contract AaveV3LendAdapter is IProtocolAdapter {
    using SafeERC20 for IERC20;

    error NotRouter();
    error ZeroAddress();

    /// @notice The Aave V3 Pool proxy for the chain this adapter is deployed on.
    IAaveV3Pool public immutable pool;

    /// @notice The MeridianRouter that is authorized to call this adapter.
    address public immutable router;

    /// @param _pool   Aave V3 Pool proxy address on this chain.
    /// @param _router MeridianRouter address on this chain.
    constructor(address _pool, address _router) {
        if (_pool == address(0)) revert ZeroAddress();
        if (_router == address(0)) revert ZeroAddress();
        pool = IAaveV3Pool(_pool);
        router = _router;
    }

    /// @inheritdoc IProtocolAdapter
    /// @notice Deposits `amountIn` of `asset` into Aave V3.
    ///         aTokens are minted directly to the router (msg.sender).
    /// @return amountOut Always equals `amountIn` (aTokens are 1:1 at deposit time).
    function execute(
        address asset,
        uint256 amountIn,
        bytes calldata /* params */
    ) external payable override returns (uint256 amountOut) {
        if (msg.sender != router) revert NotRouter();

        // Pull tokens from the router. Router approved us before this call.
        // If this reverts, the entire call frame reverts — tokens stay in the router.
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve the Aave pool to pull `amountIn` from this adapter.
        // Exact amount — not type(uint256).max — to limit exposure.
        IERC20(asset).safeIncreaseAllowance(address(pool), amountIn);

        // Supply to Aave. aTokens are minted directly to the router.
        // `msg.sender` == router, so `onBehalfOf` = router here.
        pool.supply(asset, amountIn, msg.sender, 0);

        // Reset approval to zero after supply completes.
        IERC20(asset).forceApprove(address(pool), 0);

        // aTokens are 1:1 with the underlying at deposit time.
        return amountIn;
    }
}

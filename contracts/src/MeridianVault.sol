// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title MeridianVault
/// @notice ERC-4626 compliant vault for optional yield compounding.
///         Users deposit an asset and receive vault shares.
///         Yield is compounded by authorized routers only — no admin withdrawal.
///
/// @dev Security properties:
///      - `_decimalsOffset()` returns 6, adding virtual shares (10^6 units)
///        that eliminate the ERC-4626 first-depositor inflation attack.
///        An attacker would need to donate >10^6× the victim's deposit to
///        manipulate share prices meaningfully — economically infeasible.
///      - All four ERC-4626 entry points (deposit/withdraw/mint/redeem) are
///        guarded with nonReentrant to prevent reentrancy via ERC-777 or
///        other token transfer hooks.
contract MeridianVault is ERC4626, ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Routers authorized to trigger yield compounding.
    mapping(address => bool) public authorizedRouters;

    uint256 public totalYieldCompounded;

    // ─── Events ───────────────────────────────────────────────────────────────

    event YieldCompounded(address indexed by, uint256 amount);
    event RouterAuthorized(address indexed router, bool authorized);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAuthorizedRouter();

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param asset_     The underlying ERC-20 asset (e.g. USDC).
    /// @param name_      Vault share token name (e.g. "Meridian USDC Vault").
    /// @param symbol_    Vault share token symbol (e.g. "mUSDC").
    constructor(IERC20 asset_, string memory name_, string memory symbol_)
        ERC4626(asset_)
        ERC20(name_, symbol_)
        Ownable(msg.sender)
    {}

    // ─── ERC-4626 inflation-attack protection ─────────────────────────────────

    /// @notice Returns 6, adding a virtual 10^6 share buffer to prevent the
    ///         first-depositor inflation attack without sacrificing usability.
    ///         The effective share denominator becomes totalAssets + 1 vs
    ///         totalSupply + 10^6, making single-wei attacks economically infeasible.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    // ─── ERC-4626 Overrides — all entry points guarded with nonReentrant ──────

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        return super.withdraw(assets, receiver, owner_);
    }

    function redeem(uint256 shares, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        return super.redeem(shares, receiver, owner_);
    }

    // ─── Compound ─────────────────────────────────────────────────────────────

    /// @notice Re-invest accrued yield into the vault.
    ///         Only authorized routers (never admin) can trigger this.
    /// @param yieldAmount Amount of underlying asset to compound.
    function compound(uint256 yieldAmount) external nonReentrant {
        if (!authorizedRouters[msg.sender]) revert NotAuthorizedRouter();

        // Pull yield from caller (router holds it after harvesting)
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), yieldAmount);

        totalYieldCompounded += yieldAmount;
        emit YieldCompounded(msg.sender, yieldAmount);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setRouterAuthorized(address router, bool authorized)
        external
        onlyOwner
    {
        authorizedRouters[router] = authorized;
        emit RouterAuthorized(router, authorized);
    }

    // ─── Security: no admin withdrawal ───────────────────────────────────────
    // ERC-4626 deposit/withdraw/mint/redeem are the only fund movement functions.
    // No owner-only transfer, no rescue function, no drain.
}

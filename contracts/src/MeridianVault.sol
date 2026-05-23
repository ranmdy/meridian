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

    // ─── ERC-4626 Overrides ───────────────────────────────────────────────────

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        return super.deposit(assets, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        return super.withdraw(assets, receiver, owner_);
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
    // ERC-4626 deposit/withdraw are the only fund movement functions.
    // No owner-only transfer, no rescue function, no drain.
}

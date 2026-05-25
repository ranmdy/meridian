/**
 * Meridian Solana Program
 *
 * Handles the Solana leg of cross-chain DeFi routing:
 *
 *   1. Vault management  — program-owned USDC/SOL custody accounts.
 *   2. Kamino deposits   — CPI to Kamino Lending for USDC yield.
 *   3. Kamino withdraws  — redeem kUSDC shares back to USDC.
 *   4. Wormhole bridge   — lock USDC and emit a VAA for the Ethereum relayer.
 *
 * Architecture notes:
 *   - All PDAs use [b"meridian", user.key(), nonce] seeds.
 *   - Fee: 8 bps (0.08%) deducted before deposits, held in treasury ATA.
 *   - Emergency exit: owner can close vault and return funds to user at any time.
 *   - Re-entrancy: Solana's single-threaded execution prevents re-entrancy.
 *     However, we still guard against duplicate CPI calls via state flags.
 *
 * Env / config accounts:
 *   CONFIG_ACCOUNT — singleton PDA holding treasury + fee config + authority.
 */

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("MeridN1sVaULtjEjSNFpRt2g6DpW9ZSP2V3Wy4XfGhw");

/// Platform fee in basis points (8 bps = 0.08%).
pub const PLATFORM_FEE_BPS: u64 = 8;

/// Max slippage we accept on Kamino operations (50 bps = 0.5%).
pub const MAX_SLIPPAGE_BPS: u64 = 50;

/// Wormhole Token Bridge Program ID on mainnet.
pub const WORMHOLE_TOKEN_BRIDGE: &str = "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb";

#[program]
pub mod meridian_solana {
    use super::*;

    /// Initialize the global config (called once by deployer).
    pub fn initialize(ctx: Context<Initialize>, treasury: Pubkey) -> Result<()> {
        instructions::initialize::handler(ctx, treasury)
    }

    /// Create a user-scoped vault PDA for USDC custody.
    pub fn create_vault(ctx: Context<CreateVault>, nonce: u64) -> Result<()> {
        instructions::create_vault::handler(ctx, nonce)
    }

    /// Deposit USDC into the user's vault (deducts platform fee to treasury).
    pub fn deposit(ctx: Context<Deposit>, amount: u64, nonce: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount, nonce)
    }

    /// Withdraw USDC from the user's vault back to their wallet.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64, nonce: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount, nonce)
    }

    /// CPI into Kamino to deposit USDC from the vault into a lending reserve.
    pub fn kamino_deposit(ctx: Context<KaminoDeposit>, amount: u64, nonce: u64) -> Result<()> {
        instructions::kamino_deposit::handler(ctx, amount, nonce)
    }

    /// CPI into Kamino to redeem kUSDC shares back to USDC in the vault.
    pub fn kamino_withdraw(ctx: Context<KaminoWithdraw>, shares: u64, nonce: u64) -> Result<()> {
        instructions::kamino_withdraw::handler(ctx, shares, nonce)
    }

    /// Lock USDC in the Wormhole Token Bridge and emit a VAA for the
    /// Ethereum relayer to pick up and route on the EVM side.
    pub fn bridge_to_ethereum(
        ctx: Context<BridgeToEthereum>,
        amount: u64,
        nonce: u64,
        eth_recipient: [u8; 20],
        arbiter_fee: u64,
    ) -> Result<()> {
        instructions::bridge_to_ethereum::handler(ctx, amount, nonce, eth_recipient, arbiter_fee)
    }

    /// Emergency exit — owner drains vault back to user and closes the account.
    pub fn emergency_exit(ctx: Context<EmergencyExit>, nonce: u64) -> Result<()> {
        instructions::emergency_exit::handler(ctx, nonce)
    }
}

/**
 * Kamino Deposit instruction
 *
 * CPI flow:
 *   1. Lock the vault (prevent concurrent operations).
 *   2. Call Kamino's `deposit_reserve_liquidity_and_obligation_collateral`.
 *   3. Record kUSDC shares received in vault state.
 *
 * Kamino program ID on mainnet: KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD
 *
 * Note: The full Kamino CPI interface is stubbed here because the public
 * CPI crate is not yet on crates.io at this Anchor version.
 * In production, replace the stub with: use kamino_lending::cpi::*;
 */

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::Vault;
use crate::errors::MeridianError;

/// Kamino lending program mainnet address.
pub const KAMINO_PROGRAM_ID: &str = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";

#[derive(Accounts)]
#[instruction(amount: u64, nonce: u64)]
pub struct KaminoDeposit<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump = vault.bump,
        has_one = owner,
    )]
    pub vault: Account<'info, Vault>,

    /// Vault USDC ATA — source for Kamino deposit.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_usdc_ata: Account<'info, TokenAccount>,

    /// Vault kUSDC ATA — receives Kamino collateral shares.
    #[account(
        mut,
        token::mint = kusdc_mint,
        token::authority = vault,
    )]
    pub vault_kusdc_ata: Account<'info, TokenAccount>,

    pub usdc_mint:  Account<'info, Mint>,
    pub kusdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub owner: Signer<'info>,

    // ── Kamino CPI accounts (passed through) ─────────────────────────────────
    /// CHECK: Kamino validates this account in its own program.
    pub kamino_lending_market:  UncheckedAccount<'info>,
    /// CHECK: Kamino reserve account for USDC.
    pub kamino_reserve:         UncheckedAccount<'info>,
    /// CHECK: Kamino reserve liquidity supply ATA.
    pub kamino_reserve_liquidity_supply: UncheckedAccount<'info>,
    /// CHECK: Kamino collateral mint.
    pub kamino_reserve_collateral_mint:  UncheckedAccount<'info>,
    /// CHECK: Kamino program (validated via constraint).
    #[account(executable, address = KAMINO_PROGRAM_ID.parse().unwrap())]
    pub kamino_program:         UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub clock:         Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<KaminoDeposit>, amount: u64, nonce: u64) -> Result<()> {
    require!(amount > 0, MeridianError::ZeroAmount);

    let vault = &ctx.accounts.vault;
    require!(!vault.locked, MeridianError::VaultLocked);
    require!(vault.deposited >= amount, MeridianError::InsufficientBalance);

    // Lock the vault to prevent re-entrancy
    ctx.accounts.vault.locked = true;

    // ── Kamino CPI ─────────────────────────────────────────────────────────────
    //
    // In production, replace this block with the Kamino CPI crate call:
    //
    //   kamino_lending::cpi::deposit_reserve_liquidity_and_obligation_collateral(
    //     CpiContext::new_with_signer(
    //       ctx.accounts.kamino_program.to_account_info(),
    //       kamino_lending::cpi::accounts::DepositReserveLiquidity { ... },
    //       signer_seeds,
    //     ),
    //     amount,
    //   )?;
    //
    // For now we emit an event and update state to mirror what would happen.
    // The protocol is fully integrated once the CPI crate is available.

    let owner_key = ctx.accounts.owner.key();
    let nonce_bytes = nonce.to_le_bytes();
    let _seeds: &[&[u8]] = &[
        b"vault",
        owner_key.as_ref(),
        nonce_bytes.as_ref(),
        &[vault.bump],
    ];

    // Placeholder: record that shares were issued 1:1 with USDC (real ratio varies)
    let shares_issued = amount; // Kamino will return actual cToken amount

    // Unlock and update state
    let vault = &mut ctx.accounts.vault;
    vault.locked        = false;
    vault.deposited     = vault.deposited.checked_sub(amount).ok_or(MeridianError::Overflow)?;
    vault.kamino_shares = vault.kamino_shares.checked_add(shares_issued).ok_or(MeridianError::Overflow)?;

    emit!(KaminoDeposited {
        owner:         ctx.accounts.owner.key(),
        vault:         ctx.accounts.vault.key(),
        usdc_deposited: amount,
        shares_issued,
    });

    Ok(())
}

#[event]
pub struct KaminoDeposited {
    pub owner:           Pubkey,
    pub vault:           Pubkey,
    pub usdc_deposited:  u64,
    pub shares_issued:   u64,
}

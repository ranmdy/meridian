use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::Vault;
use crate::errors::MeridianError;

#[derive(Accounts)]
#[instruction(shares: u64, nonce: u64)]
pub struct KaminoWithdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump = vault.bump,
        has_one = owner,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_usdc_ata: Account<'info, TokenAccount>,

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

    /// CHECK: Kamino validates in its own program.
    pub kamino_lending_market: UncheckedAccount<'info>,
    /// CHECK: Kamino reserve.
    pub kamino_reserve:        UncheckedAccount<'info>,
    /// CHECK: Kamino program.
    #[account(executable)]
    pub kamino_program:        UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub clock:         Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<KaminoWithdraw>, shares: u64, _nonce: u64) -> Result<()> {
    require!(shares > 0, MeridianError::ZeroAmount);

    let vault = &ctx.accounts.vault;
    require!(!vault.locked, MeridianError::VaultLocked);
    require!(vault.kamino_shares >= shares, MeridianError::InsufficientBalance);

    ctx.accounts.vault.locked = true;

    // ── Kamino CPI (stubbed — see kamino_deposit.rs for production notes) ─────
    // Placeholder: 1:1 share-to-USDC redemption
    let usdc_received = shares;

    let vault = &mut ctx.accounts.vault;
    vault.locked        = false;
    vault.kamino_shares = vault.kamino_shares.checked_sub(shares).ok_or(MeridianError::Overflow)?;
    vault.deposited     = vault.deposited.checked_add(usdc_received).ok_or(MeridianError::Overflow)?;

    emit!(KaminoWithdrawn {
        owner:         ctx.accounts.owner.key(),
        vault:         ctx.accounts.vault.key(),
        shares_burned: shares,
        usdc_received,
    });

    Ok(())
}

#[event]
pub struct KaminoWithdrawn {
    pub owner:         Pubkey,
    pub vault:         Pubkey,
    pub shares_burned: u64,
    pub usdc_received: u64,
}

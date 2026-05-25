use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::Vault;
use crate::errors::MeridianError;

#[derive(Accounts)]
#[instruction(amount: u64, nonce: u64)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump = vault.bump,
        has_one = owner,
    )]
    pub vault: Account<'info, Vault>,

    /// Vault ATA — program-owned, signed by vault PDA.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    /// Destination: owner's USDC ATA.
    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
    )]
    pub owner_ata: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Withdraw>, amount: u64, nonce: u64) -> Result<()> {
    require!(amount > 0, MeridianError::ZeroAmount);

    let vault = &ctx.accounts.vault;
    require!(!vault.locked, MeridianError::VaultLocked);
    require!(vault.deposited >= amount, MeridianError::InsufficientBalance);

    let owner_key = ctx.accounts.owner.key();
    let nonce_bytes = nonce.to_le_bytes();
    let seeds: &[&[u8]] = &[b"vault", owner_key.as_ref(), nonce_bytes.as_ref(), &[vault.bump]];
    let signer_seeds = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.vault_ata.to_account_info(),
                to:        ctx.accounts.owner_ata.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.deposited = vault.deposited.checked_sub(amount).ok_or(MeridianError::Overflow)?;

    emit!(Withdrawn {
        owner:  ctx.accounts.owner.key(),
        vault:  ctx.accounts.vault.key(),
        amount,
    });

    Ok(())
}

#[event]
pub struct Withdrawn {
    pub owner:  Pubkey,
    pub vault:  Pubkey,
    pub amount: u64,
}

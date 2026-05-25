use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::Vault;

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateVault<'info> {
    #[account(
        init,
        payer = owner,
        space = Vault::LEN,
        seeds = [b"vault", owner.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    /// The vault's ATA for USDC — holds the actual tokens.
    #[account(
        init,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program:    Program<'info, System>,
    pub token_program:     Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<CreateVault>, nonce: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.owner         = ctx.accounts.owner.key();
    vault.mint          = ctx.accounts.mint.key();
    vault.nonce         = nonce;
    vault.deposited     = 0;
    vault.kamino_shares = 0;
    vault.locked        = false;
    vault.created_slot  = Clock::get()?.slot;
    vault.bump          = ctx.bumps.vault;

    emit!(VaultCreated {
        owner: vault.owner,
        vault: ctx.accounts.vault.key(),
        mint:  vault.mint,
        nonce,
    });

    Ok(())
}

#[event]
pub struct VaultCreated {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub mint:  Pubkey,
    pub nonce: u64,
}

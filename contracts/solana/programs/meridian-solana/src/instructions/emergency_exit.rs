use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, CloseAccount};
use crate::state::{Config, Vault};
use crate::errors::MeridianError;

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct EmergencyExit<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump = vault.bump,
        has_one = owner,
        close = owner,   // return rent to owner on close
    )]
    pub vault: Account<'info, Vault>,

    /// Vault USDC ATA — drained to user's ATA then closed.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    /// Owner's USDC ATA — receives all remaining funds.
    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
    )]
    pub owner_ata: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    /// Emergency exit may be called by the authority OR the owner.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The vault's nominal owner (must match vault.owner).
    /// CHECK: validated via has_one on vault.
    pub user: UncheckedAccount<'info>,

    pub token_program:  Program<'info, Token>,
}

pub fn handler(ctx: Context<EmergencyExit>, nonce: u64) -> Result<()> {
    let caller = ctx.accounts.owner.key();
    let is_authority = caller == ctx.accounts.config.authority;
    let is_owner     = caller == ctx.accounts.vault.owner;
    require!(is_authority || is_owner, MeridianError::Unauthorized);

    require!(ctx.accounts.vault.kamino_shares == 0, MeridianError::VaultLocked);

    let balance = ctx.accounts.vault_ata.amount;
    if balance > 0 {
        let owner_key  = ctx.accounts.user.key();
        let nonce_bytes = nonce.to_le_bytes();
        let bump = ctx.accounts.vault.bump;
        let seeds: &[&[u8]] = &[b"vault", owner_key.as_ref(), nonce_bytes.as_ref(), &[bump]];
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
            balance,
        )?;

        // Close the vault ATA and return rent to owner
        token::close_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                CloseAccount {
                    account:     ctx.accounts.vault_ata.to_account_info(),
                    destination: ctx.accounts.owner.to_account_info(),
                    authority:   ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
        )?;
    }

    emit!(EmergencyExited {
        owner:           ctx.accounts.vault.owner,
        vault:           ctx.accounts.vault.key(),
        amount_returned: balance,
        closed_by:       caller,
    });

    Ok(())
}

#[event]
pub struct EmergencyExited {
    pub owner:           Pubkey,
    pub vault:           Pubkey,
    pub amount_returned: u64,
    pub closed_by:       Pubkey,
}

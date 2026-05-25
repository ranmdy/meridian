use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::{Config, Vault};
use crate::errors::MeridianError;
use crate::PLATFORM_FEE_BPS;

#[derive(Accounts)]
#[instruction(amount: u64, nonce: u64)]
pub struct Deposit<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump = vault.bump,
        has_one = owner,
    )]
    pub vault: Account<'info, Vault>,

    /// Vault's USDC ATA (program-owned).
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    /// Treasury ATA receiving platform fee.
    #[account(
        mut,
        token::mint = mint,
        token::authority = config.treasury,
    )]
    pub treasury_ata: Account<'info, TokenAccount>,

    /// Source: owner's USDC ATA.
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

pub fn handler(ctx: Context<Deposit>, amount: u64, _nonce: u64) -> Result<()> {
    require!(amount > 0, MeridianError::ZeroAmount);

    // Compute fee and net deposit
    let fee = amount
        .checked_mul(PLATFORM_FEE_BPS)
        .ok_or(MeridianError::Overflow)?
        .checked_div(10_000)
        .ok_or(MeridianError::Overflow)?;
    let net = amount.checked_sub(fee).ok_or(MeridianError::Overflow)?;

    // Transfer fee to treasury
    if fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.owner_ata.to_account_info(),
                    to:        ctx.accounts.treasury_ata.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    // Transfer net amount to vault ATA
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.owner_ata.to_account_info(),
                to:        ctx.accounts.vault_ata.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        net,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.deposited = vault.deposited.checked_add(net).ok_or(MeridianError::Overflow)?;

    emit!(Deposited {
        owner:  ctx.accounts.owner.key(),
        vault:  ctx.accounts.vault.key(),
        amount,
        fee,
        net,
    });

    Ok(())
}

#[event]
pub struct Deposited {
    pub owner:  Pubkey,
    pub vault:  Pubkey,
    pub amount: u64,
    pub fee:    u64,
    pub net:    u64,
}

use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::MeridianError;
use crate::PLATFORM_FEE_BPS;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Config::LEN,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, treasury: Pubkey) -> Result<()> {
    require!(treasury != Pubkey::default(), MeridianError::InvalidTreasury);

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.treasury   = treasury;
    config.fee_bps    = PLATFORM_FEE_BPS;
    config.bump       = ctx.bumps.config;

    emit!(ConfigInitialized {
        authority: config.authority,
        treasury,
        fee_bps: config.fee_bps,
    });

    Ok(())
}

#[event]
pub struct ConfigInitialized {
    pub authority: Pubkey,
    pub treasury:  Pubkey,
    pub fee_bps:   u64,
}

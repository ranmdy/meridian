/**
 * bridge_to_ethereum — Wormhole Token Bridge CPI
 *
 * Locks USDC in the Wormhole Token Bridge and emits a signed VAA.
 * The Meridian backend relayer monitors VAAs and triggers the
 * `continueStrategy` call on the Ethereum Router once the VAA is finalized.
 *
 * Wormhole Token Bridge (mainnet): wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb
 * Wormhole Core Bridge (mainnet):  worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth
 *
 * In production, use the `wormhole-anchor-sdk` crate:
 *   wormhole_anchor_sdk::token_bridge::cpi::transfer_native(...)
 */

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::Vault;
use crate::errors::MeridianError;

#[derive(Accounts)]
#[instruction(amount: u64, nonce: u64, eth_recipient: [u8; 20], arbiter_fee: u64)]
pub struct BridgeToEthereum<'info> {
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

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub owner: Signer<'info>,

    // ── Wormhole Token Bridge accounts ─────────────────────────────────────────
    /// CHECK: Wormhole Token Bridge program (executable).
    #[account(executable)]
    pub wormhole_token_bridge: UncheckedAccount<'info>,

    /// CHECK: Wormhole Core Bridge program.
    #[account(executable)]
    pub wormhole_core_bridge: UncheckedAccount<'info>,

    /// CHECK: Wormhole config (PDA of core bridge).
    pub wormhole_config: UncheckedAccount<'info>,

    /// CHECK: Token Bridge config PDA.
    pub token_bridge_config: UncheckedAccount<'info>,

    /// CHECK: Token Bridge custody ATA for USDC.
    #[account(mut)]
    pub token_bridge_custody: UncheckedAccount<'info>,

    /// CHECK: Token Bridge authority signer PDA.
    pub token_bridge_authority_signer: UncheckedAccount<'info>,

    /// CHECK: Token Bridge custody signer PDA.
    pub token_bridge_custody_signer: UncheckedAccount<'info>,

    /// CHECK: Wormhole bridge PDA.
    #[account(mut)]
    pub wormhole_bridge: UncheckedAccount<'info>,

    /// CHECK: Wormhole message account (keyed by transfer nonce).
    #[account(mut)]
    pub wormhole_message: UncheckedAccount<'info>,

    /// CHECK: Wormhole emitter PDA.
    pub wormhole_emitter: UncheckedAccount<'info>,

    /// CHECK: Wormhole sequence tracker.
    #[account(mut)]
    pub wormhole_sequence: UncheckedAccount<'info>,

    /// CHECK: Wormhole fee collector.
    #[account(mut)]
    pub wormhole_fee_collector: UncheckedAccount<'info>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub clock:          Sysvar<'info, Clock>,
    pub rent:           Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<BridgeToEthereum>,
    amount: u64,
    nonce: u64,
    eth_recipient: [u8; 20],
    arbiter_fee: u64,
) -> Result<()> {
    require!(amount > 0, MeridianError::ZeroAmount);
    require!(arbiter_fee < amount, MeridianError::ArbiterFeeTooHigh);

    let vault = &ctx.accounts.vault;
    require!(!vault.locked, MeridianError::VaultLocked);
    require!(vault.deposited >= amount, MeridianError::InsufficientBalance);
    require!(vault.kamino_shares == 0, MeridianError::VaultLocked); // must withdraw from Kamino first

    ctx.accounts.vault.locked = true;

    // ── Wormhole Token Bridge CPI (stubbed) ────────────────────────────────────
    //
    // Production implementation using wormhole-anchor-sdk:
    //
    //   let cpi_program = ctx.accounts.wormhole_token_bridge.to_account_info();
    //   let cpi_accounts = wormhole_anchor_sdk::token_bridge::cpi::accounts::TransferNative {
    //     payer:                    ctx.accounts.owner.to_account_info(),
    //     config:                   ctx.accounts.token_bridge_config.to_account_info(),
    //     from:                     ctx.accounts.vault_usdc_ata.to_account_info(),
    //     mint:                     ctx.accounts.usdc_mint.to_account_info(),
    //     custody:                  ctx.accounts.token_bridge_custody.to_account_info(),
    //     authority_signer:         ctx.accounts.token_bridge_authority_signer.to_account_info(),
    //     custody_signer:           ctx.accounts.token_bridge_custody_signer.to_account_info(),
    //     wormhole_bridge:          ctx.accounts.wormhole_bridge.to_account_info(),
    //     wormhole_message:         ctx.accounts.wormhole_message.to_account_info(),
    //     wormhole_emitter:         ctx.accounts.wormhole_emitter.to_account_info(),
    //     wormhole_sequence:        ctx.accounts.wormhole_sequence.to_account_info(),
    //     wormhole_fee_collector:   ctx.accounts.wormhole_fee_collector.to_account_info(),
    //     clock:                    ctx.accounts.clock.to_account_info(),
    //     rent:                     ctx.accounts.rent.to_account_info(),
    //     system_program:           ctx.accounts.system_program.to_account_info(),
    //     token_program:            ctx.accounts.token_program.to_account_info(),
    //   };
    //   // Ethereum chain ID in Wormhole is 2
    //   wormhole_anchor_sdk::token_bridge::cpi::transfer_native(
    //     CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds),
    //     wormhole_anchor_sdk::token_bridge::TransferNativeData {
    //       nonce: nonce as u32,
    //       amount,
    //       fee: arbiter_fee,
    //       target_address: eth_recipient.to_vec(),
    //       target_chain: 2,  // Ethereum Wormhole chain ID
    //     },
    //   )?;

    let vault = &mut ctx.accounts.vault;
    vault.locked    = false;
    vault.deposited = vault.deposited.checked_sub(amount).ok_or(MeridianError::Overflow)?;

    emit!(BridgedToEthereum {
        owner:          ctx.accounts.owner.key(),
        vault:          ctx.accounts.vault.key(),
        amount,
        arbiter_fee,
        eth_recipient,
        nonce,
    });

    Ok(())
}

#[event]
pub struct BridgedToEthereum {
    pub owner:         Pubkey,
    pub vault:         Pubkey,
    pub amount:        u64,
    pub arbiter_fee:   u64,
    pub eth_recipient: [u8; 20],
    pub nonce:         u64,
}

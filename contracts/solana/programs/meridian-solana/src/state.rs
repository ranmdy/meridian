use anchor_lang::prelude::*;

/// Singleton config PDA — holds protocol-wide settings.
/// Seeds: [b"config"]
#[account]
#[derive(Default)]
pub struct Config {
    /// Authority (deployer / multisig) — can update treasury / fee.
    pub authority: Pubkey,
    /// Treasury ATA that receives platform fees.
    pub treasury: Pubkey,
    /// Fee in basis points (default: 8 bps).
    pub fee_bps: u64,
    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1 + 64; // discriminator + fields + padding
}

/// Per-user vault PDA — tracks USDC balance and state flags.
/// Seeds: [b"vault", user.key(), nonce.to_le_bytes()]
#[account]
pub struct Vault {
    /// Owner of this vault (the strategy executor / user wallet).
    pub owner: Pubkey,
    /// USDC mint this vault holds.
    pub mint: Pubkey,
    /// Nonce used in PDA derivation (allows multiple vaults per user).
    pub nonce: u64,
    /// Total USDC deposited (lamports of token, 6 decimals for USDC).
    pub deposited: u64,
    /// Currently locked in Kamino (cannot be bridged until withdrawn).
    pub kamino_shares: u64,
    /// True while a CPI call is in-flight (prevents duplicate operations).
    pub locked: bool,
    /// Block slot at which this vault was created.
    pub created_slot: u64,
    pub bump: u8,
}

impl Vault {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 8 + 1 + 64;
}

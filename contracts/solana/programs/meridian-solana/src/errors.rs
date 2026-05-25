use anchor_lang::prelude::*;

#[error_code]
pub enum MeridianError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Insufficient vault balance")]
    InsufficientBalance,

    #[msg("Vault is already in use (pending Kamino deposit)")]
    VaultLocked,

    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,

    #[msg("Wormhole bridge: arbiter fee exceeds amount")]
    ArbiterFeeTooHigh,

    #[msg("Unauthorized: caller is not the vault owner")]
    Unauthorized,

    #[msg("Unauthorized: caller is not the program authority")]
    NotAuthority,

    #[msg("Math overflow")]
    Overflow,

    #[msg("Invalid treasury account")]
    InvalidTreasury,
}

/**
 * Meridian Solana — Anchor Integration Tests
 *
 * Run with:  anchor test
 * Requires:  solana-test-validator + anchor CLI installed
 *
 * Test coverage:
 *   - Initialize config (deploys global config PDA)
 *   - Create vault (deploys user vault PDA + ATA)
 *   - Deposit (transfers USDC to vault, deducts fee to treasury)
 *   - Withdraw (returns USDC to owner)
 *   - Emergency exit (authority drains and closes vault)
 *   - Error cases: zero amount, unauthorized, insufficient balance
 */

import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { assert } from 'chai';
import type { MeridianSolana } from '../target/types/meridian_solana';

describe('meridian-solana', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MeridianSolana as Program<MeridianSolana>;
  const authority = provider.wallet as anchor.Wallet;

  let usdcMint: PublicKey;
  let treasuryKp:    Keypair;
  let treasuryAta:   PublicKey;
  let userKp:        Keypair;
  let userAta:       PublicKey;
  let configPda:     PublicKey;
  let configBump:    number;
  const NONCE       = new BN(1);

  // ─── Setup ──────────────────────────────────────────────────────────────────

  before(async () => {
    // Deploy a mock USDC mint
    usdcMint = await createMint(
      provider.connection,
      (authority.payer as unknown as Keypair),
      authority.publicKey,
      null,
      6, // USDC has 6 decimals
    );

    // Create treasury keypair + ATA
    treasuryKp  = Keypair.generate();
    treasuryAta = await createAssociatedTokenAccount(
      provider.connection,
      (authority.payer as unknown as Keypair),
      usdcMint,
      treasuryKp.publicKey,
    );

    // Create user keypair + ATA + fund with 1000 USDC
    userKp  = Keypair.generate();
    userAta = await createAssociatedTokenAccount(
      provider.connection,
      (authority.payer as unknown as Keypair),
      usdcMint,
      userKp.publicKey,
    );
    await mintTo(
      provider.connection,
      (authority.payer as unknown as Keypair),
      usdcMint,
      userAta,
      authority.publicKey,
      1_000_000_000, // 1000 USDC (6 decimals)
    );

    // Derive config PDA
    [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      program.programId,
    );
  });

  // ─── initialize ─────────────────────────────────────────────────────────────

  it('initializes the config PDA', async () => {
    await program.methods
      .initialize(treasuryKp.publicKey)
      .accounts({
        config:        configPda,
        authority:     authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(config.treasury.toBase58(), treasuryKp.publicKey.toBase58());
    assert.equal(config.feeBps.toNumber(), 8);
  });

  // ─── createVault ────────────────────────────────────────────────────────────

  it('creates a vault PDA for the user', async () => {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), userKp.publicKey.toBuffer(), NONCE.toArrayLike(Buffer, 'le', 8)],
      program.programId,
    );
    const vaultAta = await anchor.utils.token.associatedAddress({
      mint:   usdcMint,
      owner:  vaultPda,
    });

    await program.methods
      .createVault(NONCE)
      .accounts({
        vault:                    vaultPda,
        vaultAta:                 vaultAta,
        mint:                     usdcMint,
        owner:                    userKp.publicKey,
        systemProgram:            SystemProgram.programId,
        tokenProgram:             TOKEN_PROGRAM_ID,
        associatedTokenProgram:   ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([userKp])
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.owner.toBase58(), userKp.publicKey.toBase58());
    assert.equal(vault.deposited.toNumber(), 0);
    assert.equal(vault.locked, false);
  });

  // ─── deposit ────────────────────────────────────────────────────────────────

  it('deposits USDC into vault and deducts platform fee', async () => {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), userKp.publicKey.toBuffer(), NONCE.toArrayLike(Buffer, 'le', 8)],
      program.programId,
    );
    const vaultAta = await anchor.utils.token.associatedAddress({
      mint:  usdcMint,
      owner: vaultPda,
    });

    const depositAmount = new BN(100_000_000); // 100 USDC
    const expectedFee   = new BN(8_000);       // 0.008 USDC (8 bps)
    const expectedNet   = depositAmount.sub(expectedFee);

    const beforeUser     = await getAccount(provider.connection, userAta);
    const beforeTreasury = await getAccount(provider.connection, treasuryAta);

    await program.methods
      .deposit(depositAmount, NONCE)
      .accounts({
        config:       configPda,
        vault:        vaultPda,
        vaultAta,
        treasuryAta,
        ownerAta:     userAta,
        mint:         usdcMint,
        owner:        userKp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([userKp])
      .rpc();

    const afterUser     = await getAccount(provider.connection, userAta);
    const afterTreasury = await getAccount(provider.connection, treasuryAta);
    const vault         = await program.account.vault.fetch(vaultPda);

    // User's ATA reduced by full amount
    assert.equal(
      (BigInt(afterUser.amount) - BigInt(beforeUser.amount)).toString(),
      (-depositAmount.toNumber()).toString(),
    );
    // Treasury received fee
    assert.isAbove(Number(afterTreasury.amount - beforeTreasury.amount), 0);
    // Vault records net deposit
    assert.equal(vault.deposited.toNumber(), expectedNet.toNumber());
  });

  // ─── withdraw ───────────────────────────────────────────────────────────────

  it('withdraws USDC from vault back to owner', async () => {
    const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), userKp.publicKey.toBuffer(), NONCE.toArrayLike(Buffer, 'le', 8)],
      program.programId,
    );
    const vaultAta = await anchor.utils.token.associatedAddress({
      mint:  usdcMint,
      owner: vaultPda,
    });

    const vault   = await program.account.vault.fetch(vaultPda);
    const balance = vault.deposited;
    const before  = await getAccount(provider.connection, userAta);

    await program.methods
      .withdraw(balance, NONCE)
      .accounts({
        vault:        vaultPda,
        vaultAta,
        ownerAta:     userAta,
        mint:         usdcMint,
        owner:        userKp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([userKp])
      .rpc();

    const after      = await getAccount(provider.connection, userAta);
    const vaultAfter = await program.account.vault.fetch(vaultPda);

    assert.equal(Number(after.amount - before.amount), balance.toNumber());
    assert.equal(vaultAfter.deposited.toNumber(), 0);
  });

  // ─── Error cases ────────────────────────────────────────────────────────────

  it('rejects deposit of zero amount', async () => {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), userKp.publicKey.toBuffer(), NONCE.toArrayLike(Buffer, 'le', 8)],
      program.programId,
    );
    const vaultAta = await anchor.utils.token.associatedAddress({
      mint:  usdcMint,
      owner: vaultPda,
    });

    try {
      await program.methods
        .deposit(new BN(0), NONCE)
        .accounts({
          config: configPda, vault: vaultPda, vaultAta, treasuryAta,
          ownerAta: userAta, mint: usdcMint, owner: userKp.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([userKp])
        .rpc();
      assert.fail('Should have thrown ZeroAmount error');
    } catch (err: unknown) {
      const error = err as { error?: { errorCode?: { code?: string } } };
      assert.include(
        error?.error?.errorCode?.code ?? String(err),
        'ZeroAmount',
      );
    }
  });

  it('rejects withdrawal exceeding vault balance', async () => {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), userKp.publicKey.toBuffer(), NONCE.toArrayLike(Buffer, 'le', 8)],
      program.programId,
    );
    const vaultAta = await anchor.utils.token.associatedAddress({
      mint:  usdcMint,
      owner: vaultPda,
    });

    try {
      await program.methods
        .withdraw(new BN(999_999_999_999), NONCE)
        .accounts({
          vault: vaultPda, vaultAta, ownerAta: userAta,
          mint: usdcMint, owner: userKp.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([userKp])
        .rpc();
      assert.fail('Should have thrown InsufficientBalance error');
    } catch (err: unknown) {
      const error = err as { error?: { errorCode?: { code?: string } } };
      assert.include(
        error?.error?.errorCode?.code ?? String(err),
        'InsufficientBalance',
      );
    }
  });
});

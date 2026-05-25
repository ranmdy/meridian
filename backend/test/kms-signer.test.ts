/**
 * kms-signer.test.ts
 *
 * Tests the KMS signer service in dev/fallback mode (plaintext private keys).
 * AWS KMS path is integration-only and not exercised here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Well-known Hardhat test key (never holds real funds)
const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

describe('KMS Signer (dev mode)', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear all relayer env vars
    delete process.env.RELAYER_PRIVATE_KEY;
    delete process.env.RELAYER_PK_ETH;
    delete process.env.RELAYER_PK_BASE;
    delete process.env.AWS_KMS_KEY_ID;
    delete process.env.AWS_KMS_KEY_ID_ETH;
  });

  afterEach(() => {
    delete process.env.RELAYER_PRIVATE_KEY;
    delete process.env.RELAYER_PK_ETH;
  });

  it('returns null when no key is configured', async () => {
    const { getRelayerAccount } = await import('../src/services/kms-signer/index.js');
    const account = await getRelayerAccount(1);
    expect(account).toBeNull();
  });

  it('uses RELAYER_PRIVATE_KEY (global) for any chain', async () => {
    process.env.RELAYER_PRIVATE_KEY = TEST_PK;
    const { getRelayerAccount } = await import('../src/services/kms-signer/index.js');
    const account = await getRelayerAccount(1);
    expect(account).not.toBeNull();
    expect(account!.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
  });

  it('uses RELAYER_PK_ETH for chain 1 (chain-specific override)', async () => {
    process.env.RELAYER_PRIVATE_KEY = '0x' + 'aa'.repeat(32); // different global key
    process.env.RELAYER_PK_ETH     = TEST_PK;                 // chain override
    const { getRelayerAccount } = await import('../src/services/kms-signer/index.js');
    const account = await getRelayerAccount(1);
    expect(account!.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
  });

  it('uses RELAYER_PK_BASE for chain 8453', async () => {
    process.env.RELAYER_PK_BASE = TEST_PK;
    const { getRelayerAccount } = await import('../src/services/kms-signer/index.js');
    const account = await getRelayerAccount(8453);
    expect(account!.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
  });

  it('uses RELAYER_PK_SCROLL for chain 534352', async () => {
    process.env.RELAYER_PK_SCROLL = TEST_PK;
    const { getRelayerAccount } = await import('../src/services/kms-signer/index.js');
    const account = await getRelayerAccount(534352);
    expect(account!.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
  });

  it('uses RELAYER_PK_ZKSYNC for chain 324', async () => {
    process.env.RELAYER_PK_ZKSYNC = TEST_PK;
    const { getRelayerAccount } = await import('../src/services/kms-signer/index.js');
    const account = await getRelayerAccount(324);
    expect(account!.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
  });

  it('falls back to global key when chain-specific is missing', async () => {
    process.env.RELAYER_PRIVATE_KEY = TEST_PK;
    const { getRelayerAccount } = await import('../src/services/kms-signer/index.js');
    // No RELAYER_PK_ARB set — should fall back to global
    const account = await getRelayerAccount(42161);
    expect(account!.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
  });

  it('signerDescription returns "plaintext-key:global"', async () => {
    process.env.RELAYER_PRIVATE_KEY = TEST_PK;
    const { signerDescription } = await import('../src/services/kms-signer/index.js');
    expect(signerDescription(1)).toBe('plaintext-key:global');
  });

  it('signerDescription returns "plaintext-key:ETH" for chain-specific', async () => {
    process.env.RELAYER_PK_ETH = TEST_PK;
    const { signerDescription } = await import('../src/services/kms-signer/index.js');
    expect(signerDescription(1)).toBe('plaintext-key:ETH');
  });

  it('signerDescription returns "none" when unconfigured', async () => {
    const { signerDescription } = await import('../src/services/kms-signer/index.js');
    expect(signerDescription(1)).toBe('none');
  });
});

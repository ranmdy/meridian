import { describe, it, expect, beforeEach } from 'vitest';

// Import internals via dynamic import so we can reset state between tests
let createApiKey: typeof import('../src/services/api-keys/index.js').createApiKey;
let validateApiKey: typeof import('../src/services/api-keys/index.js').validateApiKey;
let revokeApiKey: typeof import('../src/services/api-keys/index.js').revokeApiKey;
let listApiKeys: typeof import('../src/services/api-keys/index.js').listApiKeys;
let getApiKeyStats: typeof import('../src/services/api-keys/index.js').getApiKeyStats;

// Re-import fresh module before each describe block
beforeEach(async () => {
  // Vitest module cache reset is not trivial — use the same module instance
  // and rely on unique wallet addresses per test to isolate state.
  const mod = await import('../src/services/api-keys/index.js');
  createApiKey = mod.createApiKey;
  validateApiKey = mod.validateApiKey;
  revokeApiKey = mod.revokeApiKey;
  listApiKeys = mod.listApiKeys;
  getApiKeyStats = mod.getApiKeyStats;
});

const WALLET = '0xdeadbeef00000000000000000000000000000001';
const WALLET2 = '0xdeadbeef00000000000000000000000000000002';

describe('ApiKeyService', () => {
  describe('createApiKey', () => {
    it('returns rawKey and a record', () => {
      const { rawKey, record } = createApiKey({
        walletAddress: WALLET,
        tier: 'starter',
        name: 'Test Key',
      });
      expect(rawKey).toMatch(/^mk_(test|live)_[0-9a-f]{32}$/);
      expect(record.tier).toBe('starter');
      expect(record.name).toBe('Test Key');
      expect(record.revokedAt).toBeNull();
      expect(record.usageThisMonth).toBe(0);
    });

    it('defaults to test environment', () => {
      const { rawKey } = createApiKey({ walletAddress: WALLET, tier: 'growth', name: 'K' });
      expect(rawKey).toMatch(/^mk_test_/);
    });

    it('respects live environment', () => {
      const { rawKey } = createApiKey({
        walletAddress: WALLET, tier: 'enterprise', name: 'L', environment: 'live',
      });
      expect(rawKey).toMatch(/^mk_live_/);
    });

    it('assigns correct rate limits by tier', () => {
      const starter = createApiKey({ walletAddress: WALLET, tier: 'starter', name: 'S' }).record;
      const growth  = createApiKey({ walletAddress: WALLET, tier: 'growth',  name: 'G' }).record;
      const ent     = createApiKey({ walletAddress: WALLET, tier: 'enterprise', name: 'E' }).record;

      expect(starter.requestsPerMinute).toBe(10);
      expect(growth.requestsPerMinute).toBe(60);
      expect(ent.requestsPerMinute).toBe(300);

      expect(starter.requestsPerMonth).toBe(10_000);
      expect(growth.requestsPerMonth).toBe(100_000);
      expect(ent.requestsPerMonth).toBe(1_000_000);
    });

    it('rawKey is never stored in plain — only hash is stored', () => {
      const w = '0x' + 'ab'.repeat(20);
      const { rawKey, record } = createApiKey({ walletAddress: w, tier: 'starter', name: 'H' });
      const listed = listApiKeys(w);
      const found = listed.find((k) => k.id === record.id);
      expect(found).toBeDefined();
      // keyHash field should not be present on listed records
      expect((found as Record<string, unknown>).keyHash).toBeUndefined();
      // rawKey is not stored
      expect(JSON.stringify(found)).not.toContain(rawKey);
    });
  });

  describe('validateApiKey', () => {
    it('returns record on valid key', () => {
      const w = '0x' + 'aa'.repeat(20);
      const { rawKey, record } = createApiKey({ walletAddress: w, tier: 'growth', name: 'V' });
      const validated = validateApiKey(rawKey);
      expect(validated.id).toBe(record.id);
      expect(validated.usageThisMonth).toBe(1);
    });

    it('increments usageThisMonth on each call', () => {
      const w = '0x' + 'cc'.repeat(20);
      const { rawKey } = createApiKey({ walletAddress: w, tier: 'enterprise', name: 'U' });
      validateApiKey(rawKey);
      validateApiKey(rawKey);
      const record = validateApiKey(rawKey);
      expect(record.usageThisMonth).toBe(3);
    });

    it('throws on unknown key', () => {
      expect(() => validateApiKey('mk_test_' + 'ff'.repeat(16))).toThrow('Invalid API key');
    });

    it('throws on revoked key', () => {
      const w = '0x' + 'dd'.repeat(20);
      const { rawKey, record } = createApiKey({ walletAddress: w, tier: 'starter', name: 'R' });
      revokeApiKey(record.id, w);
      expect(() => validateApiKey(rawKey)).toThrow('revoked');
    });
  });

  describe('revokeApiKey', () => {
    it('returns true for valid revocation', () => {
      const w = '0x' + 'ee'.repeat(20);
      const { record } = createApiKey({ walletAddress: w, tier: 'starter', name: 'Rv' });
      expect(revokeApiKey(record.id, w)).toBe(true);
    });

    it('returns false for unknown id', () => {
      expect(revokeApiKey('nonexistent…', WALLET2)).toBe(false);
    });

    it('returns false if wallet does not own the key', () => {
      const w = '0x' + 'ff'.repeat(20);
      const { record } = createApiKey({ walletAddress: w, tier: 'starter', name: 'Ro' });
      expect(revokeApiKey(record.id, WALLET2)).toBe(false);
    });

    it('sets revokedAt timestamp', () => {
      const w = '0x' + '11'.repeat(20);
      const before = Date.now();
      const { record } = createApiKey({ walletAddress: w, tier: 'starter', name: 'Rt' });
      revokeApiKey(record.id, w);
      const listed = listApiKeys(w);
      const found = listed.find((k) => k.id === record.id);
      expect(found?.revokedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('listApiKeys', () => {
    it('only returns keys for the given wallet', () => {
      const w = '0x' + '22'.repeat(20);
      createApiKey({ walletAddress: w, tier: 'starter', name: 'L1' });
      createApiKey({ walletAddress: w, tier: 'growth',  name: 'L2' });
      createApiKey({ walletAddress: WALLET2, tier: 'starter', name: 'Other' });
      const keys = listApiKeys(w);
      expect(keys.every((k) => k.walletAddress === w.toLowerCase())).toBe(true);
    });

    it('is case-insensitive on wallet address', () => {
      const w = '0x' + '33'.repeat(20);
      createApiKey({ walletAddress: w.toUpperCase(), tier: 'starter', name: 'CI' });
      expect(listApiKeys(w.toLowerCase()).length).toBeGreaterThan(0);
    });
  });

  describe('getApiKeyStats', () => {
    it('counts active vs total keys', () => {
      const w = '0x' + '44'.repeat(20);
      const { record: r1 } = createApiKey({ walletAddress: w, tier: 'starter', name: 'S1' });
      createApiKey({ walletAddress: w, tier: 'starter', name: 'S2' });
      revokeApiKey(r1.id, w);

      const stats = getApiKeyStats(w);
      expect(stats.totalKeys).toBeGreaterThanOrEqual(2);
      // activeKeys should be one less than totalKeys (revoked r1)
      expect(stats.activeKeys).toBe(stats.totalKeys - 1);
    });
  });
});

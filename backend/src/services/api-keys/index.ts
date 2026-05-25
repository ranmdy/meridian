/**
 * API Key Management Service — Phase 3
 *
 * Generates, validates, and rate-limits programmatic API keys for
 * Business API tier customers ($299–$2,999/month).
 *
 * Key format: mk_<tier>_<32-char-hex>
 *   mk_test_<hex>  — sandbox keys (no real funds)
 *   mk_live_<hex>  — production keys
 *
 * Phase 1: in-memory store.
 * Phase 2: PostgreSQL + Redis for rate-limit counters.
 */

import { randomBytes, createHash } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiKeyTier = 'starter' | 'growth' | 'enterprise';

export interface ApiKeyRecord {
  id: string;                  // public identifier (prefix only)
  keyHash: string;             // SHA-256 of full key (never stored in plain)
  walletAddress: string;
  tier: ApiKeyTier;
  name: string;                // human label (e.g. "Production bot")
  environment: 'test' | 'live';
  requestsPerMinute: number;   // rate limit
  requestsPerMonth: number;    // monthly quota
  usageThisMonth: number;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

const TIER_LIMITS: Record<ApiKeyTier, { rpm: number; monthly: number }> = {
  starter:    { rpm: 10,  monthly: 10_000  },
  growth:     { rpm: 60,  monthly: 100_000 },
  enterprise: { rpm: 300, monthly: 1_000_000 },
};

// ─── In-memory store ──────────────────────────────────────────────────────────

const keys = new Map<string, ApiKeyRecord>(); // keyId → record
const hashIndex = new Map<string, string>();   // keyHash → keyId

// ─── Request counter (per-minute sliding window) ──────────────────────────────

const requestCounts = new Map<string, { count: number; windowStart: number }>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function generateKey(environment: 'test' | 'live'): string {
  return `mk_${environment}_${randomBytes(16).toString('hex')}`;
}

function makeId(rawKey: string): string {
  // Public ID = first 24 chars of key (safe to display)
  return rawKey.slice(0, 24) + '…';
}

// ─── Service API ──────────────────────────────────────────────────────────────

export function createApiKey(opts: {
  walletAddress: string;
  tier: ApiKeyTier;
  name: string;
  environment?: 'test' | 'live';
}): { record: ApiKeyRecord; rawKey: string } {
  const env = opts.environment ?? 'test';
  const rawKey = generateKey(env);
  const keyHash = hashKey(rawKey);
  const id = makeId(rawKey);
  const limits = TIER_LIMITS[opts.tier];

  const record: ApiKeyRecord = {
    id,
    keyHash,
    walletAddress: opts.walletAddress.toLowerCase(),
    tier: opts.tier,
    name: opts.name,
    environment: env,
    requestsPerMinute: limits.rpm,
    requestsPerMonth: limits.monthly,
    usageThisMonth: 0,
    createdAt: Date.now(),
    lastUsedAt: null,
    revokedAt: null,
  };

  keys.set(id, record);
  hashIndex.set(keyHash, id);

  console.log(`[ApiKeys] Created ${env} key for ${opts.walletAddress} tier=${opts.tier} name="${opts.name}"`);
  return { record, rawKey };
}

/**
 * Validate a raw API key and check rate limits.
 * Returns the record if valid, or throws with a descriptive error.
 */
export function validateApiKey(rawKey: string): ApiKeyRecord {
  const hash = hashKey(rawKey);
  const id = hashIndex.get(hash);
  if (!id) throw new Error('Invalid API key');

  const record = keys.get(id);
  if (!record) throw new Error('Invalid API key');
  if (record.revokedAt) throw new Error('API key has been revoked');

  const now = Date.now();

  // Per-minute rate limit
  const window = requestCounts.get(id);
  if (window && now - window.windowStart < 60_000) {
    if (window.count >= record.requestsPerMinute) {
      throw new Error(`Rate limit exceeded: ${record.requestsPerMinute} req/min`);
    }
    window.count++;
  } else {
    requestCounts.set(id, { count: 1, windowStart: now });
  }

  // Monthly quota
  if (record.usageThisMonth >= record.requestsPerMonth) {
    throw new Error(`Monthly quota exceeded: ${record.requestsPerMonth.toLocaleString()} requests`);
  }

  record.usageThisMonth++;
  record.lastUsedAt = now;

  return record;
}

export function revokeApiKey(id: string, walletAddress: string): boolean {
  const record = keys.get(id);
  if (!record) return false;
  if (record.walletAddress !== walletAddress.toLowerCase()) return false;
  record.revokedAt = Date.now();
  console.log(`[ApiKeys] Revoked key ${id} for ${walletAddress}`);
  return true;
}

export function listApiKeys(walletAddress: string): Omit<ApiKeyRecord, 'keyHash'>[] {
  return Array.from(keys.values())
    .filter((r) => r.walletAddress === walletAddress.toLowerCase())
    .map(({ keyHash: _, ...rest }) => rest); // never expose hash
}

export function getApiKeyStats(walletAddress: string): {
  totalKeys: number;
  activeKeys: number;
  totalRequestsThisMonth: number;
} {
  const wallet = walletAddress.toLowerCase();
  const walletKeys = Array.from(keys.values()).filter((r) => r.walletAddress === wallet);
  return {
    totalKeys: walletKeys.length,
    activeKeys: walletKeys.filter((r) => !r.revokedAt).length,
    totalRequestsThisMonth: walletKeys.reduce((s, r) => s + r.usageThisMonth, 0),
  };
}

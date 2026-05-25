/**
 * Per-tier rate limiting
 *
 * Tiers:
 *   anonymous:  20 req/min  (IP-based, no auth)
 *   free:       60 req/min  (authenticated wallet, no subscription)
 *   pro:        300 req/min (active Pro subscription)
 *   api:        1000 req/hr (API key bearer auth — business tier)
 *
 * Phase 2: persist tier assignments in PostgreSQL.
 * Phase 1: in-memory map, reset on server restart.
 */

import type { FastifyRequest } from 'fastify';
import { verifyJwt } from '../auth/index.js';

export type Tier = 'anonymous' | 'free' | 'pro' | 'api';

export interface TierLimits {
  max: number;
  timeWindowMs: number;
  keyBy: (req: FastifyRequest) => string;
}

// ─── In-memory pro wallets + API keys ─────────────────────────────────────────
// Phase 2: replace with DB lookups

const proWallets = new Set<string>();
const apiKeys = new Map<string, { owner: string; rph: number }>();  // rph = requests per hour

export function grantProAccess(wallet: string) {
  proWallets.add(wallet.toLowerCase());
}

export function registerApiKey(key: string, owner: string, rph = 1000) {
  apiKeys.set(key, { owner, rph });
}

// ─── Tier detection ───────────────────────────────────────────────────────────

export function detectTier(request: FastifyRequest): Tier {
  // API key in Authorization: Bearer sk_...
  const authHeader = request.headers['authorization'] ?? '';
  if (authHeader.startsWith('Bearer sk_')) {
    const key = authHeader.slice(7);
    if (apiKeys.has(key)) return 'api';
  }

  // JWT wallet session
  let wallet: string | null = null;
  try {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token && !token.startsWith('sk_')) {
      const payload = verifyJwt(token);
      wallet = payload.sub;
    }
  } catch {
    // not authenticated
  }

  if (wallet) {
    return proWallets.has(wallet) ? 'pro' : 'free';
  }

  return 'anonymous';
}

// ─── Limits per tier ──────────────────────────────────────────────────────────

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  anonymous: {
    max: 20,
    timeWindowMs: 60_000,
    keyBy: (req) => req.ip,
  },
  free: {
    max: 60,
    timeWindowMs: 60_000,
    keyBy: (req) => {
      try {
        const auth = req.headers['authorization'] ?? '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        return verifyJwt(token).sub;
      } catch {
        return req.ip;
      }
    },
  },
  pro: {
    max: 300,
    timeWindowMs: 60_000,
    keyBy: (req) => {
      try {
        const auth = req.headers['authorization'] ?? '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        return verifyJwt(token).sub;
      } catch {
        return req.ip;
      }
    },
  },
  api: {
    max: 1000,
    timeWindowMs: 60 * 60_000,  // per hour
    keyBy: (req) => (req.headers['authorization'] ?? '').slice(7),
  },
};

// ─── Sliding-window counter ────────────────────────────────────────────────────

interface WindowEntry {
  timestamps: number[];   // ms epoch of each request in the current window
}

const windowStore = new Map<string, WindowEntry>();

// Prune expired entries every 5 minutes to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windowStore.entries()) {
    // Use the longest possible window (1 hr) for safe pruning
    entry.timestamps = entry.timestamps.filter((t) => now - t < 60 * 60_000);
    if (entry.timestamps.length === 0) windowStore.delete(key);
  }
}, 5 * 60_000).unref();

/**
 * Returns { allowed, remaining, resetMs }.
 * Mutates the in-memory store — call once per request.
 */
function checkWindow(key: string, max: number, windowMs: number): {
  allowed: boolean;
  remaining: number;
  resetMs: number;
} {
  const now = Date.now();
  const entry = windowStore.get(key) ?? { timestamps: [] };

  // Slide: keep only timestamps within the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  const count = entry.timestamps.length;
  if (count >= max) {
    const oldestInWindow = entry.timestamps[0]!;
    windowStore.set(key, entry);
    return { allowed: false, remaining: 0, resetMs: oldestInWindow + windowMs - now };
  }

  entry.timestamps.push(now);
  windowStore.set(key, entry);
  return { allowed: true, remaining: max - entry.timestamps.length, resetMs: windowMs };
}

// ─── Fastify preHandler ────────────────────────────────────────────────────────

import type { preHandlerHookHandler } from 'fastify';

/**
 * Tiered rate-limit preHandler.
 * Usage: `{ preHandler: tieredRateLimit }` on any route.
 */
export const tieredRateLimit: preHandlerHookHandler = function (request, reply, done) {
  const tier = detectTier(request);
  const limits = TIER_LIMITS[tier];
  const key = `${tier}:${limits.keyBy(request)}`;
  const { allowed, remaining, resetMs } = checkWindow(key, limits.max, limits.timeWindowMs);

  // Always set informational headers
  reply.header('X-RateLimit-Tier', tier);
  reply.header('X-RateLimit-Limit', limits.max);
  reply.header('X-RateLimit-Remaining', remaining);
  reply.header('X-RateLimit-Reset', Math.ceil(resetMs / 1000));

  if (!allowed) {
    reply.status(429).send({
      error: 'Rate limit exceeded',
      tier,
      retryAfterMs: resetMs,
    });
    return;
  }

  done();
};

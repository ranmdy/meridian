import { describe, it, expect } from 'vitest';
import {
  detectTier,
  grantProAccess,
  registerApiKey,
  TIER_LIMITS,
  tieredRateLimit,
  type Tier,
} from '../src/services/rateLimit/index.js';
import type { FastifyRequest } from 'fastify';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as FastifyRequest;
}

function makeAuthRequest(token: string): FastifyRequest {
  return makeRequest({ headers: { authorization: `Bearer ${token}` } });
}

// ─── detectTier ───────────────────────────────────────────────────────────────

describe('detectTier', () => {
  it('returns anonymous for a plain IP request', () => {
    expect(detectTier(makeRequest())).toBe('anonymous');
  });

  it('returns api for a registered API key', () => {
    registerApiKey('sk_test_key_1', 'owner@example.com');
    const req = makeRequest({ headers: { authorization: 'Bearer sk_test_key_1' } });
    expect(detectTier(req)).toBe('api');
  });

  it('returns anonymous for an unregistered sk_ key', () => {
    const req = makeRequest({ headers: { authorization: 'Bearer sk_not_registered' } });
    // sk_ keys that aren't registered fall through to anonymous (no JWT)
    expect(detectTier(req)).toBe('anonymous');
  });

  it('returns anonymous when Authorization header is absent', () => {
    expect(detectTier(makeRequest({ headers: {} }))).toBe('anonymous');
  });
});

describe('TIER_LIMITS', () => {
  it('anonymous limit is 20 req/min', () => {
    expect(TIER_LIMITS.anonymous.max).toBe(20);
    expect(TIER_LIMITS.anonymous.timeWindowMs).toBe(60_000);
  });

  it('free limit is 60 req/min', () => {
    expect(TIER_LIMITS.free.max).toBe(60);
    expect(TIER_LIMITS.free.timeWindowMs).toBe(60_000);
  });

  it('pro limit is 300 req/min', () => {
    expect(TIER_LIMITS.pro.max).toBe(300);
    expect(TIER_LIMITS.pro.timeWindowMs).toBe(60_000);
  });

  it('api limit is 1000 req/hr', () => {
    expect(TIER_LIMITS.api.max).toBe(1000);
    expect(TIER_LIMITS.api.timeWindowMs).toBe(60 * 60_000);
  });

  it('all tiers have a keyBy function', () => {
    for (const tier of ['anonymous', 'free', 'pro', 'api'] as Tier[]) {
      expect(typeof TIER_LIMITS[tier].keyBy).toBe('function');
    }
  });

  it('anonymous keyBy returns the IP', () => {
    const req = makeRequest({ ip: '10.0.0.5' });
    expect(TIER_LIMITS.anonymous.keyBy(req)).toBe('10.0.0.5');
  });
});

describe('grantProAccess / registerApiKey', () => {
  it('grantProAccess is callable without throwing', () => {
    expect(() => grantProAccess('0xDeadBeef')).not.toThrow();
  });

  it('registerApiKey is callable without throwing', () => {
    expect(() => registerApiKey('sk_test_key_2', 'owner', 500)).not.toThrow();
  });
});

describe('tieredRateLimit preHandler', () => {
  it('is a function', () => {
    expect(typeof tieredRateLimit).toBe('function');
  });

  it('calls done() when under the limit (anonymous IP-based)', () => {
    // Use a unique IP so we don't collide with other tests
    const req = makeRequest({ ip: '192.168.100.1' });

    let doneCalled = false;
    let statusCode: number | null = null;

    const mockReply = {
      header: () => mockReply,
      status: (code: number) => { statusCode = code; return mockReply; },
      send: () => mockReply,
    };

    tieredRateLimit.call(
      null,
      req,
      mockReply as never,
      () => { doneCalled = true; },
    );

    expect(doneCalled).toBe(true);
    expect(statusCode).toBeNull();
  });

  it('returns 429 after exceeding the anonymous limit', () => {
    const req = makeRequest({ ip: '10.5.5.5' });

    let finalStatus: number | null = null;
    let finalBody: unknown = null;

    const mockReply = {
      header: () => mockReply,
      status: (code: number) => { finalStatus = code; return mockReply; },
      send: (body: unknown) => { finalBody = body; return mockReply; },
    };

    const ANON_LIMIT = TIER_LIMITS.anonymous.max; // 20

    // Exhaust the limit
    for (let i = 0; i < ANON_LIMIT; i++) {
      tieredRateLimit.call(null, req, mockReply as never, () => {});
    }

    // This one should be rejected
    tieredRateLimit.call(null, req, mockReply as never, () => {
      // should not be called
      expect(true).toBe(false);
    });

    expect(finalStatus).toBe(429);
    expect((finalBody as { error: string }).error).toBe('Rate limit exceeded');
  });

  it('sets X-RateLimit-* headers on each request', () => {
    const req = makeRequest({ ip: '10.6.6.6' });
    const headers: Record<string, unknown> = {};

    const mockReply = {
      header: (k: string, v: unknown) => { headers[k] = v; return mockReply; },
      status: () => mockReply,
      send: () => mockReply,
    };

    tieredRateLimit.call(null, req, mockReply as never, () => {});

    expect(headers['X-RateLimit-Tier']).toBe('anonymous');
    expect(typeof headers['X-RateLimit-Limit']).toBe('number');
    expect(typeof headers['X-RateLimit-Remaining']).toBe('number');
    expect(typeof headers['X-RateLimit-Reset']).toBe('number');
  });
});

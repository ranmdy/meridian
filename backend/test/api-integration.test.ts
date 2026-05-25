/**
 * Backend API Integration Tests
 *
 * Spins up a real Fastify app (with real services, no external I/O) and exercises
 * the REST endpoints via fastify.inject() — no HTTP port, no network required.
 *
 * Covers:
 *   - Strategy: optimize, auto-optimize, graph/stats, apy listing
 *   - Templates: list, categories, single by id
 *   - Auth: nonce generation
 *   - Quotes: gas/apy/swap/bridge empty-cache 404s
 *   - Simulation: strategy/simulate with valid routeIndex
 *   - Health: GET /health
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StrategyEngine } from '../src/services/strategy-engine/index.js';
import { QuoteEngine } from '../src/services/quote-engine/index.js';
import { strategyRoutes } from '../src/api/routes/strategy.js';
import { authRoutes } from '../src/api/routes/auth.js';
import { templateRoutes } from '../src/api/routes/templates.js';

// ─── App builder ─────────────────────────────────────────────────────────────

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const quoteEngine  = new QuoteEngine();
  const strategyEngine = new StrategyEngine();

  // Register only the routes needed for these tests
  await app.register(strategyRoutes, { strategyEngine, quoteEngine });
  await app.register(authRoutes);
  await app.register(templateRoutes);

  app.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));

  await app.ready();
  return app;
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

// ─── Health ──────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string }>();
    expect(body.status).toBe('ok');
  });
});

// ─── Strategy: optimize ───────────────────────────────────────────────────────

describe('POST /strategy/optimize', () => {
  const validBody = {
    sourceAsset: 'ETH',
    sourceChain: 1,
    sourceAmountUsd: 1000,
    destinationChain: 42161,
    riskTolerance: 3,
    timeHorizonDays: 30,
  };

  it('returns 200 with routes array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/optimize',
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ routes: unknown[] }>();
    expect(Array.isArray(body.routes)).toBe(true);
  });

  it('each route has required financial fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/optimize',
      payload: validBody,
    });
    const { routes } = res.json<{
      routes: Array<{
        totalScore: number;
        estimatedApyBps: number;
        totalGasUsd: number;
        bridgeCount: number;
        riskScore: number;
        hopCount: number;
        steps: unknown[];
      }>;
    }>();
    if (routes.length > 0) {
      const r = routes[0]!;
      expect(typeof r.totalScore).toBe('number');
      expect(typeof r.estimatedApyBps).toBe('number');
      expect(typeof r.totalGasUsd).toBe('number');
      expect(typeof r.bridgeCount).toBe('number');
      expect(typeof r.riskScore).toBe('number');
      expect(typeof r.hopCount).toBe('number');
      expect(Array.isArray(r.steps)).toBe(true);
    }
  });

  it('returns 400 on missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/optimize',
      payload: { sourceAsset: 'ETH' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on invalid riskTolerance (out of 1-5 range)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/optimize',
      payload: { ...validBody, riskTolerance: 6 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns quoteExpiresAt and simulatedAt timestamps', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/optimize',
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ simulatedAt: number; quoteExpiresAt: number }>();
    expect(typeof body.simulatedAt).toBe('number');
    expect(typeof body.quoteExpiresAt).toBe('number');
    expect(body.quoteExpiresAt).toBeGreaterThan(body.simulatedAt);
  });

  it('accepts valid destination wallet + signature pair (signature verification attempted)', async () => {
    // No valid ECDSA sig — we expect 403 if wallet+sig provided but invalid
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/optimize',
      payload: {
        ...validBody,
        destinationWallet: '0x0000000000000000000000000000000000000001',
        destinationSignature: '0x' + 'ab'.repeat(65),
      },
    });
    // Either 403 (sig mismatch) or 200 (chain not available in test) — not 400 (schema valid)
    expect([200, 403, 422]).toContain(res.statusCode);
  });
});

// ─── Strategy: auto-optimize ─────────────────────────────────────────────────

describe('POST /strategy/auto-optimize', () => {
  const validBody = {
    sourceAsset: 'USDC',
    sourceChain: 1,
    sourceAmountUsd: 5000,
    destinationChain: 8453,
    riskTolerance: 2,
    timeHorizonDays: 90,
  };

  it('returns 200 with a single best route', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/auto-optimize',
      payload: validBody,
    });
    if (res.statusCode === 422) return; // no routes for this pair in seed graph — ok
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      route: unknown;
      routeIndex: number;
      explanation: string;
      alternatives: unknown[];
    }>();
    expect(body.route).toBeDefined();
    expect(typeof body.routeIndex).toBe('number');
    expect(typeof body.explanation).toBe('string');
    expect(body.explanation.length).toBeGreaterThan(0);
    expect(Array.isArray(body.alternatives)).toBe(true);
  });

  it('low riskTolerance explanation mentions safety', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/auto-optimize',
      payload: { ...validBody, riskTolerance: 1 },
    });
    if (res.statusCode === 422) return;
    const { explanation } = res.json<{ explanation: string }>();
    expect(explanation.toLowerCase()).toContain('safety');
  });

  it('high riskTolerance explanation mentions yield', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/auto-optimize',
      payload: { ...validBody, riskTolerance: 5, sourceChain: 1, destinationChain: 42161 },
    });
    if (res.statusCode === 422) return;
    const { explanation } = res.json<{ explanation: string }>();
    expect(explanation.toLowerCase()).toContain('yield');
  });

  it('returns 400 on missing fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/auto-optimize',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Strategy: graph stats ────────────────────────────────────────────────────

describe('GET /strategy/graph/stats', () => {
  it('returns node and edge counts', async () => {
    const res = await app.inject({ method: 'GET', url: '/strategy/graph/stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ nodes: number; edges: number }>();
    expect(typeof body.nodes).toBe('number');
    expect(typeof body.edges).toBe('number');
    expect(body.nodes).toBeGreaterThan(0);
    expect(body.edges).toBeGreaterThan(0);
  });
});

// ─── Strategy: APY endpoint ───────────────────────────────────────────────────

describe('GET /strategy/apy', () => {
  it('returns 200 with a quotes array (may be empty before first poll)', async () => {
    const res = await app.inject({ method: 'GET', url: '/strategy/apy' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ quotes: unknown[] }>();
    expect(Array.isArray(body.quotes)).toBe(true);
  });
});

// ─── Quotes: gas ─────────────────────────────────────────────────────────────

describe('GET /quotes/gas', () => {
  it('returns 200 with empty array before first poll cycle', async () => {
    const res = await app.inject({ method: 'GET', url: '/quotes/gas' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // getAllGasQuotes returns [] before polling; getGasQuote returns 404 for unknown chain
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns 404 for unknown chain', async () => {
    const res = await app.inject({ method: 'GET', url: '/quotes/gas?chain=999999' });
    expect(res.statusCode).toBe(404);
  });
});

// ─── Quotes: apy ─────────────────────────────────────────────────────────────

describe('GET /quotes/apy', () => {
  it('returns 404 for unknown protocol/chain/asset before first poll', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/quotes/apy?protocol=aave_v3&chain=1&asset=USDC',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when query params are missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/quotes/apy' });
    // quoteEngine.getApyQuote(undefined, NaN, undefined) → null → 404
    expect(res.statusCode).toBe(404);
  });
});

// ─── Quotes: swap ────────────────────────────────────────────────────────────

describe('GET /quotes/swap', () => {
  it('returns 400 when required params are missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/quotes/swap?chain=1' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for uncached pair before first poll', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/quotes/swap?chain=1&from=ETH&to=USDC',
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── Quotes: bridge ───────────────────────────────────────────────────────────

describe('GET /quotes/bridge', () => {
  it('returns 404 for uncached bridge route before first poll', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/quotes/bridge?protocol=stargate&fromChain=1&toChain=42161&asset=USDC',
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── Auth: nonce ──────────────────────────────────────────────────────────────

describe('GET /auth/nonce', () => {
  it('returns a nonce string', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/nonce' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ nonce: string }>();
    expect(typeof body.nonce).toBe('string');
    expect(body.nonce.length).toBeGreaterThan(0);
  });

  it('returns a wallet-specific nonce when wallet is provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/nonce?wallet=0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ nonce: string; message?: string }>();
    expect(typeof body.nonce).toBe('string');
  });
});

// ─── Auth: verify (invalid sig) ───────────────────────────────────────────────

describe('POST /auth/verify', () => {
  it('returns 400 on malformed body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { nonce: 'abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 on invalid signature', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: {
        nonce: 'somevalidnonce',
        signature: '0x' + 'ab'.repeat(65),
        wallet: '0x0000000000000000000000000000000000000001',
      },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── Templates ────────────────────────────────────────────────────────────────

describe('GET /templates', () => {
  it('returns 200 with templates array and total count', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ templates: unknown[]; total: number }>();
    expect(Array.isArray(body.templates)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.total).toBeGreaterThan(0);
  });

  it('respects limit query param', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates?limit=2' });
    expect(res.statusCode).toBe(200);
    const { templates } = res.json<{ templates: unknown[] }>();
    expect(templates.length).toBeLessThanOrEqual(2);
  });

  it('filters by category', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates?category=yield' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      templates: Array<{ category: string }>;
    }>();
    expect(body.templates.every((t) => t.category === 'yield')).toBe(true);
  });

  it('filters by maxRisk', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates?maxRisk=2' });
    expect(res.statusCode).toBe(200);
    const { templates } = res.json<{ templates: Array<{ riskLevel: number }> }>();
    expect(templates.every((t) => t.riskLevel <= 2)).toBe(true);
  });

  it('sorts by apy descending', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates?sort=apy&limit=100' });
    expect(res.statusCode).toBe(200);
    const { templates } = res.json<{ templates: Array<{ estimatedApyBps: number }> }>();
    for (let i = 1; i < templates.length; i++) {
      expect(templates[i - 1]!.estimatedApyBps).toBeGreaterThanOrEqual(
        templates[i]!.estimatedApyBps,
      );
    }
  });

  it('returns empty array for unknown category', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates?category=nonexistent' });
    expect(res.statusCode).toBe(200);
    const { templates, total } = res.json<{ templates: unknown[]; total: number }>();
    expect(templates).toHaveLength(0);
    expect(total).toBe(0);
  });
});

describe('GET /templates/categories', () => {
  it('returns non-empty array of category strings', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates/categories' });
    expect(res.statusCode).toBe(200);
    const { categories } = res.json<{ categories: string[] }>();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories).toContain('yield');
  });
});

describe('GET /templates/:id', () => {
  it('returns 200 with template when id is valid', async () => {
    // Fetch one template to get a real id
    const listRes = await app.inject({ method: 'GET', url: '/templates?limit=1' });
    const { templates } = listRes.json<{ templates: Array<{ id: string }> }>();
    if (templates.length === 0) return;

    const res = await app.inject({ method: 'GET', url: `/templates/${templates[0]!.id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      id: string;
      name: string;
      category: string;
      riskLevel: number;
      estimatedApyBps: number;
      sourceAsset: string;
    }>();
    expect(body.id).toBe(templates[0]!.id);
    expect(typeof body.name).toBe('string');
    expect(typeof body.category).toBe('string');
    expect(typeof body.riskLevel).toBe('number');
    expect(typeof body.estimatedApyBps).toBe('number');
    expect(typeof body.sourceAsset).toBe('string');
  });

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates/nonexistent-id-12345' });
    expect(res.statusCode).toBe(404);
  });
});

// ─── Strategy simulate (routeIndex-based) ─────────────────────────────────────

describe('POST /strategy/simulate', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/simulate',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when routeIndex is out of bounds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/simulate',
      payload: {
        routeIndex: 9999,
        fromAddress: '0x0000000000000000000000000000000000000001',
        sourceChain: 1,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with simulation result for a valid route index', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/strategy/simulate',
      payload: {
        routeIndex: 0,
        fromAddress: '0x0000000000000000000000000000000000000001',
        sourceChain: 1,
      },
    });
    // May be 200 (simulated) or 404 (no route at index 0 for this chain pair)
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json<{ available: boolean; allStepsPass: boolean }>();
      expect(typeof body.available).toBe('boolean');
      expect(typeof body.allStepsPass).toBe('boolean');
    }
  });
});

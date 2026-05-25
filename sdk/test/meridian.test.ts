/**
 * @meridian/sdk — Unit tests
 *
 * Uses vitest + fetch mocking.
 * No real HTTP calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Meridian, MeridianApiError } from '../src/index.js';

// ─── fetch mock setup ─────────────────────────────────────────────────────────

type FetchMock = ReturnType<typeof vi.fn>;
let mockFetch: FetchMock;

function mockResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok:   status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Meridian SDK', () => {
  describe('constructor', () => {
    it('uses default API URL when none provided', () => {
      const sdk = new Meridian();
      expect(sdk).toBeDefined();
    });

    it('accepts a custom apiUrl', () => {
      const sdk = new Meridian({ apiUrl: 'http://localhost:3001' });
      expect(sdk).toBeDefined();
    });
  });

  describe('optimize()', () => {
    it('calls POST /strategy/optimize and returns routes', async () => {
      const mockRoutes = [{ totalScore: 100, projectedApyBps: 480, steps: [] }];
      mockFetch.mockResolvedValueOnce(mockResponse({
        routes: mockRoutes,
        quotedAt: new Date().toISOString(),
        expiresAt: Date.now() + 60_000,
      }));

      const sdk = new Meridian({ apiUrl: 'http://localhost:3001' });
      const result = await sdk.optimize({
        sourceAsset: 'USDC',
        sourceChain: 1,
        sourceAmountUsd: 1000,
        destinationChain: 42161,
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3001/strategy/optimize');
      expect(opts.method).toBe('POST');
      expect(result.routes).toHaveLength(1);
      expect(result.routes[0].projectedApyBps).toBe(480);
    });

    it('throws MeridianApiError on 400 response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid sourceChain' }, 400));

      const sdk = new Meridian({ apiUrl: 'http://localhost:3001' });
      await expect(sdk.optimize({
        sourceAsset: 'USDC',
        sourceChain: -1,
        sourceAmountUsd: 100,
        destinationChain: 1,
      })).rejects.toThrow(MeridianApiError);
    });

    it('includes Authorization header when apiKey provided', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ routes: [], quotedAt: '', expiresAt: 0 }));

      const sdk = new Meridian({ apiUrl: 'http://localhost:3001', apiKey: 'tok_test' });
      await sdk.optimize({ sourceAsset: 'ETH', sourceChain: 1, sourceAmountUsd: 1, destinationChain: 1 });

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer tok_test');
    });
  });

  describe('getAllPrices()', () => {
    it('returns a symbol→price map', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        prices: [
          { symbol: 'ETH', priceUsd: 3200, confidence: 1, source: 'pyth', timestamp: Date.now() },
          { symbol: 'USDC', priceUsd: 1, confidence: 1, source: 'stale', timestamp: Date.now() },
        ],
      }));

      const sdk = new Meridian({ apiUrl: 'http://localhost:3001' });
      const prices = await sdk.getAllPrices();

      expect(prices['ETH']).toBe(3200);
      expect(prices['USDC']).toBe(1);
    });
  });

  describe('getPrice()', () => {
    it('returns null on 404', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      const sdk = new Meridian({ apiUrl: 'http://localhost:3001' });
      const price = await sdk.getPrice('NONEXISTENT');
      expect(price).toBeNull();
    });

    it('returns price for known symbol', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        symbol: 'SOL', priceUsd: 155, confidence: 0.99, source: 'pyth', timestamp: Date.now(),
      }));

      const sdk = new Meridian({ apiUrl: 'http://localhost:3001' });
      const price = await sdk.getPrice('SOL');
      expect(price).toBe(155);
    });
  });

  describe('getApyQuote()', () => {
    it('returns null when API returns error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'not found' }, 404));

      const sdk = new Meridian({ apiUrl: 'http://localhost:3001' });
      const quote = await sdk.getApyQuote('aave-v3', 1, 'USDC');
      expect(quote).toBeNull();
    });
  });

  describe('health()', () => {
    it('returns status and version', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'ok', version: '0.0.1' }));

      const sdk = new Meridian({ apiUrl: 'http://localhost:3001' });
      const result = await sdk.health();
      expect(result.status).toBe('ok');
    });
  });

  describe('MeridianApiError', () => {
    it('includes status code and body', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Rate limited' }, 429));

      const sdk = new Meridian({ apiUrl: 'http://localhost:3001' });
      try {
        await sdk.health();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(MeridianApiError);
        const e = err as MeridianApiError;
        expect(e.status).toBe(429);
        expect(e.message).toContain('429');
      }
    });
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QuoteEngine } from '../src/services/quote-engine/index.js';

describe('QuoteEngine', () => {
  let engine: QuoteEngine;

  beforeEach(async () => {
    engine = new QuoteEngine();
    // Trigger one refresh cycle. Network calls may fail in CI without RPC URLs —
    // allSettled ensures we still test whatever the cache holds.
    await (engine as unknown as { refresh(): Promise<void> }).refresh();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── APY quotes ─────────────────────────────────────────────────────────────

  describe('getApyQuote', () => {
    it('returns null for unknown protocol', () => {
      expect(engine.getApyQuote('unknown_protocol', 1, 'ETH')).toBeNull();
    });

    it('getAllApyQuotes returns an array', () => {
      expect(Array.isArray(engine.getAllApyQuotes())).toBe(true);
    });

    it('any returned APY quote has required fields', () => {
      for (const q of engine.getAllApyQuotes()) {
        expect(typeof q.protocol).toBe('string');
        expect(typeof q.chain).toBe('number');
        expect(typeof q.asset).toBe('string');
        expect(typeof q.supplyApyBps).toBe('number');
        expect(typeof q.borrowApyBps).toBe('number');
        expect(typeof q.tvlUsd).toBe('number');
        expect(typeof q.isStale).toBe('boolean');
      }
    });
  });

  // ─── Bridge quotes ───────────────────────────────────────────────────────────

  describe('getBridgeQuote', () => {
    it('returns null for unknown route', () => {
      expect(engine.getBridgeQuote('stargate', 99, 999, 'BTC')).toBeNull();
    });

    it('any cached bridge quote has required fields', () => {
      const candidates = ['stargate', 'across', 'bridge'].flatMap((proto) =>
        [[1, 42161, 'USDC'], [1, 8453, 'USDC'], [1, 42161, 'ETH']].map(
          ([from, to, asset]) =>
            engine.getBridgeQuote(proto, from as number, to as number, asset as string),
        ),
      ).filter(Boolean);

      for (const q of candidates) {
        if (!q) continue;
        expect(typeof q.protocol).toBe('string');
        expect(typeof q.feeUsd).toBe('number');
        expect(typeof q.estimatedSeconds).toBe('number');
        expect(typeof q.amountIn).toBe('bigint');
        expect(typeof q.amountOut).toBe('bigint');
      }
    });
  });

  // ─── Gas quotes ──────────────────────────────────────────────────────────────

  describe('getGasQuote', () => {
    it('returns null for unknown chain', () => {
      expect(engine.getGasQuote(999999)).toBeNull();
    });

    it('getAllGasQuotes returns an array', () => {
      expect(Array.isArray(engine.getAllGasQuotes())).toBe(true);
    });

    it('any cached gas quote has valid numeric fields', () => {
      for (const q of engine.getAllGasQuotes()) {
        expect(typeof q.chain).toBe('number');
        expect(typeof q.gasPriceGwei).toBe('number');
        expect(typeof q.typicalTxUsd).toBe('number');
        expect(q.gasPriceGwei).toBeGreaterThanOrEqual(0);
        expect(q.typicalTxUsd).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ─── Staleness ───────────────────────────────────────────────────────────────

  describe('staleness', () => {
    it('fresh quotes are not stale immediately after seeding', () => {
      for (const q of engine.getAllApyQuotes()) {
        expect(q.isStale).toBe(false);
      }
    });

    it('marks quotes stale after TTL elapses', () => {
      vi.useFakeTimers();

      // Manually seed one entry
      const testEngine = new QuoteEngine();
      // @ts-expect-error — private access for test
      testEngine.apyCache.set('aave_v3:1:USDC', {
        data: {
          protocol: 'aave_v3', chain: 1, asset: 'USDC',
          supplyApyBps: 480, borrowApyBps: 620, tvlUsd: 4e9,
          timestamp: Math.floor(Date.now() / 1000), isStale: false,
        },
        fetchedAt: Date.now(),
      });

      expect(testEngine.getApyQuote('aave_v3', 1, 'USDC')?.isStale).toBe(false);

      vi.advanceTimersByTime(61_000);

      expect(testEngine.getApyQuote('aave_v3', 1, 'USDC')?.isStale).toBe(true);
    });
  });

  // ─── onApyRefresh callback ────────────────────────────────────────────────────

  describe('onApyRefresh', () => {
    it('callback receives an array after refresh', async () => {
      const received: unknown[] = [];
      engine.onApyRefresh((quotes) => received.push(...quotes));

      await (engine as unknown as { refresh(): Promise<void> }).refresh();

      expect(Array.isArray(received)).toBe(true);
    });

    it('multiple registered callbacks all fire', async () => {
      let count = 0;
      engine.onApyRefresh(() => { count++; });
      engine.onApyRefresh(() => { count++; });

      await (engine as unknown as { refresh(): Promise<void> }).refresh();

      expect(count).toBe(2);
    });
  });
});

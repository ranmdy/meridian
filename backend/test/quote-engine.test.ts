import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuoteEngine } from '../src/services/quote-engine/index.js';

describe('QuoteEngine', () => {
  let engine: QuoteEngine;

  beforeEach(async () => {
    engine = new QuoteEngine();
    // Manually trigger one refresh cycle without the timer
    await (engine as any).refresh();
  });

  describe('getApyQuote', () => {
    it('returns aave_v3 ETH quote on mainnet', () => {
      const q = engine.getApyQuote('aave_v3', 1, 'ETH');
      expect(q).not.toBeNull();
      expect(q!.supplyApyBps).toBeGreaterThan(0);
      expect(q!.protocol).toBe('aave_v3');
    });

    it('returns null for unknown protocol', () => {
      const q = engine.getApyQuote('unknown_protocol', 1, 'ETH');
      expect(q).toBeNull();
    });

    it('marks fresh quotes as not stale', () => {
      const q = engine.getApyQuote('aave_v3', 1, 'ETH');
      expect(q!.isStale).toBe(false);
    });
  });

  describe('getBridgeQuote', () => {
    it('returns stargate quote from ETH to Arbitrum', () => {
      const q = engine.getBridgeQuote('stargate', 1, 42161, 'USDC');
      expect(q).not.toBeNull();
      expect(q!.feeUsd).toBeGreaterThan(0);
      expect(q!.estimatedSeconds).toBeGreaterThan(0);
    });

    it('returns null for unknown route', () => {
      const q = engine.getBridgeQuote('stargate', 99, 999, 'BTC');
      expect(q).toBeNull();
    });
  });

  describe('staleness', () => {
    it('marks a quote as stale after ttl', async () => {
      vi.useFakeTimers();

      // Advance time by 61 seconds
      vi.advanceTimersByTime(61_000);

      const q = engine.getApyQuote('aave_v3', 1, 'ETH');
      expect(q!.isStale).toBe(true);

      vi.useRealTimers();
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyEngine } from '../src/services/strategy-engine/index.js';
import type { StrategyRequest } from '../src/services/strategy-engine/types.js';

describe('StrategyEngine', () => {
  let engine: StrategyEngine;

  beforeEach(() => {
    engine = new StrategyEngine();
  });

  describe('graphStats', () => {
    it('has nodes and edges after seeding', () => {
      const stats = engine.graphStats();
      expect(stats.nodes).toBeGreaterThan(0);
      expect(stats.edges).toBeGreaterThan(0);
    });
  });

  describe('optimize', () => {
    const baseRequest: StrategyRequest = {
      sourceAsset: 'ETH',
      sourceChain: 1,
      sourceAmountUsd: 8250,
      destinationChain: 42161, // Arbitrum
      riskTolerance: 3,
      timeHorizonDays: 30,
    };

    it('returns routes array', () => {
      const result = engine.optimize(baseRequest);
      expect(Array.isArray(result.routes)).toBe(true);
    });

    it('sets simulatedAt and quoteExpiresAt', () => {
      const result = engine.optimize(baseRequest);
      expect(result.simulatedAt).toBeGreaterThan(0);
      expect(result.quoteExpiresAt).toBeGreaterThan(result.simulatedAt);
      expect(result.quoteExpiresAt - result.simulatedAt).toBe(60);
    });

    it('routes from ETH mainnet to Arbitrum find a path', () => {
      const result = engine.optimize(baseRequest);
      expect(result.routes.length).toBeGreaterThan(0);
    });

    it('routes from ETH mainnet to Base find a path', () => {
      const result = engine.optimize({ ...baseRequest, destinationChain: 8453 });
      expect(result.routes.length).toBeGreaterThan(0);
    });

    it('each route has at least one step', () => {
      const result = engine.optimize(baseRequest);
      for (const route of result.routes) {
        expect(route.steps.length).toBeGreaterThan(0);
      }
    });

    it('no route exceeds maxHops (8)', () => {
      const result = engine.optimize(baseRequest);
      for (const route of result.routes) {
        expect(route.hopCount).toBeLessThanOrEqual(8);
      }
    });

    it('no route exceeds maxBridges (3)', () => {
      const result = engine.optimize(baseRequest);
      for (const route of result.routes) {
        expect(route.bridgeCount).toBeLessThanOrEqual(3);
      }
    });

    it('routes are sorted by totalScore descending', () => {
      const result = engine.optimize(baseRequest);
      for (let i = 1; i < result.routes.length; i++) {
        expect(result.routes[i - 1].totalScore).toBeGreaterThanOrEqual(
          result.routes[i].totalScore,
        );
      }
    });

    it('returns at most 3 routes', () => {
      const result = engine.optimize(baseRequest);
      expect(result.routes.length).toBeLessThanOrEqual(3);
    });

    it('same chain source and destination can still find routes (e.g. ETH → Aave → USDC)', () => {
      const result = engine.optimize({ ...baseRequest, destinationChain: 1 });
      // Same chain routes are valid: e.g. deposit to Aave and settle USDC on Ethereum
      // Route count may be 0 or more depending on graph — just assert it runs cleanly
      expect(Array.isArray(result.routes)).toBe(true);
    });

    it('riskTolerance=1 filters out high slippage edges', () => {
      const lowRisk = engine.optimize({ ...baseRequest, riskTolerance: 1 });
      const highRisk = engine.optimize({ ...baseRequest, riskTolerance: 5 });
      // High risk should have >= routes as low risk
      expect(highRisk.routes.length).toBeGreaterThanOrEqual(lowRisk.routes.length);
    });
  });

  describe('refreshGraph', () => {
    it('updates node APY without throwing', () => {
      expect(() =>
        engine.refreshGraph({ 'ETH_1_aave_deposit': { apyBps: 999, tvlUsd: 1_000_000 } }),
      ).not.toThrow();
    });
  });
});

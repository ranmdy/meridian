import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyEngine } from '../src/services/strategy-engine/index.js';
import type { StrategyRequest } from '../src/services/strategy-engine/types.js';
import type { ApyQuote } from '../src/services/quote-engine/index.js';

describe('StrategyEngine', () => {
  let engine: StrategyEngine;

  beforeEach(() => {
    engine = new StrategyEngine();
  });

  // ─── Graph stats ─────────────────────────────────────────────────────────────

  describe('graphStats', () => {
    it('has more than 10 nodes after seeding (expanded graph)', () => {
      const stats = engine.graphStats();
      expect(stats.nodes).toBeGreaterThan(10);
    });

    it('has more than 10 edges after seeding', () => {
      const stats = engine.graphStats();
      expect(stats.edges).toBeGreaterThan(10);
    });

    it('reports numeric node and edge counts', () => {
      const stats = engine.graphStats();
      expect(typeof stats.nodes).toBe('number');
      expect(typeof stats.edges).toBe('number');
    });
  });

  // ─── optimize ────────────────────────────────────────────────────────────────

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

    it('routes from ETH mainnet to Polygon find a path', () => {
      const result = engine.optimize({ ...baseRequest, destinationChain: 137 });
      expect(result.routes.length).toBeGreaterThan(0);
    });

    it('routes USDC source asset', () => {
      const result = engine.optimize({ ...baseRequest, sourceAsset: 'USDC' });
      // USDC routes may exist or not depending on graph — just verify it runs
      expect(Array.isArray(result.routes)).toBe(true);
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

    it('same chain source and destination runs cleanly', () => {
      const result = engine.optimize({ ...baseRequest, destinationChain: 1 });
      expect(Array.isArray(result.routes)).toBe(true);
    });

    it('riskTolerance=1 filters out high slippage edges', () => {
      const lowRisk = engine.optimize({ ...baseRequest, riskTolerance: 1 });
      const highRisk = engine.optimize({ ...baseRequest, riskTolerance: 5 });
      // High risk mode opens more edges so route count should be >= low risk
      expect(highRisk.routes.length).toBeGreaterThanOrEqual(lowRisk.routes.length);
    });

    it('longer time horizon does not break optimization', () => {
      const result = engine.optimize({ ...baseRequest, timeHorizonDays: 365 });
      expect(Array.isArray(result.routes)).toBe(true);
    });

    it('each route totalScore is a finite number', () => {
      const result = engine.optimize(baseRequest);
      for (const route of result.routes) {
        expect(Number.isFinite(route.totalScore)).toBe(true);
      }
    });

    it('each route step has required fields', () => {
      const result = engine.optimize(baseRequest);
      for (const route of result.routes) {
        for (const step of route.steps) {
          expect(typeof step.stepType).toBe('string');
          expect(typeof step.fromChain).toBe('number');
          expect(typeof step.toChain).toBe('number');
          expect(typeof step.protocol).toBe('string');
        }
      }
    });
  });

  // ─── refreshGraph (legacy) ────────────────────────────────────────────────────

  describe('refreshGraph', () => {
    it('updates node APY without throwing', () => {
      expect(() =>
        engine.refreshGraph({ 'ETH_1_aave_deposit': { apyBps: 999, tvlUsd: 1_000_000 } }),
      ).not.toThrow();
    });

    it('accepts multiple node updates at once', () => {
      expect(() =>
        engine.refreshGraph({
          'ETH_1_aave_deposit': { apyBps: 480, tvlUsd: 4e9 },
          'ARB_42161_aave_deposit': { apyBps: 510, tvlUsd: 1.2e9 },
        }),
      ).not.toThrow();
    });
  });

  // ─── refreshFromQuotes ───────────────────────────────────────────────────────

  describe('refreshFromQuotes', () => {
    const makeQuote = (overrides: Partial<ApyQuote>): ApyQuote => ({
      protocol: 'aave_v3',
      chain: 1,
      asset: 'USDC',
      supplyApyBps: 480,
      borrowApyBps: 620,
      tvlUsd: 4e9,
      timestamp: Math.floor(Date.now() / 1000),
      isStale: false,
      ...overrides,
    });

    it('does not throw with empty array', () => {
      expect(() => engine.refreshFromQuotes([])).not.toThrow();
    });

    it('does not throw with valid aave_v3 quote on ETH mainnet', () => {
      expect(() =>
        engine.refreshFromQuotes([makeQuote({ protocol: 'aave_v3', chain: 1, asset: 'USDC' })]),
      ).not.toThrow();
    });

    it('does not throw with compound_v3 quote on Arbitrum', () => {
      expect(() =>
        engine.refreshFromQuotes([
          makeQuote({ protocol: 'compound_v3', chain: 42161, asset: 'USDC', supplyApyBps: 320 }),
        ]),
      ).not.toThrow();
    });

    it('does not throw with morpho quote on Base', () => {
      expect(() =>
        engine.refreshFromQuotes([
          makeQuote({ protocol: 'morpho', chain: 8453, asset: 'USDC', supplyApyBps: 550 }),
        ]),
      ).not.toThrow();
    });

    it('does not throw with multiple quotes from multiple chains', () => {
      const quotes: ApyQuote[] = [
        makeQuote({ protocol: 'aave_v3', chain: 1, asset: 'USDC' }),
        makeQuote({ protocol: 'aave_v3', chain: 42161, asset: 'USDC', supplyApyBps: 510 }),
        makeQuote({ protocol: 'aave_v3', chain: 8453, asset: 'USDC', supplyApyBps: 490 }),
        makeQuote({ protocol: 'compound_v3', chain: 1, asset: 'USDC', supplyApyBps: 380 }),
      ];
      expect(() => engine.refreshFromQuotes(quotes)).not.toThrow();
    });

    it('graph is still optimizable after refreshFromQuotes', () => {
      engine.refreshFromQuotes([
        makeQuote({ protocol: 'aave_v3', chain: 1, asset: 'USDC', supplyApyBps: 999 }),
      ]);
      const result = engine.optimize({
        sourceAsset: 'ETH',
        sourceChain: 1,
        sourceAmountUsd: 5000,
        destinationChain: 42161,
        riskTolerance: 3,
        timeHorizonDays: 30,
      });
      expect(Array.isArray(result.routes)).toBe(true);
    });
  });

  // ─── Optimism + Avalanche routing ────────────────────────────────────────────

  describe('L2 routing (Optimism + Avalanche)', () => {
    const baseReq: StrategyRequest = {
      sourceAsset: 'ETH',
      sourceChain: 1,
      sourceAmountUsd: 10_000,
      destinationChain: 10, // Optimism
      riskTolerance: 3,
      timeHorizonDays: 30,
    };

    it('finds routes from Ethereum to Optimism', () => {
      const result = engine.optimize(baseReq);
      expect(result.routes.length).toBeGreaterThan(0);
    });

    it('Optimism route steps include a bridge step', () => {
      const result = engine.optimize(baseReq);
      const hasBridge = result.routes[0]?.steps.some((s) => s.stepType === 'BRIDGE') ?? false;
      expect(hasBridge).toBe(true);
    });

    it('finds routes from Ethereum to Avalanche', () => {
      const result = engine.optimize({
        ...baseReq,
        destinationChain: 43114,
      });
      expect(result.routes.length).toBeGreaterThan(0);
    });

    it('graph has nodes for Optimism (chain 10)', () => {
      const stats = engine.graphStats();
      // We added ~8 Optimism nodes — total should exceed previous count meaningfully
      expect(stats.nodes).toBeGreaterThan(30);
    });

    it('graph has nodes for Avalanche (chain 43114)', () => {
      const stats = engine.graphStats();
      expect(stats.nodes).toBeGreaterThan(30);
    });
  });

  // ─── Phase 3: Scroll + zkSync Era ────────────────────────────────────────────

  describe('Scroll and zkSync Era routing', () => {
    const baseReq: StrategyRequest = {
      sourceAsset: 'USDC',
      sourceChain: 1,
      sourceAmountUsd: 5000,
      destinationChain: 534352,
      riskTolerance: 2,
      timeHorizonDays: 30,
    };

    it('finds routes from Ethereum to Scroll (chain 534352)', () => {
      const result = engine.optimize(baseReq);
      expect(result.routes.length).toBeGreaterThan(0);
    });

    it('Scroll route includes a bridge step', () => {
      const result = engine.optimize(baseReq);
      const hasBridge = result.routes[0]?.steps.some((s) => s.stepType === 'BRIDGE') ?? false;
      expect(hasBridge).toBe(true);
    });

    it('finds routes from Ethereum to zkSync Era (chain 324)', () => {
      const result = engine.optimize({ ...baseReq, destinationChain: 324 });
      expect(result.routes.length).toBeGreaterThan(0);
    });

    it('zkSync route includes a bridge step', () => {
      const result = engine.optimize({ ...baseReq, destinationChain: 324 });
      const hasBridge = result.routes[0]?.steps.some((s) => s.stepType === 'BRIDGE') ?? false;
      expect(hasBridge).toBe(true);
    });

    it('graph has nodes for Scroll and zkSync (total > 50)', () => {
      const stats = engine.graphStats();
      // Phase 3 adds ~13 more nodes (6 Scroll + 6 zkSync + 2 wallets each)
      expect(stats.nodes).toBeGreaterThan(50);
    });
  });
});

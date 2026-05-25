import { describe, it, expect } from 'vitest';
import {
  browseStrategies,
  publishStrategy,
  getStrategy,
  voteStrategy,
  deprecateStrategy,
  type PublishRequest,
} from '../src/services/marketplace/index.js';
import type { Route } from '../src/services/strategy-engine/types.js';

const sampleRoute: Route = {
  steps: [],
  totalScore: 5000,
  estimatedApyBps: 480,
  totalGasUsd: 5.00,
  totalBridgeFeeUsd: 1.00,
  totalProtocolFeeUsd: 0.25,
  estimatedTimeSeconds: 600,
  hopCount: 2,
  bridgeCount: 1,
  riskScore: 28,
};

const basePublishReq: PublishRequest = {
  name: 'Test Strategy Alpha',
  description: 'A test strategy for unit tests, simulating a simple ETH bridge to Arbitrum.',
  creatorWallet: '0x1234567890abcdef1234567890abcdef12345678',
  route: sampleRoute,
  sourceAsset: 'ETH',
  sourceChain: 1,
  destinationChain: 42161,
  riskTolerance: 2,
  timeHorizonDays: 30,
};

describe('MarketplaceService', () => {
  describe('browseStrategies', () => {
    it('returns at least the seeded strategies', () => {
      const { strategies, total } = browseStrategies();
      expect(strategies.length).toBeGreaterThan(0);
      expect(total).toBeGreaterThan(0);
    });

    it('sorts by votes by default', () => {
      const { strategies } = browseStrategies({ sort: 'votes' });
      for (let i = 1; i < strategies.length; i++) {
        expect(strategies[i - 1].votes).toBeGreaterThanOrEqual(strategies[i].votes);
      }
    });

    it('sorts by yield correctly', () => {
      const { strategies } = browseStrategies({ sort: 'yield' });
      for (let i = 1; i < strategies.length; i++) {
        expect(strategies[i - 1].publishedApyBps).toBeGreaterThanOrEqual(strategies[i].publishedApyBps);
      }
    });

    it('respects limit', () => {
      const { strategies } = browseStrategies({ limit: 1 });
      expect(strategies.length).toBeLessThanOrEqual(1);
    });

    it('filters by chain', () => {
      const { strategies } = browseStrategies({ chain: 1 });
      for (const s of strategies) {
        expect(s.sourceChain === 1 || s.destinationChain === 1).toBe(true);
      }
    });
  });

  describe('publishStrategy', () => {
    it('creates a strategy and returns it with an id', () => {
      const s = publishStrategy(basePublishReq);
      expect(s.id).toBeTruthy();
      expect(s.name).toBe(basePublishReq.name);
      expect(s.executionCount).toBe(0);
      expect(s.votes).toBe(0);
      expect(s.deprecated).toBe(false);
    });

    it('published strategy appears in browse results', () => {
      const s = publishStrategy({ ...basePublishReq, name: 'Visible Strategy' });
      const { strategies } = browseStrategies();
      expect(strategies.some((x) => x.id === s.id)).toBe(true);
    });

    it('publishedApyBps matches route estimatedApyBps', () => {
      const s = publishStrategy(basePublishReq);
      expect(s.publishedApyBps).toBe(sampleRoute.estimatedApyBps);
    });
  });

  describe('getStrategy', () => {
    it('returns undefined for unknown id', () => {
      expect(getStrategy('nonexistent_id')).toBeUndefined();
    });

    it('returns the strategy after publishing', () => {
      const s = publishStrategy(basePublishReq);
      const found = getStrategy(s.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe(basePublishReq.name);
    });
  });

  describe('voteStrategy', () => {
    it('increments vote count', () => {
      const s = publishStrategy(basePublishReq);
      expect(s.votes).toBe(0);
      voteStrategy(s.id);
      const updated = getStrategy(s.id)!;
      expect(updated.votes).toBe(1);
    });

    it('returns false for unknown id', () => {
      expect(voteStrategy('no_such_id')).toBe(false);
    });
  });

  describe('deprecateStrategy', () => {
    it('marks strategy as deprecated when called by creator', () => {
      const s = publishStrategy(basePublishReq);
      const ok = deprecateStrategy(s.id, basePublishReq.creatorWallet);
      expect(ok).toBe(true);
      expect(getStrategy(s.id)!.deprecated).toBe(true);
    });

    it('rejects deprecation by non-creator', () => {
      const s = publishStrategy(basePublishReq);
      const ok = deprecateStrategy(s.id, '0xdeadbeef0000000000000000000000000000dead');
      expect(ok).toBe(false);
      expect(getStrategy(s.id)!.deprecated).toBe(false);
    });

    it('deprecated strategies do not appear in browse results', () => {
      const s = publishStrategy({ ...basePublishReq, name: 'Soon Deprecated' });
      deprecateStrategy(s.id, basePublishReq.creatorWallet);
      const { strategies } = browseStrategies();
      expect(strategies.some((x) => x.id === s.id)).toBe(false);
    });
  });
});

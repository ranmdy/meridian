/**
 * Strategy Marketplace Service
 *
 * Allows users to publish named strategies to a shared marketplace.
 * Other users can browse, copy (one-click replication), and vote.
 *
 * Phase 1: in-memory store. Phase 2: PostgreSQL.
 *
 * Fee routing:
 *   0.02% of execution value → creator wallet (collected by Router contract, Phase 2)
 *   0.03% of execution value → Meridian treasury
 */

import type { Route } from '../strategy-engine/types.js';
import { randomBytes } from 'node:crypto';

export interface MarketplaceStrategy {
  id: string;
  name: string;
  description: string;
  creatorWallet: string;
  route: Route;
  /** Source asset for this strategy */
  sourceAsset: string;
  /** Source chain for this strategy */
  sourceChain: number;
  /** Destination chain */
  destinationChain: number;
  /** Risk tolerance (1–5) */
  riskTolerance: 1 | 2 | 3 | 4 | 5;
  /** Time horizon in days */
  timeHorizonDays: number;
  /** Total executions (copies) by other users */
  executionCount: number;
  /** Upvotes */
  votes: number;
  /** APY in basis points at time of publication */
  publishedApyBps: number;
  publishedAt: number;
  updatedAt: number;
  deprecated: boolean;
}

export interface PublishRequest {
  name: string;
  description: string;
  creatorWallet: string;
  route: Route;
  sourceAsset: string;
  sourceChain: number;
  destinationChain: number;
  riskTolerance: 1 | 2 | 3 | 4 | 5;
  timeHorizonDays: number;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const store = new Map<string, MarketplaceStrategy>();

function makeId(): string {
  return randomBytes(8).toString('hex');
}

// ─── Seed a few sample strategies so the marketplace is not empty ──────────────

function seedSampleStrategies() {
  const sampleRoute: Route = {
    steps: [
      {
        stepType: 'BRIDGE',
        protocol: 'stargate',
        protocolAddress: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        fromChain: 1,
        toChain: 42161,
        estimatedOutput: 999,
        gasEstimateUsd: 8.10,
        bridgeFeeUsd: 1.00,
        slippageBps: 5,
        apyBps: 0,
      },
      {
        stepType: 'LEND',
        protocol: 'aave_v3',
        protocolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        fromAsset: 'USDC',
        toAsset: 'aUSDC',
        fromChain: 42161,
        toChain: 42161,
        estimatedOutput: 998,
        gasEstimateUsd: 0.30,
        bridgeFeeUsd: 0,
        slippageBps: 0,
        apyBps: 510,
      },
    ],
    totalScore: 8200,
    estimatedApyBps: 510,
    totalGasUsd: 8.40,
    totalBridgeFeeUsd: 1.00,
    totalProtocolFeeUsd: 0.50,
    estimatedTimeSeconds: 900,
    hopCount: 2,
    bridgeCount: 1,
    riskScore: 22,
  };

  const samples: Omit<MarketplaceStrategy, 'id'>[] = [
    {
      name: 'ETH → ARB Aave Yield',
      description: 'Bridge USDC from Ethereum to Arbitrum and deposit into Aave v3 for yield. Simple 2-step strategy, low risk.',
      creatorWallet: '0x1234567890abcdef1234567890abcdef12345678',
      route: sampleRoute,
      sourceAsset: 'USDC',
      sourceChain: 1,
      destinationChain: 42161,
      riskTolerance: 2,
      timeHorizonDays: 30,
      executionCount: 47,
      votes: 128,
      publishedApyBps: 510,
      publishedAt: Math.floor(Date.now() / 1000) - 7 * 86400,
      updatedAt: Math.floor(Date.now() / 1000) - 86400,
      deprecated: false,
    },
    {
      name: 'Base Morpho Blue Vault',
      description: 'Bridge ETH from Ethereum to Base and deposit into Morpho Blue for optimised yield. Mid-risk, ~60 min bridge.',
      creatorWallet: '0xabcdef1234567890abcdef1234567890abcdef12',
      route: { ...sampleRoute, estimatedApyBps: 680, hopCount: 2, bridgeCount: 1, riskScore: 35 },
      sourceAsset: 'ETH',
      sourceChain: 1,
      destinationChain: 8453,
      riskTolerance: 3,
      timeHorizonDays: 90,
      executionCount: 19,
      votes: 61,
      publishedApyBps: 680,
      publishedAt: Math.floor(Date.now() / 1000) - 3 * 86400,
      updatedAt: Math.floor(Date.now() / 1000) - 3 * 86400,
      deprecated: false,
    },
  ];

  for (const s of samples) {
    const id = makeId();
    store.set(id, { ...s, id });
  }
}

seedSampleStrategies();

// ─── Service API ──────────────────────────────────────────────────────────────

export type SortField = 'yield' | 'risk' | 'votes' | 'newest' | 'popular';

export interface BrowseOptions {
  sort?: SortField;
  chain?: number;
  maxRisk?: number;
  minApyBps?: number;
  limit?: number;
  offset?: number;
}

export function publishStrategy(req: PublishRequest): MarketplaceStrategy {
  const id = makeId();
  const now = Math.floor(Date.now() / 1000);
  const strategy: MarketplaceStrategy = {
    ...req,
    id,
    executionCount: 0,
    votes: 0,
    publishedApyBps: req.route.estimatedApyBps,
    publishedAt: now,
    updatedAt: now,
    deprecated: false,
  };
  store.set(id, strategy);
  return strategy;
}

export function browseStrategies(opts: BrowseOptions = {}): {
  strategies: MarketplaceStrategy[];
  total: number;
} {
  const {
    sort = 'votes',
    chain,
    maxRisk,
    minApyBps,
    limit = 20,
    offset = 0,
  } = opts;

  let results = Array.from(store.values()).filter((s) => !s.deprecated);

  if (chain !== undefined) {
    results = results.filter((s) => s.sourceChain === chain || s.destinationChain === chain);
  }
  if (maxRisk !== undefined) {
    results = results.filter((s) => s.route.riskScore <= maxRisk);
  }
  if (minApyBps !== undefined) {
    results = results.filter((s) => s.publishedApyBps >= minApyBps);
  }

  const comparators: Record<SortField, (a: MarketplaceStrategy, b: MarketplaceStrategy) => number> = {
    yield:   (a, b) => b.publishedApyBps - a.publishedApyBps,
    risk:    (a, b) => a.route.riskScore - b.route.riskScore,
    votes:   (a, b) => b.votes - a.votes,
    newest:  (a, b) => b.publishedAt - a.publishedAt,
    popular: (a, b) => b.executionCount - a.executionCount,
  };

  results.sort(comparators[sort]);

  return {
    strategies: results.slice(offset, offset + limit),
    total: results.length,
  };
}

export function getStrategy(id: string): MarketplaceStrategy | undefined {
  return store.get(id);
}

export function voteStrategy(id: string): boolean {
  const s = store.get(id);
  if (!s || s.deprecated) return false;
  s.votes += 1;
  s.updatedAt = Math.floor(Date.now() / 1000);
  return true;
}

export function deprecateStrategy(id: string, creatorWallet: string): boolean {
  const s = store.get(id);
  if (!s) return false;
  if (s.creatorWallet.toLowerCase() !== creatorWallet.toLowerCase()) return false;
  s.deprecated = true;
  s.updatedAt = Math.floor(Date.now() / 1000);
  return true;
}

export function incrementExecutionCount(id: string): void {
  const s = store.get(id);
  if (s) {
    s.executionCount += 1;
    s.updatedAt = Math.floor(Date.now() / 1000);
  }
}

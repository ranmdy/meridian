import { buildSeedGraph } from './graph.js';
import type { ProtocolGraph } from './graph.js';
import { findTopRoutes } from './pathfinder.js';
import type { StrategyRequest, StrategyResponse } from './types.js';
import type { ApyQuote } from '../quote-engine/index.js';
import { config } from '../../config/index.js';

// Maps DeFiLlama protocol names to graph node ID patterns
// Graph node IDs follow: {ASSET}_{chainId}_{protocol}_{action}
const PROTOCOL_NODE_MAP: Record<string, string> = {
  aave_v3:     'aave',
  compound_v3: 'compound',
  morpho:      'morpho',
  gmx:         'gmx',
};

export class StrategyEngine {
  private graph: ProtocolGraph;

  constructor() {
    this.graph = buildSeedGraph();
  }

  /**
   * Refreshes graph node APY + TVL from live quote engine data.
   * Called after every 15s quote poll cycle.
   */
  refreshFromQuotes(apyQuotes: ApyQuote[]): void {
    for (const q of apyQuotes) {
      if (q.isStale) continue;

      const protocolKey = PROTOCOL_NODE_MAP[q.protocol] ?? q.protocol;
      // Search for matching nodes: asset + chain + protocol pattern
      for (const node of this.graph.allNodes()) {
        if (
          node.chain === q.chain &&
          node.asset.replace(/^a/, '') === q.asset && // strip Aave aToken prefix
          node.protocol.includes(protocolKey)
        ) {
          node.apyBps = q.supplyApyBps;
          node.tvlUsd = q.tvlUsd;
        }
      }
    }
  }

  /**
   * Refreshes the protocol graph with arbitrary updates.
   * Legacy method — prefer refreshFromQuotes().
   */
  refreshGraph(updates: Partial<Record<string, { apyBps: number; tvlUsd: number }>>) {
    for (const [nodeId, data] of Object.entries(updates)) {
      const node = this.graph.getNode(nodeId);
      if (node) Object.assign(node, data);
    }
  }

  /**
   * Find optimal routes for a strategy request.
   * Returns top 3 routes ranked by score.
   */
  optimize(req: StrategyRequest): StrategyResponse {
    const routes = findTopRoutes(this.graph, req, 3);
    const now = Date.now();

    return {
      routes,
      simulatedAt: Math.floor(now / 1000),
      quoteExpiresAt: Math.floor(now / 1000) + config.quoteTtlSeconds,
    };
  }

  graphStats() {
    return {
      nodes: this.graph.nodeCount(),
      edges: this.graph.edgeCount(),
    };
  }
}

export type { StrategyRequest, StrategyResponse };

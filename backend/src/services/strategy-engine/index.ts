import { buildSeedGraph } from './graph.js';
import type { ProtocolGraph } from './graph.js';
import { findTopRoutes } from './pathfinder.js';
import type { StrategyRequest, StrategyResponse } from './types.js';
import type { ApyQuote } from '../quote-engine/index.js';
import { config } from '../../config/index.js';
import { isProtocolFlagged } from '../exploit-feed/index.js';

// Maps DeFiLlama protocol names to graph node ID patterns
// Graph node IDs follow: {ASSET}_{chainId}_{protocol}_{action}
const PROTOCOL_NODE_MAP: Record<string, string> = {
  aave_v3:       'aave',
  compound_v3:   'compound',
  morpho:        'morpho',
  gmx:           'gmx',
  pendle:        'pendle',
  convex:        'convex',
  curve:         'curve',
  pancakeswap:   'pancakeswap',
  camelot:       'camelot',
  aerodrome:     'aerodrome',
  kamino:        'kamino',
  layerbank:     'layerbank',
  zerolend:      'zerolend',
  scroll_bridge: 'scroll_bridge',
  zksync_bridge: 'zksync_bridge',
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
    // Testnet chains mirror their mainnet counterparts' interest rate models.
    // When mainnet APY data arrives, apply it to the corresponding testnet nodes.
    const TESTNET_MIRRORS: Record<number, number> = {
      1:    11155111, // Ethereum mainnet → Sepolia
      8453: 84532,    // Base mainnet     → Base Sepolia
    };

    for (const q of apyQuotes) {
      if (q.isStale) continue;

      const protocolKey = PROTOCOL_NODE_MAP[q.protocol] ?? q.protocol;
      const chainsToUpdate = [q.chain, TESTNET_MIRRORS[q.chain]].filter(Boolean) as number[];

      for (const chainId of chainsToUpdate) {
        for (const node of this.graph.allNodes()) {
          if (
            node.chain === chainId &&
            node.asset.replace(/^a/, '') === q.asset &&
            node.protocol.includes(protocolKey)
          ) {
            node.apyBps = q.supplyApyBps;
            // Don't mirror mainnet TVL to testnet (testnet TVL is 0 by design)
            if (chainId === q.chain) node.tvlUsd = q.tvlUsd;
          }
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
   * Syncs exploit-feed flags into graph nodes so the pathfinder can skip them.
   * Called automatically before each optimize() call.
   */
  private syncExploitFlags(): void {
    for (const node of this.graph.allNodes()) {
      node.exploitFlagged = isProtocolFlagged(node.protocol);
    }
  }

  /**
   * Find optimal routes for a strategy request.
   * Returns top 3 routes ranked by score.
   */
  optimize(req: StrategyRequest): StrategyResponse {
    this.syncExploitFlags();
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

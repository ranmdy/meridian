import { buildSeedGraph, ProtocolGraph } from './graph.js';
import { findTopRoutes } from './pathfinder.js';
import type { StrategyRequest, StrategyResponse } from './types.js';
import { config } from '../../config/index.js';

export class StrategyEngine {
  private graph: ProtocolGraph;

  constructor() {
    this.graph = buildSeedGraph();
  }

  /**
   * Refreshes the protocol graph with live data from the Quote Engine.
   * Called every 15s. Phase 1: wires into live quote feeds.
   */
  refreshGraph(updates: Partial<Record<string, { apyBps: number; tvlUsd: number }>>) {
    for (const [nodeId, data] of Object.entries(updates)) {
      const node = this.graph.getNode(nodeId);
      if (node) {
        Object.assign(node, data);
      }
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

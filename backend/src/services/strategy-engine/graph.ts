import type { ProtocolNode, ProtocolEdge } from './types.js';

/**
 * The protocol graph: nodes are (asset, chain, protocol_state) tuples.
 * Edges are protocol actions with cost + yield metadata.
 *
 * Phase 0: statically seeded from config.
 * Phase 1: refreshed from live quote engine every 15s.
 */
export class ProtocolGraph {
  private nodes = new Map<string, ProtocolNode>();
  private edges = new Map<string, ProtocolEdge[]>(); // from nodeId → edges[]

  addNode(node: ProtocolNode): void {
    this.nodes.set(node.id, node);
    if (!this.edges.has(node.id)) {
      this.edges.set(node.id, []);
    }
  }

  addEdge(edge: ProtocolEdge): void {
    const existing = this.edges.get(edge.from) ?? [];
    existing.push(edge);
    this.edges.set(edge.from, existing);
  }

  getNode(id: string): ProtocolNode | undefined {
    return this.nodes.get(id);
  }

  getEdgesFrom(nodeId: string): ProtocolEdge[] {
    return this.edges.get(nodeId) ?? [];
  }

  allNodes(): ProtocolNode[] {
    return Array.from(this.nodes.values());
  }

  nodeCount(): number {
    return this.nodes.size;
  }

  edgeCount(): number {
    let total = 0;
    for (const edges of this.edges.values()) total += edges.length;
    return total;
  }
}

// ─── Phase 0: Static Seed Graph ───────────────────────────────────────────────
// Minimal nodes for Ethereum + Base + Arbitrum with the Phase 0 integrations:
// Aave v3, Uniswap v3, Stargate.

export function buildSeedGraph(): ProtocolGraph {
  const g = new ProtocolGraph();

  // Ethereum nodes
  g.addNode({ id: 'ETH_1_wallet', asset: 'ETH', chain: 1, protocol: 'wallet', action: 'SETTLE', tvlUsd: 0, apyBps: 0, exploitFlagged: false });
  g.addNode({ id: 'USDC_1_wallet', asset: 'USDC', chain: 1, protocol: 'wallet', action: 'SETTLE', tvlUsd: 0, apyBps: 0, exploitFlagged: false });
  g.addNode({ id: 'ETH_1_aave_deposit', asset: 'aETH', chain: 1, protocol: 'aave_v3', action: 'LEND', tvlUsd: 8_000_000_000, apyBps: 210, exploitFlagged: false });
  g.addNode({ id: 'USDC_1_aave_deposit', asset: 'aUSDC', chain: 1, protocol: 'aave_v3', action: 'LEND', tvlUsd: 4_000_000_000, apyBps: 480, exploitFlagged: false });
  g.addNode({ id: 'USDC_1_uniswap', asset: 'USDC', chain: 1, protocol: 'uniswap_v3', action: 'SWAP', tvlUsd: 500_000_000, apyBps: 0, exploitFlagged: false });

  // Base nodes
  g.addNode({ id: 'USDC_8453_wallet', asset: 'USDC', chain: 8453, protocol: 'wallet', action: 'SETTLE', tvlUsd: 0, apyBps: 0, exploitFlagged: false });
  g.addNode({ id: 'USDC_8453_aave_deposit', asset: 'aUSDC', chain: 8453, protocol: 'aave_v3', action: 'LEND', tvlUsd: 200_000_000, apyBps: 520, exploitFlagged: false });

  // Arbitrum nodes
  g.addNode({ id: 'USDC_42161_wallet', asset: 'USDC', chain: 42161, protocol: 'wallet', action: 'SETTLE', tvlUsd: 0, apyBps: 0, exploitFlagged: false });
  g.addNode({ id: 'USDC_42161_gmx', asset: 'GLP', chain: 42161, protocol: 'gmx', action: 'STAKE', tvlUsd: 400_000_000, apyBps: 840, exploitFlagged: false });

  // ─── Edges ────────────────────────────────────────────────────────────────

  // ETH wallet → Aave deposit (Ethereum)
  g.addEdge({
    from: 'ETH_1_wallet',
    to: 'ETH_1_aave_deposit',
    stepType: 'LEND',
    protocol: 'aave_v3',
    protocolAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', // Aave v3 Pool (mainnet)
    gasEstimateUsd: 0.80,
    bridgeFeeUsd: 0,
    slippageBps: 0,
    isBridge: false,
  });

  // Aave aETH → borrow USDC (Ethereum) — LEND edge (borrow action)
  g.addEdge({
    from: 'ETH_1_aave_deposit',
    to: 'USDC_1_wallet',
    stepType: 'LEND',
    protocol: 'aave_v3',
    protocolAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    gasEstimateUsd: 0.60,
    bridgeFeeUsd: 0,
    slippageBps: 0,
    isBridge: false,
  });

  // USDC Ethereum → USDC Arbitrum via Stargate (BRIDGE)
  g.addEdge({
    from: 'USDC_1_wallet',
    to: 'USDC_42161_wallet',
    stepType: 'BRIDGE',
    protocol: 'stargate',
    protocolAddress: '0x8731d54E9D02c286767d56ac03e8037C07e01e98', // Stargate Router (mainnet)
    gasEstimateUsd: 1.20,
    bridgeFeeUsd: 1.20,
    slippageBps: 5,
    isBridge: true,
  });

  // USDC Ethereum → USDC Base via Stargate (BRIDGE)
  g.addEdge({
    from: 'USDC_1_wallet',
    to: 'USDC_8453_wallet',
    stepType: 'BRIDGE',
    protocol: 'stargate',
    protocolAddress: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
    gasEstimateUsd: 0.90,
    bridgeFeeUsd: 0.90,
    slippageBps: 3,
    isBridge: true,
  });

  // USDC Arbitrum → GMX GLP stake
  g.addEdge({
    from: 'USDC_42161_wallet',
    to: 'USDC_42161_gmx',
    stepType: 'STAKE',
    protocol: 'gmx',
    protocolAddress: '0xB95DB5B167D75e6d04227CfFFA61069348d271F5', // GLP Manager (Arbitrum)
    gasEstimateUsd: 0.15,
    bridgeFeeUsd: 0,
    slippageBps: 30,
    isBridge: false,
  });

  // USDC Base → Aave v3 deposit
  g.addEdge({
    from: 'USDC_8453_wallet',
    to: 'USDC_8453_aave_deposit',
    stepType: 'LEND',
    protocol: 'aave_v3',
    protocolAddress: '0xA238Dd8sAE912a1A6b1Bb9Dc22c9Ef5B7b2d9dA', // Aave v3 Pool (Base)
    gasEstimateUsd: 0.05,
    bridgeFeeUsd: 0,
    slippageBps: 0,
    isBridge: false,
  });

  return g;
}

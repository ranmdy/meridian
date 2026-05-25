import type { ProtocolNode, ProtocolEdge } from './types.js';

/**
 * The protocol graph: nodes are (asset, chain, protocol_state) tuples.
 * Edges are protocol actions with cost + yield metadata.
 *
 * Phase 1: Expanded to include Compound v3, Morpho, Across bridge,
 * Polygon chain, WBTC asset, and more bridge pairs.
 * Phase 2: Optimism, Avalanche, and Solana via Wormhole.
 * Phase 3: Scroll (534352) and zkSync Era (324).
 * APY and TVL values are refreshed from DeFiLlama every 15 seconds.
 */
export class ProtocolGraph {
  private nodes = new Map<string, ProtocolNode>();
  private edges = new Map<string, ProtocolEdge[]>();

  addNode(node: ProtocolNode): void {
    this.nodes.set(node.id, node);
    if (!this.edges.has(node.id)) this.edges.set(node.id, []);
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

  nodeCount(): number { return this.nodes.size; }

  edgeCount(): number {
    let total = 0;
    for (const edges of this.edges.values()) total += edges.length;
    return total;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wallet(asset: string, chain: number): ProtocolNode {
  return { id: `${asset}_${chain}_wallet`, asset, chain, protocol: 'wallet', action: 'SETTLE', tvlUsd: 0, apyBps: 0, exploitFlagged: false };
}

function lendNode(asset: string, wrappedAsset: string, chain: number, protocol: string, tvlUsd: number, apyBps: number): ProtocolNode {
  return { id: `${asset}_${chain}_${protocol}_deposit`, asset: wrappedAsset, chain, protocol, action: 'LEND', tvlUsd, apyBps, exploitFlagged: false };
}

// ─── Phase 1 Seed Graph ───────────────────────────────────────────────────────

export function buildSeedGraph(): ProtocolGraph {
  const g = new ProtocolGraph();

  // ── Ethereum (chain 1) ──────────────────────────────────────────────────────

  g.addNode(wallet('ETH',  1));
  g.addNode(wallet('USDC', 1));
  g.addNode(wallet('USDT', 1));
  g.addNode(wallet('WBTC', 1));

  // Aave v3 — Ethereum
  g.addNode(lendNode('ETH',  'aETH',  1, 'aave_v3', 8_000_000_000, 210));
  g.addNode(lendNode('USDC', 'aUSDC', 1, 'aave_v3', 4_000_000_000, 480));
  g.addNode(lendNode('USDT', 'aUSDT', 1, 'aave_v3', 2_500_000_000, 460));
  g.addNode(lendNode('WBTC', 'aWBTC', 1, 'aave_v3', 3_000_000_000, 180));

  // Compound v3 — Ethereum (cUSDCv3 market)
  g.addNode(lendNode('USDC', 'cUSDCv3', 1, 'compound_v3', 1_200_000_000, 420));
  g.addNode(lendNode('ETH',  'cETHv3',  1, 'compound_v3',   600_000_000, 180));

  // Morpho — Ethereum (MetaMorpho vaults)
  g.addNode(lendNode('USDC', 'mUSDC', 1, 'morpho', 800_000_000, 550));
  g.addNode(lendNode('ETH',  'mETH',  1, 'morpho', 400_000_000, 240));
  g.addNode(lendNode('WBTC', 'mWBTC', 1, 'morpho', 200_000_000, 160));

  // Uniswap v3 — Ethereum (swap node)
  g.addNode({ id: 'USDC_1_uniswap', asset: 'USDC', chain: 1, protocol: 'uniswap_v3', action: 'SWAP', tvlUsd: 500_000_000, apyBps: 0, exploitFlagged: false });

  // ── Base (chain 8453) ────────────────────────────────────────────────────────

  g.addNode(wallet('ETH',  8453));
  g.addNode(wallet('USDC', 8453));

  g.addNode(lendNode('USDC', 'aUSDC', 8453, 'aave_v3', 200_000_000, 520));
  g.addNode(lendNode('ETH',  'aETH',  8453, 'aave_v3', 100_000_000, 190));
  g.addNode(lendNode('USDC', 'cUSDCv3', 8453, 'compound_v3', 80_000_000, 450));
  g.addNode(lendNode('USDC', 'mUSDC', 8453, 'morpho', 60_000_000, 580));

  // ── Arbitrum One (chain 42161) ───────────────────────────────────────────────

  g.addNode(wallet('ETH',  42161));
  g.addNode(wallet('USDC', 42161));
  g.addNode(wallet('USDT', 42161));

  g.addNode(lendNode('USDC', 'aUSDC', 42161, 'aave_v3', 500_000_000, 500));
  g.addNode(lendNode('ETH',  'aETH',  42161, 'aave_v3', 300_000_000, 200));
  g.addNode(lendNode('USDC', 'cUSDCv3', 42161, 'compound_v3', 150_000_000, 430));

  // GMX — Arbitrum
  g.addNode({ id: 'USDC_42161_gmx', asset: 'GLP', chain: 42161, protocol: 'gmx', action: 'STAKE', tvlUsd: 400_000_000, apyBps: 840, exploitFlagged: false });

  // ── Polygon (chain 137) ──────────────────────────────────────────────────────

  g.addNode(wallet('ETH',  137)); // WETH on Polygon
  g.addNode(wallet('USDC', 137));
  g.addNode(wallet('USDT', 137));

  g.addNode(lendNode('USDC', 'aUSDC', 137, 'aave_v3', 300_000_000, 470));
  g.addNode(lendNode('USDT', 'aUSDT', 137, 'aave_v3', 200_000_000, 440));

  // ── BNB Chain (chain 56) ─────────────────────────────────────────────────────

  g.addNode(wallet('ETH',  56)); // WETH on BNB
  g.addNode(wallet('USDC', 56));

  // ── Optimism (chain 10) ──────────────────────────────────────────────────────

  g.addNode(wallet('ETH',  10));
  g.addNode(wallet('USDC', 10));
  g.addNode(wallet('USDT', 10));

  g.addNode(lendNode('USDC', 'aUSDC', 10, 'aave_v3', 250_000_000, 490));
  g.addNode(lendNode('ETH',  'aETH',  10, 'aave_v3', 150_000_000, 195));
  g.addNode(lendNode('USDC', 'cUSDCv3', 10, 'compound_v3', 90_000_000, 440));
  g.addNode(lendNode('USDC', 'mUSDC', 10, 'morpho', 70_000_000, 560));

  // ── Avalanche C-Chain (chain 43114) ──────────────────────────────────────────

  g.addNode(wallet('ETH',  43114)); // WETH on AVAX
  g.addNode(wallet('USDC', 43114));
  g.addNode(wallet('USDT', 43114));

  g.addNode(lendNode('USDC', 'aUSDC', 43114, 'aave_v3', 180_000_000, 460));
  g.addNode(lendNode('ETH',  'aETH',  43114, 'aave_v3', 100_000_000, 185));

  // GMX — Avalanche
  g.addNode({ id: 'USDC_43114_gmx', asset: 'GLP', chain: 43114, protocol: 'gmx', action: 'STAKE', tvlUsd: 200_000_000, apyBps: 720, exploitFlagged: false });

  // ─────────────────────────────────────────────────────────────────────────────
  // EDGES
  // ─────────────────────────────────────────────────────────────────────────────

  const AAVE_ETH       = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
  const AAVE_BASE      = '0xA238Dd8sAE912a1A6b1Bb9Dc22c9Ef5B7b2d9dA'; // placeholder until deployed
  const AAVE_ARB       = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
  const AAVE_POLY      = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
  const COMPOUND_V3_ETH = '0xc3d688B66703497DAA19211EEdff47f25384cdc3';
  const COMPOUND_V3_BASE = '0xb125E6687d4313864e53df431d5425969c15Eb2';
  const COMPOUND_V3_ARB = '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf';
  const MORPHO_ETH     = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb';
  const STARGATE       = '0x8731d54E9D02c286767d56ac03e8037C07e01e98';
  const ACROSS         = '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5'; // Spoke Pool ETH
  const GMX_MANAGER    = '0xB95DB5B167D75e6d04227CfFFA61069348d271F5';

  // ── Ethereum: wallet → lend ─────────────────────────────────────────────────

  g.addEdge({ from: 'ETH_1_wallet',  to: 'ETH_1_aave_v3_deposit',      stepType: 'LEND', protocol: 'aave_v3',     protocolAddress: AAVE_ETH,        gasEstimateUsd: 0.80, bridgeFeeUsd: 0, slippageBps: 0,  isBridge: false });
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_1_aave_v3_deposit',     stepType: 'LEND', protocol: 'aave_v3',     protocolAddress: AAVE_ETH,        gasEstimateUsd: 0.70, bridgeFeeUsd: 0, slippageBps: 0,  isBridge: false });
  g.addEdge({ from: 'USDT_1_wallet', to: 'USDT_1_aave_v3_deposit',     stepType: 'LEND', protocol: 'aave_v3',     protocolAddress: AAVE_ETH,        gasEstimateUsd: 0.70, bridgeFeeUsd: 0, slippageBps: 0,  isBridge: false });
  g.addEdge({ from: 'WBTC_1_wallet', to: 'WBTC_1_aave_v3_deposit',     stepType: 'LEND', protocol: 'aave_v3',     protocolAddress: AAVE_ETH,        gasEstimateUsd: 0.80, bridgeFeeUsd: 0, slippageBps: 0,  isBridge: false });
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_1_compound_v3_deposit',  stepType: 'LEND', protocol: 'compound_v3', protocolAddress: COMPOUND_V3_ETH, gasEstimateUsd: 0.60, bridgeFeeUsd: 0, slippageBps: 0,  isBridge: false });
  g.addEdge({ from: 'ETH_1_wallet',  to: 'ETH_1_compound_v3_deposit',   stepType: 'LEND', protocol: 'compound_v3', protocolAddress: COMPOUND_V3_ETH, gasEstimateUsd: 0.65, bridgeFeeUsd: 0, slippageBps: 0,  isBridge: false });
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_1_morpho_deposit',       stepType: 'LEND', protocol: 'morpho',      protocolAddress: MORPHO_ETH,      gasEstimateUsd: 0.75, bridgeFeeUsd: 0, slippageBps: 0,  isBridge: false });
  g.addEdge({ from: 'ETH_1_wallet',  to: 'ETH_1_morpho_deposit',        stepType: 'LEND', protocol: 'morpho',      protocolAddress: MORPHO_ETH,      gasEstimateUsd: 0.75, bridgeFeeUsd: 0, slippageBps: 0,  isBridge: false });
  g.addEdge({ from: 'WBTC_1_wallet', to: 'WBTC_1_morpho_deposit',       stepType: 'LEND', protocol: 'morpho',      protocolAddress: MORPHO_ETH,      gasEstimateUsd: 0.75, bridgeFeeUsd: 0, slippageBps: 0,  isBridge: false });

  // Aave borrow-to-wallet (exit) edges
  g.addEdge({ from: 'ETH_1_aave_v3_deposit',  to: 'USDC_1_wallet',  stepType: 'LEND', protocol: 'aave_v3', protocolAddress: AAVE_ETH, gasEstimateUsd: 0.60, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });

  // ── Ethereum: bridge out ────────────────────────────────────────────────────

  // Stargate: ETH → Base
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_8453_wallet',  stepType: 'BRIDGE', protocol: 'stargate', protocolAddress: STARGATE, gasEstimateUsd: 0.90, bridgeFeeUsd: 0.90, slippageBps: 3,  isBridge: true });
  g.addEdge({ from: 'ETH_1_wallet',  to: 'ETH_8453_wallet',   stepType: 'BRIDGE', protocol: 'stargate', protocolAddress: STARGATE, gasEstimateUsd: 0.95, bridgeFeeUsd: 1.10, slippageBps: 5,  isBridge: true });

  // Stargate: ETH → Arbitrum
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_42161_wallet', stepType: 'BRIDGE', protocol: 'stargate', protocolAddress: STARGATE, gasEstimateUsd: 1.20, bridgeFeeUsd: 1.20, slippageBps: 5,  isBridge: true });
  g.addEdge({ from: 'ETH_1_wallet',  to: 'ETH_42161_wallet',  stepType: 'BRIDGE', protocol: 'stargate', protocolAddress: STARGATE, gasEstimateUsd: 1.30, bridgeFeeUsd: 1.40, slippageBps: 5,  isBridge: true });

  // Stargate: ETH → Polygon
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_137_wallet',   stepType: 'BRIDGE', protocol: 'stargate', protocolAddress: STARGATE, gasEstimateUsd: 1.10, bridgeFeeUsd: 1.10, slippageBps: 4,  isBridge: true });
  g.addEdge({ from: 'USDT_1_wallet', to: 'USDT_137_wallet',   stepType: 'BRIDGE', protocol: 'stargate', protocolAddress: STARGATE, gasEstimateUsd: 1.10, bridgeFeeUsd: 1.10, slippageBps: 4,  isBridge: true });

  // Across: ETH → Arbitrum (faster, lower fee)
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_42161_wallet', stepType: 'BRIDGE', protocol: 'across',   protocolAddress: ACROSS,   gasEstimateUsd: 0.80, bridgeFeeUsd: 0.60, slippageBps: 2,  isBridge: true });
  g.addEdge({ from: 'ETH_1_wallet',  to: 'ETH_42161_wallet',  stepType: 'BRIDGE', protocol: 'across',   protocolAddress: ACROSS,   gasEstimateUsd: 0.85, bridgeFeeUsd: 0.70, slippageBps: 3,  isBridge: true });

  // Across: ETH → Base
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_8453_wallet',  stepType: 'BRIDGE', protocol: 'across',   protocolAddress: ACROSS,   gasEstimateUsd: 0.70, bridgeFeeUsd: 0.50, slippageBps: 2,  isBridge: true });

  // ── Base: wallet → lend ─────────────────────────────────────────────────────

  g.addEdge({ from: 'USDC_8453_wallet', to: 'USDC_8453_aave_v3_deposit',    stepType: 'LEND', protocol: 'aave_v3',     protocolAddress: AAVE_BASE,        gasEstimateUsd: 0.05, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'ETH_8453_wallet',  to: 'ETH_8453_aave_v3_deposit',     stepType: 'LEND', protocol: 'aave_v3',     protocolAddress: AAVE_BASE,        gasEstimateUsd: 0.05, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'USDC_8453_wallet', to: 'USDC_8453_compound_v3_deposit', stepType: 'LEND', protocol: 'compound_v3', protocolAddress: COMPOUND_V3_BASE, gasEstimateUsd: 0.04, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'USDC_8453_wallet', to: 'USDC_8453_morpho_deposit',      stepType: 'LEND', protocol: 'morpho',      protocolAddress: MORPHO_ETH,       gasEstimateUsd: 0.05, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });

  // ── Arbitrum: wallet → lend ─────────────────────────────────────────────────

  g.addEdge({ from: 'USDC_42161_wallet', to: 'USDC_42161_aave_v3_deposit',    stepType: 'LEND', protocol: 'aave_v3',     protocolAddress: AAVE_ARB,        gasEstimateUsd: 0.10, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'ETH_42161_wallet',  to: 'ETH_42161_aave_v3_deposit',     stepType: 'LEND', protocol: 'aave_v3',     protocolAddress: AAVE_ARB,        gasEstimateUsd: 0.10, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'USDC_42161_wallet', to: 'USDC_42161_compound_v3_deposit', stepType: 'LEND', protocol: 'compound_v3', protocolAddress: COMPOUND_V3_ARB, gasEstimateUsd: 0.08, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'USDC_42161_wallet', to: 'USDC_42161_gmx',                 stepType: 'STAKE', protocol: 'gmx',        protocolAddress: GMX_MANAGER,     gasEstimateUsd: 0.15, bridgeFeeUsd: 0, slippageBps: 30, isBridge: false });

  // ── Polygon: wallet → lend ──────────────────────────────────────────────────

  g.addEdge({ from: 'USDC_137_wallet', to: 'USDC_137_aave_v3_deposit', stepType: 'LEND', protocol: 'aave_v3', protocolAddress: AAVE_POLY, gasEstimateUsd: 0.02, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'USDT_137_wallet', to: 'USDT_137_aave_v3_deposit', stepType: 'LEND', protocol: 'aave_v3', protocolAddress: AAVE_POLY, gasEstimateUsd: 0.02, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });

  // ── Optimism: bridge in ─────────────────────────────────────────────────────

  const AAVE_OPT = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'; // Aave v3 Optimism
  const COMPOUND_V3_OPT = '0x2e44e174f7D53F0212823acC11C01A11d58c5bCb';

  // Across: ETH → Optimism
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_10_wallet',  stepType: 'BRIDGE', protocol: 'across', protocolAddress: ACROSS, gasEstimateUsd: 0.75, bridgeFeeUsd: 0.55, slippageBps: 2, isBridge: true });
  g.addEdge({ from: 'ETH_1_wallet',  to: 'ETH_10_wallet',   stepType: 'BRIDGE', protocol: 'across', protocolAddress: ACROSS, gasEstimateUsd: 0.80, bridgeFeeUsd: 0.65, slippageBps: 3, isBridge: true });

  // Stargate: ETH → Optimism
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_10_wallet',  stepType: 'BRIDGE', protocol: 'stargate', protocolAddress: STARGATE, gasEstimateUsd: 0.90, bridgeFeeUsd: 0.85, slippageBps: 3, isBridge: true });

  // ── Optimism: wallet → lend ─────────────────────────────────────────────────

  g.addEdge({ from: 'USDC_10_wallet', to: 'USDC_10_aave_v3_deposit',    stepType: 'LEND', protocol: 'aave_v3',     protocolAddress: AAVE_OPT,       gasEstimateUsd: 0.05, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'ETH_10_wallet',  to: 'ETH_10_aave_v3_deposit',     stepType: 'LEND', protocol: 'aave_v3',     protocolAddress: AAVE_OPT,       gasEstimateUsd: 0.05, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'USDC_10_wallet', to: 'USDC_10_compound_v3_deposit', stepType: 'LEND', protocol: 'compound_v3', protocolAddress: COMPOUND_V3_OPT, gasEstimateUsd: 0.04, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'USDC_10_wallet', to: 'USDC_10_morpho_deposit',      stepType: 'LEND', protocol: 'morpho',      protocolAddress: MORPHO_ETH,      gasEstimateUsd: 0.05, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });

  // ── Avalanche: bridge in ────────────────────────────────────────────────────

  const AAVE_AVAX  = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'; // Aave v3 Avalanche
  const STARGATE_AVAX = '0x45A01E4e04F14f7A4a6702c74187c5F6222033cd';
  const GMX_AVAX   = '0x5F719c2F1095F7B9fc68a68e35B51194f4b6abe8';

  // Stargate: ETH → Avalanche
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_43114_wallet', stepType: 'BRIDGE', protocol: 'stargate', protocolAddress: STARGATE_AVAX, gasEstimateUsd: 1.40, bridgeFeeUsd: 1.60, slippageBps: 6, isBridge: true });

  // ── Avalanche: wallet → lend ────────────────────────────────────────────────

  g.addEdge({ from: 'USDC_43114_wallet', to: 'USDC_43114_aave_v3_deposit', stepType: 'LEND', protocol: 'aave_v3', protocolAddress: AAVE_AVAX, gasEstimateUsd: 0.08, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'ETH_43114_wallet',  to: 'ETH_43114_aave_v3_deposit',  stepType: 'LEND', protocol: 'aave_v3', protocolAddress: AAVE_AVAX, gasEstimateUsd: 0.08, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'USDC_43114_wallet', to: 'USDC_43114_gmx',             stepType: 'STAKE', protocol: 'gmx',    protocolAddress: GMX_AVAX,  gasEstimateUsd: 0.12, bridgeFeeUsd: 0, slippageBps: 30, isBridge: false });

  // ── Solana (chain 101) ───────────────────────────────────────────────────────
  // Chain ID 101 follows the Phantom/Solana ecosystem convention.
  // Wormhole bridges USDC from Solana to Ethereum mainnet.

  g.addNode(wallet('SOL',  101));   // native SOL
  g.addNode(wallet('USDC', 101));   // SPL USDC on Solana

  // Kamino USDC lending on Solana
  g.addNode({ id: 'USDC_101_kamino_deposit', asset: 'kUSDC', chain: 101, protocol: 'kamino', action: 'LEND', tvlUsd: 300_000_000, apyBps: 650, exploitFlagged: false });

  const WORMHOLE_CORE = '0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B'; // Ethereum Core Bridge

  // Wormhole: Solana USDC → Ethereum USDC
  g.addEdge({ from: 'USDC_101_wallet', to: 'USDC_1_wallet', stepType: 'BRIDGE', protocol: 'wormhole', protocolAddress: WORMHOLE_CORE, gasEstimateUsd: 0.60, bridgeFeeUsd: 1.20, slippageBps: 5, isBridge: true });

  // Kamino: Solana wallet → lending
  g.addEdge({ from: 'USDC_101_wallet', to: 'USDC_101_kamino_deposit', stepType: 'LEND', protocol: 'kamino', protocolAddress: '0x0000000000000000000000000000000000000000', gasEstimateUsd: 0.01, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });

  // ── Scroll (chain 534352) ────────────────────────────────────────────────────
  // Scroll is a ZK rollup on Ethereum. Low gas (~$0.03), EVM-equivalent.
  // Primary DeFi: Aave v3 + Layerbank (lending) + Ambient (DEX).

  const AAVE_SCROLL    = '0x11fCfe756c05AD438e312a7fd934381537D3cFfe'; // Aave v3 Scroll
  const LAYERBANK_SCROLL = '0x009a0b7C38B542208936F1179151CD08E2943833'; // Layerbank Scroll core
  const ACROSS_SCROLL  = '0x3baD7AD0728f9917d1Bf08af5782dCbD516cDd96'; // Across SpokePool Scroll

  g.addNode(wallet('ETH',  534352));
  g.addNode(wallet('USDC', 534352));
  g.addNode(wallet('USDT', 534352));

  // Aave v3 on Scroll
  g.addNode(lendNode('USDC', 'aUSDC', 534352, 'aave_v3',    120_000_000, 510));
  g.addNode(lendNode('ETH',  'aETH',  534352, 'aave_v3',     80_000_000, 200));

  // Layerbank — Scroll-native lending (Compound-fork)
  g.addNode(lendNode('USDC', 'lbUSDC', 534352, 'layerbank',  60_000_000, 580));
  g.addNode(lendNode('ETH',  'lbETH',  534352, 'layerbank',  40_000_000, 220));

  // Across: ETH → Scroll
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_534352_wallet', stepType: 'BRIDGE', protocol: 'across', protocolAddress: ACROSS,       gasEstimateUsd: 0.72, bridgeFeeUsd: 0.50, slippageBps: 2, isBridge: true });
  g.addEdge({ from: 'ETH_1_wallet',  to: 'ETH_534352_wallet',  stepType: 'BRIDGE', protocol: 'across', protocolAddress: ACROSS,       gasEstimateUsd: 0.78, bridgeFeeUsd: 0.60, slippageBps: 3, isBridge: true });
  // Scroll native bridge (slower but free relay — users bridge ETH directly)
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_534352_wallet', stepType: 'BRIDGE', protocol: 'scroll_bridge', protocolAddress: ACROSS_SCROLL, gasEstimateUsd: 0.50, bridgeFeeUsd: 0, slippageBps: 1, isBridge: true });

  // Scroll: wallet → lend
  g.addEdge({ from: 'USDC_534352_wallet', to: 'USDC_534352_aave_v3_deposit',   stepType: 'LEND', protocol: 'aave_v3',   protocolAddress: AAVE_SCROLL,     gasEstimateUsd: 0.03, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'ETH_534352_wallet',  to: 'ETH_534352_aave_v3_deposit',    stepType: 'LEND', protocol: 'aave_v3',   protocolAddress: AAVE_SCROLL,     gasEstimateUsd: 0.03, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'USDC_534352_wallet', to: 'USDC_534352_layerbank_deposit', stepType: 'LEND', protocol: 'layerbank', protocolAddress: LAYERBANK_SCROLL, gasEstimateUsd: 0.03, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'ETH_534352_wallet',  to: 'ETH_534352_layerbank_deposit',  stepType: 'LEND', protocol: 'layerbank', protocolAddress: LAYERBANK_SCROLL, gasEstimateUsd: 0.03, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });

  // ── zkSync Era (chain 324) ────────────────────────────────────────────────────
  // zkSync Era is a ZK rollup with native account abstraction. Gas ~$0.05.
  // Primary DeFi: ZeroLend (Aave-fork) + Maverick (DEX) + SyncSwap.

  const ZEROLEND_ZKSYNC  = '0x767B53bde5d4723e97b726D3D3f4CbA1D70CfFCc'; // ZeroLend Pool on zkSync
  const ACROSS_ZKSYNC    = '0xE0B015E54d54fc84a6cB9B666099c46adE9335FF'; // Across SpokePool zkSync

  g.addNode(wallet('ETH',  324));
  g.addNode(wallet('USDC', 324));
  g.addNode(wallet('USDT', 324));

  // ZeroLend — zkSync Era (Aave v3 fork with ZK-native optimizations)
  g.addNode(lendNode('USDC', 'zUSDC', 324, 'zerolend', 90_000_000, 530));
  g.addNode(lendNode('ETH',  'zETH',  324, 'zerolend', 60_000_000, 210));
  g.addNode(lendNode('USDT', 'zUSDT', 324, 'zerolend', 40_000_000, 490));

  // Across: ETH → zkSync Era
  g.addEdge({ from: 'USDC_1_wallet', to: 'USDC_324_wallet', stepType: 'BRIDGE', protocol: 'across',      protocolAddress: ACROSS,       gasEstimateUsd: 0.68, bridgeFeeUsd: 0.45, slippageBps: 2, isBridge: true });
  g.addEdge({ from: 'ETH_1_wallet',  to: 'ETH_324_wallet',  stepType: 'BRIDGE', protocol: 'across',      protocolAddress: ACROSS,       gasEstimateUsd: 0.75, bridgeFeeUsd: 0.55, slippageBps: 3, isBridge: true });
  // zkSync native bridge
  g.addEdge({ from: 'ETH_1_wallet',  to: 'ETH_324_wallet',  stepType: 'BRIDGE', protocol: 'zksync_bridge', protocolAddress: ACROSS_ZKSYNC, gasEstimateUsd: 0.55, bridgeFeeUsd: 0, slippageBps: 1, isBridge: true });

  // zkSync: wallet → lend
  g.addEdge({ from: 'USDC_324_wallet', to: 'USDC_324_zerolend_deposit', stepType: 'LEND', protocol: 'zerolend', protocolAddress: ZEROLEND_ZKSYNC, gasEstimateUsd: 0.05, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'ETH_324_wallet',  to: 'ETH_324_zerolend_deposit',  stepType: 'LEND', protocol: 'zerolend', protocolAddress: ZEROLEND_ZKSYNC, gasEstimateUsd: 0.05, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });
  g.addEdge({ from: 'USDT_324_wallet', to: 'USDT_324_zerolend_deposit', stepType: 'LEND', protocol: 'zerolend', protocolAddress: ZEROLEND_ZKSYNC, gasEstimateUsd: 0.05, bridgeFeeUsd: 0, slippageBps: 0, isBridge: false });

  return g;
}

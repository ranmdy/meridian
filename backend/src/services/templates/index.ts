/**
 * Strategy Template Library
 *
 * Curated, pre-built strategy templates that users can browse and copy into
 * their own strategy forms. Each template is a fully-specified StrategyOptimizeRequest
 * with a human-readable name, description, and metadata.
 */

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'yield' | 'bridge' | 'arbitrage' | 'lending' | 'staking';
  difficulty: 'simple' | 'moderate' | 'advanced';
  estimatedApyBps: number;   // indicative APY in basis points
  riskLevel: 1 | 2 | 3 | 4 | 5;
  sourceAsset: string;
  sourceChain: number;
  destinationChain: number;
  timeHorizonDays: number;
  tags: string[];
  popularityScore: number;   // 0–100, higher = more popular
  createdAt: number;
}

const TEMPLATES: StrategyTemplate[] = [
  {
    id: 'usdc-base-aave',
    name: 'USDC Stablecoin Yield on Base',
    description: 'Bridge USDC from Ethereum to Base, then deposit into Aave v3 for stable yield. Low risk, no price exposure.',
    category: 'yield',
    difficulty: 'simple',
    estimatedApyBps: 450,
    riskLevel: 1,
    sourceAsset: 'USDC',
    sourceChain: 1,
    destinationChain: 8453,
    timeHorizonDays: 90,
    tags: ['stablecoin', 'base', 'aave', 'lending'],
    popularityScore: 91,
    createdAt: 1704067200,
  },
  {
    id: 'eth-arb-uniswap-lend',
    name: 'ETH: Bridge + LP on Arbitrum',
    description: 'Move ETH to Arbitrum via Stargate, provide liquidity in Uniswap v3 ETH/USDC 0.05% pool. Earns swap fees.',
    category: 'yield',
    difficulty: 'moderate',
    estimatedApyBps: 820,
    riskLevel: 3,
    sourceAsset: 'ETH',
    sourceChain: 1,
    destinationChain: 42161,
    timeHorizonDays: 30,
    tags: ['eth', 'arbitrum', 'uniswap', 'liquidity'],
    popularityScore: 78,
    createdAt: 1706745600,
  },
  {
    id: 'usdt-bnb-pancake',
    name: 'USDT Yield on BNB Chain',
    description: 'Bridge USDT to BNB Chain and stake in PancakeSwap stable pools. Higher APY with minimal impermanent loss.',
    category: 'yield',
    difficulty: 'simple',
    estimatedApyBps: 620,
    riskLevel: 2,
    sourceAsset: 'USDT',
    sourceChain: 1,
    destinationChain: 56,
    timeHorizonDays: 60,
    tags: ['stablecoin', 'bnb', 'pancakeswap'],
    popularityScore: 65,
    createdAt: 1709424000,
  },
  {
    id: 'wbtc-polygon-aave',
    name: 'WBTC Lending on Polygon',
    description: 'Bridge WBTC to Polygon and supply to Aave v3. Earn yield on BTC exposure without selling.',
    category: 'lending',
    difficulty: 'simple',
    estimatedApyBps: 130,
    riskLevel: 2,
    sourceAsset: 'WBTC',
    sourceChain: 1,
    destinationChain: 137,
    timeHorizonDays: 180,
    tags: ['wbtc', 'polygon', 'aave', 'bitcoin'],
    popularityScore: 54,
    createdAt: 1709424000,
  },
  {
    id: 'eth-optimism-compound',
    name: 'ETH Staking + Compound on Optimism',
    description: 'Move ETH to Optimism via Hop Protocol, supply to Compound v3. Captures rollup APY boost.',
    category: 'lending',
    difficulty: 'moderate',
    estimatedApyBps: 340,
    riskLevel: 2,
    sourceAsset: 'ETH',
    sourceChain: 1,
    destinationChain: 10,
    timeHorizonDays: 45,
    tags: ['eth', 'optimism', 'compound'],
    popularityScore: 47,
    createdAt: 1712102400,
  },
  {
    id: 'usdc-multichain-arb',
    name: 'USDC Cross-Chain Rate Arbitrage',
    description: 'Exploit APY differentials across Aave on Base vs Arbitrum. Bridge USDC to highest-yield chain each week.',
    category: 'arbitrage',
    difficulty: 'advanced',
    estimatedApyBps: 1100,
    riskLevel: 4,
    sourceAsset: 'USDC',
    sourceChain: 8453,
    destinationChain: 42161,
    timeHorizonDays: 7,
    tags: ['usdc', 'arbitrage', 'aave', 'multi-chain'],
    popularityScore: 82,
    createdAt: 1714780800,
  },
  {
    id: 'eth-scroll-native',
    name: 'ETH Native Yield on Scroll',
    description: 'Deposit ETH into Scroll native protocols. Early adopter bonus yields from Scroll incentives.',
    category: 'staking',
    difficulty: 'simple',
    estimatedApyBps: 750,
    riskLevel: 3,
    sourceAsset: 'ETH',
    sourceChain: 1,
    destinationChain: 534352,
    timeHorizonDays: 90,
    tags: ['eth', 'scroll', 'native', 'incentives'],
    popularityScore: 59,
    createdAt: 1717459200,
  },
  {
    id: 'usdc-zksync-bridge',
    name: 'USDC zkSync Era Vault',
    description: 'Bridge USDC to zkSync Era and earn yield in ZK native protocols with low gas costs.',
    category: 'yield',
    difficulty: 'moderate',
    estimatedApyBps: 580,
    riskLevel: 2,
    sourceAsset: 'USDC',
    sourceChain: 1,
    destinationChain: 324,
    timeHorizonDays: 30,
    tags: ['usdc', 'zksync', 'zk'],
    popularityScore: 41,
    createdAt: 1720137600,
  },
];

const CATEGORY_ORDER: Record<string, number> = {
  yield: 0,
  lending: 1,
  staking: 2,
  arbitrage: 3,
  bridge: 4,
};

export function listTemplates(opts?: {
  category?: string;
  maxRisk?: number;
  minApy?: number;
  sort?: 'popular' | 'apy' | 'risk';
  limit?: number;
  offset?: number;
}): { templates: StrategyTemplate[]; total: number } {
  let results = [...TEMPLATES];

  if (opts?.category) {
    results = results.filter((t) => t.category === opts.category);
  }
  if (opts?.maxRisk !== undefined) {
    results = results.filter((t) => t.riskLevel <= opts.maxRisk!);
  }
  if (opts?.minApy !== undefined) {
    results = results.filter((t) => t.estimatedApyBps >= opts.minApy!);
  }

  // Sort
  switch (opts?.sort ?? 'popular') {
    case 'apy':
      results.sort((a, b) => b.estimatedApyBps - a.estimatedApyBps);
      break;
    case 'risk':
      results.sort((a, b) => a.riskLevel - b.riskLevel);
      break;
    default:
      results.sort((a, b) => b.popularityScore - a.popularityScore);
  }

  const total = results.length;
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? 20;
  return { templates: results.slice(offset, offset + limit), total };
}

export function getTemplate(id: string): StrategyTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

export function getTemplateCategories(): string[] {
  const cats = [...new Set(TEMPLATES.map((t) => t.category))];
  return cats.sort((a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99));
}

// Mock data for Meridian Press — TypeScript version

export const CHAINS = [
  { id: 1, name: 'Ethereum', short: 'ETH', color: 'var(--c-slate)' },
  { id: 42161, name: 'Arbitrum', short: 'ARB', color: 'var(--c-slate)' },
  { id: 8453, name: 'Base', short: 'BASE', color: 'var(--c-slate)' },
  { id: 137, name: 'Polygon', short: 'MATIC', color: 'var(--c-plum)' },
  { id: 56, name: 'BNB Chain', short: 'BNB', color: 'var(--c-ochre)' },
  { id: 10, name: 'Optimism', short: 'OP', color: 'var(--bad)' },
  { id: 43114, name: 'Avalanche', short: 'AVAX', color: 'var(--bad)' },
  { id: 534352, name: 'Scroll', short: 'SCROLL', color: 'var(--c-clay)' },
  { id: 324, name: 'zkSync Era', short: 'ZKSYNC', color: 'var(--c-slate)' },
  { id: 'sol', name: 'Solana', short: 'SOL', color: 'var(--c-plum)' },
] as const;

export const ASSETS: Record<string, { sym: string; color: string }> = {
  ETH:  { sym: 'ETH',  color: 'var(--c-slate)' },
  USDC: { sym: 'USDC', color: 'var(--c-moss)' },
  USDT: { sym: 'USDT', color: 'var(--c-moss)' },
  WBTC: { sym: 'WBTC', color: 'var(--c-clay)' },
  SOL:  { sym: 'SOL',  color: 'var(--c-plum)' },
  DAI:  { sym: 'DAI',  color: 'var(--c-ochre)' },
};

export interface RouteStep {
  kind: string;
  label: string;
  from?: string;
  to?: string;
  token?: string;
  apy?: number;
}

export interface Route {
  id: string;
  rank: number;
  apy: number;
  fee: number;
  timeMin: number;
  risk: number;
  riskLabel: string;
  steps: RouteStep[];
}

export const ROUTES: Route[] = [
  {
    id: 'r1',
    rank: 1,
    apy: 14.82,
    fee: 0.18,
    timeMin: 2.4,
    risk: 22,
    riskLabel: 'Low',
    steps: [
      { kind: 'BRIDGE', label: 'Across', from: 'Ethereum', to: 'Base' },
      { kind: 'SWAP',   label: 'Aerodrome', from: 'USDC', to: 'cbETH' },
      { kind: 'LEND',   label: 'Moonwell', token: 'cbETH', apy: 14.82 },
    ],
  },
  {
    id: 'r2',
    rank: 2,
    apy: 13.06,
    fee: 0.12,
    timeMin: 1.8,
    risk: 18,
    riskLabel: 'Low',
    steps: [
      { kind: 'BRIDGE', label: 'Stargate', from: 'Ethereum', to: 'Arbitrum' },
      { kind: 'LEND',   label: 'Aave v3', token: 'USDC', apy: 13.06 },
    ],
  },
  {
    id: 'r3',
    rank: 3,
    apy: 17.42,
    fee: 0.31,
    timeMin: 4.1,
    risk: 54,
    riskLabel: 'Moderate',
    steps: [
      { kind: 'BRIDGE', label: 'Hop', from: 'Ethereum', to: 'Polygon' },
      { kind: 'SWAP',   label: 'Quickswap', from: 'USDC', to: 'MATIC' },
      { kind: 'STAKE',  label: 'Lido (st)', token: 'MATIC', apy: 17.42 },
    ],
  },
  {
    id: 'r4',
    rank: 4,
    apy: 22.10,
    fee: 0.48,
    timeMin: 6.7,
    risk: 71,
    riskLabel: 'High',
    steps: [
      { kind: 'BRIDGE', label: 'deBridge', from: 'Ethereum', to: 'Solana' },
      { kind: 'SWAP',   label: 'Jupiter', from: 'USDC', to: 'JitoSOL' },
      { kind: 'STAKE',  label: 'Marinade', token: 'JitoSOL', apy: 22.10 },
    ],
  },
];

export const TEMPLATES = [
  {
    id: 't1',
    name: 'Stable Yield, Ethereum',
    desc: 'USDC supplied to Aave v3 on the home chain. Lowest moving parts, lowest yield ceiling.',
    apy: 4.8, risk: 12, tier: 'starter', difficulty: 'simple',
    route: 'USDC · Ethereum',
    tags: ['lending', 'low-risk'], copies: 8421,
  },
  {
    id: 't2',
    name: 'Base Yield Loop',
    desc: 'Bridge USDC to Base, swap to cbETH, supply on Moonwell. Single bridge, no leverage.',
    apy: 14.8, risk: 22, tier: 'growth', difficulty: 'moderate',
    route: 'USDC · ETH → Base',
    tags: ['bridge', 'lending'], copies: 3902,
  },
  {
    id: 't3',
    name: 'Solana Liquid Stake',
    desc: 'Cross-chain to Solana, swap to JitoSOL, accrue MEV-boosted stake yield. Higher bridge risk.',
    apy: 22.1, risk: 71, tier: 'enterprise', difficulty: 'advanced',
    route: 'USDC · ETH → Solana',
    tags: ['bridge', 'staking'], copies: 1844,
  },
  {
    id: 't4',
    name: 'Arbitrum Stable Pool',
    desc: 'USDC.e/USDC LP on Curve, harvest CRV, auto-compound weekly. Stable pair, IL minimal.',
    apy: 9.4, risk: 28, tier: 'growth', difficulty: 'moderate',
    route: 'USDC · ETH → Arbitrum',
    tags: ['lending', 'farming'], copies: 2614,
  },
  {
    id: 't5',
    name: 'Polygon Restake',
    desc: 'Swap USDC → MATIC, delegate to Lido stMATIC, retain liquid token for re-collateralisation.',
    apy: 17.4, risk: 54, tier: 'growth', difficulty: 'advanced',
    route: 'USDC · ETH → Polygon',
    tags: ['staking'], copies: 1207,
  },
  {
    id: 't6',
    name: 'BNB Yield Triangle',
    desc: 'Bridge to BNB, swap into Venus collateral, borrow USDT, redeposit. Recursive, 1.8x effective.',
    apy: 19.2, risk: 63, tier: 'enterprise', difficulty: 'advanced',
    route: 'USDC · ETH → BNB',
    tags: ['lending', 'leverage'], copies: 962,
  },
];

export const MARKETPLACE = [
  { id: 'm1', name: 'Conservative Ethereum Lender', author: 'voss.eth', desc: 'Single-leg USDC lending, no bridge. The boring one. Compounded weekly via auto-claim.', apy: 4.8, risk: 11, votes: 412, copies: 2104, conservative: true, route: 'USDC · Ethereum', published: '2024-08-14' },
  { id: 'm2', name: 'Base Yield Stacker', author: 'ploom', desc: 'Bridges to Base, supplies cbETH on Moonwell, harvests AERO rewards weekly.', apy: 14.6, risk: 24, votes: 318, copies: 1872, conservative: false, route: 'USDC · ETH → Base', published: '2024-10-02' },
  { id: 'm3', name: 'Solana Long Yield', author: 'shorthand', desc: 'High-conviction Solana stake. Two-bridge path with Jupiter aggregator settlement.', apy: 22.1, risk: 71, votes: 244, copies: 906, conservative: false, route: 'USDC · ETH → SOL', published: '2024-11-20' },
  { id: 'm4', name: 'Arbitrum Stable LP', author: 'fern', desc: 'Curve USDC.e / USDC pool, CRV harvested and re-LPd. Built for capital efficiency at scale.', apy: 9.4, risk: 28, votes: 198, copies: 1421, conservative: false, route: 'USDC · ETH → ARB', published: '2024-09-19' },
  { id: 'm5', name: 'Polygon Triple', author: 'meridian.lab', desc: 'Three-protocol route. Lido stMATIC, then loop on Aave at 0.6 LTV. Audited route.', apy: 17.4, risk: 54, votes: 156, copies: 803, conservative: false, route: 'USDC · ETH → MATIC', published: '2024-12-04' },
  { id: 'm6', name: 'Optimism Vanilla', author: 'hex', desc: 'USDC to Velodrome single-sided. Quiet route, low TVL competition.', apy: 11.2, risk: 19, votes: 134, copies: 612, conservative: true, route: 'USDC · ETH → OP', published: '2025-01-08' },
];

export const PORTFOLIO = {
  totalUsd: 142_618.42,
  chains: [
    {
      chain: 'Ethereum',
      total: 84_210.18,
      assets: [
        { sym: 'ETH', balance: 12.4022, usd: 41_206.40, color: 'var(--c-slate)' },
        { sym: 'USDC', balance: 32_004.18, usd: 32_004.18, color: 'var(--c-moss)' },
        { sym: 'WBTC', balance: 0.1620, usd: 11_000.00, color: 'var(--c-clay)' },
      ],
    },
    {
      chain: 'Base',
      total: 28_440.20,
      assets: [
        { sym: 'cbETH', balance: 8.0102, usd: 26_440.20, color: 'var(--c-slate)' },
        { sym: 'USDC', balance: 2000.00, usd: 2000.00, color: 'var(--c-moss)' },
      ],
    },
    {
      chain: 'Arbitrum',
      total: 18_240.00,
      assets: [
        { sym: 'USDC', balance: 18_240.00, usd: 18_240.00, color: 'var(--c-moss)' },
      ],
    },
    {
      chain: 'Solana',
      total: 11_728.04,
      assets: [
        { sym: 'SOL', balance: 60.2010, usd: 8_428.04, color: 'var(--c-plum)' },
        { sym: 'JitoSOL', balance: 22.0142, usd: 3_300.00, color: 'var(--c-plum)' },
      ],
    },
  ],
};

export const EXECUTIONS = [
  { id: '0x7e21a4f0b9c7842d', status: 'completed', steps: 3, of: 3, elapsed: '2m 14s', when: '2026-05-22T14:08:00Z', route: 'USDC ETH → Base · Moonwell' },
  { id: '0xa1b94cc8b03d11f2', status: 'in-progress', steps: 2, of: 4, elapsed: '0m 47s', when: '2026-05-25T09:18:00Z', route: 'USDC ETH → Solana · Marinade' },
  { id: '0x4f0c81e6b2a37dd0', status: 'failed', steps: 1, of: 3, elapsed: '1m 02s', when: '2026-05-20T10:34:00Z', route: 'USDC ETH → Polygon · Lido' },
  { id: '0xc28f01a0e441f9bd', status: 'completed', steps: 3, of: 3, elapsed: '3m 41s', when: '2026-05-18T22:42:00Z', route: 'WBTC ETH → ARB · Aave v3' },
  { id: '0xb70a224d80f1e0bc', status: 'completed', steps: 2, of: 2, elapsed: '1m 53s', when: '2026-05-12T11:14:00Z', route: 'USDC ETH → ARB · Aave v3' },
];

export const SAVED_STRATEGIES = [
  { name: 'My Base Loop', meta: 'USDC · ETH → Base · Risk 2 · saved 12 May' },
  { name: 'Solana Test', meta: 'USDC · ETH → Solana · Risk 4 · saved 03 May' },
];

export interface Protocol {
  id: string;
  kind: string;
  label: string;
  chain: string;
  apy?: number;
}

export const PROTOCOLS: Protocol[] = [
  // wallet
  { id: 'wallet-evm', kind: 'wallet', label: 'EVM Wallet', chain: 'Ethereum' },
  { id: 'wallet-sol', kind: 'wallet', label: 'Solana Wallet', chain: 'Solana' },
  // bridge
  { id: 'across',   kind: 'bridge', label: 'Across',   chain: 'cross-chain' },
  { id: 'stargate', kind: 'bridge', label: 'Stargate', chain: 'cross-chain' },
  { id: 'hop',      kind: 'bridge', label: 'Hop',      chain: 'cross-chain' },
  { id: 'debridge', kind: 'bridge', label: 'deBridge', chain: 'cross-chain' },
  // swap
  { id: 'aerodrome',  kind: 'swap', label: 'Aerodrome',  chain: 'Base' },
  { id: 'quickswap',  kind: 'swap', label: 'QuickSwap',  chain: 'Polygon' },
  { id: 'jupiter',    kind: 'swap', label: 'Jupiter',    chain: 'Solana' },
  { id: 'uniswap',    kind: 'swap', label: 'Uniswap v3', chain: 'Ethereum' },
  // lend
  { id: 'aave-eth',     kind: 'lend', label: 'Aave v3',   chain: 'Ethereum',  apy: 5.4 },
  { id: 'aave-arb',     kind: 'lend', label: 'Aave v3',   chain: 'Arbitrum',  apy: 13.06 },
  { id: 'moonwell',     kind: 'lend', label: 'Moonwell',  chain: 'Base',      apy: 14.82 },
  { id: 'venus',        kind: 'lend', label: 'Venus',     chain: 'BNB Chain', apy: 19.2 },
  { id: 'compound',     kind: 'lend', label: 'Compound',  chain: 'Ethereum',  apy: 4.4 },
  // stake
  { id: 'lido',         kind: 'stake', label: 'Lido',        chain: 'Ethereum', apy: 3.2 },
  { id: 'lido-matic',   kind: 'stake', label: 'Lido stMATIC', chain: 'Polygon', apy: 17.4 },
  { id: 'marinade',     kind: 'stake', label: 'Marinade',    chain: 'Solana',   apy: 22.1 },
  { id: 'jito',         kind: 'stake', label: 'Jito',        chain: 'Solana',   apy: 8.4 },
];

export const KIND_COLOR: Record<string, string> = {
  wallet: 'var(--k-wallet)',
  lend:   'var(--k-lend)',
  bridge: 'var(--k-bridge)',
  swap:   'var(--k-swap)',
  stake:  'var(--k-stake)',
};

export const KIND_GLYPH: Record<string, string> = {
  wallet: '◆',
  lend:   '+',
  bridge: '~',
  swap:   '↔',
  stake:  '↑',
};

export const STEP_GLYPH: Record<string, string> = {
  SWAP: '↔',
  LEND: '+',
  BRIDGE: '~',
  STAKE: '↑',
  SETTLE: '·',
};

export const API_KEYS = [
  { id: 'mk_prod_a91f', name: 'Production · Backend', env: 'live', tier: 'enterprise', rpm: 600, used: 412_881, limit: 1_000_000, created: '2024-09-12', lastUsed: '2026-05-25T08:14:00Z', active: true },
  { id: 'mk_test_b27c', name: 'Local Dev', env: 'test', tier: 'starter', rpm: 60, used: 1_204, limit: 10_000, created: '2025-02-04', lastUsed: '2026-05-24T22:14:00Z', active: true },
  { id: 'mk_test_d10e', name: 'Staging Build', env: 'test', tier: 'growth', rpm: 200, used: 18_440, limit: 100_000, created: '2025-04-19', lastUsed: '2026-05-22T11:01:00Z', active: true },
];

export const TIERS = [
  { id: 'starter',    name: 'Starter',    rpm: 60,  limit: 10_000,    price: 0 },
  { id: 'growth',     name: 'Growth',     rpm: 200, limit: 100_000,   price: 49 },
  { id: 'enterprise', name: 'Enterprise', rpm: 600, limit: 1_000_000, price: 299 },
];

// Formatters
export function fmtUsd(n: number, dp = 2): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function fmtNum(n: number, dp = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function fmtPct(n: number, dp = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) + '%';
}
export function fmtAddr(a: string): string {
  if (!a) return '';
  return a.slice(0, 6) + '…' + a.slice(-4);
}
export function riskColor(r: number): string {
  if (r < 30) return 'var(--ok)';
  if (r < 60) return 'var(--warn)';
  return 'var(--bad)';
}
export function riskLabel(r: number): string {
  if (r < 30) return 'Low';
  if (r < 60) return 'Moderate';
  return 'High';
}

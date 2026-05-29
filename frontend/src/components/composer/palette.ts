import type { PaletteItem } from './types.js';

export const PALETTE_ITEMS: PaletteItem[] = [
  // ── Wallet sources ────────────────────────────────────────────────────────
  { kind: 'wallet', protocol: 'wallet', label: 'ETH Wallet',      chain: 1,     chainName: 'Ethereum', asset: 'ETH'  },
  { kind: 'wallet', protocol: 'wallet', label: 'USDC Wallet',     chain: 1,     chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'wallet', protocol: 'wallet', label: 'WBTC Wallet',     chain: 1,     chainName: 'Ethereum', asset: 'WBTC' },
  { kind: 'wallet', protocol: 'wallet', label: 'USDC (Arb)',      chain: 42161, chainName: 'Arbitrum', asset: 'USDC' },
  { kind: 'wallet', protocol: 'wallet', label: 'USDC (Base)',     chain: 8453,  chainName: 'Base',     asset: 'USDC' },
  { kind: 'wallet', protocol: 'wallet', label: 'USDC (Polygon)',  chain: 137,    chainName: 'Polygon',  asset: 'USDC' },
  { kind: 'wallet', protocol: 'wallet', label: 'USDC (Optimism)', chain: 10,     chainName: 'Optimism', asset: 'USDC' },
  { kind: 'wallet', protocol: 'wallet', label: 'USDC (Scroll)',   chain: 534352, chainName: 'Scroll',   asset: 'USDC' },
  { kind: 'wallet', protocol: 'wallet', label: 'USDC (zkSync)',   chain: 324,    chainName: 'zkSync',   asset: 'USDC' },
  { kind: 'wallet', protocol: 'wallet', label: 'USDC (BNB)',      chain: 56,     chainName: 'BNB Chain',asset: 'USDC' },
  { kind: 'wallet', protocol: 'wallet', label: 'USDC (Avalanche)',chain: 43114,  chainName: 'Avalanche',asset: 'USDC' },
  { kind: 'wallet', protocol: 'wallet', label: 'USDC (Solana)',   chain: 101,    chainName: 'Solana',   asset: 'USDC' },

  // ── Lend steps ────────────────────────────────────────────────────────────
  { kind: 'lend', protocol: 'aave_v3',    label: 'Aave v3 (ETH)',        chain: 1,      chainName: 'Ethereum', asset: 'USDC',  apyBps: 480  },
  { kind: 'lend', protocol: 'aave_v3',    label: 'Aave v3 (Arb)',        chain: 42161,  chainName: 'Arbitrum', asset: 'USDC',  apyBps: 500  },
  { kind: 'lend', protocol: 'aave_v3',    label: 'Aave v3 (Base)',       chain: 8453,   chainName: 'Base',     asset: 'USDC',  apyBps: 520  },
  { kind: 'lend', protocol: 'aave_v3',    label: 'Aave v3 (Polygon)',    chain: 137,    chainName: 'Polygon',  asset: 'USDC',  apyBps: 470  },
  { kind: 'lend', protocol: 'aave_v3',    label: 'Aave v3 (Optimism)',   chain: 10,     chainName: 'Optimism', asset: 'USDC',  apyBps: 490  },
  { kind: 'lend', protocol: 'aave_v3',    label: 'Aave v3 (Scroll)',     chain: 534352, chainName: 'Scroll',   asset: 'USDC',  apyBps: 510  },
  { kind: 'lend', protocol: 'compound_v3',label: 'Compound v3 (ETH)',    chain: 1,      chainName: 'Ethereum', asset: 'USDC',  apyBps: 420  },
  { kind: 'lend', protocol: 'compound_v3',label: 'Compound v3 (Arb)',    chain: 42161,  chainName: 'Arbitrum', asset: 'USDC',  apyBps: 430  },
  { kind: 'lend', protocol: 'morpho',     label: 'Morpho (ETH)',         chain: 1,      chainName: 'Ethereum', asset: 'USDC',  apyBps: 550  },
  { kind: 'lend', protocol: 'morpho',     label: 'Morpho (Base)',        chain: 8453,   chainName: 'Base',     asset: 'USDC',  apyBps: 580  },
  { kind: 'lend', protocol: 'layerbank',  label: 'Layerbank (Scroll)',   chain: 534352, chainName: 'Scroll',   asset: 'USDC',  apyBps: 580  },
  { kind: 'lend', protocol: 'zerolend',   label: 'ZeroLend (zkSync)',    chain: 324,    chainName: 'zkSync',   asset: 'USDC',  apyBps: 530  },
  { kind: 'lend', protocol: 'kamino',     label: 'Kamino (Solana)',      chain: 101,    chainName: 'Solana',   asset: 'USDC',  apyBps: 650  },

  // ── Bridges ───────────────────────────────────────────────────────────────
  { kind: 'bridge', protocol: 'stargate',      label: 'Stargate → Base',      chain: 1,  chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'bridge', protocol: 'stargate',      label: 'Stargate → Arb',       chain: 1,  chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'bridge', protocol: 'stargate',      label: 'Stargate → Polygon',   chain: 1,  chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'bridge', protocol: 'across',        label: 'Across → Arb',         chain: 1,  chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'bridge', protocol: 'across',        label: 'Across → Base',        chain: 1,  chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'bridge', protocol: 'across',        label: 'Across → Optimism',    chain: 1,  chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'bridge', protocol: 'across',        label: 'Across → Scroll',      chain: 1,  chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'bridge', protocol: 'across',        label: 'Across → zkSync',      chain: 1,  chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'bridge', protocol: 'scroll_bridge', label: 'Scroll Native Bridge', chain: 1,  chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'bridge', protocol: 'zksync_bridge', label: 'zkSync Native Bridge', chain: 1,  chainName: 'Ethereum', asset: 'ETH'  },
  { kind: 'bridge', protocol: 'wormhole',      label: 'Wormhole (Solana→ETH)',chain: 101, chainName: 'Solana',  asset: 'USDC' },

  // ── Swap steps ────────────────────────────────────────────────────────────
  { kind: 'swap', protocol: 'uniswap_v3',  label: 'Uniswap v3 (ETH)',   chain: 1,     chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'swap', protocol: 'curve',       label: 'Curve 3pool (ETH)',   chain: 1,     chainName: 'Ethereum', asset: 'USDC' },
  { kind: 'swap', protocol: 'curve',       label: 'Curve (Arb)',         chain: 42161, chainName: 'Arbitrum', asset: 'USDC' },
  { kind: 'swap', protocol: 'camelot',     label: 'Camelot (Arb)',       chain: 42161, chainName: 'Arbitrum', asset: 'USDC' },
  { kind: 'swap', protocol: 'aerodrome',   label: 'Aerodrome (Base)',     chain: 8453,  chainName: 'Base',     asset: 'USDC' },
  { kind: 'swap', protocol: 'pancakeswap', label: 'PancakeSwap v3 (BNB)',chain: 56,    chainName: 'BNB Chain',asset: 'USDC' },

  // ── Stake steps ───────────────────────────────────────────────────────────
  { kind: 'stake', protocol: 'gmx',    label: 'GMX GLP Stake (Arb)',        chain: 42161, chainName: 'Arbitrum', asset: 'GLP',      apyBps: 840 },
  { kind: 'stake', protocol: 'gmx',    label: 'GMX GLP Stake (Avax)',       chain: 43114, chainName: 'Avalanche',asset: 'GLP',      apyBps: 720 },
  { kind: 'stake', protocol: 'pendle', label: 'Pendle PT-stETH (ETH)',      chain: 1,     chainName: 'Ethereum', asset: 'PT-stETH', apyBps: 420 },
  { kind: 'stake', protocol: 'pendle', label: 'Pendle PT-eETH (ETH)',       chain: 1,     chainName: 'Ethereum', asset: 'PT-eETH',  apyBps: 380 },
  { kind: 'stake', protocol: 'pendle', label: 'Pendle PT-weETH (Arb)',      chain: 42161, chainName: 'Arbitrum', asset: 'PT-weETH', apyBps: 450 },
  { kind: 'stake', protocol: 'pendle', label: 'Pendle PT-USDC (Arb)',       chain: 42161, chainName: 'Arbitrum', asset: 'PT-USDC',  apyBps: 860 },
  { kind: 'stake', protocol: 'convex', label: 'Convex 3pool (ETH)',         chain: 1,     chainName: 'Ethereum', asset: 'cvx3CRV',  apyBps: 620 },
  { kind: 'stake', protocol: 'convex', label: 'Convex stETH-ETH (ETH)',     chain: 1,     chainName: 'Ethereum', asset: 'cvxsteCRV',apyBps: 510 },
];

export const KIND_COLORS: Record<string, string> = {
  wallet:  '#6366f1', // indigo
  lend:    '#10b981', // emerald
  bridge:  '#f59e0b', // amber
  swap:    '#3b82f6', // blue
  stake:   '#ec4899', // pink
};

export const KIND_ICONS: Record<string, string> = {
  wallet:  '🏦',
  lend:    '📈',
  bridge:  '🌉',
  swap:    '🔄',
  stake:   '🏆',
};

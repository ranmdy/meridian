export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',

  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/meridian',
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    expiresIn: '7d',
  },

  /** Quote cache TTL in seconds (stale after 60s) */
  quoteTtlSeconds: 60,

  /** Quote refresh interval in milliseconds */
  quoteRefreshMs: 15_000,

  /** Execution fee in basis points (0.08% = 8 bps) */
  feeBps: 8,

  /** Pathfinding constraints */
  strategy: {
    maxHops: 8,
    maxBridges: 3,
    minLiquidityUsd: 50_000,
  },

  chains: {
    // Primary: Alchemy — fallback: QuickNode (set *_RPC_URL_FALLBACK env vars)
    ethereum:  { id: 1,      rpcUrl: process.env.ETH_RPC_URL    ?? '', fallbackRpcUrl: process.env.ETH_RPC_URL_FALLBACK    ?? '' },
    base:      { id: 8453,   rpcUrl: process.env.BASE_RPC_URL   ?? '', fallbackRpcUrl: process.env.BASE_RPC_URL_FALLBACK   ?? '' },
    arbitrum:  { id: 42161,  rpcUrl: process.env.ARB_RPC_URL    ?? '', fallbackRpcUrl: process.env.ARB_RPC_URL_FALLBACK    ?? '' },
    bnb:       { id: 56,     rpcUrl: process.env.BNB_RPC_URL    ?? '', fallbackRpcUrl: process.env.BNB_RPC_URL_FALLBACK    ?? '' },
    polygon:   { id: 137,    rpcUrl: process.env.POLY_RPC_URL   ?? '', fallbackRpcUrl: process.env.POLY_RPC_URL_FALLBACK   ?? '' },
    optimism:  { id: 10,     rpcUrl: process.env.OPT_RPC_URL    ?? '', fallbackRpcUrl: process.env.OPT_RPC_URL_FALLBACK    ?? '' },
    avalanche: { id: 43114,  rpcUrl: process.env.AVAX_RPC_URL   ?? '', fallbackRpcUrl: process.env.AVAX_RPC_URL_FALLBACK   ?? '' },
    scroll:    { id: 534352, rpcUrl: process.env.SCROLL_RPC_URL ?? '', fallbackRpcUrl: process.env.SCROLL_RPC_URL_FALLBACK ?? '' },
    zkSync:    { id: 324,    rpcUrl: process.env.ZKSYNC_RPC_URL ?? '', fallbackRpcUrl: process.env.ZKSYNC_RPC_URL_FALLBACK ?? '' },
  },

  tenderly: {
    accessKey: process.env.TENDERLY_ACCESS_KEY ?? '',
    project: process.env.TENDERLY_PROJECT ?? '',
    account: process.env.TENDERLY_ACCOUNT ?? '',
  },
} as const;

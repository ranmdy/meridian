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
    ethereum: { id: 1, rpcUrl: process.env.ETH_RPC_URL ?? '' },
    base: { id: 8453, rpcUrl: process.env.BASE_RPC_URL ?? '' },
    arbitrum: { id: 42161, rpcUrl: process.env.ARB_RPC_URL ?? '' },
    bnb: { id: 56, rpcUrl: process.env.BNB_RPC_URL ?? '' },
    polygon: { id: 137, rpcUrl: process.env.POLY_RPC_URL ?? '' },
  },

  tenderly: {
    accessKey: process.env.TENDERLY_ACCESS_KEY ?? '',
    project: process.env.TENDERLY_PROJECT ?? '',
    account: process.env.TENDERLY_ACCOUNT ?? '',
  },
} as const;

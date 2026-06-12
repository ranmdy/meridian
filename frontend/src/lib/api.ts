const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface StrategyOptimizeRequest {
  sourceAsset: string;
  sourceChain: number;
  sourceAmountUsd: number;
  destinationChain: number;
  riskTolerance: 1 | 2 | 3 | 4 | 5;
  timeHorizonDays: number;
  destinationWallet?: string;
  destinationSignature?: string;
}

export interface RouteStep {
  stepType: string;
  protocol: string;
  protocolAddress: string;
  fromAsset: string;
  toAsset: string;
  fromChain: number;
  toChain: number;
  estimatedOutput: number;
  gasEstimateUsd: number;
  bridgeFeeUsd: number;
  slippageBps: number;
  apyBps: number;
}

export interface Route {
  steps: RouteStep[];
  totalScore: number;
  estimatedApyBps: number;
  totalGasUsd: number;
  totalBridgeFeeUsd: number;
  totalProtocolFeeUsd: number;
  estimatedTimeSeconds: number;
  hopCount: number;
  bridgeCount: number;
  riskScore: number;
}

export interface StrategyOptimizeResponse {
  routes: Route[];
  simulatedAt: number;
  quoteExpiresAt: number;
}

export interface AutoOptimizeResponse {
  route: Route;
  routeIndex: number;
  explanation: string;
  alternatives: Route[];
  simulatedAt: number;
  quoteExpiresAt: number;
}

export interface StepSimResult {
  stepIndex: number;
  passed: boolean;
  gasUsd: number;
  revertReason?: string;
}

export interface SimulationResult {
  available: boolean;
  allStepsPass: boolean;
  steps: StepSimResult[];
  totalGasUsd: number;
  estimatedApyBps: number;
  riskScore: number;
  exploitAlerts: string[];
  simulatedAt: number;
}

export interface StepStatus {
  index: number;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  txHash?: string;
  chain?: number;
  completedAt?: number;
  estimatedCompletionAt?: number;
}

export interface ExecutionStatus {
  executionId: string;
  strategyId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'emergency_exited';
  currentStep: number;
  totalSteps: number;
  steps: StepStatus[];
  elapsedSeconds?: number;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Backend unreachable');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface MarketplaceStrategy {
  id: string;
  name: string;
  description: string;
  creatorWallet: string;
  route: Route;
  sourceAsset: string;
  sourceChain: number;
  destinationChain: number;
  riskTolerance: 1 | 2 | 3 | 4 | 5;
  timeHorizonDays: number;
  executionCount: number;
  votes: number;
  publishedApyBps: number;
  publishedAt: number;
  updatedAt: number;
  deprecated: boolean;
}

export interface MarketplaceBrowseResponse {
  strategies: MarketplaceStrategy[];
  total: number;
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`);
  } catch {
    throw new Error('Backend unreachable');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  auth: {
    nonce: (wallet?: string) =>
      get<{ nonce: string; message: string; expiresAt: number }>(
        wallet ? `/auth/nonce?wallet=${encodeURIComponent(wallet)}` : '/auth/nonce',
      ),
    verify: (nonce: string, signature: string, wallet: string) =>
      post<{ token: string; wallet: string; expiresAt: number; refreshExpiresAt: number }>('/auth/verify', { nonce, signature, wallet }),
    refresh: (refreshToken?: string) =>
      post<{ token: string; wallet: string; expiresAt: number; refreshExpiresAt: number }>(
        '/auth/refresh',
        refreshToken ? { refreshToken } : {},
      ),
    me: () => get<{ wallet: string; expiresAt: number }>('/auth/me'),
    logout: () => post<{ ok: boolean }>('/auth/logout', {}),
  },
  strategy: {
    optimize: (req: StrategyOptimizeRequest) =>
      post<StrategyOptimizeResponse>('/strategy/optimize', req),
    autoOptimize: (req: StrategyOptimizeRequest) =>
      post<AutoOptimizeResponse>('/strategy/auto-optimize', req),
    simulate: (routeIndex: number, fromAddress: string, sourceChain: number) =>
      post<SimulationResult>('/strategy/simulate', { routeIndex, fromAddress, sourceChain }),
    status: (executionId: string) =>
      get<ExecutionStatus>(`/strategy/${executionId}/status`),
    execute: (req: {
      strategyId: string;
      walletAddress: string;
      sourceAsset: string;
      sourceChain: number;
      destinationChain: number;
      sourceAmountUsd: number;
      stepCount: number;
      initialTxHash?: string;
      quoteExpiresAt?: number;
      /** The exact Step[] submitted to executeStrategy on-chain — needed for bridge continuation. */
      onChainSteps?: Array<{
        stepType: number;
        protocol: string;
        params: string;
        minOutput: string;
        outputAsset: string;
      }>;
    }) => post<{ executionId: string; strategyId: string; status: string; totalSteps: number; startedAt: number }>(
      '/strategy/execute',
      req,
    ),
    compose: (req: {
      steps: Array<{
        stepType: 'SWAP' | 'BRIDGE' | 'LEND' | 'STAKE' | 'SETTLE';
        protocol: string;
        protocolAddress?: string;
        fromAsset: string;
        toAsset: string;
        fromChain: number;
        toChain: number;
        estimatedOutput?: number;
        gasEstimateUsd?: number;
        bridgeFeeUsd?: number;
        slippageBps?: number;
        apyBps?: number;
      }>;
      simulate?: boolean;
      fromAddress?: string;
    }) => post<{ route: Route; simulation?: SimulationResult; composedAt: number; quoteExpiresAt: number }>(
      '/strategy/compose',
      req,
    ),
  },
  user: {
    executions: (wallet: string, limit?: number) =>
      get<{ executions: ExecutionStatus[]; total: number }>(
        `/user/executions?wallet=${encodeURIComponent(wallet)}${limit ? `&limit=${limit}` : ''}`,
      ),
    portfolio: (wallet: string) =>
      get<{
        wallet: string;
        positions: Array<{ chain: number; asset: string; amountUsd: number; count: number }>;
        totalExecutions: number;
        completedExecutions: number;
      }>(`/user/portfolio?wallet=${encodeURIComponent(wallet)}`),
  },
  marketplace: {
    browse: (params?: { sort?: string; chain?: number; maxRisk?: number; minApy?: number; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.sort) qs.set('sort', params.sort);
      if (params?.chain) qs.set('chain', String(params.chain));
      if (params?.maxRisk) qs.set('maxRisk', String(params.maxRisk));
      if (params?.minApy) qs.set('minApy', String(params.minApy));
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.offset) qs.set('offset', String(params.offset));
      const q = qs.toString();
      return get<MarketplaceBrowseResponse>(`/strategies${q ? `?${q}` : ''}`);
    },
    get: (id: string) => get<MarketplaceStrategy>(`/strategies/${id}`),
    vote: (id: string) => post<{ ok: boolean }>(`/strategies/${id}/vote`, {}),
    publish: (strategy: {
      name: string;
      description: string;
      route: Route;
      sourceAsset: string;
      sourceChain: number;
      destinationChain: number;
      riskTolerance: 1 | 2 | 3 | 4 | 5;
      timeHorizonDays: number;
    }, token: string) =>
      fetch(`${BASE_URL}/strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(strategy),
      }).then(async (r) => {
        if (!r.ok) { const e = await r.json().catch(() => ({ error: 'Unknown error' })); throw new Error(e.error ?? `HTTP ${r.status}`); }
        return r.json() as Promise<MarketplaceStrategy>;
      }),
  },
  quotes: {
    swap: (chain: number, from: string, to: string, protocol = 'uniswap_v3') =>
      get<{
        protocol: string; chain: number; fromAsset: string; toAsset: string;
        amountIn: string; amountOut: string; feeUsd: number; slippageBps: number;
        timestamp: number; isStale: boolean;
      }>(`/quotes/swap?chain=${chain}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&protocol=${protocol}`),
    bridge: (protocol: string, fromChain: number, toChain: number, asset: string) =>
      get<{
        protocol: string; fromChain: number; toChain: number; fromAsset: string;
        amountIn: string; amountOut: string; feeUsd: number; estimatedSeconds: number;
        timestamp: number; isStale: boolean;
      }>(`/quotes/bridge?protocol=${protocol}&fromChain=${fromChain}&toChain=${toChain}&asset=${asset}`),
    apy: (protocol: string, chain: number, asset: string) =>
      get<{
        protocol: string; chain: number; asset: string;
        supplyApyBps: number; borrowApyBps: number; tvlUsd: number;
        timestamp: number; isStale: boolean;
      }>(`/quotes/apy?protocol=${protocol}&chain=${chain}&asset=${asset}`),
    gas: (chain?: number) => chain
      ? get<{ chain: number; gasPriceGwei: number; typicalTxUsd: number; timestamp: number; isStale: boolean }>(`/quotes/gas?chain=${chain}`)
      : get<Array<{ chain: number; gasPriceGwei: number; typicalTxUsd: number; timestamp: number; isStale: boolean }>>('/quotes/gas'),
  },
  templates: {
    list: (params?: { category?: string; maxRisk?: number; minApy?: number; sort?: 'popular' | 'apy' | 'risk'; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set('category', params.category);
      if (params?.maxRisk !== undefined) qs.set('maxRisk', String(params.maxRisk));
      if (params?.minApy !== undefined) qs.set('minApy', String(params.minApy));
      if (params?.sort) qs.set('sort', params.sort);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.offset) qs.set('offset', String(params.offset));
      const q = qs.toString();
      return get<{
        templates: Array<{
          id: string; name: string; description: string;
          category: string; difficulty: string;
          estimatedApyBps: number; riskLevel: number;
          sourceAsset: string; sourceChain: number; destinationChain: number;
          timeHorizonDays: number; tags: string[]; popularityScore: number;
        }>;
        total: number;
      }>(`/templates${q ? `?${q}` : ''}`);
    },
    get: (id: string) => get<{
      id: string; name: string; description: string;
      category: string; difficulty: string;
      estimatedApyBps: number; riskLevel: number;
      sourceAsset: string; sourceChain: number; destinationChain: number;
      timeHorizonDays: number; tags: string[];
    }>(`/templates/${id}`),
    categories: () => get<{ categories: string[] }>('/templates/categories'),
  },
  health: () => get<{ status: string; version: string }>('/health'),
  apiKeys: {
    list: (token?: string) =>
      fetch(`${BASE_URL}/api-keys`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      }).then(async (r) => {
        if (!r.ok) { const e = await r.json().catch(() => ({ error: 'Unknown error' })); throw new Error(e.error ?? `HTTP ${r.status}`); }
        return r.json() as Promise<{
          keys: Array<{
            id: string;
            tier: string;
            name: string;
            environment: string;
            requestsPerMinute: number;
            requestsPerMonth: number;
            usageThisMonth: number;
            createdAt: number;
            lastUsedAt: number | null;
            revokedAt: number | null;
          }>;
          stats: { totalKeys: number; activeKeys: number; totalRequestsThisMonth: number };
        }>;
      }),
    create: (tier: string, name: string, environment?: 'test' | 'live', token?: string) =>
      fetch(`${BASE_URL}/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tier, name, environment }),
      }).then(async (r) => {
        if (!r.ok) { const e = await r.json().catch(() => ({ error: 'Unknown error' })); throw new Error(e.error ?? `HTTP ${r.status}`); }
        return r.json() as Promise<{
          id: string; rawKey: string; tier: string; name: string;
          environment: string; requestsPerMinute: number; requestsPerMonth: number;
          createdAt: number; _warning: string;
        }>;
      }),
    revoke: (id: string, token: string) =>
      fetch(`${BASE_URL}/api-keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (r) => {
        if (!r.ok) { const e = await r.json().catch(() => ({ error: 'Unknown error' })); throw new Error(e.error ?? `HTTP ${r.status}`); }
        return r.json() as Promise<{ ok: boolean; id: string; revoked: boolean }>;
      }),
  },
};

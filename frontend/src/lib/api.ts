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
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  strategy: {
    optimize: (req: StrategyOptimizeRequest) =>
      post<StrategyOptimizeResponse>('/strategy/optimize', req),
    status: (executionId: string) =>
      get<ExecutionStatus>(`/strategy/${executionId}/status`),
  },
  health: () => get<{ status: string; version: string }>('/health'),
};

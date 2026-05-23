// ─── Protocol Graph Types ──────────────────────────────────────────────────────

export type StepType = 'SWAP' | 'LEND' | 'BRIDGE' | 'STAKE' | 'SETTLE';

export interface ProtocolNode {
  id: string;           // e.g. "ETH_ethereum_aave_deposit"
  asset: string;        // token symbol, e.g. "ETH"
  chain: number;        // chain ID
  protocol: string;     // protocol name, e.g. "aave_v3"
  action: StepType;
  tvlUsd: number;       // current TVL — used for min liquidity check
  apyBps: number;       // yield in basis points (e.g. 210 = 2.10%)
  exploitFlagged: boolean;
}

export interface ProtocolEdge {
  from: string;         // ProtocolNode.id
  to: string;           // ProtocolNode.id
  stepType: StepType;
  protocol: string;
  protocolAddress: string;
  gasEstimateUsd: number;
  bridgeFeeUsd: number;
  slippageBps: number;  // estimated slippage in basis points
  isBridge: boolean;    // if true, relayer must wait for confirmation
}

// ─── Scored Edge (used during Dijkstra) ───────────────────────────────────────

export interface ScoredEdge extends ProtocolEdge {
  /** score = (projected_yield_usd * timeHorizonDays) - (gas + bridge_fee + slippage_usd) */
  score: number;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export interface RouteStep {
  stepType: StepType;
  protocol: string;
  protocolAddress: string;
  fromAsset: string;
  toAsset: string;
  fromChain: number;
  toChain: number;
  estimatedOutput: number;  // in token units
  gasEstimateUsd: number;
  bridgeFeeUsd: number;
  slippageBps: number;
  apyBps: number;
}

export interface Route {
  steps: RouteStep[];
  totalScore: number;
  estimatedApyBps: number;  // weighted net APY
  totalGasUsd: number;
  totalBridgeFeeUsd: number;
  totalProtocolFeeUsd: number;
  estimatedTimeSeconds: number;
  hopCount: number;
  bridgeCount: number;
  riskScore: number;         // 0–100 composite
}

// ─── Strategy Request ──────────────────────────────────────────────────────────

export interface StrategyRequest {
  sourceAsset: string;
  sourceChain: number;
  sourceAmountUsd: number;
  destinationChain: number;
  /** 1 = low risk, 5 = high risk tolerance */
  riskTolerance: 1 | 2 | 3 | 4 | 5;
  /** Investment time horizon in days */
  timeHorizonDays: number;
}

export interface StrategyResponse {
  routes: Route[];          // top 3, ranked by score
  simulatedAt: number;      // unix timestamp
  quoteExpiresAt: number;   // simulatedAt + 60s
}

/**
 * Meridian SDK — Shared Types
 */

// ─── Assets ──────────────────────────────────────────────────────────────────

export type AssetSymbol = 'ETH' | 'USDC' | 'USDT' | 'WBTC' | 'SOL' | 'AVAX' | 'MATIC' | string;

export type StepType = 'SWAP' | 'BRIDGE' | 'LEND' | 'STAKE' | 'SETTLE';

export type RiskTolerance = 1 | 2 | 3 | 4 | 5;

// ─── Strategy Request/Response ────────────────────────────────────────────────

export interface OptimizeRequest {
  /** Asset symbol of the input (e.g. "USDC") */
  sourceAsset: AssetSymbol;
  /** Chain ID where the source asset lives */
  sourceChain: number;
  /** Amount of source asset in USD equivalent */
  sourceAmountUsd: number;
  /** Chain ID where the strategy should end up */
  destinationChain: number;
  /** Risk tolerance 1 (conservative) to 5 (aggressive) */
  riskTolerance?: RiskTolerance;
  /** Time horizon in days */
  timeHorizonDays?: number;
  /** Destination wallet address (EVM or Solana base58) */
  destinationWallet?: string;
  /** EIP-191 signature proving ownership of destinationWallet */
  destinationSignature?: string;
}

export interface RouteStep {
  /** Human-readable step description */
  description:     string;
  stepType:        StepType;
  protocol:        string;
  /** Protocol contract address (EVM 0x... or Solana pubkey) */
  protocolAddress: string;
  fromChain:       number;
  toChain:         number;
  fromAsset:       AssetSymbol;
  toAsset:         AssetSymbol;
  /** Estimated APY in basis points */
  apyBps:          number;
  /** Estimated gas cost in USD */
  gasCostUsd:      number;
  /** Estimated bridge fee in USD */
  bridgeFeeUsd:    number;
}

export interface OptimizedRoute {
  /** Composite score (higher = better) */
  totalScore:     number;
  /** Estimated annual percentage yield in basis points */
  projectedApyBps: number;
  /** Total estimated gas cost across all steps */
  totalGasCostUsd: number;
  /** Total bridge fees */
  totalBridgeFeeUsd: number;
  steps: RouteStep[];
  riskScore: number;
  bridgeCount: number;
}

export interface OptimizeResponse {
  routes: OptimizedRoute[];
  /** ISO timestamp */
  quotedAt: string;
  /** Unix ms when these quotes expire */
  expiresAt: number;
}

// ─── Execution ────────────────────────────────────────────────────────────────

export interface ExecuteRequest {
  route: OptimizedRoute;
  sourceAsset: AssetSymbol;
  sourceChain: number;
  sourceAmountUsd: number;
  destinationWallet: string;
  destinationSignature: string;
  /** Slippage tolerance in basis points (default 50 = 0.5%) */
  slippageBps?: number;
}

export type ExecutionStatus =
  | 'pending'
  | 'step_executing'
  | 'bridging'
  | 'completed'
  | 'failed'
  | 'emergency_exited';

export interface ExecutionStep {
  stepIndex:    number;
  stepType:     StepType;
  status:       'pending' | 'running' | 'completed' | 'failed';
  txHash?:      string;
  amountOut?:   string;
  error?:       string;
  completedAt?: number;
}

export interface Execution {
  id:                string;
  strategyId:        `0x${string}`;
  status:            ExecutionStatus;
  sourceAsset:       AssetSymbol;
  sourceChain:       number;
  sourceAmountUsd:   number;
  destinationChain:  number;
  destinationWallet: string;
  steps:             ExecutionStep[];
  createdAt:         number;
  updatedAt:         number;
  finalAmount?:      string;
  finalAsset?:       AssetSymbol;
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

export interface ApyQuote {
  protocol:   string;
  chain:      number;
  asset:      AssetSymbol;
  apyBps:     number;
  tvlUsd:     number;
  isStale:    boolean;
  fetchedAt:  number;
}

export interface SwapQuote {
  protocol:    string;
  chain:       number;
  fromAsset:   AssetSymbol;
  toAsset:     AssetSymbol;
  /** Amount in (smallest token unit, as string to avoid bigint serialization issues) */
  amountIn:    string;
  /** Amount out (smallest token unit, as string) */
  amountOut:   string;
  feeUsd:      number;
  slippageBps: number;
  timestamp:   number;
  isStale:     boolean;
}

export interface BridgeQuote {
  fromChain:   number;
  toChain:     number;
  fromAsset:   AssetSymbol;
  toAsset:     AssetSymbol;
  bridgeName:  string;
  feeBps:      number;
  feeUsd:      number;
  estimatedMs: number;
  isStale:     boolean;
}

export interface GasQuote {
  chainId:       number;
  gasPriceGwei:  number;
  baseFeeGwei:   number;
  priorityFeeGwei: number;
  isStale:       boolean;
}

// ─── Token Prices ─────────────────────────────────────────────────────────────

export interface TokenPrice {
  symbol:     AssetSymbol;
  priceUsd:   number;
  confidence: number;
  source:     'pyth' | 'defillama' | 'stale';
  timestamp:  number;
}

// ─── SDK Config ───────────────────────────────────────────────────────────────

export interface MeridianConfig {
  /** Backend API base URL (default: https://api.meridian.finance) */
  apiUrl?: string;
  /** JWT token for authenticated endpoints (pro/api tier) */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

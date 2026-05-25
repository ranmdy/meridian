/**
 * Meridian SDK — Main Entry Point
 *
 * Example:
 *   import { Meridian } from '@meridian/sdk'
 *
 *   const sdk = new Meridian({ apiKey: 'your-jwt-token' })
 *
 *   const { routes } = await sdk.optimize({
 *     sourceAsset: 'USDC',
 *     sourceChain: 1,
 *     sourceAmountUsd: 10_000,
 *     destinationChain: 42161,
 *     riskTolerance: 3,
 *   })
 *
 *   console.log(routes[0].projectedApyBps)  // e.g. 480 (4.8% APY)
 */

import { MeridianClient } from './client.js';
import type {
  MeridianConfig,
  OptimizeRequest,
  OptimizeResponse,
  ApyQuote,
  SwapQuote,
  BridgeQuote,
  GasQuote,
  TokenPrice,
  Execution,
  StrategyTemplate,
  ComposeRequest,
} from './types.js';

export class Meridian {
  private readonly client: MeridianClient;

  constructor(config: MeridianConfig = {}) {
    this.client = new MeridianClient(config);
  }

  // ─── Strategy ──────────────────────────────────────────────────────────────

  /**
   * Find the top-3 yield-optimised routes for a given strategy request.
   */
  async optimize(req: OptimizeRequest): Promise<OptimizeResponse> {
    return this.client.post<OptimizeResponse>('/strategy/optimize', req);
  }

  /**
   * Like optimize(), but auto-selects the best route for the given risk tolerance.
   * Returns a single route + an explanation of why it was selected.
   */
  async autoOptimize(req: OptimizeRequest): Promise<{
    bestRoute: OptimizeResponse['routes'][0];
    explanation: string;
    alternatives: OptimizeResponse['routes'];
  }> {
    return this.client.post('/strategy/auto-optimize', req);
  }

  /**
   * Get execution status for a strategy ID.
   */
  async getExecution(strategyId: string): Promise<Execution> {
    return this.client.get<Execution>(`/executions/${strategyId}`);
  }

  // ─── Quotes ────────────────────────────────────────────────────────────────

  /**
   * Get the current APY quote for a specific protocol+chain+asset combination.
   */
  async getApyQuote(
    protocol: string,
    chainId: number,
    asset: string,
  ): Promise<ApyQuote | null> {
    try {
      return await this.client.get<ApyQuote>(
        `/quotes/apy?protocol=${protocol}&chain=${chainId}&asset=${asset}`,
      );
    } catch {
      return null;
    }
  }

  /**
   * Get all cached APY quotes (for all supported protocols).
   */
  async getAllApyQuotes(): Promise<ApyQuote[]> {
    return this.client.get<ApyQuote[]>('/strategy/apy');
  }

  /**
   * Get the current swap quote for a given chain + asset pair.
   * Returns null if no quote is available (quotes refresh every 15s).
   */
  async getSwapQuote(
    chainId: number,
    fromAsset: string,
    toAsset: string,
    protocol = 'uniswap_v3',
  ): Promise<SwapQuote | null> {
    try {
      return await this.client.get<SwapQuote>(
        `/quotes/swap?chain=${chainId}&from=${encodeURIComponent(fromAsset)}&to=${encodeURIComponent(toAsset)}&protocol=${protocol}`,
      );
    } catch {
      return null;
    }
  }

  /**
   * Get the current bridge quote for a given route.
   */
  async getBridgeQuote(
    fromChain: number,
    toChain: number,
    asset: string,
  ): Promise<BridgeQuote | null> {
    try {
      return await this.client.get<BridgeQuote>(
        `/quotes/bridge?from=${fromChain}&to=${toChain}&asset=${asset}`,
      );
    } catch {
      return null;
    }
  }

  /**
   * Get the current gas quote for a chain.
   */
  async getGasQuote(chainId: number): Promise<GasQuote | null> {
    try {
      return await this.client.get<GasQuote>(`/quotes/gas?chain=${chainId}`);
    } catch {
      return null;
    }
  }

  // ─── Prices ────────────────────────────────────────────────────────────────

  /**
   * Get the current USD price for all tracked tokens.
   */
  async getAllPrices(): Promise<Record<string, number>> {
    const res = await this.client.get<{ prices: TokenPrice[] }>('/prices');
    return Object.fromEntries(res.prices.map((p) => [p.symbol, p.priceUsd]));
  }

  /**
   * Get the current USD price for a single token symbol.
   */
  async getPrice(symbol: string): Promise<number | null> {
    try {
      const res = await this.client.get<TokenPrice>(`/prices/${symbol}`);
      return res.priceUsd;
    } catch {
      return null;
    }
  }

  // ─── Compose ────────────────────────────────────────────────────────────────

  /**
   * Compose a custom strategy from an explicit list of steps.
   * Each step's toChain/toAsset must match the next step's fromChain/fromAsset.
   * Live quote data is automatically merged where available.
   */
  async compose(req: ComposeRequest): Promise<{
    route: OptimizeResponse['routes'][0];
    composedAt: number;
    quoteExpiresAt: number;
  }> {
    return this.client.post('/strategy/compose', req);
  }

  // ─── Templates ─────────────────────────────────────────────────────────────

  /**
   * Browse curated strategy templates.
   */
  async listTemplates(opts?: {
    category?: string;
    maxRisk?: number;
    minApy?: number;
    sort?: 'popular' | 'apy' | 'risk';
    limit?: number;
    offset?: number;
  }): Promise<{ templates: StrategyTemplate[]; total: number }> {
    const qs = new URLSearchParams();
    if (opts?.category) qs.set('category', opts.category);
    if (opts?.maxRisk !== undefined) qs.set('maxRisk', String(opts.maxRisk));
    if (opts?.minApy !== undefined) qs.set('minApy', String(opts.minApy));
    if (opts?.sort) qs.set('sort', opts.sort);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.offset) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return this.client.get(`/templates${q ? `?${q}` : ''}`);
  }

  /**
   * Get a single template by ID.
   */
  async getTemplate(id: string): Promise<StrategyTemplate | null> {
    try {
      return await this.client.get<StrategyTemplate>(`/templates/${encodeURIComponent(id)}`);
    } catch {
      return null;
    }
  }

  // ─── Health ────────────────────────────────────────────────────────────────

  async health(): Promise<{ status: string; version: string }> {
    return this.client.get('/health');
  }
}

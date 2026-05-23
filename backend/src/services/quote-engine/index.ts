import { config } from '../../config/index.js';

// ─── Quote Types ───────────────────────────────────────────────────────────────

export interface BridgeQuote {
  protocol: string;
  fromChain: number;
  toChain: number;
  fromAsset: string;
  amountIn: bigint;
  amountOut: bigint;
  feeUsd: number;
  estimatedSeconds: number;
  timestamp: number;
  isStale: boolean;
}

export interface SwapQuote {
  protocol: string;
  chain: number;
  fromAsset: string;
  toAsset: string;
  amountIn: bigint;
  amountOut: bigint;
  feeUsd: number;
  slippageBps: number;
  timestamp: number;
  isStale: boolean;
}

export interface ApyQuote {
  protocol: string;
  chain: number;
  asset: string;
  supplyApyBps: number;
  borrowApyBps: number;
  tvlUsd: number;
  timestamp: number;
  isStale: boolean;
}

// ─── Cache Entry ──────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

// ─── Quote Engine ─────────────────────────────────────────────────────────────

export class QuoteEngine {
  private bridgeCache = new Map<string, CacheEntry<BridgeQuote>>();
  private swapCache = new Map<string, CacheEntry<SwapQuote>>();
  private apyCache = new Map<string, CacheEntry<ApyQuote>>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  /** Start the 15-second polling loop. */
  start() {
    this.refresh();
    this.refreshTimer = setInterval(() => this.refresh(), config.quoteRefreshMs);
  }

  stop() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  // ─── Public Accessors ──────────────────────────────────────────────────────

  getBridgeQuote(
    protocol: string,
    fromChain: number,
    toChain: number,
    fromAsset: string,
  ): BridgeQuote | null {
    const key = `${protocol}:${fromChain}:${toChain}:${fromAsset}`;
    const entry = this.bridgeCache.get(key);
    if (!entry) return null;
    return this.withStaleness(entry);
  }

  getSwapQuote(
    protocol: string,
    chain: number,
    fromAsset: string,
    toAsset: string,
  ): SwapQuote | null {
    const key = `${protocol}:${chain}:${fromAsset}:${toAsset}`;
    const entry = this.swapCache.get(key);
    if (!entry) return null;
    return this.withStaleness(entry);
  }

  getApyQuote(protocol: string, chain: number, asset: string): ApyQuote | null {
    const key = `${protocol}:${chain}:${asset}`;
    const entry = this.apyCache.get(key);
    if (!entry) return null;
    return this.withStaleness(entry);
  }

  // ─── Polling ──────────────────────────────────────────────────────────────

  private async refresh() {
    await Promise.allSettled([
      this.fetchBridgeQuotes(),
      this.fetchSwapQuotes(),
      this.fetchApyData(),
    ]);
  }

  /**
   * Phase 0: returns static placeholder data.
   * Phase 1: replaced with live Stargate/Across/Wormhole SDK calls.
   */
  private async fetchBridgeQuotes() {
    const now = Date.now();
    const placeholders: Array<CacheEntry<BridgeQuote>> = [
      {
        data: {
          protocol: 'stargate',
          fromChain: 1,
          toChain: 42161,
          fromAsset: 'USDC',
          amountIn: 4200n * 10n ** 6n,
          amountOut: 4197n * 10n ** 6n,
          feeUsd: 1.20,
          estimatedSeconds: 180,
          timestamp: Math.floor(now / 1000),
          isStale: false,
        },
        fetchedAt: now,
      },
      {
        data: {
          protocol: 'stargate',
          fromChain: 1,
          toChain: 8453,
          fromAsset: 'USDC',
          amountIn: 4200n * 10n ** 6n,
          amountOut: 4198n * 10n ** 6n,
          feeUsd: 0.90,
          estimatedSeconds: 120,
          timestamp: Math.floor(now / 1000),
          isStale: false,
        },
        fetchedAt: now,
      },
    ];

    for (const entry of placeholders) {
      const { protocol, fromChain, toChain, fromAsset } = entry.data;
      this.bridgeCache.set(`${protocol}:${fromChain}:${toChain}:${fromAsset}`, entry);
    }
  }

  /**
   * Phase 0: returns static placeholder data.
   * Phase 1: replaced with live 1inch/Paraswap/0x calls.
   */
  private async fetchSwapQuotes() {
    const now = Date.now();
    this.swapCache.set('uniswap_v3:1:ETH:USDC', {
      data: {
        protocol: 'uniswap_v3',
        chain: 1,
        fromAsset: 'ETH',
        toAsset: 'USDC',
        amountIn: 1n * 10n ** 18n,
        amountOut: 3300n * 10n ** 6n,
        feeUsd: 0.50,
        slippageBps: 30,
        timestamp: Math.floor(now / 1000),
        isStale: false,
      },
      fetchedAt: now,
    });
  }

  /**
   * Phase 0: returns static placeholder APY data.
   * Phase 1: replaced with Aave subgraph / Compound API / DeFiLlama calls.
   */
  private async fetchApyData() {
    const now = Date.now();
    const apyData: ApyQuote[] = [
      { protocol: 'aave_v3', chain: 1, asset: 'ETH', supplyApyBps: 210, borrowApyBps: 350, tvlUsd: 8_000_000_000, timestamp: Math.floor(now / 1000), isStale: false },
      { protocol: 'aave_v3', chain: 1, asset: 'USDC', supplyApyBps: 480, borrowApyBps: 620, tvlUsd: 4_000_000_000, timestamp: Math.floor(now / 1000), isStale: false },
      { protocol: 'aave_v3', chain: 8453, asset: 'USDC', supplyApyBps: 520, borrowApyBps: 650, tvlUsd: 200_000_000, timestamp: Math.floor(now / 1000), isStale: false },
      { protocol: 'gmx', chain: 42161, asset: 'USDC', supplyApyBps: 840, borrowApyBps: 0, tvlUsd: 400_000_000, timestamp: Math.floor(now / 1000), isStale: false },
    ];

    for (const apy of apyData) {
      this.apyCache.set(`${apy.protocol}:${apy.chain}:${apy.asset}`, {
        data: apy,
        fetchedAt: now,
      });
    }
  }

  // ─── Staleness ────────────────────────────────────────────────────────────

  private withStaleness<T extends { isStale: boolean; timestamp: number }>(
    entry: CacheEntry<T>,
  ): T {
    const ageSeconds = (Date.now() - entry.fetchedAt) / 1000;
    return { ...entry.data, isStale: ageSeconds > config.quoteTtlSeconds };
  }
}

import { createPublicClient, http, formatGwei } from 'viem';
import { mainnet, arbitrum, base, bsc, polygon } from 'viem/chains';
import { config } from '../../config/index.js';

// ─── DeFiLlama pool-to-protocol/chain/asset mapping ───────────────────────────

// Pool IDs from DeFiLlama yields API for Aave v3, Compound v3, Morpho
// (https://yields.llama.fi/pools — sorted by tvlUsd desc, human-curated)
const DEFI_LLAMA_POOL_IDS: Record<string, { protocol: string; chain: number; asset: string }> = {
  // Aave v3 – Ethereum
  'a349fea4-d780-4e16-973e-70ca9b606db2': { protocol: 'aave_v3', chain: 1, asset: 'USDC' },
  'cefa9bb8-c230-459a-a855-3083e4b8d01b': { protocol: 'aave_v3', chain: 1, asset: 'USDT' },
  '4c27b4c2-5673-4197-b498-c27680c7ad5c': { protocol: 'aave_v3', chain: 1, asset: 'ETH' },
  'd4b3c522-6127-4b89-bedf-83641cdcd2eb': { protocol: 'aave_v3', chain: 1, asset: 'WBTC' },
  // Aave v3 – Base
  '755b7ef3-aad3-4e04-93b3-9b6a14b22a15': { protocol: 'aave_v3', chain: 8453, asset: 'USDC' },
  'dd2d4fac-0ad4-4fea-9063-d7cce3e5d0ea': { protocol: 'aave_v3', chain: 8453, asset: 'ETH' },
  // Aave v3 – Arbitrum
  'f7731c5e-21f3-4e7e-84ed-09bc04be0e07': { protocol: 'aave_v3', chain: 42161, asset: 'USDC' },
  '14b4f197-65c7-4b4a-b3e2-eba7cdced7da': { protocol: 'aave_v3', chain: 42161, asset: 'ETH' },
  // Compound v3 – Ethereum
  '0f45d730-b279-4629-8f7e-0d9b803df79d': { protocol: 'compound_v3', chain: 1, asset: 'USDC' },
  'f8e46bd8-4ec1-4bab-aa7b-e1a94a4ef4d3': { protocol: 'compound_v3', chain: 1, asset: 'ETH' },
  // Morpho – Ethereum
  '5d3cf0be-5b94-4c8e-aa34-21e0aca87e3a': { protocol: 'morpho', chain: 1, asset: 'USDC' },
  'b1d8d742-e0a6-4fca-8c56-35b2c96c2a40': { protocol: 'morpho', chain: 1, asset: 'ETH' },
};

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

export interface GasQuote {
  chain: number;
  gasPriceGwei: number;
  /** Estimated cost in USD for a typical DeFi tx (~200k gas) */
  typicalTxUsd: number;
  timestamp: number;
  isStale: boolean;
}

// ─── Cache Entry ──────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

// ─── Quote Engine ─────────────────────────────────────────────────────────────

// ETH price used for gas USD conversion — replace with Chainlink before mainnet
const ETH_PRICE_USD = 3000;
const TYPICAL_GAS_UNITS = 200_000;

export class QuoteEngine {
  private bridgeCache = new Map<string, CacheEntry<BridgeQuote>>();
  private swapCache  = new Map<string, CacheEntry<SwapQuote>>();
  private apyCache   = new Map<string, CacheEntry<ApyQuote>>();
  private gasCache   = new Map<number, CacheEntry<GasQuote>>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private onRefreshCallbacks: Array<(quotes: ApyQuote[]) => void> = [];

  /** Register a callback that fires after each successful APY refresh. */
  onApyRefresh(cb: (quotes: ApyQuote[]) => void) {
    this.onRefreshCallbacks.push(cb);
  }

  /** Start the 15-second polling loop. */
  start() {
    this.refresh();
    this.refreshTimer = setInterval(() => this.refresh(), config.quoteRefreshMs);
  }

  stop() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  /** Return all APY quotes currently in cache. */
  getAllApyQuotes(): ApyQuote[] {
    return Array.from(this.apyCache.values()).map((e) => this.withStaleness(e));
  }

  /** Gas price for a given chain (gwei + USD estimate). */
  getGasQuote(chainId: number): GasQuote | null {
    const entry = this.gasCache.get(chainId);
    if (!entry) return null;
    return this.withStaleness(entry);
  }

  /** All gas quotes for display / edge-cost updates. */
  getAllGasQuotes(): GasQuote[] {
    return Array.from(this.gasCache.values()).map((e) => this.withStaleness(e));
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
      this.fetchGasPrices(),
    ]);
    // Notify graph refresh subscribers after each cycle
    if (this.onRefreshCallbacks.length > 0) {
      const quotes = this.getAllApyQuotes();
      for (const cb of this.onRefreshCallbacks) cb(quotes);
    }
  }

  /**
   * Live bridge quotes via Li.Fi aggregator API (no key required).
   * Covers Stargate, Across, Wormhole, Hop in a single request.
   * Falls back to last cached values on error.
   */
  private async fetchBridgeQuotes() {
    const now = Date.now();

    // Reference pairs: [fromChain, toChain, fromAsset, fromAmount (in token units), decimals]
    const pairs: Array<[number, number, string, string, number]> = [
      [1, 42161, 'USDC', '4200000000', 6],   // ETH → ARB  4,200 USDC
      [1, 8453,  'USDC', '4200000000', 6],   // ETH → Base 4,200 USDC
      [1, 42161, 'ETH',  '1000000000000000000', 18], // ETH → ARB  1 ETH
    ];

    // Li.Fi chain ID names
    const chainNames: Record<number, string> = {
      1: 'ETH', 42161: 'ARB', 8453: 'BAS', 56: 'BSC', 137: 'POL',
      10: 'OPT', 43114: 'AVA', 101: 'SOL', 534352: 'SCR', 324: 'ERA',
    };

    // ERC-20 addresses (or native sentinel) per asset/chain
    const tokenAddresses: Record<string, Record<number, string>> = {
      USDC: {
        1:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      },
      ETH: {
        1:     '0x0000000000000000000000000000000000000000',
        42161: '0x0000000000000000000000000000000000000000',
        8453:  '0x0000000000000000000000000000000000000000',
      },
    };

    await Promise.allSettled(
      pairs.map(async ([fromChain, toChain, asset, fromAmount, _dec]) => {
        const fromToken = tokenAddresses[asset]?.[fromChain];
        const toToken   = tokenAddresses[asset]?.[toChain];
        if (!fromToken || !toToken) return;

        try {
          const url = new URL('https://li.quest/v1/quote');
          url.searchParams.set('fromChain', chainNames[fromChain] ?? String(fromChain));
          url.searchParams.set('toChain',   chainNames[toChain]   ?? String(toChain));
          url.searchParams.set('fromToken', fromToken);
          url.searchParams.set('toToken',   toToken);
          url.searchParams.set('fromAmount', fromAmount);
          url.searchParams.set('fromAddress', '0x0000000000000000000000000000000001000000');
          url.searchParams.set('order', 'CHEAPEST');

          const res = await fetch(url.toString(), {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8_000),
          });
          if (!res.ok) return;

          const data = await res.json() as {
            estimate?: { toAmount?: string; feeCosts?: Array<{ amountUSD?: string }> };
            tool?: string;
            execution?: { approvalRequired?: boolean };
            toolDetails?: { name?: string };
            transactionRequest?: { gasPrice?: string };
          };

          const amountIn  = BigInt(fromAmount);
          const amountOut = BigInt(data.estimate?.toAmount ?? '0');
          const feeUsd    = data.estimate?.feeCosts?.reduce(
            (s, f) => s + Number(f.amountUSD ?? 0), 0
          ) ?? 0;
          const toolName  = (data.toolDetails?.name ?? data.tool ?? 'lifi').toLowerCase()
            .replace(/\s+/g, '_');

          const entry: CacheEntry<BridgeQuote> = {
            data: {
              protocol: toolName,
              fromChain,
              toChain,
              fromAsset: asset,
              amountIn,
              amountOut,
              feeUsd,
              estimatedSeconds: 180, // Li.Fi doesn't expose duration in quote endpoint
              timestamp: Math.floor(now / 1000),
              isStale: false,
            },
            fetchedAt: now,
          };

          this.bridgeCache.set(
            `${toolName}:${fromChain}:${toChain}:${asset}`,
            entry,
          );
          // Also index by generic 'bridge' key for strategy engine lookups
          this.bridgeCache.set(`bridge:${fromChain}:${toChain}:${asset}`, entry);
        } catch {
          // silently retain last cached value
        }
      }),
    );
  }

  /**
   * Live swap quotes via 1inch v5 price API (no key required for price endpoint).
   * Falls back to last cached values on error.
   */
  private async fetchSwapQuotes() {
    const now = Date.now();

    // [chain, fromAsset, toAsset, fromAmount]
    const pairs: Array<[number, string, string, string]> = [
      [1,     'ETH',  'USDC', '1000000000000000000'],
      [42161, 'ETH',  'USDC', '1000000000000000000'],
      [8453,  'ETH',  'USDC', '1000000000000000000'],
    ];

    const nativeAddr = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    const usdcAddresses: Record<number, string> = {
      1:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    };

    await Promise.allSettled(
      pairs.map(async ([chain, fromAsset, toAsset, fromAmount]) => {
        const src = fromAsset === 'ETH' ? nativeAddr : usdcAddresses[chain] ?? '';
        const dst = toAsset  === 'USDC' ? usdcAddresses[chain] ?? '' : nativeAddr;
        if (!src || !dst) return;

        try {
          const url = `https://api.1inch.dev/swap/v6.0/${chain}/quote?src=${src}&dst=${dst}&amount=${fromAmount}`;
          const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(6_000),
          });
          if (!res.ok) return;

          const data = await res.json() as {
            dstAmount?: string;
            gas?: number;
          };

          const amountOut = BigInt(data.dstAmount ?? '0');
          const key = `uniswap_v3:${chain}:${fromAsset}:${toAsset}`;

          this.swapCache.set(key, {
            data: {
              protocol: 'uniswap_v3',
              chain,
              fromAsset,
              toAsset,
              amountIn: BigInt(fromAmount),
              amountOut,
              feeUsd: 0,   // 1inch quote doesn't break out USD fee
              slippageBps: 30,
              timestamp: Math.floor(now / 1000),
              isStale: false,
            },
            fetchedAt: now,
          });
        } catch {
          // retain last cached value
        }
      }),
    );
  }

  /**
   * Live APY data from DeFiLlama yields API (free, no key required).
   * Fetches the full pool list once, filters to our protocol/chain/asset set.
   * Falls back to last cached values on error.
   */
  private async fetchApyData() {
    const now = Date.now();

    try {
      const res = await fetch('https://yields.llama.fi/pools', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return;

      const json = await res.json() as {
        data?: Array<{
          pool: string;
          project: string;
          chain: string;
          symbol: string;
          apy: number | null;
          apyBase: number | null;
          apyReward: number | null;
          apyBorrow: number | null;
          tvlUsd: number | null;
        }>;
      };

      const pools = json.data ?? [];

      for (const pool of pools) {
        const mapping = DEFI_LLAMA_POOL_IDS[pool.pool];
        if (!mapping) continue;

        const supplyApy = (pool.apyBase ?? pool.apy ?? 0);
        const borrowApy = Math.abs(pool.apyBorrow ?? 0);

        this.apyCache.set(`${mapping.protocol}:${mapping.chain}:${mapping.asset}`, {
          data: {
            protocol: mapping.protocol,
            chain: mapping.chain,
            asset: mapping.asset,
            supplyApyBps: Math.round(supplyApy * 100),
            borrowApyBps: Math.round(borrowApy * 100),
            tvlUsd: pool.tvlUsd ?? 0,
            timestamp: Math.floor(now / 1000),
            isStale: false,
          },
          fetchedAt: now,
        });
      }
    } catch {
      // retain last cached values — next poll will retry
    }
  }

  /**
   * Live gas prices via viem getGasPrice() — no API key required.
   * Falls back to last cached value on RPC error.
   */
  private async fetchGasPrices() {
    const now = Date.now();

    const chains = [
      { chain: mainnet,  rpcUrl: config.chains.ethereum.rpcUrl,  chainId: 1 },
      { chain: base,     rpcUrl: config.chains.base.rpcUrl,      chainId: 8453 },
      { chain: arbitrum, rpcUrl: config.chains.arbitrum.rpcUrl,  chainId: 42161 },
      { chain: bsc,      rpcUrl: config.chains.bnb.rpcUrl,       chainId: 56 },
      { chain: polygon,  rpcUrl: config.chains.polygon.rpcUrl,   chainId: 137 },
    ];

    await Promise.allSettled(
      chains.map(async ({ chain, rpcUrl, chainId }) => {
        if (!rpcUrl) return;
        try {
          const client = createPublicClient({ chain, transport: http(rpcUrl) });
          const gasPrice = await client.getGasPrice();
          const gasPriceGwei = parseFloat(formatGwei(gasPrice));
          // cost = gasPrice (wei) × typical gas units, converted to ETH, then USD
          const typicalTxUsd =
            (Number(gasPrice) * TYPICAL_GAS_UNITS * ETH_PRICE_USD) / 1e18;

          this.gasCache.set(chainId, {
            data: {
              chain: chainId,
              gasPriceGwei,
              typicalTxUsd,
              timestamp: Math.floor(now / 1000),
              isStale: false,
            },
            fetchedAt: now,
          });
        } catch {
          // retain last cached value
        }
      }),
    );
  }

  // ─── Staleness ────────────────────────────────────────────────────────────

  private withStaleness<T extends { isStale: boolean; timestamp: number }>(
    entry: CacheEntry<T>,
  ): T {
    const ageSeconds = (Date.now() - entry.fetchedAt) / 1000;
    return { ...entry.data, isStale: ageSeconds > config.quoteTtlSeconds };
  }
}

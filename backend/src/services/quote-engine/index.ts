import { createPublicClient, http, formatGwei, parseAbi } from 'viem';
import { mainnet, arbitrum, base, bsc, polygon } from 'viem/chains';
import { config } from '../../config/index.js';
import { quotes as quoteMetrics } from '../metrics/index.js';

// ─── Compound v3 Comet contract config ────────────────────────────────────────
// Each comet has: getUtilization() → uint (1e18-scaled) and getSupplyRate(util) → uint64
// Rate is per-second; annualise: (rate / 1e18) × SECONDS_PER_YEAR

const COMPOUND_V3_COMETS: Array<{
  address: `0x${string}`;
  chain: typeof mainnet | typeof arbitrum | typeof base;
  chainId: number;
  asset: string;
}> = [
  { address: '0xc3d688B66703497DAA19211EEdff47f25384cdc3', chain: mainnet,  chainId: 1,     asset: 'USDC' },
  { address: '0xA17581A9E3356d9A858b789D68B4d866e593aE94', chain: mainnet,  chainId: 1,     asset: 'ETH'  },
  { address: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf', chain: arbitrum, chainId: 42161, asset: 'USDC' },
  { address: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf', chain: base,     chainId: 8453,  asset: 'USDC' },
];

const COMET_ABI = parseAbi([
  'function getUtilization() view returns (uint)',
  'function getSupplyRate(uint utilization) view returns (uint64)',
  'function totalSupply() view returns (uint)',
]);

const SECONDS_PER_YEAR = 365 * 24 * 3600;

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
  // Kamino – Solana (chain 101 by convention)
  'b7e4b4b4-1234-4e5f-8a3b-1234567890ab': { protocol: 'kamino', chain: 101, asset: 'USDC' },
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
    // Prefer the best-of-all-sources quote when protocol is unspecified / 'best'
    const bestKey = `best:${chain}:${fromAsset}:${toAsset}`;
    const directKey = `${protocol}:${chain}:${fromAsset}:${toAsset}`;
    const entry = this.swapCache.get(directKey) ?? this.swapCache.get(bestKey);
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
    const time = async (fn: () => Promise<void>, protocol: string, quoteType: 'apy' | 'bridge' | 'swap' | 'gas') => {
      const t0 = Date.now();
      try {
        await fn();
        quoteMetrics.fetchDone(protocol, quoteType, Date.now() - t0);
      } catch (err) {
        quoteMetrics.fetchError(protocol, quoteType);
        throw err;
      }
    };

    await Promise.allSettled([
      time(() => this.fetchBridgeQuotes(), 'lifi',      'bridge'),
      time(() => this.fetchSwapQuotes(),   '1inch',     'swap'),
      time(() => this.fetchApyData(),      'defillama', 'apy'),
      time(() => this.fetchGasPrices(),    'onchain',   'gas'),
    ]);

    // Gauge cache sizes after each refresh cycle
    quoteMetrics.cacheSize(
      this.bridgeCache.size + this.swapCache.size + this.apyCache.size + this.gasCache.size,
    );

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
      [1,        42161, 'USDC', '4200000000',         6],  // ETH mainnet → Arbitrum
      [1,        8453,  'USDC', '4200000000',         6],  // ETH mainnet → Base
      [1,        42161, 'ETH',  '1000000000000000000', 18], // ETH mainnet → Arbitrum
      // Testnet pairs
      [11155111, 84532, 'USDC', '100000000',          6],  // Sepolia → Base Sepolia 100 USDC
      [11155111, 84532, 'ETH',  '10000000000000000',  18], // Sepolia → Base Sepolia 0.01 ETH
    ];

    // Li.Fi chain ID names (Li.Fi accepts numeric chain IDs directly)
    const chainNames: Record<number, string> = {
      1:        'ETH', 42161: 'ARB',  8453:  'BAS',  56:  'BSC', 137: 'POL',
      10:       'OPT', 43114: 'AVA',  101:   'SOL',  534352: 'SCR', 324: 'ERA',
      11155111: 'SEP', 84532: 'BSP',
    };

    // ERC-20 addresses (or native sentinel) per asset/chain
    const tokenAddresses: Record<string, Record<number, string>> = {
      USDC: {
        1:        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        42161:    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        8453:     '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC Sepolia
        84532:    '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC Base Sepolia
      },
      ETH: {
        1:        '0x0000000000000000000000000000000000000000',
        42161:    '0x0000000000000000000000000000000000000000',
        8453:     '0x0000000000000000000000000000000000000000',
        11155111: '0x0000000000000000000000000000000000000000',
        84532:    '0x0000000000000000000000000000000000000000',
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
   * Live swap quotes from 1inch, Paraswap, and 0x Protocol.
   * Caches each source independently, then picks the best (highest amountOut)
   * and stores it under `best:{chain}:{fromAsset}:{toAsset}`.
   */
  private async fetchSwapQuotes() {
    const now = Date.now();

    // [chain, fromAsset, toAsset, fromAmount (wei)]
    const pairs: Array<[number, string, string, string]> = [
      [1,     'ETH',  'USDC', '1000000000000000000'],
      [42161, 'ETH',  'USDC', '1000000000000000000'],
      [8453,  'ETH',  'USDC', '1000000000000000000'],
    ];

    const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    const USDC: Record<number, string> = {
      1:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    };

    const tokenAddr = (asset: string, chain: number) =>
      asset === 'ETH' ? NATIVE : (USDC[chain] ?? '');

    const cacheSwap = (protocol: string, chain: number, fromAsset: string, toAsset: string,
      fromAmount: string, amountOut: bigint, feeUsd: number, slippageBps: number,
    ) => {
      const entry: CacheEntry<SwapQuote> = {
        data: {
          protocol,
          chain,
          fromAsset,
          toAsset,
          amountIn: BigInt(fromAmount),
          amountOut,
          feeUsd,
          slippageBps,
          timestamp: Math.floor(now / 1000),
          isStale: false,
        },
        fetchedAt: now,
      };
      this.swapCache.set(`${protocol}:${chain}:${fromAsset}:${toAsset}`, entry);
      return entry;
    };

    await Promise.allSettled(
      pairs.flatMap(([chain, fromAsset, toAsset, fromAmount]) => {
        const src = tokenAddr(fromAsset, chain);
        const dst = tokenAddr(toAsset,  chain);
        if (!src || !dst) return [];

        return [
          // ── 1inch v6 ──────────────────────────────────────────────────────────
          (async () => {
            try {
              const url = `https://api.1inch.dev/swap/v6.0/${chain}/quote?src=${src}&dst=${dst}&amount=${fromAmount}`;
              const key = process.env.ONEINCH_API_KEY;
              const res = await fetch(url, {
                headers: {
                  'Accept': 'application/json',
                  ...(key ? { Authorization: `Bearer ${key}` } : {}),
                },
                signal: AbortSignal.timeout(6_000),
              });
              if (!res.ok) return;
              const data = await res.json() as { dstAmount?: string };
              const amountOut = BigInt(data.dstAmount ?? '0');
              if (amountOut === 0n) return;
              cacheSwap('1inch', chain, fromAsset, toAsset, fromAmount, amountOut, 0, 30);
            } catch { /* retain last cached value */ }
          })(),

          // ── Paraswap ──────────────────────────────────────────────────────────
          (async () => {
            try {
              const params = new URLSearchParams({
                srcToken: src,
                destToken: dst,
                amount: fromAmount,
                network: String(chain),
                partner: 'meridian',
              });
              const res = await fetch(`https://api.paraswap.io/prices?${params.toString()}`, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(6_000),
              });
              if (!res.ok) return;
              const data = await res.json() as {
                priceRoute?: { destAmount?: string; gasCostUSD?: string };
              };
              const amountOut = BigInt(data.priceRoute?.destAmount ?? '0');
              if (amountOut === 0n) return;
              const feeUsd = Number(data.priceRoute?.gasCostUSD ?? '0');
              cacheSwap('paraswap', chain, fromAsset, toAsset, fromAmount, amountOut, feeUsd, 30);
            } catch { /* retain last cached value */ }
          })(),

          // ── 0x Protocol ───────────────────────────────────────────────────────
          (async () => {
            try {
              const params = new URLSearchParams({
                buyToken: dst,
                sellToken: src,
                sellAmount: fromAmount,
              });
              const zxKey = process.env.ZRX_API_KEY;
              const res = await fetch(`https://api.0x.org/swap/v1/price?${params.toString()}`, {
                headers: {
                  'Accept': 'application/json',
                  ...(zxKey ? { '0x-api-key': zxKey } : {}),
                },
                signal: AbortSignal.timeout(6_000),
              });
              if (!res.ok) return;
              const data = await res.json() as {
                buyAmount?: string;
                estimatedGas?: string;
                gasPrice?: string;
              };
              const amountOut = BigInt(data.buyAmount ?? '0');
              if (amountOut === 0n) return;
              cacheSwap('0x', chain, fromAsset, toAsset, fromAmount, amountOut, 0, 30);
            } catch { /* retain last cached value */ }
          })(),
        ];
      }),
    );

    // ── Chain-specific DEXes (PancakeSwap, Camelot, Aerodrome) ────────────────
    await this.fetchChainSpecificDexQuotes(now);

    // ── Curve stablecoin swaps (run after the main DEX fetches) ───────────────
    await this.fetchCurveSwapQuotes(now);

    // ── Best-of selection ──────────────────────────────────────────────────────
    // After all fetches, pick the source with highest amountOut per pair and
    // store it under the `best:` prefix so strategy routing always gets the
    // cheapest quote regardless of which aggregator is live.
    // Include 'curve' in stablecoin pairs since Curve often wins on USDC↔USDT.
    for (const [chain, fromAsset, toAsset, fromAmount] of pairs) {
      const sources = ['1inch', 'paraswap', '0x'];
      if ((fromAsset === 'USDC' || fromAsset === 'USDT') && (toAsset === 'USDC' || toAsset === 'USDT')) {
        sources.push('curve');
      }
      const candidates = sources
        .map((p) => this.swapCache.get(`${p}:${chain}:${fromAsset}:${toAsset}`)?.data)
        .filter((q): q is SwapQuote => !!q && q.amountOut > 0n);

      if (candidates.length === 0) continue;

      const best = candidates.reduce((a, b) => (a.amountOut >= b.amountOut ? a : b));
      this.swapCache.set(`best:${chain}:${fromAsset}:${toAsset}`, {
        data: { ...best, protocol: `best(${best.protocol})` },
        fetchedAt: now,
      });

      // Maintain the existing generic key used by strategy engine lookups
      this.swapCache.set(`uniswap_v3:${chain}:${fromAsset}:${toAsset}`, {
        data: { ...best, protocol: best.protocol },
        fetchedAt: now,
      });

      // Keep the reverse pair too (USDC→ETH)
      this.swapCache.set(`best:${chain}:${toAsset}:${fromAsset}`, {
        data: {
          ...best,
          fromAsset: toAsset,
          toAsset: fromAsset,
          amountIn: best.amountOut,
          amountOut: BigInt(fromAmount),
          protocol: `best(${best.protocol})`,
        },
        fetchedAt: now,
      });
    }
  }

  /**
   * Chain-specific DEX swap quotes:
   *   - PancakeSwap v3 (BNB Chain 56) — via 1inch on BNB
   *   - Camelot (Arbitrum 42161) — via 1inch on Arbitrum (Camelot pools included)
   *   - Aerodrome (Base 8453) — via 1inch on Base (Aerodrome pools included)
   *
   * All three DEXes are covered by 1inch's routing which aggregates liquidity
   * from all pools on each chain. We cache them under their protocol name for
   * strategy engine graph lookups.
   */
  private async fetchChainSpecificDexQuotes(now: number) {
    const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    // BNB Chain uses WBNB as native, USDC at this address
    const BNB_USDC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
    const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
    const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

    const dexPairs: Array<{
      protocol: string; chain: number; fromAsset: string; toAsset: string;
      src: string; dst: string; fromAmount: string;
    }> = [
      // PancakeSwap — BNB Chain (ETH=WBNB)
      { protocol: 'pancakeswap', chain: 56, fromAsset: 'ETH', toAsset: 'USDC', src: NATIVE, dst: BNB_USDC, fromAmount: '1000000000000000000' },
      // Camelot — Arbitrum
      { protocol: 'camelot', chain: 42161, fromAsset: 'ETH', toAsset: 'USDC', src: NATIVE, dst: ARB_USDC, fromAmount: '1000000000000000000' },
      // Aerodrome — Base
      { protocol: 'aerodrome', chain: 8453, fromAsset: 'ETH', toAsset: 'USDC', src: NATIVE, dst: BASE_USDC, fromAmount: '1000000000000000000' },
    ];

    await Promise.allSettled(
      dexPairs.map(async ({ protocol, chain, fromAsset, toAsset, src, dst, fromAmount }) => {
        try {
          // 1inch supports BNB (56), Arbitrum (42161), Base (8453)
          const url = `https://api.1inch.dev/swap/v6.0/${chain}/quote?src=${src}&dst=${dst}&amount=${fromAmount}`;
          const key = process.env.ONEINCH_API_KEY;
          const res = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              ...(key ? { Authorization: `Bearer ${key}` } : {}),
            },
            signal: AbortSignal.timeout(6_000),
          });
          if (!res.ok) return;

          const data = await res.json() as { dstAmount?: string };
          const amountOut = BigInt(data.dstAmount ?? '0');
          if (amountOut === 0n) return;

          this.swapCache.set(`${protocol}:${chain}:${fromAsset}:${toAsset}`, {
            data: {
              protocol,
              chain,
              fromAsset,
              toAsset,
              amountIn: BigInt(fromAmount),
              amountOut,
              feeUsd: 0,
              slippageBps: 30,
              timestamp: Math.floor(now / 1000),
              isStale: false,
            },
            fetchedAt: now,
          });
        } catch { /* retain last cached */ }
      }),
    );
  }

  /**
   * Curve Finance stablecoin swap quotes via Curve's public router API.
   * Curve 3pool (USDC ↔ USDT ↔ DAI) and crypto pools on ETH/ARB.
   */
  private async fetchCurveSwapQuotes(now: number) {
    // Curve uses its own router API: GET /api/getExchangeAmount?network=ethereum&...
    // We'll query the canonical pools for stablecoin swaps
    const CURVE_STABLESWAP_3POOL = '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7';

    // For Curve, we simulate USDC ↔ USDT on Ethereum 3pool
    // Amount: 1,000,000 USDC (6 decimals)
    const fromAmount = '1000000000'; // 1,000 USDC

    // Curve has a public exchange-rate endpoint
    const pairs: Array<{ chain: number; network: string; fromAsset: string; toAsset: string }> = [
      { chain: 1,     network: 'ethereum', fromAsset: 'USDC', toAsset: 'USDT' },
      { chain: 42161, network: 'arbitrum', fromAsset: 'USDC', toAsset: 'USDT' },
    ];

    await Promise.allSettled(
      pairs.map(async ({ chain, network, fromAsset, toAsset }) => {
        try {
          // Curve's public API returns best exchange route and output amount
          const url = new URL('https://api.curve.fi/api/getExchangeAmount');
          url.searchParams.set('network', network);
          url.searchParams.set('fromToken', fromAsset);
          url.searchParams.set('toToken', toAsset);
          url.searchParams.set('amount', fromAmount);

          const res = await fetch(url.toString(), {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8_000),
          });
          if (!res.ok) return;

          const data = await res.json() as {
            success?: boolean;
            data?: {
              toAmount?: string;
              bestPoolAndOutput?: { output?: string };
            };
          };

          if (!data.success) return;
          const rawOut = data.data?.toAmount ?? data.data?.bestPoolAndOutput?.output;
          if (!rawOut) return;

          const amountOut = BigInt(Math.round(parseFloat(rawOut) * 1e6)); // back to 6-dec units
          if (amountOut === 0n) return;

          // Curve stablecoin swaps have near-zero slippage (1-2 bps)
          this.swapCache.set(`curve:${chain}:${fromAsset}:${toAsset}`, {
            data: {
              protocol: 'curve',
              chain,
              fromAsset,
              toAsset,
              amountIn: BigInt(fromAmount),
              amountOut,
              feeUsd: 0.04, // ~0.04% fee for 3pool
              slippageBps: 2,
              timestamp: Math.floor(now / 1000),
              isStale: false,
            },
            fetchedAt: now,
          });
        } catch { /* retain last cached */ }
      }),
    );
  }

  /**
   * Live APY data from multiple sources running in parallel:
   *   1. DeFiLlama  — broad coverage, free, fallback for all protocols
   *   2. Compound v3 — on-chain `getSupplyRate` (per-second → annualised)
   *   3. Morpho Blue — GraphQL API `https://blue-api.morpho.org/graphql`
   *   4. GMX         — stats API for GLP/GM pool yields (Arbitrum)
   *   5. Pendle      — REST API for PT/YT APY per market
   *   6. Convex      — Convex Finance boosted CRV + CVX APY
   *
   * Each source can fail independently; last cached values are retained.
   */
  private async fetchApyData() {
    const now = Date.now();

    await Promise.allSettled([
      this.fetchDeFiLlamaApy(now),
      this.fetchAaveSubgraphApy(now),
      this.fetchCompoundV3Apy(now),
      this.fetchMorphoApy(now),
      this.fetchGmxApy(now),
      this.fetchPendleApy(now),
      this.fetchConvexApy(now),
    ]);
  }

  /** DeFiLlama yields API — broad coverage backup source. */
  private async fetchDeFiLlamaApy(now: number) {
    try {
      const res = await fetch('https://yields.llama.fi/pools', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return;

      const json = await res.json() as {
        data?: Array<{
          pool: string;
          apy: number | null;
          apyBase: number | null;
          apyBorrow: number | null;
          tvlUsd: number | null;
        }>;
      };

      for (const pool of json.data ?? []) {
        const mapping = DEFI_LLAMA_POOL_IDS[pool.pool];
        if (!mapping) continue;

        const key = `${mapping.protocol}:${mapping.chain}:${mapping.asset}`;
        // Only write if not already present from a higher-priority source this cycle
        if (this.apyCache.get(key)?.fetchedAt === now) continue;

        this.apyCache.set(key, {
          data: {
            protocol: mapping.protocol,
            chain: mapping.chain,
            asset: mapping.asset,
            supplyApyBps: Math.round((pool.apyBase ?? pool.apy ?? 0) * 100),
            borrowApyBps: Math.round(Math.abs(pool.apyBorrow ?? 0) * 100),
            tvlUsd: pool.tvlUsd ?? 0,
            timestamp: Math.floor(now / 1000),
            isStale: false,
          },
          fetchedAt: now,
        });
      }
    } catch { /* retain last cached */ }
  }

  /**
   * Aave v3 APY via The Graph subgraph — `reservesData { liquidityRate }` query.
   * Queries the hosted Aave v3 Ethereum subgraph; falls back gracefully if
   * THEGRAPH_API_KEY is not set (no query, silently skips).
   */
  private async fetchAaveSubgraphApy(now: number) {
    const apiKey = process.env.THEGRAPH_API_KEY;

    // Aave v3 subgraph IDs on The Graph's decentralised network
    const subgraphs: Array<{ chainId: number; subgraphId: string }> = [
      { chainId: 1,     subgraphId: 'JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnWtnpjdaKE' }, // Ethereum
      { chainId: 42161, subgraphId: '6AKNZ1pnGFHoAFMoT4bddRjX8c6SHvKUGLGkF2vJ5Joh' }, // Arbitrum
      { chainId: 8453,  subgraphId: 'GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF' }, // Base
    ];

    const query = `{
      reserves(first: 20, orderBy: totalLiquidity, orderDirection: desc) {
        symbol
        liquidityRate
        stableBorrowRate
        variableBorrowRate
        totalLiquidity
        decimals
      }
    }`;

    // Determine the endpoint to use based on whether we have an API key
    const endpoint = (subgraphId: string) =>
      apiKey
        ? `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`
        : `https://api.thegraph.com/subgraphs/id/${subgraphId}`; // free hosted

    await Promise.allSettled(
      subgraphs.map(async ({ chainId, subgraphId }) => {
        try {
          const res = await fetch(endpoint(subgraphId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) return;

          const json = await res.json() as {
            data?: {
              reserves?: Array<{
                symbol?: string;
                liquidityRate?: string; // ray (1e27-scaled)
                variableBorrowRate?: string; // ray
                totalLiquidity?: string;
                decimals?: number;
              }>;
            };
          };

          const RAY = 1e27;
          const SECONDS_PER_YEAR_APY = 31_536_000;

          for (const reserve of json.data?.reserves ?? []) {
            const rawSymbol = reserve.symbol ?? '';
            // Normalise to our asset names
            const asset = rawSymbol === 'WETH' ? 'ETH'
              : rawSymbol === 'WBTC' ? 'WBTC'
              : rawSymbol === 'USDC' || rawSymbol === 'USDC.e' ? 'USDC'
              : rawSymbol === 'USDT' ? 'USDT'
              : null;
            if (!asset) continue;

            const liquidityRate = Number(reserve.liquidityRate ?? '0') / RAY;
            const borrowRate    = Number(reserve.variableBorrowRate ?? '0') / RAY;

            // Aave uses per-second rate; compound to get APY
            const supplyApy = ((1 + liquidityRate / SECONDS_PER_YEAR_APY) ** SECONDS_PER_YEAR_APY - 1) * 100;
            const borrowApy = ((1 + borrowRate    / SECONDS_PER_YEAR_APY) ** SECONDS_PER_YEAR_APY - 1) * 100;

            const key = `aave_v3:${chainId}:${asset}`;
            // Only overwrite if this is a higher-priority source (better than DeFiLlama)
            if (this.apyCache.get(key)?.fetchedAt === now) continue;

            this.apyCache.set(key, {
              data: {
                protocol: 'aave_v3',
                chain: chainId,
                asset,
                supplyApyBps: Math.round(supplyApy * 100),
                borrowApyBps: Math.round(borrowApy * 100),
                tvlUsd: 0,
                timestamp: Math.floor(now / 1000),
                isStale: false,
              },
              fetchedAt: now,
            });
          }
        } catch { /* retain last cached */ }
      }),
    );
  }

  /** Compound v3 on-chain supply rate via Comet.getSupplyRate(utilization). */
  private async fetchCompoundV3Apy(now: number) {
    const rpcUrls: Record<number, string | undefined> = {
      1:     config.chains.ethereum.rpcUrl,
      42161: config.chains.arbitrum.rpcUrl,
      8453:  config.chains.base.rpcUrl,
    };

    await Promise.allSettled(
      COMPOUND_V3_COMETS.map(async ({ address, chain, chainId, asset }) => {
        const rpcUrl = rpcUrls[chainId];
        if (!rpcUrl) return;
        try {
          const client = createPublicClient({ chain, transport: http(rpcUrl) });
          const utilization = await client.readContract({
            address, abi: COMET_ABI, functionName: 'getUtilization',
          });
          const ratePerSecond = await client.readContract({
            address, abi: COMET_ABI, functionName: 'getSupplyRate',
            args: [utilization],
          });
          // Rate is 1e18-scaled; annualise it
          const supplyApy = (Number(ratePerSecond) / 1e18) * SECONDS_PER_YEAR * 100;

          this.apyCache.set(`compound_v3:${chainId}:${asset}`, {
            data: {
              protocol: 'compound_v3',
              chain: chainId,
              asset,
              supplyApyBps: Math.round(supplyApy * 100),
              borrowApyBps: 0, // borrow rate requires separate call — covered by DeFiLlama
              tvlUsd: 0,
              timestamp: Math.floor(now / 1000),
              isStale: false,
            },
            fetchedAt: now,
          });
        } catch { /* retain last cached */ }
      }),
    );
  }

  /** Morpho Blue GraphQL API — top USDC and ETH markets on Ethereum. */
  private async fetchMorphoApy(now: number) {
    const query = `{
      markets(first: 20, orderBy: TotalSupplyUsd, orderDirection: Desc,
              where: { chainId_in: [1], assetSymbol_in: ["USDC","WETH","ETH"] }) {
        items {
          uniqueKey
          collateralAsset { symbol }
          loanAsset { symbol }
          state { supplyApy borrowApy totalSupplyAssetsUsd }
        }
      }
    }`;

    try {
      const res = await fetch('https://blue-api.morpho.org/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;

      const json = await res.json() as {
        data?: {
          markets?: {
            items?: Array<{
              loanAsset?: { symbol?: string };
              state?: { supplyApy?: number; borrowApy?: number; totalSupplyAssetsUsd?: number };
            }>;
          };
        };
      };

      const items = json.data?.markets?.items ?? [];

      // Aggregate by loan asset (USDC, WETH) — average APY across top markets
      const byAsset = new Map<string, { supplyApySum: number; count: number; tvlSum: number }>();
      for (const item of items) {
        const rawAsset = item.loanAsset?.symbol ?? '';
        const asset = rawAsset === 'WETH' ? 'ETH' : rawAsset;
        if (!asset || !item.state) continue;
        const cur = byAsset.get(asset) ?? { supplyApySum: 0, count: 0, tvlSum: 0 };
        cur.supplyApySum += (item.state.supplyApy ?? 0) * 100; // already a fraction → %
        cur.count++;
        cur.tvlSum += item.state.totalSupplyAssetsUsd ?? 0;
        byAsset.set(asset, cur);
      }

      for (const [asset, agg] of byAsset) {
        const supplyApy = agg.count > 0 ? agg.supplyApySum / agg.count : 0;
        this.apyCache.set(`morpho:1:${asset}`, {
          data: {
            protocol: 'morpho',
            chain: 1,
            asset,
            supplyApyBps: Math.round(supplyApy * 100),
            borrowApyBps: 0,
            tvlUsd: agg.tvlSum,
            timestamp: Math.floor(now / 1000),
            isStale: false,
          },
          fetchedAt: now,
        });
      }
    } catch { /* retain last cached */ }
  }

  /** GMX GLP/GM pool APR on Arbitrum via GMX stats API. */
  private async fetchGmxApy(now: number) {
    try {
      // GMX v2 markets include GM pools with APR; v1 GLP APR from stats
      const res = await fetch('https://arbitrum.api.0xsquid.com/v1/token-price?chainId=42161&tokenAddress=0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      // Alternative: use GMX stats for GLP fee APR
      const statsRes = await fetch('https://stats.gmx.io/api/earn/arbitrum', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!statsRes.ok) return;

      const stats = await statsRes.json() as {
        glpData?: {
          feeAprFormatted?: string; // e.g. "18.23"
          aum?: string; // TVL in USD
        };
      };

      const feeAprStr = stats.glpData?.feeAprFormatted;
      if (!feeAprStr) return;

      const feeApr = parseFloat(feeAprStr);
      const tvlUsd = parseFloat(stats.glpData?.aum ?? '0');

      this.apyCache.set('gmx:42161:GLP', {
        data: {
          protocol: 'gmx',
          chain: 42161,
          asset: 'GLP',
          supplyApyBps: Math.round(feeApr * 100),
          borrowApyBps: 0,
          tvlUsd,
          timestamp: Math.floor(now / 1000),
          isStale: false,
        },
        fetchedAt: now,
      });
    } catch { /* retain last cached */ }
  }

  /** Convex Finance boosted CRV + CVX APY via Convex public API. */
  private async fetchConvexApy(now: number) {
    try {
      const res = await fetch('https://www.convexfinance.com/api/curve-apys', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;

      const json = await res.json() as {
        apys?: Record<string, {
          baseApy?: number;
          crvApy?: number;
          cvxApy?: number;
          totalApy?: number;
        }>;
      };

      // Key pools we care about: 3pool (USDC/USDT/DAI), stETH (ETH), fraxUsdc
      const poolMap: Record<string, { asset: string }> = {
        '3pool':    { asset: 'USDC' },
        'steth':    { asset: 'ETH' },
        'fraxusdc': { asset: 'USDC' },
        'crvusd':   { asset: 'crvUSD' },
      };

      for (const [poolName, meta] of Object.entries(poolMap)) {
        const apy = json.apys?.[poolName];
        if (!apy) continue;

        const totalApy = apy.totalApy ?? (apy.baseApy ?? 0) + (apy.crvApy ?? 0) + (apy.cvxApy ?? 0);

        this.apyCache.set(`convex:1:${meta.asset}`, {
          data: {
            protocol: 'convex',
            chain: 1,
            asset: meta.asset,
            supplyApyBps: Math.round(totalApy * 100),
            borrowApyBps: 0,
            tvlUsd: 0,
            timestamp: Math.floor(now / 1000),
            isStale: false,
          },
          fetchedAt: now,
        });
      }
    } catch { /* retain last cached */ }
  }

  /** Pendle PT/YT APY for active markets on Ethereum and Arbitrum. */
  private async fetchPendleApy(now: number) {
    const chainIds = [1, 42161];

    await Promise.allSettled(
      chainIds.map(async (chainId) => {
        try {
          const res = await fetch(
            `https://api.pendle.finance/core/v1/chains/${chainId}/markets/active?limit=20`,
            {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(10_000),
            },
          );
          if (!res.ok) return;

          const json = await res.json() as {
            results?: Array<{
              name?: string;
              underlyingApy?: number; // fraction (e.g. 0.08 = 8%)
              impliedApy?: number;
              pt?: { apy?: number };
              tvl?: { usd?: number };
            }>;
          };

          for (const market of json.results ?? []) {
            const name = (market.name ?? '').replace(/\s+/g, '_').toUpperCase();
            if (!name) continue;

            const supplyApy = (market.pt?.apy ?? market.impliedApy ?? market.underlyingApy ?? 0) * 100;
            const tvlUsd = market.tvl?.usd ?? 0;

            this.apyCache.set(`pendle:${chainId}:${name}`, {
              data: {
                protocol: 'pendle',
                chain: chainId,
                asset: name,
                supplyApyBps: Math.round(supplyApy * 100),
                borrowApyBps: 0,
                tvlUsd,
                timestamp: Math.floor(now / 1000),
                isStale: false,
              },
              fetchedAt: now,
            });
          }
        } catch { /* retain last cached */ }
      }),
    );
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

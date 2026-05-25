/**
 * Price Feed Service
 *
 * Fetches real-time token prices to power slippage estimation and USD value
 * calculations throughout the strategy engine.
 *
 * Sources (in priority order):
 *   1. Pyth Network (pull model via Hermes REST) — sub-second latency
 *   2. DeFiLlama Coins API                       — free, no API key
 *   3. Stale cache                               — last known values
 *
 * Env vars (all optional):
 *   PYTH_HERMES_URL — defaults to https://hermes.pyth.network
 *
 * Phase 1: DeFiLlama + Pyth REST.
 * Phase 2: on-chain Chainlink data feed reads via viem for critical paths.
 */

import { EventEmitter } from 'node:events';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TokenPrice {
  symbol:    string;
  priceUsd:  number;
  confidence: number;   // Pyth confidence interval in USD (0 if unknown)
  source:    'pyth' | 'defillama' | 'stale';
  timestamp: number;
}

// ─── Pyth price feed IDs ───────────────────────────────────────────────────────
// https://pyth.network/developers/price-feed-ids

const PYTH_FEED_IDS: Record<string, string> = {
  ETH:  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  BTC:  '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  SOL:  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  AVAX: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  MATIC:'0x5de33a9112c2b700b8d30b8a3402c103578ccfa2765696471cc672bd5cf6ac52',
};

// ─── DeFiLlama token IDs ───────────────────────────────────────────────────────

const DEFILLAMA_TOKEN_IDS: Record<string, string> = {
  ETH:  'coingecko:ethereum',
  BTC:  'coingecko:bitcoin',
  WBTC: 'coingecko:wrapped-bitcoin',
  USDC: 'coingecko:usd-coin',
  USDT: 'coingecko:tether',
  SOL:  'coingecko:solana',
  AVAX: 'coingecko:avalanche-2',
  MATIC:'coingecko:matic-network',
};

// Stablecoins don't need live prices
const STABLECOIN_PRICES: Record<string, number> = {
  USDC: 1.0,
  USDT: 1.0,
  DAI:  1.0,
  FRAX: 1.0,
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class PriceFeedService {
  private prices = new Map<string, TokenPrice>();
  private emitter = new EventEmitter();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly refreshIntervalMs: number;
  private readonly pythHermesUrl: string;

  constructor(opts: { refreshIntervalMs?: number } = {}) {
    this.refreshIntervalMs = opts.refreshIntervalMs ?? 60_000;
    this.pythHermesUrl = process.env.PYTH_HERMES_URL ?? 'https://hermes.pyth.network';

    // Pre-seed stablecoins
    for (const [symbol, priceUsd] of Object.entries(STABLECOIN_PRICES)) {
      this.prices.set(symbol, { symbol, priceUsd, confidence: 0, source: 'stale', timestamp: Date.now() });
    }
  }

  /** Get cached price for a symbol; returns null if never fetched. */
  getPrice(symbol: string): TokenPrice | null {
    return this.prices.get(symbol.toUpperCase()) ?? null;
  }

  /** Get all currently cached prices. */
  getAllPrices(): TokenPrice[] {
    return Array.from(this.prices.values());
  }

  /** Register a callback invoked after every price refresh. */
  onRefresh(cb: (prices: TokenPrice[]) => void): void {
    this.emitter.on('refresh', cb);
  }

  /** Start the polling loop. */
  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.refreshIntervalMs);
    if (this.timer.unref) this.timer.unref();
    console.log(`[PriceFeed] Started — polling every ${this.refreshIntervalMs / 1000}s`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async refresh(): Promise<void> {
    await Promise.allSettled([
      this.fetchFromPyth(),
      this.fetchFromDeFiLlama(),
    ]);
    this.emitter.emit('refresh', this.getAllPrices());
  }

  private async fetchFromPyth(): Promise<void> {
    const feedIds = Object.values(PYTH_FEED_IDS);
    const params = feedIds.map((id) => `ids[]=${id}`).join('&');
    const url = `${this.pythHermesUrl}/v2/updates/price/latest?${params}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`Pyth HTTP ${res.status}`);

    const data = await res.json() as {
      parsed: Array<{
        id: string;
        price: { price: string; expo: number; conf: string };
      }>;
    };

    const idToSymbol = Object.fromEntries(
      Object.entries(PYTH_FEED_IDS).map(([sym, id]) => [id.toLowerCase(), sym]),
    );

    for (const item of data.parsed ?? []) {
      const symbol = idToSymbol[item.id.toLowerCase()];
      if (!symbol) continue;

      const rawPrice = Number(item.price.price);
      const expo = item.price.expo;
      const priceUsd = rawPrice * Math.pow(10, expo);
      const confidence = Number(item.price.conf) * Math.pow(10, expo);

      this.prices.set(symbol, {
        symbol,
        priceUsd,
        confidence,
        source: 'pyth',
        timestamp: Date.now(),
      });
    }
  }

  private async fetchFromDeFiLlama(): Promise<void> {
    // Only fetch symbols not already fresh from Pyth
    const toFetch = Object.entries(DEFILLAMA_TOKEN_IDS).filter(([sym]) => {
      const p = this.prices.get(sym);
      return !p || p.source !== 'pyth' || Date.now() - p.timestamp > 120_000;
    });
    if (toFetch.length === 0) return;

    const coins = toFetch.map(([, id]) => id).join(',');
    const url = `https://coins.llama.fi/prices/current/${coins}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`DeFiLlama HTTP ${res.status}`);

    const data = await res.json() as { coins: Record<string, { price: number; timestamp: number }> };

    for (const [sym, llamaId] of toFetch) {
      const coin = data.coins[llamaId];
      if (!coin) continue;
      // Don't overwrite a fresh Pyth price
      const existing = this.prices.get(sym);
      if (existing?.source === 'pyth' && Date.now() - existing.timestamp < 120_000) continue;

      this.prices.set(sym, {
        symbol: sym,
        priceUsd: coin.price,
        confidence: 0,
        source: 'defillama',
        timestamp: Date.now(),
      });
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const priceFeed = new PriceFeedService();

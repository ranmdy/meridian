'use client';

/**
 * usePriceFeed — polls GET /prices every 60 seconds and returns a price map.
 * Falls back to hardcoded values if the backend is unreachable.
 */

import { useState, useEffect, useRef } from 'react';

export interface TokenPrice {
  symbol:    string;
  priceUsd:  number;
  confidence: number;
  source:    'pyth' | 'defillama' | 'stale';
  timestamp: number;
}

// Fallback prices used when API is unreachable
const FALLBACK_PRICES: Record<string, number> = {
  ETH:  3000,
  BTC:  60000,
  WBTC: 60000,
  USDC: 1,
  USDT: 1,
  SOL:  140,
  AVAX: 35,
  MATIC: 0.85,
};

export function usePriceFeed(): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>(FALLBACK_PRICES);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function fetchPrices() {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
        const res = await fetch(`${base}/prices`);
        if (!res.ok) return;
        const data = await res.json() as { prices: TokenPrice[] };
        const map: Record<string, number> = { ...FALLBACK_PRICES };
        for (const p of data.prices) {
          map[p.symbol] = p.priceUsd;
        }
        setPrices(map);
      } catch {
        // Keep fallback values
      }
    }

    void fetchPrices();
    intervalRef.current = setInterval(() => void fetchPrices(), 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return prices;
}

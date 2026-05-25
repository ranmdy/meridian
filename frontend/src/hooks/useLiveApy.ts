'use client';

/**
 * useLiveApy — polls GET /strategy/apy every 30 seconds and builds a lookup
 * map keyed by `{protocol}:{chain}:{asset}`.
 *
 * Used by the Composer to update node APY labels in real time.
 */

import { useState, useEffect, useRef } from 'react';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ApyEntry {
  protocol: string;
  chain:    number;
  asset:    string;
  apyBps:   number;
  isStale:  boolean;
}

export type ApyMap = Record<string, number>; // key: `${protocol}:${chain}:${asset}`

export function useLiveApy(): ApyMap {
  const [apyMap, setApyMap] = useState<ApyMap>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch(`${BASE_URL}/strategy/apy`);
        if (!res.ok) return;
        const data = await res.json() as { quotes: ApyEntry[] };
        const map: ApyMap = {};
        for (const q of data.quotes ?? []) {
          if (!q.isStale) {
            map[`${q.protocol}:${q.chain}:${q.asset}`] = q.apyBps;
          }
        }
        setApyMap(map);
      } catch {
        // Keep previous values on error
      }
    }

    void fetch_();
    intervalRef.current = setInterval(() => void fetch_(), 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return apyMap;
}

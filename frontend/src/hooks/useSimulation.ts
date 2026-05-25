'use client';

import { useState, useEffect, useRef } from 'react';
import { api, type SimulationResult } from '@/src/lib/api';

interface UseSimulationResult {
  simulation: SimulationResult | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches a pre-execution simulation for the selected route whenever
 * routeIndex, fromAddress, or sourceChain changes.
 *
 * Skips the call when fromAddress is empty (wallet not connected).
 */
export function useSimulation(
  routeIndex: number,
  fromAddress: string | undefined,
  sourceChain: number,
): UseSimulationResult {
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!fromAddress) {
      setSimulation(null);
      setError(null);
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsLoading(true);
    setError(null);

    api.strategy
      .simulate(routeIndex, fromAddress, sourceChain)
      .then((result) => {
        if (!ctrl.signal.aborted) {
          setSimulation(result);
        }
      })
      .catch((err: Error) => {
        if (!ctrl.signal.aborted) {
          setError(err.message ?? 'Simulation failed');
          setSimulation(null);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setIsLoading(false);
      });

    return () => ctrl.abort();
  }, [routeIndex, fromAddress, sourceChain]);

  return { simulation, isLoading, error };
}

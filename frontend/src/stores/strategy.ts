import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Route, StrategyOptimizeRequest } from '@/src/lib/api';

interface StrategyState {
  // Current strategy form inputs
  sourceAsset: string;
  sourceChain: number;
  sourceAmountUsd: number;
  destinationChain: number;
  riskTolerance: 1 | 2 | 3 | 4 | 5;
  timeHorizonDays: number;
  destinationWallet: string;
  destinationVerified: boolean;
  destinationSignature: string;

  // Optimized routes
  routes: Route[];
  selectedRouteIndex: number;
  quoteExpiresAt: number | null;
  isOptimizing: boolean;
  optimizeError: string | null;

  // Actions
  setSourceAsset: (asset: string) => void;
  setSourceChain: (chain: number) => void;
  setSourceAmountUsd: (amount: number) => void;
  setDestinationChain: (chain: number) => void;
  setRiskTolerance: (r: 1 | 2 | 3 | 4 | 5) => void;
  setTimeHorizonDays: (days: number) => void;
  setDestinationWallet: (wallet: string) => void;
  setDestinationVerified: (verified: boolean, signature?: string) => void;
  setRoutes: (routes: Route[], quoteExpiresAt: number) => void;
  selectRoute: (index: number) => void;
  setOptimizing: (loading: boolean) => void;
  setOptimizeError: (err: string | null) => void;
  reset: () => void;
  toRequest: () => StrategyOptimizeRequest;
}

const defaults = {
  sourceAsset: 'ETH',
  sourceChain: 1,
  sourceAmountUsd: 0,
  destinationChain: 42161,
  riskTolerance: 3 as const,
  timeHorizonDays: 30,
  destinationWallet: '',
  destinationVerified: false,
  destinationSignature: '',
  routes: [],
  selectedRouteIndex: 0,
  quoteExpiresAt: null,
  isOptimizing: false,
  optimizeError: null,
};

export const useStrategyStore = create<StrategyState>()(
  persist(
    (set, get) => ({
      ...defaults,

      setSourceAsset: (sourceAsset) => set({ sourceAsset }),
      setSourceChain: (sourceChain) => set({ sourceChain }),
      setSourceAmountUsd: (sourceAmountUsd) => set({ sourceAmountUsd }),
      setDestinationChain: (destinationChain) => set({ destinationChain }),
      setRiskTolerance: (riskTolerance) => set({ riskTolerance }),
      setTimeHorizonDays: (timeHorizonDays) => set({ timeHorizonDays }),
      setDestinationWallet: (destinationWallet) =>
        set({ destinationWallet, destinationVerified: false, destinationSignature: '' }),
      setDestinationVerified: (destinationVerified, signature = '') =>
        set({ destinationVerified, destinationSignature: signature }),
      setRoutes: (routes, quoteExpiresAt) =>
        set({ routes, quoteExpiresAt, selectedRouteIndex: 0, optimizeError: null }),
      selectRoute: (selectedRouteIndex) => set({ selectedRouteIndex }),
      setOptimizing: (isOptimizing) => set({ isOptimizing }),
      setOptimizeError: (optimizeError) => set({ optimizeError }),
      reset: () => set(defaults),

      toRequest: (): StrategyOptimizeRequest => {
        const s = get();
        return {
          sourceAsset: s.sourceAsset,
          sourceChain: s.sourceChain,
          sourceAmountUsd: s.sourceAmountUsd,
          destinationChain: s.destinationChain,
          riskTolerance: s.riskTolerance,
          timeHorizonDays: s.timeHorizonDays,
          destinationWallet: s.destinationWallet || undefined,
          destinationSignature: s.destinationSignature || undefined,
        };
      },
    }),
    {
      name: 'meridian-strategy',
      partialize: (s) => ({
        sourceAsset: s.sourceAsset,
        sourceChain: s.sourceChain,
        destinationChain: s.destinationChain,
        riskTolerance: s.riskTolerance,
        timeHorizonDays: s.timeHorizonDays,
      }),
    },
  ),
);

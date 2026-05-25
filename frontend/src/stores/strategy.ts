import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Route, StrategyOptimizeRequest } from '@/src/lib/api';

export type OptimizeMode = 'manual' | 'auto';

export interface SavedStrategy {
  id: string;
  name: string;
  savedAt: number;
  sourceAsset: string;
  sourceChain: number;
  sourceAmountUsd: number;
  destinationChain: number;
  riskTolerance: 1 | 2 | 3 | 4 | 5;
  timeHorizonDays: number;
}

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

  // Auto-optimize
  mode: OptimizeMode;
  autoExplanation: string | null;
  autoAlternatives: Route[];

  // Saved strategies (localStorage)
  savedStrategies: SavedStrategy[];
  saveStrategy: (name: string) => void;
  loadStrategy: (id: string) => void;
  deleteSavedStrategy: (id: string) => void;

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
  setAutoResult: (route: Route, explanation: string, alternatives: Route[], quoteExpiresAt: number) => void;
  selectRoute: (index: number) => void;
  setMode: (mode: OptimizeMode) => void;
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
  mode: 'manual' as OptimizeMode,
  autoExplanation: null as string | null,
  autoAlternatives: [] as Route[],
  savedStrategies: [] as SavedStrategy[],
};

export const useStrategyStore = create<StrategyState>()(
  persist(
    (set, get) => ({
      ...defaults,

      saveStrategy: (name) => {
        const s = get();
        const entry: SavedStrategy = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          savedAt: Date.now(),
          sourceAsset: s.sourceAsset,
          sourceChain: s.sourceChain,
          sourceAmountUsd: s.sourceAmountUsd,
          destinationChain: s.destinationChain,
          riskTolerance: s.riskTolerance,
          timeHorizonDays: s.timeHorizonDays,
        };
        set({ savedStrategies: [entry, ...s.savedStrategies].slice(0, 50) });
      },

      loadStrategy: (id) => {
        const { savedStrategies } = get();
        const entry = savedStrategies.find((s) => s.id === id);
        if (!entry) return;
        set({
          sourceAsset: entry.sourceAsset,
          sourceChain: entry.sourceChain,
          sourceAmountUsd: entry.sourceAmountUsd,
          destinationChain: entry.destinationChain,
          riskTolerance: entry.riskTolerance,
          timeHorizonDays: entry.timeHorizonDays,
          routes: [],
          selectedRouteIndex: 0,
          optimizeError: null,
        });
      },

      deleteSavedStrategy: (id) =>
        set((s) => ({ savedStrategies: s.savedStrategies.filter((e) => e.id !== id) })),

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
      setAutoResult: (route, explanation, alternatives, quoteExpiresAt) =>
        set({ routes: [route], selectedRouteIndex: 0, autoExplanation: explanation, autoAlternatives: alternatives, quoteExpiresAt, optimizeError: null }),
      selectRoute: (selectedRouteIndex) => set({ selectedRouteIndex }),
      setMode: (mode) => set({ mode, autoExplanation: null, autoAlternatives: [] }),
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
        savedStrategies: s.savedStrategies,
      }),
    },
  ),
);

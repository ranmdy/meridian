'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, type MarketplaceStrategy } from '@/src/lib/api';
import { useStrategyStore } from '@/src/stores/strategy';

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  42161: 'Arbitrum',
  56: 'BNB',
  137: 'Polygon',
};

const SORT_OPTIONS = [
  { value: 'votes',   label: 'Most Voted' },
  { value: 'yield',   label: 'Highest Yield' },
  { value: 'risk',    label: 'Lowest Risk' },
  { value: 'popular', label: 'Most Used' },
  { value: 'newest',  label: 'Newest' },
];

const riskColor = (score: number) => {
  if (score < 30) return 'text-green-400';
  if (score < 60) return 'text-yellow-400';
  return 'text-red-400';
};

export function MarketplaceBrowser() {
  const router = useRouter();
  const { setRoutes } = useStrategyStore();

  const [strategies, setStrategies] = useState<MarketplaceStrategy[]>([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('votes');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [copyingId, setCopyingId] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    api.marketplace.browse({ sort: sort as never, limit: 20 })
      .then((result) => {
        setStrategies(result.strategies);
        setTotal(result.total);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [sort]);

  const handleVote = async (id: string) => {
    if (votedIds.has(id)) return;
    await api.marketplace.vote(id);
    setVotedIds((prev) => new Set(prev).add(id));
    setStrategies((prev) =>
      prev.map((s) => s.id === id ? { ...s, votes: s.votes + 1 } : s),
    );
  };

  const handleCopy = async (strategy: MarketplaceStrategy) => {
    setCopyingId(strategy.id);
    try {
      // Pre-populate the strategy form with this strategy's params then run optimize
      const store = useStrategyStore.getState();
      store.setSourceAsset(strategy.sourceAsset);
      store.setSourceChain(strategy.sourceChain);
      store.setDestinationChain(strategy.destinationChain);
      store.setRiskTolerance(strategy.riskTolerance);
      store.setTimeHorizonDays(strategy.timeHorizonDays);
      // Load the route directly
      setRoutes([strategy.route], Math.floor(Date.now() / 1000) + 60);
      router.push('/');
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Sort by</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-meridian-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-gray-500">{total} strategies</span>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-lg p-4">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass h-24 animate-pulse" />
          ))}
        </div>
      )}

      {/* Strategies */}
      {!isLoading && strategies.length === 0 && !error && (
        <div className="text-center py-12 text-gray-500">
          No strategies published yet. Be the first!
        </div>
      )}

      <div className="space-y-3">
        {strategies.map((s) => {
          const apyPct = (s.publishedApyBps / 100).toFixed(2);
          const srcChain = CHAIN_NAMES[s.sourceChain] ?? String(s.sourceChain);
          const dstChain = CHAIN_NAMES[s.destinationChain] ?? String(s.destinationChain);

          return (
            <div key={s.id} className="glass p-5 flex gap-4">
              {/* Left: info */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start gap-2">
                  <h3 className="font-medium text-gray-100 leading-tight">{s.name}</h3>
                  {s.riskTolerance <= 2 && (
                    <span className="shrink-0 text-xs bg-green-950/40 text-green-400 border border-green-800 px-1.5 py-0.5 rounded-full">
                      Conservative
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 line-clamp-2">{s.description}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                  <span>{s.sourceAsset} · {srcChain} → {dstChain}</span>
                  <span className="text-meridian-400 font-medium">{apyPct}% APY</span>
                  <span className={riskColor(s.route.riskScore)}>
                    risk {s.route.riskScore}/100
                  </span>
                  <span>{s.executionCount} copies</span>
                </div>
              </div>

              {/* Right: actions */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  onClick={() => void handleVote(s.id)}
                  disabled={votedIds.has(s.id)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
                    votedIds.has(s.id)
                      ? 'bg-meridian-950/40 border-meridian-800 text-meridian-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                  }`}
                >
                  ▲ {s.votes}
                </button>
                <button
                  onClick={() => void handleCopy(s)}
                  disabled={copyingId === s.id}
                  className="text-xs px-3 py-1.5 rounded-lg bg-meridian-600 hover:bg-meridian-500 disabled:opacity-40 text-white transition-colors"
                >
                  {copyingId === s.id ? 'Loading…' : 'Copy Strategy'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { api } from '@/src/lib/api';
import { useStrategyStore } from '@/src/stores/strategy';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  estimatedApyBps: number;
  riskLevel: number;
  sourceAsset: string;
  sourceChain: number;
  destinationChain: number;
  timeHorizonDays: number;
  tags: string[];
  popularityScore: number;
}

const CHAIN_NAMES: Record<number, string> = {
  1:      'Ethereum',
  8453:   'Base',
  42161:  'Arbitrum',
  56:     'BNB Chain',
  137:    'Polygon',
  10:     'Optimism',
  43114:  'Avalanche',
  534352: 'Scroll',
  324:    'zkSync Era',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  simple:   'text-green-400 bg-green-950/30 border-green-800',
  moderate: 'text-yellow-400 bg-yellow-950/30 border-yellow-800',
  advanced: 'text-red-400 bg-red-950/30 border-red-800',
};

const RISK_COLORS: Record<number, string> = {
  1: 'text-emerald-400',
  2: 'text-green-400',
  3: 'text-yellow-400',
  4: 'text-orange-400',
  5: 'text-red-400',
};

const RISK_LABELS: Record<number, string> = {
  1: 'Conservative',
  2: 'Low',
  3: 'Moderate',
  4: 'High',
  5: 'Aggressive',
};

const CATEGORY_ICONS: Record<string, string> = {
  yield:     '◈',
  lending:   '⟳',
  staking:   '▲',
  arbitrage: '⇄',
  bridge:    '⤳',
};

export function TemplateLibrary() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<'popular' | 'apy' | 'risk'>('popular');

  const {
    setSourceAsset, setSourceChain, setDestinationChain,
    setRiskTolerance, setTimeHorizonDays,
  } = useStrategyStore();

  useEffect(() => {
    void api.templates.categories().then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    void api.templates.list({
      category: activeCategory ?? undefined,
      sort,
      limit: 12,
    }).then((r) => {
      setTemplates(r.templates);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [activeCategory, sort]);

  const handleUseTemplate = (t: Template) => {
    setSourceAsset(t.sourceAsset);
    setSourceChain(t.sourceChain);
    setDestinationChain(t.destinationChain);
    setRiskTolerance(t.riskLevel as 1 | 2 | 3 | 4 | 5);
    setTimeHorizonDays(t.timeHorizonDays);
    // Scroll the user to the strategy form
    const form = document.querySelector('[data-optimize-btn]');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="glass p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-100 tracking-tight">Strategy Templates</h2>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as 'popular' | 'apy' | 'risk')}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-meridian-500"
        >
          <option value="popular">Most Popular</option>
          <option value="apy">Highest APY</option>
          <option value="risk">Lowest Risk</option>
        </select>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${
            activeCategory === null
              ? 'bg-meridian-700 border-meridian-600 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors capitalize ${
              activeCategory === cat
                ? 'bg-meridian-700 border-meridian-600 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            {CATEGORY_ICONS[cat]} {cat}
          </button>
        ))}
      </div>

      {/* Template cards */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <span className="inline-block w-4 h-4 border-2 border-gray-600 border-t-meridian-500 rounded-full animate-spin" />
          Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="text-gray-600 text-sm text-center py-8">No templates found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-gray-900/40 border border-gray-800 rounded-xl p-4 hover:border-gray-700 hover:bg-gray-900/60 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-100">{t.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs border ${DIFFICULTY_COLORS[t.difficulty]}`}>
                      {t.difficulty}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2 leading-relaxed">{t.description}</p>
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    <span className="text-meridian-400 font-semibold tabular-nums">
                      ~{(t.estimatedApyBps / 100).toFixed(1)}% APY
                    </span>
                    <span className="text-gray-600">·</span>
                    <span className={RISK_COLORS[t.riskLevel]}>
                      {RISK_LABELS[t.riskLevel]} risk
                    </span>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-500">
                      {t.sourceAsset} · {CHAIN_NAMES[t.sourceChain] ?? `Chain ${t.sourceChain}`}
                      {' → '}
                      {CHAIN_NAMES[t.destinationChain] ?? `Chain ${t.destinationChain}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.tags.map((tag) => (
                      <span key={tag} className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleUseTemplate(t)}
                  className="flex-shrink-0 px-3 py-1.5 bg-meridian-600 hover:bg-meridian-500 text-white text-xs rounded-lg font-semibold transition-colors"
                >
                  Use
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

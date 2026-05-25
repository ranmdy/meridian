'use client';

import { useState } from 'react';
import { useStrategyStore } from '@/src/stores/strategy';

export function SavedStrategies() {
  const { savedStrategies, loadStrategy, deleteSavedStrategy } = useStrategyStore();
  const [open, setOpen] = useState(false);

  if (savedStrategies.length === 0) return null;

  return (
    <div className="glass">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-800/30 transition-colors rounded-xl"
      >
        <span className="flex items-center gap-2 text-base font-semibold text-gray-100 tracking-tight">
          Saved Strategies
          <span className="text-xs bg-meridian-900 text-meridian-400 border border-meridian-800 px-1.5 py-0.5 rounded-full font-normal">
            {savedStrategies.length}
          </span>
        </span>
        <span className={`text-gray-500 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 divide-y divide-gray-800/60">
          {savedStrategies.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-800/20 transition-colors">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-200 truncate">{s.name}</div>
                <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
                  {s.sourceAsset} · Chain {s.sourceChain} → {s.destinationChain} · Risk {s.riskTolerance} · {new Date(s.savedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                <button
                  onClick={() => loadStrategy(s.id)}
                  className="text-xs text-meridian-400 hover:text-meridian-300 font-medium transition-colors"
                >
                  Load
                </button>
                <button
                  onClick={() => deleteSavedStrategy(s.id)}
                  className="text-xs text-gray-600 hover:text-red-400 transition-colors leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        <span>
          Saved Strategies{' '}
          <span className="ml-1 text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded-full">
            {savedStrategies.length}
          </span>
        </span>
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 divide-y divide-gray-800">
          {savedStrategies.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-200 truncate">{s.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {s.sourceAsset} on {s.sourceChain} → chain {s.destinationChain} ·
                  Risk {s.riskTolerance} ·{' '}
                  {new Date(s.savedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <button
                  onClick={() => loadStrategy(s.id)}
                  className="text-xs text-meridian-400 hover:text-meridian-300 transition-colors"
                >
                  Load
                </button>
                <button
                  onClick={() => deleteSavedStrategy(s.id)}
                  className="text-xs text-gray-600 hover:text-red-400 transition-colors"
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

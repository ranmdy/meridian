'use client';

import { useState } from 'react';
import type { PaletteItem } from './types';
import { PALETTE_ITEMS, KIND_COLORS, KIND_ICONS } from './palette';

interface NodePaletteProps {
  onDragStart: (event: React.DragEvent, item: PaletteItem) => void;
}

const KIND_ORDER = ['wallet', 'lend', 'bridge', 'swap', 'stake'] as const;

export function NodePalette({ onDragStart }: NodePaletteProps) {
  const [search, setSearch] = useState('');
  const [activeKind, setActiveKind] = useState<string | null>(null);

  const filtered = PALETTE_ITEMS.filter((item) => {
    const matchesSearch = search === '' ||
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.protocol.toLowerCase().includes(search.toLowerCase());
    const matchesKind = activeKind === null || item.kind === activeKind;
    return matchesSearch && matchesKind;
  });

  const grouped = KIND_ORDER.reduce<Record<string, PaletteItem[]>>((acc, kind) => {
    const items = filtered.filter((i) => i.kind === kind);
    if (items.length > 0) acc[kind] = items;
    return acc;
  }, {});

  return (
    <aside className="w-64 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Protocol Palette</h2>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-800 text-sm text-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-500"
        />
        <div className="flex flex-wrap gap-1 mt-2">
          <button
            onClick={() => setActiveKind(null)}
            className={`text-xs px-2 py-0.5 rounded-full transition-colors ${activeKind === null ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            All
          </button>
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              onClick={() => setActiveKind(activeKind === k ? null : k)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${activeKind === k ? 'text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
              style={activeKind === k ? { backgroundColor: KIND_COLORS[k] } : {}}
            >
              {KIND_ICONS[k]} {k}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {Object.entries(grouped).map(([kind, items]) => (
          <div key={kind}>
            <div
              className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1"
              style={{ color: KIND_COLORS[kind] }}
            >
              <span>{KIND_ICONS[kind]}</span> {kind}
            </div>
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={`${item.protocol}-${item.chain}-${item.asset}-${item.label}`}
                  draggable
                  onDragStart={(e) => onDragStart(e, item)}
                  className="bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing transition-colors select-none"
                >
                  <div className="text-sm text-white font-medium truncate">{item.label}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-gray-400">{item.chainName}</span>
                    {item.apyBps != null && item.apyBps > 0 && (
                      <>
                        <span className="text-gray-600">·</span>
                        <span className="text-xs" style={{ color: KIND_COLORS[kind] }}>
                          {(item.apyBps / 100).toFixed(2)}% APY
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {Object.keys(grouped).length === 0 && (
          <p className="text-xs text-gray-500 text-center mt-8">No protocols match your filter.</p>
        )}
      </div>

      <div className="p-3 border-t border-gray-800 text-xs text-gray-500">
        Drag nodes onto the canvas to build a strategy.
      </div>
    </aside>
  );
}

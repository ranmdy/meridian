'use client';

import type { Node, Edge } from '@xyflow/react';
import type { ComposerNodeData } from './types';

interface ComposerToolbarProps {
  nodes: Node[];
  edges: Edge[];
  onClear: () => void;
  onRunStrategy: () => void;
  isRunning: boolean;
}

export function ComposerToolbar({
  nodes,
  edges,
  onClear,
  onRunStrategy,
  isRunning,
}: ComposerToolbarProps) {
  const protocolNodes = nodes.filter((n) => {
    const d = n.data as unknown as ComposerNodeData;
    return d.kind !== 'wallet';
  });

  const hasWallet  = nodes.some((n) => (n.data as unknown as ComposerNodeData).kind === 'wallet');
  const hasEndNode = nodes.some((n) => {
    const d = n.data as unknown as ComposerNodeData;
    return d.kind === 'lend' || d.kind === 'stake';
  });
  const canRun = hasWallet && hasEndNode && edges.length > 0;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-800">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-bold text-white tracking-tight">Strategy Composer</h1>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>{nodes.length} nodes</span>
          <span>·</span>
          <span>{edges.length} edges</span>
          {protocolNodes.length > 0 && (
            <>
              <span>·</span>
              <span>{protocolNodes.length} steps</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!canRun && nodes.length > 0 && (
          <span className="text-xs text-amber-400">
            {!hasWallet
              ? 'Add a wallet node'
              : !hasEndNode
              ? 'Add a lend or stake endpoint'
              : 'Connect nodes with edges'}
          </span>
        )}

        <button
          onClick={onClear}
          disabled={nodes.length === 0}
          className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Clear
        </button>

        <button
          onClick={onRunStrategy}
          disabled={!canRun || isRunning}
          className="text-xs px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isRunning ? 'Optimizing…' : 'Run Strategy'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ComposerNodeData } from './types';
import { KIND_COLORS, KIND_ICONS } from './palette';

function ProtocolNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ComposerNodeData;
  const color = KIND_COLORS[nodeData.kind] ?? '#6b7280';
  const icon  = KIND_ICONS[nodeData.kind]  ?? '⬡';

  return (
    <div
      style={{ borderColor: color }}
      className={`
        relative min-w-[160px] rounded-xl border-2 bg-gray-900 shadow-lg
        transition-shadow
        ${selected ? 'shadow-[0_0_0_3px_rgba(99,102,241,0.5)]' : ''}
      `}
    >
      {/* Top handle (incoming connections) */}
      {nodeData.kind !== 'wallet' && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-gray-400 !border-gray-600"
        />
      )}

      {/* Node body */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg leading-none">{icon}</span>
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color }}
          >
            {nodeData.kind}
          </span>
        </div>

        <div className="text-sm font-semibold text-white truncate">{nodeData.label}</div>

        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-gray-400">{nodeData.chainName}</span>
          <span className="text-gray-600">·</span>
          <span className="text-xs text-gray-400">{nodeData.asset}</span>
        </div>

        {nodeData.apyBps != null && nodeData.apyBps > 0 && (
          <div
            className="mt-2 text-xs font-semibold rounded px-1.5 py-0.5 inline-block"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {(nodeData.apyBps / 100).toFixed(2)}% APY
          </div>
        )}
      </div>

      {/* Bottom handle (outgoing connections) */}
      {nodeData.kind !== 'lend' && nodeData.kind !== 'stake' && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-gray-400 !border-gray-600"
        />
      )}
    </div>
  );
}

export default memo(ProtocolNode);

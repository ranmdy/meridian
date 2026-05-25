'use client';

import type { Route } from '@/src/lib/api';

const CHAIN_NAMES: Record<number, string> = {
  1:      'Ethereum',
  8453:   'Base',
  42161:  'Arbitrum',
  56:     'BNB',
  137:    'Polygon',
  10:     'Optimism',
  43114:  'Avalanche',
  534352: 'Scroll',
  324:    'zkSync',
};

const STEP_ICONS: Record<string, string> = {
  SWAP: '↔',
  LEND: '🏦',
  BRIDGE: '🌉',
  STAKE: '📈',
  SETTLE: '✓',
};

const riskColor = (score: number) => {
  if (score < 30) return 'text-green-400';
  if (score < 60) return 'text-yellow-400';
  return 'text-red-400';
};

interface Props {
  route: Route;
  rank: number;
  selected: boolean;
  onSelect: () => void;
}

export function RouteCard({ route, rank, selected, onSelect }: Props) {
  const apyPct = (route.estimatedApyBps / 100).toFixed(2);
  const totalFees = route.totalGasUsd + route.totalBridgeFeeUsd + route.totalProtocolFeeUsd;
  const minutes = Math.round(route.estimatedTimeSeconds / 60);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left glass p-5 transition-all ${
        selected
          ? 'border-meridian-500 shadow-lg shadow-meridian-500/10'
          : 'hover:border-gray-600'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {rank === 1 && (
            <span className="text-xs bg-meridian-900 text-meridian-400 border border-meridian-700 px-2 py-0.5 rounded-full">
              Best
            </span>
          )}
          <span className="text-sm text-gray-400">Route #{rank}</span>
        </div>
        <span className="text-xl font-bold text-meridian-400">{apyPct}% APY</span>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-1 flex-wrap mb-4">
        {route.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1">
            <span
              className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 font-mono text-gray-300"
              title={`${step.protocol} on ${CHAIN_NAMES[step.fromChain] ?? step.fromChain}`}
            >
              {STEP_ICONS[step.stepType] ?? '·'} {step.fromAsset}
              {step.fromChain !== step.toChain && (
                <span className="text-gray-500">
                  {' '}→ {CHAIN_NAMES[step.toChain] ?? step.toChain}
                </span>
              )}
            </span>
            {i < route.steps.length - 1 && (
              <span className="text-gray-600 text-xs">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-xs text-gray-500 mb-1">Fees</div>
          <div className="text-sm font-medium text-gray-200">${totalFees.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Time</div>
          <div className="text-sm font-medium text-gray-200">~{minutes}m</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Risk</div>
          <div className={`text-sm font-medium ${riskColor(route.riskScore)}`}>
            {route.riskScore.toFixed(0)}/100
          </div>
        </div>
      </div>
    </button>
  );
}

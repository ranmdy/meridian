'use client';

import type { SimulationResult } from '@/src/lib/api';

const riskLabel = (score: number) => {
  if (score < 30) return { text: 'Low', cls: 'text-green-400 bg-green-950/30 border-green-800' };
  if (score < 60) return { text: 'Medium', cls: 'text-yellow-400 bg-yellow-950/30 border-yellow-800' };
  return { text: 'High', cls: 'text-red-400 bg-red-950/30 border-red-800' };
};

interface Props {
  simulation: SimulationResult;
  isLoading: boolean;
}

export function SimulationPanel({ simulation, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="glass p-4 flex items-center gap-3 text-sm text-gray-400">
        <span className="inline-block w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
        Running pre-execution simulation…
      </div>
    );
  }

  const risk = riskLabel(simulation.riskScore);
  const apyPct = (simulation.estimatedApyBps / 100).toFixed(2);

  return (
    <div className="glass p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">
          {simulation.available ? 'Simulation Results' : 'Estimated Results'}
        </span>
        {!simulation.available && (
          <span className="text-xs text-gray-500 italic">Tenderly not configured — optimistic estimates</span>
        )}
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-xs text-gray-500 mb-1">Est. APY</div>
          <div className="text-sm font-semibold text-meridian-400">{apyPct}%</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Total Gas</div>
          <div className="text-sm font-semibold text-gray-200">${simulation.totalGasUsd.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Risk Score</div>
          <span className={`text-sm font-semibold px-2 py-0.5 rounded border ${risk.cls}`}>
            {risk.text} · {simulation.riskScore}/100
          </span>
        </div>
      </div>

      {/* Step results */}
      {simulation.steps.length > 0 && (
        <div className="space-y-1">
          {simulation.steps.map((s) => (
            <div key={s.stepIndex} className="flex items-center gap-2 text-xs">
              <span className={s.passed ? 'text-green-400' : 'text-red-400'}>
                {s.passed ? '✓' : '✗'}
              </span>
              <span className="text-gray-400">Step {s.stepIndex + 1}</span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-500">${s.gasUsd.toFixed(3)} gas</span>
              {s.revertReason && (
                <span className="text-red-400 truncate max-w-[200px]" title={s.revertReason}>
                  {s.revertReason}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Exploit alerts */}
      {simulation.exploitAlerts.length > 0 && (
        <div className="bg-red-950/40 border border-red-900 rounded-lg p-3 space-y-1">
          <div className="text-xs font-semibold text-red-400">⚠ Exploit Alerts</div>
          {simulation.exploitAlerts.map((alert, i) => (
            <div key={i} className="text-xs text-red-300">{alert}</div>
          ))}
        </div>
      )}

      {/* All steps pass */}
      {simulation.allStepsPass && simulation.steps.length > 0 && (
        <div className="text-xs text-green-400 flex items-center gap-1">
          <span>✓</span>
          <span>All {simulation.steps.length} steps pass simulation</span>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useStrategyStore } from '@/src/stores/strategy';
import { useExecuteStrategy } from '@/src/hooks/useExecuteStrategy';
import { useSimulation } from '@/src/hooks/useSimulation';
import { RouteCard } from './RouteCard';
import { SimulationPanel } from './SimulationPanel';
import { RiskModal } from './RiskModal';

const STAGE_LABELS: Record<string, string> = {
  idle:               'Execute Selected Route',
  checking_allowance: 'Checking allowance…',
  approving:          'Confirm approval in wallet…',
  awaiting_approval:  'Waiting for approval tx…',
  executing:          'Confirm execution in wallet…',
  awaiting_execution: 'Waiting for confirmation…',
  success:            'Strategy submitted!',
  error:              'Execute Selected Route',
};

// Show risk modal for scores >= 40 so users always see the disclosure on meaningful risk
const RISK_MODAL_THRESHOLD = 40;

export function RouteList() {
  const router = useRouter();
  const { address } = useAccount();
  const { routes, selectedRouteIndex, selectRoute, quoteExpiresAt, sourceChain, mode, autoExplanation, autoAlternatives } = useStrategyStore();
  const {
    execute, stage, isApproving,
    isPending, isConfirming, isSuccess,
    strategyId, executionTxHash, error, reset,
  } = useExecuteStrategy();

  const [showRiskModal, setShowRiskModal] = useState(false);

  const { simulation, isLoading: simLoading } = useSimulation(
    selectedRouteIndex ?? 0,
    address,
    sourceChain ?? 1,
  );

  useEffect(() => {
    if (strategyId) router.push(`/execution/${strategyId}`);
  }, [strategyId, router]);

  // Reset risk modal when route selection changes
  useEffect(() => {
    setShowRiskModal(false);
  }, [selectedRouteIndex]);

  const handleExecuteClick = useCallback(() => {
    const riskScore = simulation?.riskScore ?? 0;
    if (riskScore >= RISK_MODAL_THRESHOLD) {
      setShowRiskModal(true);
    } else {
      execute();
    }
  }, [simulation, execute]);

  const handleRiskConfirm = useCallback(() => {
    setShowRiskModal(false);
    execute();
  }, [execute]);

  if (routes.length === 0) return null;

  const now = Math.floor(Date.now() / 1000);
  const isStale = quoteExpiresAt !== null && now > quoteExpiresAt;
  const isBusy = isPending || isConfirming;
  const showSim = !!address && (simLoading || !!simulation);

  return (
    <>
      {showRiskModal && simulation && (
        <RiskModal
          riskScore={simulation.riskScore}
          onConfirm={handleRiskConfirm}
          onCancel={() => setShowRiskModal(false)}
        />
      )}

      <div className="glass p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-100 tracking-tight">
            {routes.length} Route{routes.length !== 1 ? 's' : ''} Found
          </h2>
          {isStale && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-800 px-2 py-1 rounded-full">
                Quote expired
              </span>
              <button
                onClick={() => { void (document.querySelector('[data-optimize-btn]') as HTMLButtonElement | null)?.click(); }}
                className="text-xs text-meridian-400 underline hover:no-underline"
              >
                Re-optimize
              </button>
            </div>
          )}
        </div>

        {/* Auto-mode explanation */}
        {mode === 'auto' && autoExplanation && (
          <div className="text-sm text-meridian-300 bg-meridian-950/30 border border-meridian-800 rounded-lg px-4 py-3 flex items-start gap-2">
            <span className="shrink-0 mt-0.5">✦</span>
            <span>{autoExplanation}</span>
          </div>
        )}

        {routes.map((route, i) => (
          <RouteCard
            key={i}
            route={route}
            rank={i + 1}
            selected={selectedRouteIndex === i}
            onSelect={() => selectRoute(i)}
          />
        ))}

        {/* Auto-mode alternatives */}
        {mode === 'auto' && autoAlternatives.length > 0 && (
          <details className="text-xs text-gray-500 cursor-pointer">
            <summary className="hover:text-gray-400 transition-colors py-1">
              {autoAlternatives.length} alternative route{autoAlternatives.length !== 1 ? 's' : ''} considered
            </summary>
            <div className="mt-2 space-y-2 pl-2 border-l border-gray-800">
              {autoAlternatives.map((alt, i) => (
                <div key={i} className="text-gray-600">
                  Alt {i + 1}: {(alt.estimatedApyBps / 100).toFixed(2)}% APY · risk {alt.riskScore}/100
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Simulation results */}
        {showSim && (
          <SimulationPanel
            simulation={simulation ?? {
              available: false,
              allStepsPass: false,
              steps: [],
              totalGasUsd: 0,
              estimatedApyBps: 0,
              riskScore: 0,
              exploitAlerts: [],
              simulatedAt: 0,
            }}
            isLoading={simLoading}
          />
        )}

        {/* Approval progress */}
        {isApproving && (
          <div className="text-xs text-blue-300 bg-blue-950/40 border border-blue-900 rounded-lg p-3 flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Approving {useStrategyStore.getState().sourceAsset} spend for Meridian Router…
          </div>
        )}

        {/* Execution tx hash */}
        {executionTxHash && !strategyId && (
          <div className="text-xs text-gray-400 font-mono break-all bg-gray-900 border border-gray-800 rounded-lg p-3">
            TX submitted: <span className="text-meridian-400">{executionTxHash}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg p-3">
            {error.includes('shortMessage')
              ? error
              : error.slice(0, 200)}
            <button onClick={reset} className="ml-2 underline hover:no-underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Execute button with staged label */}
        <button
          onClick={handleExecuteClick}
          disabled={isBusy || isStale || isSuccess}
          className="w-full bg-meridian-600 hover:bg-meridian-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold text-sm transition-colors mt-2 flex items-center justify-center gap-2"
        >
          {isBusy && (
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {STAGE_LABELS[stage] ?? 'Execute Selected Route'}
        </button>

        <p className="text-xs text-gray-600 text-center">
          ⚠ You are interacting with 3rd party DeFi protocols. Meridian is non-custodial. Funds are not insured.
        </p>
      </div>
    </>
  );
}

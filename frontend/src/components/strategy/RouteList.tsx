'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStrategyStore } from '@/src/stores/strategy';
import { useExecuteStrategy } from '@/src/hooks/useExecuteStrategy';
import { RouteCard } from './RouteCard';

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

export function RouteList() {
  const router = useRouter();
  const { routes, selectedRouteIndex, selectRoute, quoteExpiresAt } = useStrategyStore();
  const {
    execute, stage, isApproving, isExecuting,
    isPending, isConfirming, isSuccess,
    strategyId, executionTxHash, error, reset,
  } = useExecuteStrategy();

  useEffect(() => {
    if (strategyId) router.push(`/execution/${strategyId}`);
  }, [strategyId, router]);

  if (routes.length === 0) return null;

  const now = Math.floor(Date.now() / 1000);
  const isStale = quoteExpiresAt !== null && now > quoteExpiresAt;
  const isBusy = isPending || isConfirming;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-100">
          {routes.length} Route{routes.length !== 1 ? 's' : ''} Found
        </h2>
        {isStale && (
          <span className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-800 px-2 py-1 rounded-full">
            Quote expired — re-optimize for fresh prices
          </span>
        )}
      </div>

      {routes.map((route, i) => (
        <RouteCard
          key={i}
          route={route}
          rank={i + 1}
          selected={selectedRouteIndex === i}
          onSelect={() => selectRoute(i)}
        />
      ))}

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
        onClick={execute}
        disabled={isBusy || isStale || isSuccess}
        className="w-full bg-meridian-600 hover:bg-meridian-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-colors mt-2 flex items-center justify-center gap-2"
      >
        {isBusy && (
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        {STAGE_LABELS[stage] ?? 'Execute Selected Route'}
      </button>

      <p className="text-xs text-gray-500 text-center">
        ⚠ You are interacting with 3rd party DeFi protocols. Meridian is non-custodial.
        Funds are not insured.
      </p>
    </div>
  );
}

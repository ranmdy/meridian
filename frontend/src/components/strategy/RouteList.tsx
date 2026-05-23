'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStrategyStore } from '@/src/stores/strategy';
import { useExecuteStrategy } from '@/src/hooks/useExecuteStrategy';
import { RouteCard } from './RouteCard';

export function RouteList() {
  const router = useRouter();
  const { routes, selectedRouteIndex, selectRoute, quoteExpiresAt } = useStrategyStore();
  const { execute, isPending, isConfirming, isSuccess, strategyId, txHash, error, reset } =
    useExecuteStrategy();

  // Navigate to the live tracker as soon as we have a strategyId from the event log
  useEffect(() => {
    if (strategyId) {
      router.push(`/execution/${strategyId}`);
    }
  }, [strategyId, router]);

  if (routes.length === 0) return null;

  const now = Math.floor(Date.now() / 1000);
  const isStale = quoteExpiresAt !== null && now > quoteExpiresAt;
  const isBusy = isPending || isConfirming;

  const buttonLabel = () => {
    if (isPending) return 'Confirm in wallet…';
    if (isConfirming) return 'Waiting for confirmation…';
    if (isSuccess && !strategyId) return 'Parsing result…';
    return 'Execute Selected Route';
  };

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

      {txHash && !strategyId && (
        <div className="text-xs text-gray-400 font-mono break-all bg-gray-900 border border-gray-800 rounded-lg p-3">
          TX submitted:{' '}
          <span className="text-meridian-400">{txHash}</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg p-3">
          {(error as { shortMessage?: string }).shortMessage ?? error.message}
          <button
            onClick={reset}
            className="ml-2 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <button
        onClick={execute}
        disabled={isBusy || isStale}
        className="w-full bg-meridian-600 hover:bg-meridian-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-colors mt-2"
      >
        {buttonLabel()}
      </button>

      <p className="text-xs text-gray-500 text-center">
        ⚠ You are interacting with 3rd party DeFi protocols. Meridian is non-custodial.
        Funds are not insured.
      </p>
    </div>
  );
}

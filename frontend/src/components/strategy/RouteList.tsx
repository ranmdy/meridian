'use client';

import { useStrategyStore } from '@/src/stores/strategy';
import { RouteCard } from './RouteCard';

export function RouteList() {
  const { routes, selectedRouteIndex, selectRoute, quoteExpiresAt } = useStrategyStore();

  if (routes.length === 0) return null;

  const now = Math.floor(Date.now() / 1000);
  const isStale = quoteExpiresAt !== null && now > quoteExpiresAt;

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

      {routes.length > 0 && (
        <button className="w-full bg-meridian-600 hover:bg-meridian-500 text-white py-3 rounded-lg font-medium transition-colors mt-2">
          Execute Selected Route
        </button>
      )}

      <p className="text-xs text-gray-500 text-center">
        ⚠ You are interacting with 3rd party DeFi protocols. Meridian is non-custodial.
        Funds are not insured.
      </p>
    </div>
  );
}

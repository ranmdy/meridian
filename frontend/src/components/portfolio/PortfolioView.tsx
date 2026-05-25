'use client';

import { useAccount } from 'wagmi';
import { usePortfolio } from '@/src/hooks/usePortfolio';
import { useSolanaPortfolio } from '@/src/hooks/useSolanaPortfolio';
import { usePriceFeed } from '@/src/hooks/usePriceFeed';
import type { Address } from 'viem';

const ASSET_COLORS: Record<string, string> = {
  ETH:  'text-blue-400',
  USDC: 'text-green-400',
  USDT: 'text-emerald-400',
  WBTC: 'text-orange-400',
  SOL:  'text-purple-400',
};

export function PortfolioView() {
  const { address, isConnected } = useAccount();
  const livePrices = usePriceFeed();
  const evm = usePortfolio(address as Address | undefined, livePrices);
  const sol = useSolanaPortfolio(livePrices);

  // Merge EVM + Solana assets
  const assets       = [...evm.assets, ...sol.assets].sort((a, b) => b.valueUsd - a.valueUsd);
  const totalValueUsd = evm.totalValueUsd + sol.totalValueUsd;
  const isLoading    = evm.isLoading || sol.isLoading;
  const error        = evm.error ?? sol.error;

  if (!isConnected) {
    return (
      <div className="glass p-8 text-center text-gray-500">
        Connect your wallet to view your portfolio.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="glass p-8 space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="inline-block w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
          Loading balances across all chains…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass p-6 text-sm text-red-400">
        Error loading portfolio: {error}
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="glass p-8 text-center text-gray-500">
        No assets found across supported chains.
        <br />
        <span className="text-xs mt-1 block">Ethereum, Arbitrum, Base, Polygon, BNB, Optimism, Avalanche, Scroll, zkSync, Solana</span>
      </div>
    );
  }

  // Group by chain
  const byChain = assets.reduce<Record<string, typeof assets>>((acc, a) => {
    const key = `${a.chainId}:${a.chainName}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Total value */}
      <div className="glass p-5">
        <div className="text-xs text-gray-500 mb-1">Total Portfolio Value</div>
        <div className="text-3xl font-bold text-gray-100">
          ${totalValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {assets.length} asset{assets.length !== 1 ? 's' : ''} across {Object.keys(byChain).length} chain{Object.keys(byChain).length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Allocation bar */}
      {totalValueUsd > 0 && (
        <div className="glass p-4">
          <div className="text-xs text-gray-500 mb-3">Allocation</div>
          <div className="h-3 rounded-full overflow-hidden flex">
            {assets.filter(a => a.valueUsd > 0).map((a, i) => (
              <div
                key={`${a.chainId}-${a.symbol}`}
                style={{ width: `${(a.valueUsd / totalValueUsd) * 100}%` }}
                className={`h-full ${i % 4 === 0 ? 'bg-meridian-500' : i % 4 === 1 ? 'bg-blue-500' : i % 4 === 2 ? 'bg-green-500' : 'bg-orange-500'}`}
                title={`${a.symbol} on ${a.chainName}: $${a.valueUsd.toFixed(2)}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {assets.slice(0, 6).map((a) => (
              <div key={`${a.chainId}-${a.symbol}`} className="flex items-center gap-1 text-xs text-gray-400">
                <span className={ASSET_COLORS[a.symbol] ?? 'text-gray-400'}>●</span>
                <span>{a.symbol} ({a.chainName})</span>
                <span className="text-gray-600">
                  {((a.valueUsd / totalValueUsd) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assets by chain */}
      {Object.entries(byChain).map(([chainKey, chainAssets]) => {
        const chainName = chainKey.split(':')[1];
        const chainTotal = chainAssets.reduce((s, a) => s + a.valueUsd, 0);

        return (
          <div key={chainKey} className="glass">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <span className="text-sm font-medium text-gray-300">{chainName}</span>
              <span className="text-sm text-gray-400">
                ${chainTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="divide-y divide-gray-800">
              {chainAssets.map((asset) => (
                <div key={`${asset.chainId}-${asset.symbol}`} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-lg ${ASSET_COLORS[asset.symbol] ?? 'text-gray-400'}`}>●</span>
                    <div>
                      <div className="text-sm font-medium text-gray-200">{asset.symbol}</div>
                      <div className="text-xs text-gray-500 font-mono">
                        {parseFloat(asset.balance).toFixed(asset.symbol === 'WBTC' ? 6 : asset.symbol === 'ETH' ? 4 : 2)}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-gray-300">
                    ${asset.valueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

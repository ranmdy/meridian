'use client';

import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import type { Address } from 'viem';
import { useStrategyStore } from '@/src/stores/strategy';
import { usePortfolio } from '@/src/hooks/usePortfolio';
import { api } from '@/src/lib/api';

const CHAINS = [
  { id: 1,      name: 'Ethereum' },
  { id: 8453,   name: 'Base' },
  { id: 42161,  name: 'Arbitrum' },
  { id: 56,     name: 'BNB Chain' },
  { id: 137,    name: 'Polygon' },
  { id: 10,     name: 'Optimism' },
  { id: 43114,  name: 'Avalanche' },
  { id: 534352, name: 'Scroll' },
  { id: 324,    name: 'zkSync Era' },
];

const ASSETS = ['ETH', 'USDC', 'USDT', 'WBTC'];

const RISK_LABELS: Record<number, string> = {
  1: 'Conservative',
  2: 'Low',
  3: 'Moderate',
  4: 'High',
  5: 'Aggressive',
};

export function StrategyForm() {
  const { isConnected, address } = useAccount();
  const { signMessage } = useSignMessage();
  const [verifying, setVerifying] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const {
    sourceAsset, setSourceAsset,
    sourceChain, setSourceChain,
    sourceAmountUsd, setSourceAmountUsd,
    destinationChain, setDestinationChain,
    riskTolerance, setRiskTolerance,
    timeHorizonDays, setTimeHorizonDays,
    destinationWallet, setDestinationWallet,
    destinationVerified, setDestinationVerified,
    isOptimizing, setOptimizing,
    optimizeError, setOptimizeError,
    mode, setMode,
    setRoutes, setAutoResult,
    toRequest, saveStrategy,
  } = useStrategyStore();

  // Step 1 & 2: auto-detect assets from the connected wallet
  const portfolio = usePortfolio(address as Address | undefined);
  const detectedAssets = portfolio.assets.filter((a) => a.valueUsd > 1); // ignore dust

  const canOptimize =
    isConnected &&
    destinationVerified &&
    sourceAmountUsd > 0 &&
    sourceChain !== destinationChain;

  const handleVerifyDestination = async () => {
    if (!destinationWallet || destinationWallet.length < 42) return;
    setVerifying(true);
    try {
      const message =
        `Meridian destination verification\n` +
        `I confirm this wallet is mine: ${destinationWallet}`;

      signMessage(
        { message },
        {
          onSuccess: (sig) => {
            setDestinationVerified(true, sig);
            setVerifying(false);
          },
          onError: () => {
            setVerifying(false);
          },
        },
      );
    } catch {
      setVerifying(false);
    }
  };

  const handleOptimize = async () => {
    if (!canOptimize) return;
    setOptimizing(true);
    setOptimizeError(null);
    try {
      if (mode === 'auto') {
        const result = await api.strategy.autoOptimize(toRequest());
        setAutoResult(result.route, result.explanation, result.alternatives, result.quoteExpiresAt);
      } else {
        const result = await api.strategy.optimize(toRequest());
        setRoutes(result.routes, result.quoteExpiresAt);
      }
    } catch (err) {
      setOptimizeError(err instanceof Error ? err.message : 'Failed to fetch routes');
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className="glass p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-100 tracking-tight">Build Your Strategy</h2>

        {/* Auto Mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Auto Mode</span>
          <button
            onClick={() => setMode(mode === 'auto' ? 'manual' : 'auto')}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              mode === 'auto' ? 'bg-meridian-600' : 'bg-gray-700'
            }`}
            title="Auto Mode picks the single best route for your risk tolerance"
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                mode === 'auto' ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {mode === 'auto' && (
        <div className="text-xs text-meridian-400 bg-meridian-950/30 border border-meridian-800 rounded-lg px-3 py-2">
          Auto Mode will select the single best route for your risk tolerance and explain why.
        </div>
      )}

      {/* Step 1: detected assets banner */}
      {isConnected && detectedAssets.length > 0 && (
        <div className="rounded-lg bg-meridian-950/30 border border-meridian-800 px-3 py-2">
          <p className="text-xs text-meridian-400 mb-1.5 font-medium">Detected in your wallet:</p>
          <div className="flex flex-wrap gap-2">
            {detectedAssets.slice(0, 6).map((a) => (
              <button
                key={`${a.chainId}-${a.symbol}`}
                onClick={() => {
                  setSourceAsset(a.symbol);
                  setSourceChain(a.chainId);
                  // Convert balance to USD amount using valueUsd
                  setSourceAmountUsd(Math.floor(a.valueUsd));
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors ${
                  sourceAsset === a.symbol && sourceChain === a.chainId
                    ? 'bg-meridian-700 border-meridian-600 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-meridian-600'
                }`}
              >
                <span className="font-medium">{a.symbol}</span>
                <span className="text-gray-500">·</span>
                <span className="text-gray-400">{a.chainName}</span>
                <span className="text-gray-500">·</span>
                <span className="font-mono">${a.valueUsd.toFixed(0)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Source */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Source Asset</label>
          <select
            value={sourceAsset}
            onChange={(e) => setSourceAsset(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-meridian-500 focus:ring-1 focus:ring-meridian-500/30"
          >
            {ASSETS.map((a) => {
              const detected = detectedAssets.find((d) => d.symbol === a && d.chainId === sourceChain);
              return (
                <option key={a} value={a}>
                  {a}{detected ? ` (${parseFloat(detected.balance).toFixed(4)} ≈ $${detected.valueUsd.toFixed(0)})` : ''}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Source Chain</label>
          <select
            value={sourceChain}
            onChange={(e) => setSourceChain(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-meridian-500 focus:ring-1 focus:ring-meridian-500/30"
          >
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Amount (USD)</label>
        <input
          type="number"
          min="0"
          step="100"
          value={sourceAmountUsd || ''}
          onChange={(e) => setSourceAmountUsd(Number(e.target.value))}
          placeholder="e.g. 8250"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-meridian-500"
        />
      </div>

      {/* Destination chain */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Destination Chain</label>
        <select
          value={destinationChain}
          onChange={(e) => setDestinationChain(Number(e.target.value))}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-meridian-500 focus:ring-1 focus:ring-meridian-500/30"
        >
          {CHAINS.filter((c) => c.id !== sourceChain).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="h-px bg-gray-800" />

      {/* Destination wallet verification */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs text-gray-400">
            Destination Wallet{' '}
            <span className="text-yellow-500">(must be yours — verified by signature)</span>
          </label>
          {address && (
            <button
              onClick={() => setDestinationWallet(address)}
              className="text-xs text-meridian-400 hover:text-meridian-300 transition-colors"
            >
              Use my wallet
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={destinationWallet}
            onChange={(e) => setDestinationWallet(e.target.value)}
            placeholder="0x..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 font-mono focus:outline-none focus:border-meridian-500 focus:ring-1 focus:ring-meridian-500/30"
          />
          <button
            onClick={handleVerifyDestination}
            disabled={!destinationWallet || verifying || destinationVerified}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              destinationVerified
                ? 'bg-green-900 text-green-400 border border-green-800'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-40'
            }`}
          >
            {destinationVerified ? '✓ Verified' : verifying ? 'Signing…' : 'Verify'}
          </button>
        </div>
      </div>

      <div className="h-px bg-gray-800" />

      {/* Risk + time horizon */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Risk Tolerance — <span className="text-gray-300">{RISK_LABELS[riskTolerance]}</span>
          </label>
          <input
            type="range"
            min={1}
            max={5}
            value={riskTolerance}
            onChange={(e) => setRiskTolerance(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
            className="w-full accent-meridian-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Time Horizon (days)</label>
          <input
            type="number"
            min={1}
            max={3650}
            value={timeHorizonDays}
            onChange={(e) => setTimeHorizonDays(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-meridian-500 focus:ring-1 focus:ring-meridian-500/30"
          />
        </div>
      </div>

      {optimizeError && (
        <p className="text-red-400 text-sm">{optimizeError}</p>
      )}

      <button
        onClick={handleOptimize}
        disabled={!canOptimize || isOptimizing}
        data-optimize-btn
        className="w-full bg-meridian-600 hover:bg-meridian-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition-colors text-sm"
      >
        {isOptimizing
          ? mode === 'auto' ? 'Auto-selecting best route…' : 'Finding best routes…'
          : mode === 'auto' ? 'Auto-Optimize' : 'Find Best Routes'}
      </button>

      {!isConnected && (
        <p className="text-center text-xs text-gray-500">Connect your wallet to continue</p>
      )}
      {isConnected && !destinationVerified && (
        <p className="text-center text-xs text-gray-500">
          Verify your destination wallet to enable routing
        </p>
      )}

      {/* Save strategy */}
      <div className="border-t border-gray-800 pt-4">
        {!showSaveInput ? (
          <button
            onClick={() => setShowSaveInput(true)}
            className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            + Save this configuration as a template
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Strategy name…"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-meridian-500"
            />
            <button
              onClick={() => {
                if (saveName.trim()) {
                  saveStrategy(saveName.trim());
                  setSaveName('');
                  setShowSaveInput(false);
                }
              }}
              disabled={!saveName.trim()}
              className="px-3 py-1.5 bg-meridian-700 hover:bg-meridian-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => { setSaveName(''); setShowSaveInput(false); }}
              className="px-3 py-1.5 text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

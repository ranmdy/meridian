'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { useStrategyStore } from '@/src/stores/strategy';
import type { ExecutionStatus } from '@/src/lib/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const EXPLORER_URLS: Record<number, string> = {
  1:        'https://etherscan.io/tx/',
  8453:     'https://basescan.org/tx/',
  42161:    'https://arbiscan.io/tx/',
  56:       'https://bscscan.com/tx/',
  137:      'https://polygonscan.com/tx/',
  10:       'https://optimistic.etherscan.io/tx/',
  43114:    'https://snowtrace.io/tx/',
  534352:   'https://scrollscan.com/tx/',
  324:      'https://explorer.zksync.io/tx/',
  11155111: 'https://sepolia.etherscan.io/tx/',
  84532:    'https://sepolia.basescan.org/tx/',
};

interface Props {
  status: ExecutionStatus;
  executionId: string;
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function SettlementScreen({ status, executionId }: Props) {
  const { reset: resetStrategy, destinationWallet, sourceAsset, destinationChain } = useStrategyStore();

  // Find the last completed step for tx hash / chain context
  const lastDoneStep = [...status.steps].reverse().find((s) => s.status === 'done');
  const txHash = lastDoneStep?.txHash;
  const stepChain = lastDoneStep?.chain ?? destinationChain;
  const explorerBase = EXPLORER_URLS[stepChain];

  const handleShare = useCallback(() => {
    const text = encodeURIComponent(
      `Just routed my ${sourceAsset} to ${destinationWallet ? truncate(destinationWallet) : 'my wallet'} using @MeridianDeFi — fully autonomous cross-chain DeFi strategy execution. Try it ↓`,
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener,noreferrer');
  }, [sourceAsset, destinationWallet]);

  const downloadReport = useCallback(async (format: 'csv' | 'json' | 'text') => {
    const url = `${BASE_URL}/executions/${executionId}/report?format=${format}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return;

    const contentDisposition = res.headers.get('content-disposition') ?? '';
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
    const filename = filenameMatch?.[1] ?? `meridian-${executionId}.${format}`;

    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [executionId]);

  return (
    <div className="space-y-6">
      {/* Success banner */}
      <div className="rounded-2xl bg-green-950/40 border border-green-900 p-6 text-center">
        <div className="flex items-center justify-center mb-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-950/60 text-green-400 text-2xl font-bold">
            ✓
          </span>
        </div>
        <h2 className="text-xl font-bold text-green-400 mb-1">Strategy Complete</h2>
        <p className="text-sm text-gray-400">
          Assets delivered to destination wallet.
        </p>
        {destinationWallet && (
          <p className="mt-2 font-mono text-xs text-gray-500 break-all">
            {destinationWallet}
          </p>
        )}
      </div>

      {/* Step summary */}
      {status.steps.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <div className="text-xs text-gray-500 mb-3 uppercase tracking-widest">Completed Steps</div>
          <div className="space-y-2">
            {status.steps.map((step) => (
              <div key={step.index} className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Step {step.index + 1}</span>
                <div className="flex items-center gap-3">
                  {step.txHash && explorerBase && (
                    <a
                      href={`${EXPLORER_URLS[step.chain ?? stepChain] ?? explorerBase}${step.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 font-mono"
                    >
                      {step.txHash.slice(0, 10)}…
                    </a>
                  )}
                  <span className="text-green-400 text-xs">✓</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View on explorer */}
      {txHash && explorerBase && (
        <a
          href={`${explorerBase}${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center py-2.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-100 hover:border-gray-600 transition-colors"
        >
          View final transaction on explorer →
        </a>
      )}

      {/* Download report */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
        <div className="text-xs text-gray-500 mb-3 uppercase tracking-widest">Download Report</div>
        <div className="grid grid-cols-3 gap-2">
          {(['csv', 'json', 'text'] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => void downloadReport(fmt)}
              className="py-2 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-100 hover:border-gray-600 uppercase tracking-widest transition-colors"
            >
              {fmt === 'text' ? 'PDF' : fmt.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-2 text-center">
          Compatible with Koinly, CoinTracker, TaxBit, Coinpanda
        </p>
      </div>

      {/* Twitter share */}
      <button
        onClick={handleShare}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-sky-800/60 text-sky-400 hover:bg-sky-950/40 text-sm font-medium transition-colors"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
        </svg>
        Share on X (Twitter)
      </button>

      {/* Run another */}
      <Link
        href="/"
        onClick={resetStrategy}
        className="block w-full text-center py-3 rounded-xl bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-300 hover:text-gray-100 text-sm font-medium transition-colors"
      >
        Run another strategy →
      </Link>

      <p className="text-xs text-gray-600 text-center">
        Execution ID: <span className="font-mono">{executionId}</span>
      </p>
    </div>
  );
}

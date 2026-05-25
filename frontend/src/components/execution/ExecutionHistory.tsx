'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useExecutionStore } from '@/src/stores/execution';
import { api } from '@/src/lib/api';
import type { ExecutionStatus } from '@/src/lib/api';

const STATUS_COLORS: Record<string, string> = {
  pending:          'text-yellow-400',
  in_progress:      'text-blue-400',
  completed:        'text-emerald-400',
  failed:           'text-red-400',
  emergency_exited: 'text-orange-400',
};

const STATUS_LABELS: Record<string, string> = {
  pending:          'Pending',
  in_progress:      'In Progress',
  completed:        'Completed',
  failed:           'Failed',
  emergency_exited: 'Emergency Exit',
};

function relativeTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function ExecutionHistory() {
  const { address } = useAccount();
  const { history: localHistory } = useExecutionStore();
  const [serverHistory, setServerHistory] = useState<ExecutionStatus[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    api.user.executions(address)
      .then((res) => setServerHistory(res.executions))
      .catch(() => setServerHistory(null))
      .finally(() => setLoading(false));
  }, [address]);

  // Prefer server history; fall back to localStorage
  const executions = serverHistory ?? localHistory;

  if (!address) {
    return (
      <div className="glass p-6 text-center text-sm text-gray-500">
        Connect your wallet to see execution history.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass p-6 text-sm text-gray-500 flex items-center gap-2">
        <span className="inline-block w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
        Loading execution history…
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="glass p-6 text-center text-sm text-gray-500">
        No executions yet.{' '}
        <Link href="/" className="text-meridian-400 hover:underline">
          Run your first strategy
        </Link>
      </div>
    );
  }

  return (
    <div className="glass divide-y divide-gray-800">
      {executions.map((exec) => (
        <Link
          key={exec.executionId}
          href={`/execution/${exec.executionId}`}
          className="flex items-center justify-between px-5 py-4 hover:bg-gray-800/30 transition-colors group"
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-200 truncate font-mono">
              {exec.executionId.slice(0, 18)}…
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className={`text-xs font-medium ${STATUS_COLORS[exec.status] ?? 'text-gray-400'}`}>
                {STATUS_LABELS[exec.status] ?? exec.status}
              </span>
              <span className="text-xs text-gray-600">
                {exec.currentStep}/{exec.totalSteps} steps
              </span>
              {exec.elapsedSeconds !== undefined && (
                <span className="text-xs text-gray-600">
                  {relativeTime(exec.elapsedSeconds)}
                </span>
              )}
            </div>
          </div>
          <span className="text-gray-600 group-hover:text-gray-400 transition-colors text-sm ml-4 flex-shrink-0">
            →
          </span>
        </Link>
      ))}
    </div>
  );
}

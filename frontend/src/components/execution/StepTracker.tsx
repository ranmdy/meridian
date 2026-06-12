'use client';

import type { ExecutionStatus, StepStatus } from '@/src/lib/api';

const EXPLORER: Record<number, string> = {
  1: 'https://etherscan.io/tx/', 8453: 'https://basescan.org/tx/',
  42161: 'https://arbiscan.io/tx/', 56: 'https://bscscan.com/tx/',
  137: 'https://polygonscan.com/tx/', 10: 'https://optimistic.etherscan.io/tx/',
  43114: 'https://snowtrace.io/tx/', 534352: 'https://scrollscan.com/tx/',
  324: 'https://explorer.zksync.io/tx/',
  11155111: 'https://sepolia.etherscan.io/tx/',
  84532: 'https://sepolia.basescan.org/tx/',
};

interface StepTrackerProps {
  status: ExecutionStatus;
}


function StatusIcon({ status }: { status: StepStatus['status'] }) {
  if (status === 'done') {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20 text-green-400 text-sm font-bold">
        ✓
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20">
        <span className="h-3 w-3 rounded-full bg-blue-400 animate-pulse" />
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20 text-red-400 text-sm font-bold">
        ✕
      </span>
    );
  }
  // pending
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 text-gray-600 text-xs">
      {' '}
    </span>
  );
}

function truncateTxHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function StepTracker({ status }: StepTrackerProps) {
  const overallDone = status.status === 'completed';
  const overallFailed = status.status === 'failed' || status.status === 'emergency_exited';

  return (
    <div className="space-y-4">
      {/* Overall status banner */}
      <div
        className={`rounded-xl px-4 py-3 text-sm font-medium ${
          overallDone
            ? 'bg-green-950/40 text-green-400 border border-green-900'
            : overallFailed
            ? 'bg-red-950/40 text-red-400 border border-red-900'
            : 'bg-blue-950/40 text-blue-400 border border-blue-900'
        }`}
      >
        {overallDone && 'Strategy complete — assets delivered to destination wallet.'}
        {overallFailed &&
          (status.status === 'emergency_exited'
            ? 'Emergency exit triggered — assets returned to source wallet.'
            : 'Strategy failed. See step details below.')}
        {!overallDone && !overallFailed && (
          <>
            Step {status.currentStep + 1} of {status.totalSteps} in progress
            {status.elapsedSeconds !== undefined && (
              <span className="text-gray-500 ml-2">
                ({Math.floor(status.elapsedSeconds / 60)}m {status.elapsedSeconds % 60}s elapsed)
              </span>
            )}
          </>
        )}
      </div>

      {/* Step list */}
      <ol className="relative space-y-0">
        {status.steps.map((step, i) => {
          const isLast = i === status.steps.length - 1;
          return (
            <li key={step.index} className="flex gap-4">
              {/* Left: icon + connector line */}
              <div className="flex flex-col items-center">
                <StatusIcon status={step.status} />
                {!isLast && (
                  <div
                    className={`w-px flex-1 my-1 ${
                      step.status === 'done' ? 'bg-green-900' : 'bg-gray-800'
                    }`}
                  />
                )}
              </div>

              {/* Right: step details */}
              <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
                <p
                  className={`text-sm font-medium ${
                    step.status === 'done'
                      ? 'text-gray-100'
                      : step.status === 'in_progress'
                      ? 'text-blue-300'
                      : step.status === 'failed'
                      ? 'text-red-300'
                      : 'text-gray-600'
                  }`}
                >
                  Step {step.index + 1}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                  {step.txHash && (
                    <a
                      href={`${EXPLORER[step.chain ?? 1] ?? EXPLORER[1]}${step.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 font-mono"
                    >
                      {truncateTxHash(step.txHash)}
                    </a>
                  )}
                  {step.completedAt && (
                    <span className="text-xs text-gray-500">
                      {new Date(step.completedAt * 1000).toLocaleTimeString()}
                    </span>
                  )}
                  {step.estimatedCompletionAt && step.status === 'in_progress' && (
                    <span className="text-xs text-gray-500">
                      ETA {new Date(step.estimatedCompletionAt * 1000).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

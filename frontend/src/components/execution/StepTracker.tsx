'use client';

import type { ExecutionStatus, StepStatus } from '@/src/lib/api';

interface StepTrackerProps {
  status: ExecutionStatus;
}

const STEP_TYPE_LABELS: Record<string, string> = {
  SWAP: 'Swap',
  LEND: 'Lend',
  BRIDGE: 'Bridge',
  STAKE: 'Stake',
  SETTLE: 'Settle',
};

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
    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/30 text-xs">
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
            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
            : overallFailed
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
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
              <span className="text-white/40 ml-2">
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
                      step.status === 'done' ? 'bg-green-500/40' : 'bg-white/10'
                    }`}
                  />
                )}
              </div>

              {/* Right: step details */}
              <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
                <p
                  className={`text-sm font-medium ${
                    step.status === 'done'
                      ? 'text-white'
                      : step.status === 'in_progress'
                      ? 'text-blue-300'
                      : step.status === 'failed'
                      ? 'text-red-300'
                      : 'text-white/30'
                  }`}
                >
                  Step {step.index + 1}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                  {step.txHash && (
                    <a
                      href={`https://etherscan.io/tx/${step.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 font-mono"
                    >
                      {truncateTxHash(step.txHash)}
                    </a>
                  )}
                  {step.completedAt && (
                    <span className="text-xs text-white/40">
                      {new Date(step.completedAt * 1000).toLocaleTimeString()}
                    </span>
                  )}
                  {step.estimatedCompletionAt && step.status === 'in_progress' && (
                    <span className="text-xs text-white/40">
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

/**
 * Execution Registry
 *
 * In-memory store of active and recently-completed strategy executions.
 * Translates relayer job state into the ExecutionStatus shape consumed by
 * the frontend's ExecutionPoller and GET /strategy/:id/status endpoint.
 *
 * Postgres persistence: every state change is fire-and-forget written to the
 * `executions` and `execution_steps` tables via execution-store.ts. The
 * in-memory map stays authoritative for live queries so DB latency never
 * blocks API responses.
 *
 * Lifecycle:
 *   1. POST /strategy/execute → register()
 *   2. Relayer emits status updates → updateStep() / complete() / fail()
 *   3. GET /strategy/:id/status → getStatus()
 *   4. GET /user/executions → listByWallet()
 */
import {
  insertExecution,
  insertExecutionSteps,
  updateExecutionStatus,
  updateExecutionStep,
} from '../../db/execution-store.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type OverallStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'emergency_exited';

export type StepStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface ExecutionStep {
  index: number;
  status: StepStatus;
  txHash?: string;
  chain?: number;
  completedAt?: number;
  estimatedCompletionAt?: number;
}

export interface Execution {
  strategyId: string;
  executionId: string;       // same as strategyId for now; can be a UUID later
  walletAddress: string;
  sourceAsset: string;
  sourceChain: number;
  destinationChain: number;
  sourceAmountUsd: number;
  status: OverallStatus;
  currentStep: number;
  totalSteps: number;
  steps: ExecutionStep[];
  startedAt: number;         // Unix seconds
  completedAt?: number;
  elapsedSeconds?: number;
  errorMessage?: string;
}

export interface ExecutionStatusResponse {
  executionId: string;
  strategyId?: string;
  status: OverallStatus;
  currentStep: number;
  totalSteps: number;
  steps: ExecutionStep[];
  elapsedSeconds?: number;
  errorMessage?: string;
}

// ─── Registry ──────────────────────────────────────────────────────────────────

class ExecutionRegistry {
  // Map strategyId → Execution
  private executions = new Map<string, Execution>();
  // Map walletAddress → strategyId[] (most recent first)
  private walletIndex = new Map<string, string[]>();

  /**
   * Register a new execution immediately after the on-chain tx confirms.
   * stepCount is derived from the strategy route.
   */
  register(opts: {
    strategyId: string;
    walletAddress: string;
    sourceAsset: string;
    sourceChain: number;
    destinationChain: number;
    sourceAmountUsd: number;
    stepCount: number;
  }): Execution {
    const { strategyId, walletAddress, stepCount } = opts;

    const execution: Execution = {
      strategyId,
      executionId: strategyId,
      walletAddress: walletAddress.toLowerCase(),
      sourceAsset: opts.sourceAsset,
      sourceChain: opts.sourceChain,
      destinationChain: opts.destinationChain,
      sourceAmountUsd: opts.sourceAmountUsd,
      status: 'pending',
      currentStep: 0,
      totalSteps: stepCount,
      steps: Array.from({ length: stepCount }, (_, i) => ({
        index: i,
        status: 'pending' as StepStatus,
      })),
      startedAt: Math.floor(Date.now() / 1000),
    };

    this.executions.set(strategyId, execution);

    // Update wallet index
    const wallet = walletAddress.toLowerCase();
    const existing = this.walletIndex.get(wallet) ?? [];
    this.walletIndex.set(wallet, [strategyId, ...existing]);

    // Persist to PostgreSQL (fire-and-forget)
    void insertExecution({
      strategyId,
      walletAddress,
      sourceAsset: opts.sourceAsset,
      sourceChain: opts.sourceChain,
      destinationChain: opts.destinationChain,
      sourceAmountUsd: opts.sourceAmountUsd,
      totalSteps: stepCount,
      startedAt: execution.startedAt,
    }).then(() => insertExecutionSteps(strategyId, stepCount))
      .catch((err) => console.error('[ExecutionRegistry] Failed to persist execution:', err));

    console.log(
      `[ExecutionRegistry] Registered execution strategy=${strategyId} wallet=${wallet} steps=${stepCount}`,
    );
    return execution;
  }

  /**
   * Update a step's status (called by the relayer on status changes).
   */
  updateStep(
    strategyId: string,
    stepIndex: number,
    status: StepStatus,
    opts?: { txHash?: string; chain?: number; completedAt?: number; estimatedCompletionAt?: number },
  ): void {
    const exec = this.executions.get(strategyId);
    if (!exec) return;

    const step = exec.steps[stepIndex];
    if (!step) return;

    step.status = status;
    if (opts?.txHash) step.txHash = opts.txHash;
    if (opts?.chain) step.chain = opts.chain;
    if (opts?.completedAt) step.completedAt = opts.completedAt;
    if (opts?.estimatedCompletionAt) step.estimatedCompletionAt = opts.estimatedCompletionAt;

    if (status === 'in_progress') {
      exec.status = 'in_progress';
      exec.currentStep = stepIndex;
      void updateExecutionStatus(strategyId, 'in_progress', { currentStep: stepIndex });
    }

    exec.elapsedSeconds = Math.floor(Date.now() / 1000) - exec.startedAt;

    // Persist step update (fire-and-forget)
    void updateExecutionStep(strategyId, stepIndex, status, {
      txHash: opts?.txHash,
      chainId: opts?.chain,
      completedAt: opts?.completedAt,
    });
  }

  /**
   * Mark an execution as completed.
   */
  complete(strategyId: string): void {
    const exec = this.executions.get(strategyId);
    if (!exec) return;

    exec.status = 'completed';
    exec.completedAt = Math.floor(Date.now() / 1000);
    exec.elapsedSeconds = exec.completedAt - exec.startedAt;
    exec.currentStep = exec.totalSteps;

    // Mark all remaining pending steps as done
    for (const step of exec.steps) {
      if (step.status === 'pending') step.status = 'done';
    }

    // Persist (fire-and-forget)
    void updateExecutionStatus(strategyId, 'completed', {
      completedAt: exec.completedAt,
      currentStep: exec.totalSteps,
    });

    console.log(`[ExecutionRegistry] Completed strategy=${strategyId}`);
  }

  /**
   * Mark an execution as failed.
   */
  fail(strategyId: string, reason: string): void {
    const exec = this.executions.get(strategyId);
    if (!exec) return;

    exec.status = 'failed';
    exec.errorMessage = reason;
    exec.completedAt = Math.floor(Date.now() / 1000);
    exec.elapsedSeconds = exec.completedAt - exec.startedAt;

    // Mark the current in_progress step as failed
    const inProgress = exec.steps.find((s) => s.status === 'in_progress');
    if (inProgress) {
      inProgress.status = 'failed';
      void updateExecutionStep(strategyId, inProgress.index, 'failed', {
        completedAt: exec.completedAt,
      });
    }

    // Persist overall failure (fire-and-forget)
    void updateExecutionStatus(strategyId, 'failed', {
      failedAt: exec.completedAt,
      failureReason: reason,
    });

    console.log(`[ExecutionRegistry] Failed strategy=${strategyId} reason=${reason}`);
  }

  /**
   * Mark an execution as emergency-exited.
   */
  emergencyExit(strategyId: string): void {
    const exec = this.executions.get(strategyId);
    if (!exec) return;

    exec.status = 'emergency_exited';
    exec.completedAt = Math.floor(Date.now() / 1000);
    exec.elapsedSeconds = exec.completedAt - exec.startedAt;

    // Persist (fire-and-forget)
    void updateExecutionStatus(strategyId, 'emergency_exited', {
      failedAt: exec.completedAt,
      failureReason: 'Emergency exit triggered',
    });
  }

  /**
   * Get the full Execution record (all fields including wallet, amounts, etc.).
   */
  get(strategyId: string): Execution | null {
    return this.executions.get(strategyId) ?? null;
  }

  /**
   * Get the current status of an execution.
   */
  getStatus(strategyId: string): ExecutionStatusResponse | null {
    const exec = this.executions.get(strategyId);
    if (!exec) return null;

    return {
      executionId: exec.executionId,
      strategyId: exec.strategyId,
      status: exec.status,
      currentStep: exec.currentStep,
      totalSteps: exec.totalSteps,
      steps: exec.steps,
      elapsedSeconds: exec.elapsedSeconds,
      errorMessage: exec.errorMessage,
    };
  }

  /**
   * Return summary of all executions for a wallet (newest first, max 50).
   */
  listByWallet(walletAddress: string, limit = 50): Execution[] {
    const ids = this.walletIndex.get(walletAddress.toLowerCase()) ?? [];
    return ids
      .slice(0, limit)
      .map((id) => this.executions.get(id))
      .filter((e): e is Execution => e !== undefined);
  }

  /**
   * Return total count of tracked executions (for monitoring).
   */
  size(): number {
    return this.executions.size;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

export const executionRegistry = new ExecutionRegistry();

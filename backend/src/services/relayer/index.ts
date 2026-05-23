/**
 * Relayer Manager — Phase 0 skeleton.
 *
 * Manages cross-chain step sequencing:
 *   1. Monitors bridge confirmation events on destination chains.
 *   2. Calls continueStrategy() on the Router after confirmation.
 *   3. Retries failed steps with exponential backoff (max 5 retries).
 *   4. Falls back to alternate bridge on repeated failures.
 *   5. Pushes live status updates via WebSocket to the frontend.
 *
 * Phase 0: In-memory job queue (no Redis dependency for local dev).
 * Phase 1: Migrated to BullMQ with Redis + Alchemy WebSocket event listeners.
 */

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface RelayerJob {
  id: string;
  strategyId: string;
  stepIndex: number;
  bridgeTxHash: string;
  sourceChain: number;
  destinationChain: number;
  status: JobStatus;
  retries: number;
  maxRetries: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

type StatusListener = (strategyId: string, job: RelayerJob) => void;

export class RelayerManager {
  private jobs = new Map<string, RelayerJob>();
  private listeners: StatusListener[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Register a callback to receive job status updates (WebSocket bridge). */
  onStatusUpdate(cb: StatusListener) {
    this.listeners.push(cb);
  }

  /** Submit a new bridge monitoring job. */
  submitMonitorJob(
    strategyId: string,
    stepIndex: number,
    bridgeTxHash: string,
    sourceChain: number,
    destinationChain: number,
  ): RelayerJob {
    const job: RelayerJob = {
      id: `${strategyId}-${stepIndex}`,
      strategyId,
      stepIndex,
      bridgeTxHash,
      sourceChain,
      destinationChain,
      status: 'pending',
      retries: 0,
      maxRetries: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.jobs.set(job.id, job);
    this.notify(strategyId, job);
    return job;
  }

  /** Start the polling loop. Phase 1: replaced by Alchemy WebSocket listeners. */
  start() {
    // Poll every 10s in Phase 0 (no live RPC in local dev)
    this.pollTimer = setInterval(() => this.processPending(), 10_000);
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  getJob(id: string): RelayerJob | undefined {
    return this.jobs.get(id);
  }

  allJobs(): RelayerJob[] {
    return Array.from(this.jobs.values());
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async processPending() {
    for (const job of this.jobs.values()) {
      if (job.status !== 'pending') continue;

      try {
        await this.processJob(job);
      } catch (err) {
        this.handleJobError(job, err instanceof Error ? err.message : String(err));
      }
    }
  }

  private async processJob(job: RelayerJob) {
    job.status = 'running';
    job.updatedAt = Date.now();
    this.notify(job.strategyId, job);

    // Phase 0: Simulate bridge confirmation (always succeeds after first poll).
    // Phase 1: Check Alchemy for bridge destination event on destinationChain.
    const confirmed = await this.checkBridgeConfirmation(job);

    if (confirmed) {
      await this.callContinueStrategy(job);
      job.status = 'done';
      job.updatedAt = Date.now();
      this.notify(job.strategyId, job);
    } else {
      job.status = 'pending';
      job.updatedAt = Date.now();
    }
  }

  /**
   * Phase 0: stub — always returns true after simulated delay.
   * Phase 1: polls destination chain RPC for bridge receipt event.
   */
  private async checkBridgeConfirmation(_job: RelayerJob): Promise<boolean> {
    // In production: query Alchemy/QuickNode WebSocket for bridge-confirmed event
    return true;
  }

  /**
   * Phase 0: stub — logs the call.
   * Phase 1: signs and broadcasts continueStrategy() tx from relayer wallet.
   */
  private async callContinueStrategy(job: RelayerJob) {
    console.log(
      `[Relayer] continueStrategy strategyId=${job.strategyId} stepIndex=${job.stepIndex + 1}`,
    );
  }

  private handleJobError(job: RelayerJob, error: string) {
    job.retries++;
    job.lastError = error;
    job.updatedAt = Date.now();

    if (job.retries >= job.maxRetries) {
      job.status = 'failed';
      console.error(
        `[Relayer] Job ${job.id} failed after ${job.retries} retries: ${error}`,
      );
      // Phase 1: trigger emergencyExit() on-chain
    } else {
      // Exponential backoff: 2^retries seconds
      const backoffMs = Math.pow(2, job.retries) * 1000;
      job.status = 'pending';
      console.warn(
        `[Relayer] Job ${job.id} retry ${job.retries}/${job.maxRetries} in ${backoffMs}ms`,
      );
      setTimeout(() => {
        // Re-queue for processing
      }, backoffMs);
    }

    this.notify(job.strategyId, job);
  }

  private notify(strategyId: string, job: RelayerJob) {
    for (const cb of this.listeners) {
      cb(strategyId, job);
    }
  }
}

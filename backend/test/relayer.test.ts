import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock all external I/O before importing RelayerManager ────────────────────

vi.mock('../src/services/kms-signer/index.js', () => ({
  getCachedRelayerAccount: vi.fn().mockResolvedValue(null),
  signerDescription: vi.fn().mockReturnValue('mock-signer'),
}));

vi.mock('../src/services/monitoring/index.js', () => ({
  monitoring: {
    captureError: vi.fn().mockResolvedValue(undefined),
    alert: vi.fn().mockResolvedValue(undefined),
  },
}));

// nonceManager mock — tracks calls and returns incrementing nonces per (chainId, address)
const nonceCounters = new Map<string, number>();
const nonceCalls: Array<{ chainId: number; addr: string; nonce: number }> = [];

vi.mock('../src/services/nonce-manager/index.js', () => ({
  nonceManager: {
    withNonce: vi.fn().mockImplementation(
      async (_client: unknown, chainId: number, addr: string, fn: (n: number) => Promise<unknown>) => {
        const key = `${chainId}:${addr}`;
        const next = (nonceCounters.get(key) ?? 0);
        nonceCounters.set(key, next + 1);
        nonceCalls.push({ chainId, addr, nonce: next });
        return fn(next);
      },
    ),
  },
}));

vi.mock('../src/services/webhooks/index.js', () => ({
  emitWebhookEvent: vi.fn(),
}));

vi.mock('../src/config/index.js', () => ({
  config: {
    chains: {
      ethereum:  { rpcUrl: '' },
      base:      { rpcUrl: '' },
      arbitrum:  { rpcUrl: '' },
      bnb:       { rpcUrl: '' },
      polygon:   { rpcUrl: '' },
      optimism:  { rpcUrl: '' },
      avalanche: { rpcUrl: '' },
      scroll:    { rpcUrl: '' },
      zkSync:    { rpcUrl: '' },
    },
  },
}));

// Import after mocks are set up
import { RelayerManager, type RelayerJob } from '../src/services/relayer/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Cast to any to access private methods for white-box testing. */
function priv(rm: RelayerManager): Record<string, (...args: unknown[]) => unknown> {
  return rm as unknown as Record<string, (...args: unknown[]) => unknown>;
}

function makeJob(overrides: Partial<RelayerJob> = {}): RelayerJob {
  const strategyId = (overrides.strategyId ?? '0xstrat1') as `0x${string}`;
  const stepIndex  = overrides.stepIndex ?? 0;
  return {
    // id must match the `${strategyId}-${stepIndex}` pattern used by handleChainFailure
    id: `${strategyId}-${stepIndex}`,
    strategyId,
    stepIndex,
    bridgeTxHash: '0xtx',
    sourceChain: 1,
    destinationChain: 42161,
    status: 'pending',
    retries: 0,
    maxRetries: 5,
    quoteExpiresAt: 0,
    reoptimized: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RelayerManager — job lifecycle', () => {
  let rm: RelayerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    nonceCounters.clear();
    nonceCalls.length = 0;
    rm = new RelayerManager();
  });

  afterEach(() => {
    rm.stop();
    vi.useRealTimers();
  });

  // ── submitMonitorJob ────────────────────────────────────────────────────────

  it('submitMonitorJob creates a pending job with correct fields', () => {
    const job = rm.submitMonitorJob('0xstrat1', 0, '0xtx', 1, 42161, 0);
    expect(job.id).toBe('0xstrat1-0');
    expect(job.status).toBe('pending');
    expect(job.retries).toBe(0);
    expect(job.maxRetries).toBe(5);
    expect(job.reoptimized).toBe(false);
  });

  it('submitMonitorJob is retrievable via getJob', () => {
    const job = rm.submitMonitorJob('0xstrat2', 1, '0xtx2', 1, 42161);
    expect(rm.getJob('0xstrat2-1')).toBe(job);
  });

  it('allJobs() returns all submitted jobs', () => {
    rm.submitMonitorJob('0xstratA', 0, '0xa', 1, 42161);
    rm.submitMonitorJob('0xstratA', 1, '0xb', 1, 42161);
    rm.submitMonitorJob('0xstratB', 0, '0xc', 1,  8453);
    expect(rm.allJobs()).toHaveLength(3);
  });

  // ── onStatusUpdate ──────────────────────────────────────────────────────────

  it('onStatusUpdate listener fires immediately on submitMonitorJob', () => {
    const updates: string[] = [];
    rm.onStatusUpdate((stratId, job) => updates.push(`${stratId}:${job.status}`));

    rm.submitMonitorJob('0xstratC', 0, '0xtx', 1, 42161);
    expect(updates).toContain('0xstratC:pending');
  });

  it('multiple listeners each receive updates', () => {
    const a: string[] = [];
    const b: string[] = [];
    rm.onStatusUpdate((id) => a.push(id));
    rm.onStatusUpdate((id) => b.push(id));

    rm.submitMonitorJob('0xstratD', 0, '0xtx', 1, 42161);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

// ─── Retry logic ───────────────────────────────────────────────────────────────

describe('RelayerManager — retry logic (handleJobError)', () => {
  let rm: RelayerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    rm = new RelayerManager();
  });

  afterEach(() => {
    rm.stop();
    vi.useRealTimers();
  });

  it('increments retries on each error', () => {
    const job = makeJob();
    priv(rm).handleJobError(job, 'RPC error 1');
    expect(job.retries).toBe(1);
    priv(rm).handleJobError(job, 'RPC error 2');
    expect(job.retries).toBe(2);
  });

  it('job stays pending (not failed) while retries < maxRetries', () => {
    const job = makeJob({ maxRetries: 5 });
    for (let i = 0; i < 4; i++) {
      priv(rm).handleJobError(job, `error ${i}`);
      expect(job.status).toBe('pending');
    }
    // 4 retries, maxRetries=5 — still pending
    expect(job.retries).toBe(4);
    expect(job.status).toBe('pending');
  });

  it('job transitions to failed after maxRetries (5) errors', () => {
    const job = makeJob({ maxRetries: 5 });
    for (let i = 0; i < 5; i++) {
      priv(rm).handleJobError(job, `error ${i}`);
    }
    expect(job.retries).toBe(5);
    expect(job.status).toBe('failed');
  });

  it('lastError is updated on each call', () => {
    const job = makeJob();
    priv(rm).handleJobError(job, 'first error');
    expect(job.lastError).toBe('first error');
    priv(rm).handleJobError(job, 'second error');
    expect(job.lastError).toBe('second error');
  });

  it('updatedAt is refreshed on each retry', async () => {
    const job = makeJob();
    const t0 = job.updatedAt;
    vi.advanceTimersByTime(1);
    priv(rm).handleJobError(job, 'err');
    expect(job.updatedAt).toBeGreaterThanOrEqual(t0);
  });

  it('listener is notified on every retry', () => {
    const updates: Array<{ status: string; retries: number }> = [];
    rm.onStatusUpdate((_id, j) => updates.push({ status: j.status, retries: j.retries }));

    const job = makeJob({ maxRetries: 3 });

    // 1st and 2nd errors → pending
    priv(rm).handleJobError(job, 'e1');
    priv(rm).handleJobError(job, 'e2');
    // 3rd error → failed
    priv(rm).handleJobError(job, 'e3');

    expect(updates).toHaveLength(3);
    expect(updates[0]!.status).toBe('pending');
    expect(updates[1]!.status).toBe('pending');
    expect(updates[2]!.status).toBe('failed');
  });

  it('exactly 5 retries before marking failed (maxRetries=5)', () => {
    const statuses: string[] = [];
    rm.onStatusUpdate((_id, j) => statuses.push(j.status));

    const job = makeJob({ maxRetries: 5 });
    // handleJobError increments retries first, then checks >= maxRetries.
    // So on the 5th call retries becomes 5 >= 5 → failed.
    for (let i = 0; i < 5; i++) {
      priv(rm).handleJobError(job, 'boom');
    }

    const failures = statuses.filter((s) => s === 'failed');
    expect(failures).toHaveLength(1);
    expect(statuses.at(-1)).toBe('failed');
  });
});

// ─── Fallback bridge cycling (handleChainFailure) ──────────────────────────────

describe('RelayerManager — fallback bridge cycling', () => {
  let rm: RelayerManager;
  const BRIDGE_FALLBACK_ORDER = ['stargate', 'across', 'hop', 'wormhole'];

  beforeEach(() => {
    vi.useFakeTimers();
    rm = new RelayerManager();
  });

  afterEach(() => {
    rm.stop();
    vi.useRealTimers();
  });

  it('cycles through all 4 fallback bridges before failing', () => {
    const job = rm.submitMonitorJob('0xstratFB', 0, '0xa', 1, 42161);

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // handleChainFailure checks retries < maxRetries before incrementing,
    // so it takes maxRetries+1 calls to reach the 'failed' branch.
    // maxRetries=5 → 5 retries (cycles through fallbacks) + 1 final fail call.
    for (let i = 0; i < 6; i++) {
      priv(rm).handleChainFailure(job.strategyId, job.stepIndex, `bridge fail ${i}`);
    }

    // Extract bridge names from warning logs
    const bridges = consoleWarn.mock.calls
      .filter((args) => String(args[0]).includes('retrying via'))
      .map((args) => {
        const m = /retrying via (\w+)/.exec(String(args[0]));
        return m?.[1];
      })
      .filter(Boolean);

    // Should see all 4 unique fallback bridges attempted (cycles mod 4)
    expect(new Set(bridges).size).toBeGreaterThanOrEqual(
      Math.min(BRIDGE_FALLBACK_ORDER.length, 4),
    );

    consoleWarn.mockRestore();
  });

  it('status becomes failed after maxRetries chain failures', () => {
    const job = rm.submitMonitorJob('0xstratFail', 0, '0xa', 1, 42161);

    // handleChainFailure: retries < maxRetries → pending; else → failed
    // With maxRetries=5, takes 6 calls: first 5 exhaust retries (0→4), 6th hits the else.
    for (let i = 0; i < 6; i++) {
      priv(rm).handleChainFailure(job.strategyId, job.stepIndex, 'fail');
    }

    expect(job.status).toBe('failed');
  });

  it('handleChainFailure creates a job record when one does not exist', () => {
    const stratId = '0xnewstrat' as `0x${string}`;
    priv(rm).handleChainFailure(stratId, 0, 'unknown job failure');

    const created = rm.getJob(`${stratId}-0`);
    expect(created).toBeDefined();
    expect(created!.strategyId).toBe(stratId);
  });

  it('retries counter increments on each chain failure', () => {
    const job = rm.submitMonitorJob('0xstratRC', 0, '0xa', 1, 42161);

    priv(rm).handleChainFailure(job.strategyId, job.stepIndex, 'fail');
    expect(job.retries).toBe(1);
    priv(rm).handleChainFailure(job.strategyId, job.stepIndex, 'fail');
    expect(job.retries).toBe(2);
  });
});

// ─── Nonce management via nonceManager ────────────────────────────────────────

describe('RelayerManager — nonce management for concurrent jobs', () => {
  let rm: RelayerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    nonceCounters.clear();
    nonceCalls.length = 0;
    vi.useFakeTimers();
    rm = new RelayerManager();
  });

  afterEach(() => {
    rm.stop();
    vi.useRealTimers();
  });

  it('callContinueStrategy delegates nonce management to nonceManager', async () => {
    const { nonceManager } = await import('../src/services/nonce-manager/index.js');

    const job = makeJob({ destinationChain: 42161 });

    // Inject mock wallet + public clients so the real-tx path runs
    const mockPublicClient = {
      simulateContract: vi.fn().mockResolvedValue({ request: {} }),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', blockNumber: 1n }),
    };
    const mockWalletClient = {
      account: { address: '0xRelayer' as `0x${string}` },
      writeContract: vi.fn().mockResolvedValue('0xtxhash' as `0x${string}`),
    };

    (rm as unknown as { publicClients: Map<number, unknown> }).publicClients.set(42161, mockPublicClient);
    (rm as unknown as { walletClients: Map<number, unknown> }).walletClients.set(42161, mockWalletClient);
    process.env['ROUTER_ADDRESS_ARB'] = '0xRouter';

    await priv(rm).callContinueStrategy(job, 1) as Promise<void>;

    expect(nonceManager.withNonce).toHaveBeenCalledOnce();
    expect(nonceCalls[0]!.chainId).toBe(42161);

    delete process.env['ROUTER_ADDRESS_ARB'];
  });

  it('concurrent callContinueStrategy calls get sequential nonces via nonceManager', async () => {
    const { nonceManager } = await import('../src/services/nonce-manager/index.js');

    const job1 = makeJob({ id: 'strat1-0', strategyId: '0xstrat1' as `0x${string}`, destinationChain: 42161 });
    const job2 = makeJob({ id: 'strat2-0', strategyId: '0xstrat2' as `0x${string}`, destinationChain: 42161 });

    const mockPublicClient = {
      simulateContract: vi.fn().mockResolvedValue({ request: {} }),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', blockNumber: 1n }),
    };
    const mockWalletClient = {
      account: { address: '0xRelayer' as `0x${string}` },
      writeContract: vi.fn().mockResolvedValue('0xtxhash' as `0x${string}`),
    };

    (rm as unknown as { publicClients: Map<number, unknown> }).publicClients.set(42161, mockPublicClient);
    (rm as unknown as { walletClients: Map<number, unknown> }).walletClients.set(42161, mockWalletClient);
    process.env['ROUTER_ADDRESS_ARB'] = '0xRouter';

    // Launch two concurrent jobs on the same chain
    await Promise.all([
      priv(rm).callContinueStrategy(job1, 1) as Promise<void>,
      priv(rm).callContinueStrategy(job2, 1) as Promise<void>,
    ]);

    // Both calls should have used nonceManager.withNonce
    expect(nonceManager.withNonce).toHaveBeenCalledTimes(2);

    // The two nonces must be different (sequential)
    const usedNonces = nonceCalls.map((c) => c.nonce);
    expect(new Set(usedNonces).size).toBe(2);

    delete process.env['ROUTER_ADDRESS_ARB'];
  });

  it('dev mode (no wallet client) skips nonceManager and marks job done', async () => {
    const { nonceManager } = await import('../src/services/nonce-manager/index.js');

    // No wallet/public clients injected → dev mode
    const job = makeJob({ destinationChain: 1 });
    await priv(rm).callContinueStrategy(job, 1) as Promise<void>;

    expect(nonceManager.withNonce).not.toHaveBeenCalled();
    expect(job.status).toBe('done');
  });
});

// ─── Quote expiry reoptimization ────────────────────────────────────────────────

describe('RelayerManager — quote expiry & reoptimize callback', () => {
  let rm: RelayerManager;

  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
    rm = new RelayerManager();
  });

  afterEach(() => {
    rm.stop();
    vi.useRealTimers();
  });

  it('does not invoke callback when quote is still valid', async () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    rm.onQuoteExpired(cb);

    const job = makeJob({ quoteExpiresAt: Date.now() + 60_000 });
    await priv(rm).checkAndReoptimizeIfExpired(job) as Promise<void>;

    expect(cb).not.toHaveBeenCalled();
  });

  it('invokes reoptimize callback when quote is expired', async () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    rm.onQuoteExpired(cb);

    const job = makeJob({ quoteExpiresAt: Date.now() - 1 });
    await priv(rm).checkAndReoptimizeIfExpired(job) as Promise<void>;

    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith(job.strategyId);
  });

  it('sets reoptimized=true after first invocation', async () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    rm.onQuoteExpired(cb);

    const job = makeJob({ quoteExpiresAt: Date.now() - 1 });
    await priv(rm).checkAndReoptimizeIfExpired(job) as Promise<void>;
    expect(job.reoptimized).toBe(true);
  });

  it('does not invoke callback a second time when reoptimized=true', async () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    rm.onQuoteExpired(cb);

    const job = makeJob({ quoteExpiresAt: Date.now() - 1, reoptimized: true });
    await priv(rm).checkAndReoptimizeIfExpired(job) as Promise<void>;

    expect(cb).not.toHaveBeenCalled();
  });

  it('continues without error when no reoptimize callback registered', async () => {
    const job = makeJob({ quoteExpiresAt: Date.now() - 1 });
    await expect(priv(rm).checkAndReoptimizeIfExpired(job) as Promise<void>).resolves.not.toThrow();
  });
});

// ─── markStrategyDone ─────────────────────────────────────────────────────────

describe('RelayerManager — markStrategyDone', () => {
  let rm: RelayerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    rm = new RelayerManager();
  });

  afterEach(() => {
    rm.stop();
    vi.useRealTimers();
  });

  it('marks all jobs for the strategy as done', () => {
    const stratId = '0xstrat99' as `0x${string}`;
    rm.submitMonitorJob(stratId, 0, '0xa', 1, 42161);
    rm.submitMonitorJob(stratId, 1, '0xb', 1, 42161);
    rm.submitMonitorJob('0xother', 0, '0xc', 1, 42161);

    priv(rm).markStrategyDone(stratId);

    expect(rm.getJob(`${stratId}-0`)!.status).toBe('done');
    expect(rm.getJob(`${stratId}-1`)!.status).toBe('done');
    // Unrelated strategy not affected
    expect(rm.getJob('0xother-0')!.status).toBe('pending');
  });

  it('does not transition already-done jobs (no double-notify)', () => {
    const updates: string[] = [];
    rm.onStatusUpdate((id, j) => updates.push(`${j.status}`));

    const stratId = '0xstrat88' as `0x${string}`;
    const job = rm.submitMonitorJob(stratId, 0, '0xa', 1, 42161);
    job.status = 'done'; // pre-mark

    priv(rm).markStrategyDone(stratId);

    // Only the initial submitMonitorJob notify; no additional notify from markStrategyDone
    const doneUpdates = updates.filter((s) => s === 'done');
    expect(doneUpdates).toHaveLength(0);
  });
});

// ─── Priority queue (Pro vs free tier ordering) ───────────────────────────────

describe('RelayerManager — priority execution queue', () => {
  let rm: RelayerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    rm = new RelayerManager();
  });

  afterEach(() => {
    rm.stop();
    vi.useRealTimers();
  });

  it('submitMonitorJob stores priority on the job', () => {
    const job = rm.submitMonitorJob('0xpro', 0, '0xtx', 1, 42161, 0, 10);
    expect(job.priority).toBe(10);
  });

  it('priority defaults to 0 (free tier) when not specified', () => {
    const job = rm.submitMonitorJob('0xfree', 0, '0xtx', 1, 42161);
    expect(job.priority).toBe(0);
  });

  it('processPending runs higher-priority jobs first', async () => {
    const processOrder: string[] = [];

    // Intercept processJob via priv to capture call order
    const origProcessJob = (priv(rm).processJob as (j: RelayerJob) => Promise<void>).bind(rm);
    (rm as unknown as { processJob: (j: RelayerJob) => Promise<void> }).processJob = async (job: RelayerJob) => {
      processOrder.push(job.id);
      // Mark done to avoid further processing
      job.status = 'done';
    };

    const freeJob  = rm.submitMonitorJob('0xfreeq', 0, '0xa', 1, 42161, 0, 0);   // priority 0
    const proJob   = rm.submitMonitorJob('0xproq',  0, '0xb', 1, 42161, 0, 10);  // priority 10
    const apiJob   = rm.submitMonitorJob('0xapiq',  0, '0xc', 1, 42161, 0, 20);  // priority 20

    // processPending is triggered by the poll timer; call it directly
    await priv(rm).processPending() as Promise<void>;

    expect(processOrder[0]).toBe(apiJob.id);   // highest priority first
    expect(processOrder[1]).toBe(proJob.id);
    expect(processOrder[2]).toBe(freeJob.id);  // lowest priority last

    void origProcessJob; // suppress unused variable
  });

  it('within same priority, earlier-created jobs run first (FIFO)', async () => {
    const processOrder: string[] = [];

    (rm as unknown as { processJob: (j: RelayerJob) => Promise<void> }).processJob = async (job: RelayerJob) => {
      processOrder.push(job.id);
      job.status = 'done';
    };

    const j1 = rm.submitMonitorJob('0xfifo1', 0, '0xa', 1, 42161, 0, 10);
    vi.advanceTimersByTime(1);
    const j2 = rm.submitMonitorJob('0xfifo2', 0, '0xb', 1, 42161, 0, 10);
    vi.advanceTimersByTime(1);
    const j3 = rm.submitMonitorJob('0xfifo3', 0, '0xc', 1, 42161, 0, 10);

    await priv(rm).processPending() as Promise<void>;

    expect(processOrder).toEqual([j1.id, j2.id, j3.id]);
  });
});

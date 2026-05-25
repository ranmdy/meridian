/**
 * WebSocket integration test — strategy status update ordering
 *
 * Tests the core behavior the WS route depends on:
 *   1. RelayerManager fires onStatusUpdate callbacks in submission order
 *   2. Each update carries the correct strategyId and status
 *   3. Filtering by strategyId: updates for strategy A are not sent to strategy B listeners
 *   4. The message format matches the WS wire format { type, data }
 *
 * We test the relay service layer directly (no actual TCP WebSocket needed)
 * because that layer is what the WS route delegates all behaviour to.
 * The Fastify WS route is a thin adapter — it calls onStatusUpdate() and sends
 * JSON.stringify({ type: 'status_update', data: job }) per received update.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RelayerManager, type RelayerJob } from '../src/services/relayer/index.js';

// Suppress relayer console output in tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Simulates what the WS route does: wraps update in { type, data } */
function makeStatusUpdateMessage(sid: string, job: RelayerJob) {
  return JSON.stringify({ type: 'status_update', data: job });
}

/** Simulates the initial "connected" message the WS route sends on open */
function makeConnectedMessage(strategyId: string) {
  return JSON.stringify({ type: 'connected', strategyId });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebSocket message ordering — RelayerManager.onStatusUpdate', () => {
  it('fires listener in submission order for sequential jobs', () => {
    const rm = new RelayerManager();
    const received: number[] = [];

    // Simulate what the WS route does: filter by strategyId, enqueue message
    const stratId = '0xordertest';
    rm.onStatusUpdate((sid, job) => {
      if (sid === stratId) received.push(job.stepIndex);
    });

    rm.submitMonitorJob(stratId, 0, '0xa', 1, 42161);
    rm.submitMonitorJob(stratId, 1, '0xb', 1, 42161);
    rm.submitMonitorJob(stratId, 2, '0xc', 1, 42161);

    expect(received).toEqual([0, 1, 2]);
    rm.stop();
  });

  it('listener receives "pending" status on submitMonitorJob', () => {
    const rm = new RelayerManager();
    const statuses: string[] = [];
    const stratId = '0xstatustest';

    rm.onStatusUpdate((sid, job) => {
      if (sid === stratId) statuses.push(job.status);
    });

    rm.submitMonitorJob(stratId, 0, '0xtx', 1, 42161);
    expect(statuses).toEqual(['pending']);
    rm.stop();
  });

  it('does not deliver updates for a different strategyId', () => {
    const rm = new RelayerManager();
    const myReceived: RelayerJob[] = [];

    const myStrategy    = '0xmine';
    const otherStrategy = '0xother';

    // Listener filtering — mirrors what the WS route does with strategyId param
    rm.onStatusUpdate((sid, job) => {
      if (sid === myStrategy) myReceived.push(job);
    });

    rm.submitMonitorJob(otherStrategy, 0, '0xtx', 1, 42161);
    rm.submitMonitorJob(otherStrategy, 1, '0xtx2', 1, 42161);

    // No updates should have arrived for myStrategy
    expect(myReceived).toHaveLength(0);
    rm.stop();
  });

  it('multiple listeners each receive all updates for their strategy', () => {
    const rm = new RelayerManager();
    const listenerA: RelayerJob[] = [];
    const listenerB: RelayerJob[] = [];
    const stratId = '0xmulti';

    // Both listeners watch the same strategy (e.g. two browser tabs)
    rm.onStatusUpdate((sid, job) => { if (sid === stratId) listenerA.push(job); });
    rm.onStatusUpdate((sid, job) => { if (sid === stratId) listenerB.push(job); });

    rm.submitMonitorJob(stratId, 0, '0xtx', 1, 42161);

    expect(listenerA).toHaveLength(1);
    expect(listenerB).toHaveLength(1);
    rm.stop();
  });

  it('update data matches the job fields at the time of notification', () => {
    const rm = new RelayerManager();
    let capturedJob: RelayerJob | null = null;
    const stratId = '0xfieldtest';

    rm.onStatusUpdate((_sid, job) => { capturedJob = job; });

    const submitted = rm.submitMonitorJob(stratId, 3, '0xtx', 1, 8453, Date.now() + 60_000);

    expect(capturedJob).not.toBeNull();
    expect(capturedJob!.stepIndex).toBe(3);
    expect(capturedJob!.bridgeTxHash).toBe('0xtx');
    expect(capturedJob!.sourceChain).toBe(1);
    expect(capturedJob!.destinationChain).toBe(8453);
    expect(capturedJob!.quoteExpiresAt).toBeGreaterThan(Date.now());
    // The listener receives the same object reference that was submitted
    expect(capturedJob).toBe(submitted);
    rm.stop();
  });
});

// ─── WS message format ────────────────────────────────────────────────────────

describe('WebSocket message format', () => {
  it('status_update message is valid JSON with { type, data } shape', () => {
    const rm = new RelayerManager();
    let raw: string | null = null;
    const stratId = '0xfmttest';

    // Simulate WS route: wrap update in wire format
    rm.onStatusUpdate((sid, job) => {
      if (sid === stratId) raw = makeStatusUpdateMessage(sid, job);
    });

    rm.submitMonitorJob(stratId, 0, '0xtx', 1, 42161);

    expect(raw).not.toBeNull();
    const msg = JSON.parse(raw!) as { type: string; data: RelayerJob };
    expect(msg.type).toBe('status_update');
    expect(typeof msg.data).toBe('object');
    expect(msg.data.strategyId).toBe(stratId);
    rm.stop();
  });

  it('connected message has { type: "connected", strategyId } shape', () => {
    const stratId = '0xconnmsg';
    const msg = JSON.parse(makeConnectedMessage(stratId)) as { type: string; strategyId: string };
    expect(msg.type).toBe('connected');
    expect(msg.strategyId).toBe(stratId);
  });

  it('status_update data contains all required RelayerJob fields', () => {
    const rm = new RelayerManager();
    let captured: RelayerJob | null = null;
    const stratId = '0xfields2';

    rm.onStatusUpdate((_sid, job) => { captured = job; });
    rm.submitMonitorJob(stratId, 0, '0xtx', 1, 42161);

    expect(captured).not.toBeNull();
    // All fields that a WS client would need to render the UI
    const j = captured!;
    expect(typeof j.id).toBe('string');
    expect(typeof j.strategyId).toBe('string');
    expect(typeof j.stepIndex).toBe('number');
    expect(typeof j.status).toBe('string');
    expect(typeof j.retries).toBe('number');
    expect(typeof j.maxRetries).toBe('number');
    expect(typeof j.createdAt).toBe('number');
    expect(typeof j.updatedAt).toBe('number');
    rm.stop();
  });
});

// ─── Strategy completion propagation ─────────────────────────────────────────

describe('WebSocket — strategy completion updates', () => {
  it('markStrategyDone notifies listener with status=done', () => {
    const rm = new RelayerManager();
    const updates: string[] = [];
    const stratId = '0xdonetest' as `0x${string}`;

    rm.onStatusUpdate((sid, job) => {
      if (sid === stratId) updates.push(job.status);
    });

    rm.submitMonitorJob(stratId, 0, '0xa', 1, 42161);
    rm.submitMonitorJob(stratId, 1, '0xb', 1, 42161);

    // Simulate StrategyCompleted on-chain event → markStrategyDone
    (rm as unknown as { markStrategyDone: (id: string) => void }).markStrategyDone(stratId);

    // First 2 updates = 'pending' from submit; last 2 = 'done' from markStrategyDone
    const doneCount = updates.filter((s) => s === 'done').length;
    expect(doneCount).toBe(2);
    rm.stop();
  });
});

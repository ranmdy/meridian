/**
 * SLA Monitor tests
 *
 * Verifies sliding-window stats, p95 computation, compliance rate,
 * breach detection, and alert cooldown.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { slaMonitor, QUOTE_SLA_MS } from '../src/services/sla-monitor/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Inject N samples with the given elapsed time and route. */
function inject(
  count: number,
  elapsedMs: number,
  route = '/strategy/optimize',
  statusCode = 200,
): void {
  for (let i = 0; i < count; i++) {
    slaMonitor.record(route, elapsedMs, statusCode);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('slaMonitor', () => {
  beforeEach(() => {
    slaMonitor.reset();
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('returns zero counts on empty window', () => {
    const s = slaMonitor.stats();
    expect(s.quote.count).toBe(0);
    expect(s.all.count).toBe(0);
    expect(s.quote.p95Ms).toBe(0);
    expect(s.all.p50Ms).toBe(0);
  });

  it('returns 100% compliance on empty window', () => {
    expect(slaMonitor.stats().quote.complianceRate).toBe(100);
  });

  it('reports withinSla=true when no quote samples', () => {
    expect(slaMonitor.stats().quote.withinSla).toBe(true);
  });

  // ── Quote route classification ──────────────────────────────────────────────

  it('classifies /strategy/optimize as a quote route', () => {
    slaMonitor.record('/strategy/optimize', 500, 200);
    expect(slaMonitor.stats().quote.count).toBe(1);
  });

  it('classifies /strategy/compose as a quote route', () => {
    slaMonitor.record('/strategy/compose', 500, 200);
    expect(slaMonitor.stats().quote.count).toBe(1);
  });

  it('classifies /strategies/* as a quote route', () => {
    slaMonitor.record('/strategies/0xabc/quotes', 500, 200);
    expect(slaMonitor.stats().quote.count).toBe(1);
  });

  it('does not classify /health as a quote route', () => {
    slaMonitor.record('/health', 10, 200);
    expect(slaMonitor.stats().quote.count).toBe(0);
    expect(slaMonitor.stats().all.count).toBe(1);
  });

  it('does not classify /user/executions as a quote route', () => {
    slaMonitor.record('/user/executions', 80, 200);
    expect(slaMonitor.stats().quote.count).toBe(0);
  });

  // ── Percentile computation ──────────────────────────────────────────────────

  it('computes p50 and p95 correctly', () => {
    // 100 samples: 95 at 100 ms, 5 at 3000 ms
    inject(95, 100);
    inject(5, 3000);
    const s = slaMonitor.stats();
    expect(s.quote.p50Ms).toBe(100);
    expect(s.quote.p95Ms).toBe(100);   // 95th sample of 100 is the 95th = 100ms
  });

  it('p95 reflects slow tail', () => {
    // 10 samples: 9 fast, 1 slow
    inject(9, 200);
    inject(1, 5000);
    const s = slaMonitor.stats();
    expect(s.quote.p95Ms).toBe(5000);
  });

  it('maxMs returns the highest sample', () => {
    inject(5, 300);
    inject(1, 9999);
    expect(slaMonitor.stats().quote.maxMs).toBe(9999);
  });

  // ── SLA compliance ──────────────────────────────────────────────────────────

  it('reports 100% compliance when all samples are within 2 s', () => {
    inject(20, QUOTE_SLA_MS - 1);  // 1999 ms — just within SLA
    expect(slaMonitor.stats().quote.complianceRate).toBe(100);
    expect(slaMonitor.stats().quote.withinSla).toBe(true);
  });

  it('reports 0% compliance when all samples exceed 2 s', () => {
    inject(20, QUOTE_SLA_MS + 1);  // 2001 ms — just over SLA
    const s = slaMonitor.stats();
    expect(s.quote.complianceRate).toBe(0);
    expect(s.quote.withinSla).toBe(false);
  });

  it('computes partial compliance correctly', () => {
    inject(8, 500);    // 80% within
    inject(2, 3000);   // 20% over
    expect(slaMonitor.stats().quote.complianceRate).toBe(80);
  });

  it('withinSla=false when p95 > 2000 ms', () => {
    // 5 fast + 5 slow → p95 is slow
    inject(5, 100);
    inject(5, 5000);
    expect(slaMonitor.stats().quote.withinSla).toBe(false);
  });

  // ── All-routes error rate ───────────────────────────────────────────────────

  it('errorRate is 0 when all responses are 2xx', () => {
    inject(10, 100, '/health', 200);
    expect(slaMonitor.stats().all.errorRate).toBe(0);
  });

  it('errorRate counts 5xx responses', () => {
    inject(8, 100, '/strategy/optimize', 200);
    inject(2, 100, '/strategy/optimize', 500);
    expect(slaMonitor.stats().all.errorRate).toBeCloseTo(0.2);
  });

  // ── Breach callbacks ────────────────────────────────────────────────────────

  it('fires breach callback when p95 exceeds SLA with sufficient samples', () => {
    const breaches: unknown[] = [];
    slaMonitor.onBreach((s) => breaches.push(s));

    // Need MIN_SAMPLES (10) to trigger evaluation
    inject(10, 5000);  // all slow
    expect(breaches.length).toBe(1);
  });

  it('does not fire breach when under MIN_SAMPLES threshold', () => {
    const breaches: unknown[] = [];
    slaMonitor.onBreach((s) => breaches.push(s));

    inject(9, 5000);   // 9 < MIN_SAMPLES=10
    expect(breaches.length).toBe(0);
  });

  it('does not fire breach when all samples are within SLA', () => {
    const breaches: unknown[] = [];
    slaMonitor.onBreach((s) => breaches.push(s));

    inject(15, 500);   // all fast
    expect(breaches.length).toBe(0);
  });

  it('passes correct stats to breach callback', () => {
    const breaches: ReturnType<typeof slaMonitor.stats>[] = [];
    slaMonitor.onBreach((s) => breaches.push(s));

    inject(10, 5000);
    expect(breaches[0]!.quote.p95Ms).toBe(5000);
    expect(breaches[0]!.quote.slaTargetMs).toBe(QUOTE_SLA_MS);
    expect(breaches[0]!.quote.withinSla).toBe(false);
  });

  // ── Snapshot metadata ───────────────────────────────────────────────────────

  it('includes snapshotAt ISO timestamp', () => {
    const s = slaMonitor.stats();
    expect(s.snapshotAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes windowSec = 300', () => {
    expect(slaMonitor.stats().windowSec).toBe(300);
  });
});

/**
 * SLA Monitor
 *
 * Tracks response latency for quote endpoints against the SLA target:
 *   - Quote response time: p95 < 2,000 ms
 *   - Uptime: 99.9% (tracked via error rate on all routes)
 *
 * Usage:
 *   import { slaMonitor } from './services/sla-monitor/index.js'
 *
 *   // In Fastify onResponse hook:
 *   slaMonitor.record(route, elapsedMs, statusCode);
 *
 *   // Register alert callback:
 *   slaMonitor.onBreach((stats) => monitoring.alert('SLA breach', stats));
 *
 *   // Health endpoint:
 *   GET /health/sla → slaMonitor.stats()
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Quote response SLA threshold in milliseconds. */
export const QUOTE_SLA_MS = 2_000;

/** Rolling window duration for all statistics. */
const WINDOW_MS = 5 * 60 * 1_000;  // 5 minutes

/** Minimum samples before evaluating SLA compliance. */
const MIN_SAMPLES = 10;

/** Cooldown between repeated breach alerts. */
const ALERT_COOLDOWN_MS = 10 * 60 * 1_000;  // 10 minutes

/** Routes classified as "quote" for the <2s SLA target. */
const QUOTE_ROUTE_PREFIXES = [
  '/strategy/optimize',
  '/strategy/compose',
  '/strategies',          // GET /strategies/:id/quotes
];

function isQuoteRoute(route: string): boolean {
  return QUOTE_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix));
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Sample {
  ts: number;
  elapsedMs: number;
  statusCode: number;
  isQuote: boolean;
}

export interface SlaStats {
  /** Window duration in seconds. */
  windowSec: number;
  quote: {
    /** Number of samples in the window. */
    count: number;
    /** Percentage of quote requests within the 2 s SLA (0–100). */
    complianceRate: number;
    /** 50th-percentile latency in ms. */
    p50Ms: number;
    /** 95th-percentile latency in ms. */
    p95Ms: number;
    /** Maximum latency in ms. */
    maxMs: number;
    /** SLA target in ms. */
    slaTargetMs: number;
    /** Whether the current p95 is within the SLA. */
    withinSla: boolean;
  };
  all: {
    count: number;
    errorRate: number;    // fraction of 5xx responses
    p50Ms: number;
    p95Ms: number;
  };
  /** ISO timestamp of the stats snapshot. */
  snapshotAt: string;
}

type BreachCallback = (stats: SlaStats) => void;

// ─── Implementation ───────────────────────────────────────────────────────────

class SlaMonitor {
  private readonly _samples: Sample[] = [];
  private _lastAlertAt = 0;
  private readonly _breachCallbacks: BreachCallback[] = [];

  /** Register a callback that fires when a SLA breach is detected. */
  onBreach(cb: BreachCallback): void {
    this._breachCallbacks.push(cb);
  }

  /** Record a completed request. Called from the Fastify onResponse hook. */
  record(route: string, elapsedMs: number, statusCode: number): void {
    const now = Date.now();
    this._samples.push({
      ts: now,
      elapsedMs,
      statusCode,
      isQuote: isQuoteRoute(route),
    });
    this._evict(now);
    this._checkBreach(now);
  }

  /** Compute current SLA statistics over the rolling window. */
  stats(): SlaStats {
    const now = Date.now();
    this._evict(now);

    const quoteSamples = this._samples.filter((s) => s.isQuote);
    const allSamples   = this._samples;

    return {
      windowSec: WINDOW_MS / 1_000,
      quote: {
        count:          quoteSamples.length,
        complianceRate: this._complianceRate(quoteSamples, QUOTE_SLA_MS),
        p50Ms:          this._percentile(quoteSamples, 50),
        p95Ms:          this._percentile(quoteSamples, 95),
        maxMs:          this._max(quoteSamples),
        slaTargetMs:    QUOTE_SLA_MS,
        withinSla:      this._percentile(quoteSamples, 95) <= QUOTE_SLA_MS,
      },
      all: {
        count:     allSamples.length,
        errorRate: allSamples.length === 0
          ? 0
          : allSamples.filter((s) => s.statusCode >= 500).length / allSamples.length,
        p50Ms: this._percentile(allSamples, 50),
        p95Ms: this._percentile(allSamples, 95),
      },
      snapshotAt: new Date(now).toISOString(),
    };
  }

  /** Remove samples older than the rolling window. */
  private _evict(now: number): void {
    const cutoff = now - WINDOW_MS;
    let i = 0;
    while (i < this._samples.length && this._samples[i]!.ts < cutoff) i++;
    if (i > 0) this._samples.splice(0, i);
  }

  /** Fire breach callbacks if p95 quote latency exceeds the SLA target. */
  private _checkBreach(now: number): void {
    const quoteSamples = this._samples.filter((s) => s.isQuote);
    if (quoteSamples.length < MIN_SAMPLES) return;

    const p95 = this._percentile(quoteSamples, 95);
    if (p95 <= QUOTE_SLA_MS) return;
    if (now - this._lastAlertAt < ALERT_COOLDOWN_MS) return;

    this._lastAlertAt = now;
    const current = this.stats();
    for (const cb of this._breachCallbacks) {
      try { cb(current); } catch { /* never crash */ }
    }
  }

  private _percentile(samples: Sample[], pct: number): number {
    if (samples.length === 0) return 0;
    const sorted = samples.map((s) => s.elapsedMs).sort((a, b) => a - b);
    const idx = Math.ceil((pct / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)]!;
  }

  private _max(samples: Sample[]): number {
    if (samples.length === 0) return 0;
    return Math.max(...samples.map((s) => s.elapsedMs));
  }

  private _complianceRate(samples: Sample[], thresholdMs: number): number {
    if (samples.length === 0) return 100;
    const within = samples.filter((s) => s.elapsedMs <= thresholdMs).length;
    return Math.round((within / samples.length) * 10_000) / 100;  // 2 decimal places
  }

  /** Reset all state (for tests). */
  reset(): void {
    this._samples.splice(0);
    this._lastAlertAt = 0;
    this._breachCallbacks.length = 0;
  }
}

export const slaMonitor = new SlaMonitor();

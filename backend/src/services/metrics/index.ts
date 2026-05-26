/**
 * Datadog Metrics Service
 *
 * Emits StatsD metrics over UDP to a local Datadog agent (DogStatsD).
 *
 * Enabled when DD_AGENT_HOST is set (defaults to localhost).
 * In development (no DD_AGENT_HOST set) all calls are no-ops.
 *
 * Metric categories:
 *   - api.*          Request latency, error rate, throughput
 *   - quote.*        Quote fetch latency per protocol, stale rate
 *   - relayer.*      Job queue depth, success/failure/retry rates
 *   - websocket.*    Active connections, message delivery
 *
 * Configuration:
 *   DD_AGENT_HOST       — Datadog agent host (default: localhost)
 *   DD_DOGSTATSD_PORT   — DogStatsD UDP port (default: 8125)
 *   DD_ENV              — Deployment env tag (default: NODE_ENV)
 *   DD_SERVICE          — Service name tag (default: meridian-backend)
 */

import { createSocket, type Socket } from 'node:dgram';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tags = Record<string, string | number>;

// ─── DogStatsD UDP client ─────────────────────────────────────────────────────

const AGENT_HOST = process.env.DD_AGENT_HOST ?? 'localhost';
const AGENT_PORT = parseInt(process.env.DD_DOGSTATSD_PORT ?? '8125', 10);
const ENABLED    = !!process.env.DD_AGENT_HOST;

const ENV     = process.env.DD_ENV     ?? process.env.NODE_ENV ?? 'development';
const SERVICE = process.env.DD_SERVICE ?? 'meridian-backend';

let _socket: Socket | null = null;

function getSocket(): Socket {
  if (!_socket) {
    _socket = createSocket('udp4');
    _socket.unref(); // never block process exit
  }
  return _socket;
}

function serializeTags(tags: Tags): string {
  const base = `env:${ENV},service:${SERVICE}`;
  const extra = Object.entries(tags)
    .map(([k, v]) => `${k}:${String(v)}`)
    .join(',');
  return extra ? `${base},${extra}` : base;
}

function send(line: string, tags: Tags): void {
  if (!ENABLED) return;
  const payload = `${line}|#${serializeTags(tags)}`;
  const buf = Buffer.from(payload);
  try {
    getSocket().send(buf, 0, buf.length, AGENT_PORT, AGENT_HOST);
  } catch {
    // Never let metrics crash the service
  }
}

// ─── Metric helpers ───────────────────────────────────────────────────────────

function gauge(metric: string, value: number, tags: Tags = {}): void {
  send(`${metric}:${value}|g`, tags);
}

function increment(metric: string, value: number = 1, tags: Tags = {}): void {
  send(`${metric}:${value}|c`, tags);
}

function histogram(metric: string, value: number, tags: Tags = {}): void {
  send(`${metric}:${value}|h`, tags);
}

function timing(metric: string, ms: number, tags: Tags = {}): void {
  send(`${metric}:${ms}|ms`, tags);
}

// ─── Metrics API ──────────────────────────────────────────────────────────────

/**
 * API metrics — call from Fastify onRequest / onResponse hooks.
 */
export const api = {
  /** Record completed request latency and status. */
  requestDone(route: string, method: string, statusCode: number, elapsedMs: number): void {
    const tags: Tags = { route, method: method.toLowerCase(), status: statusCode };
    timing('api.request.latency_ms', elapsedMs, tags);
    increment('api.request.count', 1, tags);
    if (statusCode >= 500) increment('api.request.error_count', 1, tags);
  },
};

/**
 * Quote engine metrics.
 */
export const quotes = {
  /** Record a successful quote fetch from an external protocol. */
  fetchDone(protocol: string, quoteType: 'apy' | 'bridge' | 'swap' | 'gas', elapsedMs: number): void {
    timing('quote.fetch.latency_ms', elapsedMs, { protocol, quote_type: quoteType });
    increment('quote.fetch.count', 1, { protocol, quote_type: quoteType });
  },

  /** Record a failed quote fetch. */
  fetchError(protocol: string, quoteType: 'apy' | 'bridge' | 'swap' | 'gas'): void {
    increment('quote.fetch.error_count', 1, { protocol, quote_type: quoteType });
  },

  /** Record that a cached quote was served stale to a client. */
  staleServed(protocol: string, quoteType: 'apy' | 'bridge' | 'swap' | 'gas'): void {
    increment('quote.stale.count', 1, { protocol, quote_type: quoteType });
  },

  /** Gauge: total number of cached quotes (fresh + stale). */
  cacheSize(size: number): void {
    gauge('quote.cache.size', size);
  },
};

/**
 * Relayer job metrics.
 */
export const relayer = {
  /** Gauge: current number of pending jobs in the queue. */
  queueDepth(depth: number): void {
    gauge('relayer.queue.depth', depth);
  },

  /** A job completed successfully. */
  jobSuccess(bridgeProtocol: string): void {
    increment('relayer.job.success_count', 1, { bridge: bridgeProtocol });
  },

  /** A job failed permanently (exhausted retries). */
  jobFailed(bridgeProtocol: string, reason: string): void {
    // Truncate reason to a safe tag value length
    const r = reason.slice(0, 50).replace(/[|,:]/g, '_');
    increment('relayer.job.failure_count', 1, { bridge: bridgeProtocol, reason: r });
  },

  /** A job was retried (transient failure). */
  jobRetried(bridgeProtocol: string, attempt: number): void {
    increment('relayer.job.retry_count', 1, { bridge: bridgeProtocol, attempt: String(attempt) });
  },

  /** Histogram: end-to-end job duration (submitted → done/failed). */
  jobDuration(bridgeProtocol: string, elapsedMs: number): void {
    histogram('relayer.job.duration_ms', elapsedMs, { bridge: bridgeProtocol });
  },
};

/**
 * WebSocket metrics.
 */
export const websocket = {
  /** Gauge: number of currently open WS connections. */
  connections(count: number): void {
    gauge('websocket.connections.active', count);
  },

  /** A message was delivered to a WS client. */
  messageDelivered(elapsedMs?: number): void {
    increment('websocket.message.delivered_count');
    if (elapsedMs !== undefined) timing('websocket.message.latency_ms', elapsedMs);
  },

  /** A WS client connected. */
  connected(): void {
    increment('websocket.connect_count');
  },

  /** A WS client disconnected. */
  disconnected(): void {
    increment('websocket.disconnect_count');
  },
};

// ─── Anomaly detection ────────────────────────────────────────────────────────

/**
 * Sliding-window failure rate detector.
 *
 * Tracks relayer job outcomes over a configurable window. When the failure
 * rate exceeds the threshold, it fires an alert callback once (de-duplicated
 * by a cooldown so the same alert doesn't fire every second).
 *
 * Usage (called internally when metrics are emitted):
 *   anomaly.record('success' | 'failure')
 */

const ANOMALY_WINDOW_MS   = 5 * 60 * 1000;   // 5-minute rolling window
const ANOMALY_THRESHOLD   = 0.5;              // alert if >50% of jobs fail
const ANOMALY_MIN_SAMPLES = 5;               // need at least 5 jobs to evaluate
const ANOMALY_COOLDOWN_MS = 10 * 60 * 1000; // at most one alert per 10 min

type JobOutcome = { ts: number; success: boolean };

const _window: JobOutcome[] = [];
let _lastAlertAt = 0;
type AlertCallback = (failureRate: number, windowSamples: number) => void;
const _alertCallbacks: AlertCallback[] = [];

export const anomaly = {
  /** Register a callback that fires when the failure rate spikes. */
  onAlert(cb: AlertCallback): void {
    _alertCallbacks.push(cb);
  },

  /** Record a job outcome and check for anomalies. */
  record(outcome: 'success' | 'failure'): void {
    const now = Date.now();
    _window.push({ ts: now, success: outcome === 'success' });

    // Evict entries older than the window
    let i = 0;
    while (i < _window.length && _window[i]!.ts < now - ANOMALY_WINDOW_MS) i++;
    if (i > 0) _window.splice(0, i);

    if (_window.length < ANOMALY_MIN_SAMPLES) return;

    const failures = _window.filter((e) => !e.success).length;
    const rate = failures / _window.length;

    if (rate >= ANOMALY_THRESHOLD && now - _lastAlertAt > ANOMALY_COOLDOWN_MS) {
      _lastAlertAt = now;
      // Emit a Datadog event (count metric — triggers monitor in DD UI)
      send(`relayer.anomaly.failure_spike:1|c`, { failure_rate: rate.toFixed(2), samples: _window.length });
      for (const cb of _alertCallbacks) {
        try { cb(rate, _window.length); } catch { /* never crash */ }
      }
    }
  },

  /** Expose current window stats (for tests and health checks). */
  stats(): { samples: number; failureRate: number } {
    const now = Date.now();
    const active = _window.filter((e) => e.ts >= now - ANOMALY_WINDOW_MS);
    const failures = active.filter((e) => !e.success).length;
    return {
      samples: active.length,
      failureRate: active.length === 0 ? 0 : failures / active.length,
    };
  },

  /** Reset window (for tests). */
  reset(): void {
    _window.splice(0);
    _lastAlertAt = 0;
    _alertCallbacks.length = 0;
  },
};

// ─── On-chain metrics (via The Graph subgraph) ────────────────────────────────

const GLOBAL_STATS_QUERY = /* graphql */ `
  query {
    globalStats(id: "global") {
      totalStrategies
      activeStrategies
      completedStrategies
      failedStrategies
      exitedStrategies
      totalVolume
      totalFinalAmount
      uniqueUsers
      totalSteps
    }
  }
`;

interface SubgraphGlobalStats {
  totalStrategies: string;
  activeStrategies: string;
  completedStrategies: string;
  failedStrategies: string;
  exitedStrategies: string;
  totalVolume: string;
  totalFinalAmount: string;
  uniqueUsers: string;
  totalSteps: string;
}

/**
 * On-chain metrics — pulled from The Graph subgraph, pushed to Datadog.
 * Call `onchain.start()` after the server starts (only runs when SUBGRAPH_URL is set).
 */
export const onchain = {
  _timer: null as ReturnType<typeof setInterval> | null,

  /** Fetch latest GlobalStats from subgraph and emit as Datadog gauges. */
  async push(subgraphUrl: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(subgraphUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: GLOBAL_STATS_QUERY }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return; // network error — skip silently, never crash
    }

    if (!res.ok) return;

    let body: { data?: { globalStats?: SubgraphGlobalStats } };
    try {
      body = await res.json() as typeof body;
    } catch {
      return;
    }

    const stats = body?.data?.globalStats;
    if (!stats) return;

    gauge('onchain.strategies.total',     Number(stats.totalStrategies));
    gauge('onchain.strategies.active',    Number(stats.activeStrategies));
    gauge('onchain.strategies.completed', Number(stats.completedStrategies));
    gauge('onchain.strategies.failed',    Number(stats.failedStrategies));
    gauge('onchain.strategies.exited',    Number(stats.exitedStrategies));
    gauge('onchain.volume.total',         Number(BigInt(stats.totalVolume)));
    gauge('onchain.users.unique',         Number(stats.uniqueUsers));
    gauge('onchain.steps.total',          Number(stats.totalSteps));
  },

  /** Start a polling loop. No-op if SUBGRAPH_URL is not configured. */
  start(subgraphUrl: string, intervalMs: number): void {
    if (!subgraphUrl) return;
    this.push(subgraphUrl).catch(() => {});
    this._timer = setInterval(() => {
      this.push(subgraphUrl).catch(() => {});
    }, intervalMs);
    if (this._timer.unref) this._timer.unref();
  },

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },
};

/**
 * Flush and close the UDP socket (call on graceful shutdown).
 */
export function closeMetrics(): void {
  onchain.stop();
  if (_socket) {
    try { _socket.close(); } catch { /* ignore */ }
    _socket = null;
  }
}

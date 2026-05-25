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

/**
 * Flush and close the UDP socket (call on graceful shutdown).
 */
export function closeMetrics(): void {
  if (_socket) {
    try { _socket.close(); } catch { /* ignore */ }
    _socket = null;
  }
}

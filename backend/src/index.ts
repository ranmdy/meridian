import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { StrategyEngine } from './services/strategy-engine/index.js';
import { QuoteEngine } from './services/quote-engine/index.js';
import { RelayerManager } from './services/relayer/index.js';
import { strategyRoutes } from './api/routes/strategy.js';
import { exportRoutes } from './api/routes/export.js';
import { authRoutes } from './api/routes/auth.js';
import { marketplaceRoutes } from './api/routes/marketplace.js';
import { webhookRoutes } from './api/routes/webhooks.js';
import { startExploitFeed, stopExploitFeed } from './services/exploit-feed/index.js';
import { exploitRoutes } from './api/routes/exploits.js';
import { billingRoutes } from './api/routes/billing.js';
import { bridgeListener } from './services/bridge-listener/index.js';
import { priceFeed } from './services/price-feed/index.js';
import { priceRoutes } from './api/routes/prices.js';
import { executionRoutes } from './api/routes/executions.js';
import { apiKeyRoutes } from './api/routes/api-keys.js';
import { templateRoutes } from './api/routes/templates.js';
import { executionRegistry } from './services/execution-registry/index.js';
import { api as apiMetrics, websocket as wsMetrics, anomaly, onchain as onchainMetrics, closeMetrics } from './services/metrics/index.js';
import { slaMonitor } from './services/sla-monitor/index.js';
import { closePool } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { monitoring } from './services/monitoring/index.js';
import { reportAllApiUsage } from './services/stripe/index.js';
import type { RelayerJob } from './services/relayer/index.js';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
  },
});

// ─── Services ─────────────────────────────────────────────────────────────────

const quoteEngine = new QuoteEngine();
const strategyEngine = new StrategyEngine();
const relayerManager = new RelayerManager();

// ─── Request latency metrics hook ─────────────────────────────────────────────

fastify.addHook('onResponse', (request, reply, done) => {
  const route  = request.routeOptions?.url ?? request.url ?? 'unknown';
  const method = request.method;
  const status = reply.statusCode;
  const elapsed = reply.elapsedTime;          // ms since request received
  apiMetrics.requestDone(route, method, status, elapsed);
  slaMonitor.record(route, elapsed, status);
  done();
});

// ─── Plugins ──────────────────────────────────────────────────────────────────

await fastify.register(cors, {
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
});

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

await fastify.register(websocket);

// ─── WebSocket: Live execution tracking ──────────────────────────────────────

let _wsConnectionCount = 0;

fastify.get('/ws/strategy/:strategyId', { websocket: true }, (socket, req) => {
  const { strategyId } = req.params as { strategyId: string };

  fastify.log.info(`WS client connected for strategy ${strategyId}`);
  _wsConnectionCount++;
  wsMetrics.connected();
  wsMetrics.connections(_wsConnectionCount);

  const listener = (sid: string, job: unknown) => {
    if (sid === strategyId) {
      // BigInt values (e.g. job.steps[].minOutput, job.bridgedAmount) cannot be
      // serialised with the default JSON.stringify — replace them with strings.
      const replacer = (_: string, v: unknown) =>
        typeof v === 'bigint' ? v.toString() : v;
      socket.send(JSON.stringify({ type: 'status_update', data: job }, replacer));
      wsMetrics.messageDelivered();
    }
  };

  relayerManager.onStatusUpdate(listener);

  socket.on('close', () => {
    fastify.log.info(`WS client disconnected for strategy ${strategyId}`);
    _wsConnectionCount = Math.max(0, _wsConnectionCount - 1);
    wsMetrics.disconnected();
    wsMetrics.connections(_wsConnectionCount);
    // In Phase 1: remove listener from map
  });

  // Send current status on connect
  socket.send(JSON.stringify({ type: 'connected', strategyId }));
  wsMetrics.messageDelivered();
});

// ─── REST Routes ──────────────────────────────────────────────────────────────

await fastify.register(strategyRoutes, { strategyEngine, quoteEngine });
await fastify.register(exportRoutes);
await fastify.register(authRoutes);
await fastify.register(marketplaceRoutes);
await fastify.register(webhookRoutes);
await fastify.register(exploitRoutes);
await fastify.register(billingRoutes);
await fastify.register(priceRoutes);
await fastify.register(executionRoutes, { relayerManager });
await fastify.register(apiKeyRoutes);
await fastify.register(templateRoutes);

// Health check
fastify.get('/health', async () => ({
  status: 'ok',
  version: '0.0.1',
  graph: strategyEngine.graphStats(),
}));

// SLA stats endpoint
fastify.get('/health/sla', async () => slaMonitor.stats());

// ─── Startup ──────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    // Run pending DB migrations before anything else
    await runMigrations();

    // Wire live APY data into the strategy engine graph after each quote poll
    quoteEngine.onApyRefresh((quotes) => strategyEngine.refreshFromQuotes(quotes));

    // Wire emergency exit events → execution registry
    relayerManager.onEmergencyExit((strategyId: string) => {
      executionRegistry.emergencyExit(strategyId);
    });

    // Wire StrategyCompleted on-chain event → execution registry completion
    relayerManager.onStrategyCompleted((strategyId: string) => {
      executionRegistry.complete(strategyId);
    });

    // Wire relayer status events → execution registry
    relayerManager.onStatusUpdate((strategyId: string, job: RelayerJob) => {
      switch (job.status) {
        case 'running':
          executionRegistry.updateStep(strategyId, job.stepIndex, 'in_progress', {
            txHash: job.bridgeTxHash || undefined,
            chain: job.destinationChain,
          });
          break;
        case 'done': {
          const execStatus = executionRegistry.getStatus(strategyId);
          if (execStatus && job.stepIndex >= execStatus.totalSteps - 1) {
            executionRegistry.complete(strategyId);
          } else {
            executionRegistry.updateStep(strategyId, job.stepIndex, 'done', {
              txHash: job.bridgeTxHash || undefined,
              chain: job.destinationChain,
              completedAt: Math.floor(job.updatedAt / 1000),
            });
          }
          break;
        }
        case 'failed': {
          const reason = job.lastError ?? 'Unknown error';
          executionRegistry.fail(strategyId, reason);
          // Email notification (fire-and-forget, no-op if RESEND_API_KEY not set)
          const failedExec = executionRegistry.get(strategyId);
          void monitoring.notifyFailure({
            strategyId,
            walletAddress: failedExec?.walletAddress ?? 'unknown',
            reason,
          });
          break;
        }
        default:
          break;
      }
    });

    // Wire anomaly detection: alert via monitoring when relayer failure rate spikes
    anomaly.onAlert((failureRate, samples) => {
      void monitoring.alert(
        `Relayer failure spike: ${(failureRate * 100).toFixed(0)}% of last ${samples} jobs failed`,
        { failureRate: failureRate.toFixed(3), windowSamples: samples },
      );
    });

    // Wire SLA breach alerts: fire when quote p95 exceeds 2 s target
    slaMonitor.onBreach((stats) => {
      void monitoring.alert(
        `SLA breach: quote p95 ${stats.quote.p95Ms} ms > ${stats.quote.slaTargetMs} ms target`,
        {
          p95Ms:          stats.quote.p95Ms,
          complianceRate: stats.quote.complianceRate,
          sampleCount:    stats.quote.count,
          windowSec:      stats.windowSec,
        },
      );
    });

    // Metered billing: report accumulated API usage to Stripe once daily
    const USAGE_REPORT_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const usageTimer = setInterval(async () => {
      // Collect usage for all API-tier wallets from the API key service
      // (getApiKeyStats aggregates usageThisMonth across all keys for a wallet)
      const usageByWallet = new Map<string, number>();
      // We don't have a list-all-wallets API, so we rely on the api-key registry
      // to expose keys; usage collection is best-effort for now.
      // TODO Phase 2: query DB for all active API-tier subscriptions and report usage.
      await reportAllApiUsage(usageByWallet);
    }, USAGE_REPORT_INTERVAL_MS);
    usageTimer.unref(); // don't prevent shutdown

    quoteEngine.start();
    await relayerManager.start();
    startExploitFeed();
    priceFeed.start();
    void bridgeListener.start();
    onchainMetrics.start(config.subgraphUrl, config.subgraphPollMs);

    await fastify.listen({ port: config.port, host: config.host });
    fastify.log.info(`Meridian backend listening on ${config.host}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  fastify.log.info('Shutting down...');
  quoteEngine.stop();
  relayerManager.stop();
  stopExploitFeed();
  priceFeed.stop();
  bridgeListener.stop();
  closeMetrics();
  await closePool();
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await start();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { StrategyEngine } from './services/strategy-engine/index.js';
import { QuoteEngine } from './services/quote-engine/index.js';
import { RelayerManager } from './services/relayer/index.js';
import { strategyRoutes } from './api/routes/strategy.js';

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

fastify.get('/ws/strategy/:strategyId', { websocket: true }, (socket, req) => {
  const { strategyId } = req.params as { strategyId: string };

  fastify.log.info(`WS client connected for strategy ${strategyId}`);

  const listener = (sid: string, job: unknown) => {
    if (sid === strategyId) {
      socket.send(JSON.stringify({ type: 'status_update', data: job }));
    }
  };

  relayerManager.onStatusUpdate(listener);

  socket.on('close', () => {
    fastify.log.info(`WS client disconnected for strategy ${strategyId}`);
    // In Phase 1: remove listener from map
  });

  // Send current status on connect
  socket.send(JSON.stringify({ type: 'connected', strategyId }));
});

// ─── REST Routes ──────────────────────────────────────────────────────────────

await fastify.register(strategyRoutes, { strategyEngine, quoteEngine });

// Health check
fastify.get('/health', async () => ({
  status: 'ok',
  version: '0.0.1',
  graph: strategyEngine.graphStats(),
}));

// ─── Startup ──────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    // Wire live APY data into the strategy engine graph after each quote poll
    quoteEngine.onApyRefresh((quotes) => strategyEngine.refreshFromQuotes(quotes));

    quoteEngine.start();
    relayerManager.start();

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
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await start();

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { executionRegistry } from '../../services/execution-registry/index.js';
import { incrementExecutionCount } from '../../services/marketplace/index.js';
import { listExecutionsByWallet } from '../../db/execution-store.js';
import { getSubscription } from '../../services/stripe/index.js';
import type { RelayerManager } from '../../services/relayer/index.js';

const ExecuteSchema = z.object({
  strategyId: z.string().min(1),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  sourceAsset: z.string().min(1),
  sourceChain: z.number().int().positive(),
  destinationChain: z.number().int().positive(),
  sourceAmountUsd: z.number().positive(),
  stepCount: z.number().int().min(1).max(20),
  initialTxHash: z.string().optional(),
  quoteExpiresAt: z.number().optional(),
  /** If the user is executing a marketplace strategy, pass its ID to increment the copy count. */
  marketplaceStrategyId: z.string().optional(),
});

export async function executionRoutes(
  fastify: FastifyInstance,
  opts: { relayerManager: RelayerManager },
) {
  // POST /strategy/execute — register a new execution and submit initial monitor job
  fastify.post('/strategy/execute', async (request, reply) => {
    const parsed = ExecuteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const {
      strategyId,
      walletAddress,
      sourceAsset,
      sourceChain,
      destinationChain,
      sourceAmountUsd,
      stepCount,
      initialTxHash,
      quoteExpiresAt = 0,
      marketplaceStrategyId,
    } = parsed.data;

    // Increment marketplace copy count when executing a published strategy
    if (marketplaceStrategyId) {
      incrementExecutionCount(marketplaceStrategyId);
    }

    // Register in registry (idempotent — second call for same strategyId is a no-op in prod;
    // for Phase 1 in-memory store, overwrite is fine)
    const execution = executionRegistry.register({
      strategyId,
      walletAddress,
      sourceAsset,
      sourceChain,
      destinationChain,
      sourceAmountUsd,
      stepCount,
    });

    // Determine relayer priority from subscription tier
    // Pro/API tier: 10 (processed first), free: 0
    const sub = getSubscription(walletAddress);
    const relayerPriority = sub && (sub.tier === 'pro' || sub.tier === 'api') && sub.status === 'active'
      ? 10
      : 0;

    // Submit initial monitor job to relayer so it watches the bridge tx
    if (initialTxHash) {
      opts.relayerManager.submitMonitorJob(
        strategyId,
        0,
        initialTxHash,
        sourceChain,
        destinationChain,
        quoteExpiresAt,
        relayerPriority,
      );
    }

    return reply.status(201).send({
      executionId: execution.executionId,
      strategyId: execution.strategyId,
      status: execution.status,
      totalSteps: execution.totalSteps,
      startedAt: execution.startedAt,
    });
  });

  // GET /strategy/:id/status — current execution status (polled by ExecutionPoller)
  fastify.get<{ Params: { id: string } }>('/strategy/:id/status', async (request, reply) => {
    const { id } = request.params;
    const status = executionRegistry.getStatus(id);
    if (!status) {
      return reply.status(404).send({ error: 'Execution not found', strategyId: id });
    }
    return reply.send(status);
  });

  // GET /user/executions — execution history for a wallet
  fastify.get<{ Querystring: { wallet: string; limit?: string } }>(
    '/user/executions',
    async (request, reply) => {
      const { wallet, limit } = request.query;
      if (!wallet || !/^0x[0-9a-fA-F]{40}$/i.test(wallet)) {
        return reply.status(400).send({ error: 'wallet query param is required (checksummed address)' });
      }

      const cap = limit ? parseInt(limit, 10) : 50;

      // Prefer DB (survives restarts); fall back to in-memory registry
      const dbRows = await listExecutionsByWallet(wallet, cap);
      if (dbRows !== null) {
        return reply.send({ executions: dbRows, total: dbRows.length, source: 'db' });
      }

      const executions = executionRegistry.listByWallet(wallet, cap);
      return reply.send({ executions, total: executions.length, source: 'memory' });
    },
  );

  // GET /strategy/:id — full strategy execution details (superset of /status)
  fastify.get<{ Params: { id: string } }>('/strategy/:id', async (request, reply) => {
    const { id } = request.params;
    const execution = executionRegistry.get(id);
    if (!execution) {
      return reply.status(404).send({ error: 'Strategy execution not found', strategyId: id });
    }
    return reply.send(execution);
  });

  // GET /user/portfolio — cross-chain asset balances (Phase 1: returns execution-derived summary)
  fastify.get<{ Querystring: { wallet: string } }>('/user/portfolio', async (request, reply) => {
    const { wallet } = request.query;
    if (!wallet || !/^0x[0-9a-fA-F]{40}$/i.test(wallet)) {
      return reply.status(400).send({ error: 'wallet query param is required' });
    }

    const dbRows = await listExecutionsByWallet(wallet, 100);
    const executions = dbRows ?? executionRegistry.listByWallet(wallet, 100);

    // Aggregate completed executions into a per-chain-asset summary
    const byChainAsset = new Map<string, { chain: number; asset: string; amountUsd: number; count: number }>();
    for (const exec of executions) {
      if (exec.status !== 'completed') continue;
      const key = `${exec.destinationChain}:${exec.sourceAsset}`;
      const existing = byChainAsset.get(key);
      if (existing) {
        existing.amountUsd += exec.sourceAmountUsd;
        existing.count++;
      } else {
        byChainAsset.set(key, {
          chain: exec.destinationChain,
          asset: exec.sourceAsset,
          amountUsd: exec.sourceAmountUsd,
          count: 1,
        });
      }
    }

    return reply.send({
      wallet: wallet.toLowerCase(),
      positions: Array.from(byChainAsset.values()),
      totalExecutions: executions.length,
      completedExecutions: executions.filter((e) => e.status === 'completed').length,
      _note: 'Phase 1: derived from execution history. Phase 2 will add live on-chain balance queries.',
    });
  });

  // GET /strategy/:id/report — tax/audit report (alias of /executions/:id/report)
  fastify.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>('/strategy/:id/report', async (request, reply) => {
    return reply.redirect(`/executions/${request.params.id}/report${request.query.format ? `?format=${request.query.format}` : ''}`);
  });

  // Note: GET /executions/:id/report is registered in export.ts
}

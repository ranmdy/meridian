import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { executionRegistry } from '../../services/execution-registry/index.js';
import { incrementExecutionCount } from '../../services/marketplace/index.js';
import { listExecutionsByWallet } from '../../db/execution-store.js';
import { getSubscription } from '../../services/stripe/index.js';
import type { RelayerManager, OnChainStep } from '../../services/relayer/index.js';

// ─── Step type constants (must match Solidity enum) ─────────────────────────
const STEP_BRIDGE = 2;

/**
 * Resolve same-chain execution: all steps completed atomically in the initial
 * executeStrategy tx. Mark every step done with the real tx hash.
 *
 * Same-chain = no BRIDGE steps, or all BRIDGE steps fell back to SETTLE.
 */
function resolveAtomicExecution(
  strategyId: string,
  stepCount: number,
  initialTxHash: string,
  sourceChain: number,
): void {
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < stepCount; i++) {
    executionRegistry.updateStep(strategyId, i, 'done', {
      txHash: initialTxHash,
      chain: sourceChain,
      completedAt: now,
    });
  }

  executionRegistry.complete(strategyId);
}

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
  /**
   * The exact Step[] array submitted to executeStrategy on-chain.
   * Required for the relayer to call continueStrategy after a bridge step confirms.
   * Without this, multi-step strategies with bridge hops will stall.
   */
  onChainSteps: z.array(z.object({
    stepType: z.number().int().min(0).max(4),
    protocol: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    params: z.string().regex(/^0x[0-9a-fA-F]*$/).default('0x'),
    minOutput: z.string().default('0'),
    outputAsset: z.string().regex(/^0x[0-9a-fA-F]{40}$/).default('0x0000000000000000000000000000000000000000'),
  })).optional(),
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

    // Check if this strategy has a real BRIDGE step (not a SETTLE fallback)
    const rawSteps = (parsed.data.onChainSteps ?? []);
    const hasBridgeStep = rawSteps.some((s) => s.stepType === STEP_BRIDGE);

    if (initialTxHash && hasBridgeStep) {
      // ── Cross-chain: submit relayer monitor job ──────────────────────────
      // The relayer watches for the bridge fill on the destination chain,
      // then calls continueStrategy on the destination router.
      let steps: OnChainStep[];
      try {
        steps = rawSteps.map((s) => ({
          stepType: s.stepType,
          protocol: s.protocol as `0x${string}`,
          params: s.params as `0x${string}`,
          minOutput: BigInt(s.minOutput),
          outputAsset: s.outputAsset as `0x${string}`,
        }));
      } catch (err) {
        return reply.status(400).send({
          error: 'Invalid onChainSteps: minOutput must be a valid integer string',
          details: (err as Error).message,
        });
      }

      // Mark pre-bridge steps as done with the initial tx hash.
      // Steps before the first BRIDGE executed atomically in executeStrategy.
      const firstBridgeIdx = rawSteps.findIndex((s) => s.stepType === STEP_BRIDGE);
      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < firstBridgeIdx; i++) {
        executionRegistry.updateStep(strategyId, i, 'done', {
          txHash: initialTxHash,
          chain: sourceChain,
          completedAt: now,
        });
      }
      // Mark the bridge step as in_progress
      executionRegistry.updateStep(strategyId, firstBridgeIdx, 'in_progress', {
        txHash: initialTxHash,
        chain: sourceChain,
      });

      opts.relayerManager.submitMonitorJob(
        strategyId,
        firstBridgeIdx,
        initialTxHash,
        sourceChain,
        destinationChain,
        quoteExpiresAt,
        relayerPriority,
        steps,
      );
    } else if (initialTxHash) {
      // ── Same-chain: all steps completed atomically ───────────────────────
      // No BRIDGE steps — the entire strategy settled in the initial
      // executeStrategy transaction. Mark all steps done with the real tx hash.
      resolveAtomicExecution(strategyId, stepCount, initialTxHash, sourceChain);
    } else {
      // ── No tx hash at all (should not happen in production) ──────────────
      // Mark as failed — we can't track execution without a tx hash.
      console.warn(
        `[Executions] No initialTxHash for strategy=${strategyId}. Cannot track execution.`,
      );
      executionRegistry.fail(strategyId, 'No transaction hash provided — execution cannot be tracked');
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

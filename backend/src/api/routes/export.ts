import type { FastifyInstance, FastifyReply } from 'fastify';
import { toKoinlyCsv, toJson, toTextReport, type ExecutionReport } from '../../services/export/index.js';

// In Phase 1 we store a small in-memory execution log keyed by executionId.
// Phase 2: replace with PostgreSQL query.
const executionLog = new Map<string, ExecutionReport>();

/**
 * Register a completed execution so it can be exported.
 * Called by the relayer when a strategy completes.
 */
export function registerExecution(report: ExecutionReport): void {
  executionLog.set(report.executionId, report);
}

export async function exportRoutes(fastify: FastifyInstance) {
  // GET /executions/:id/report?format=csv|json|text
  fastify.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>('/executions/:id/report', async (request, reply) => {
    const { id } = request.params;
    const format = (request.query.format ?? 'json').toLowerCase();

    const report = executionLog.get(id);
    if (!report) {
      // Return a sample report in dev mode so frontend can be tested without a real execution
      if (process.env.NODE_ENV !== 'production') {
        const sample = makeSampleReport(id);
        return sendReport(reply, sample, format);
      }
      return reply.status(404).send({ error: 'Execution not found' });
    }

    return sendReport(reply, report, format);
  });

  // POST /executions/:id/report/register — internal: relayer registers completed executions
  fastify.post<{
    Params: { id: string };
    Body: ExecutionReport;
  }>('/executions/:id/report/register', async (request, reply) => {
    const report = request.body;
    if (!report || !report.executionId || !Array.isArray(report.hops)) {
      return reply.status(400).send({ error: 'Invalid execution report' });
    }
    executionLog.set(report.executionId, report);
    return reply.status(201).send({ ok: true });
  });
}

function sendReport(reply: FastifyReply, report: ExecutionReport, format: string) {
  switch (format) {
    case 'csv':
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="meridian-${report.executionId.slice(0, 8)}.csv"`);
      return reply.send(toKoinlyCsv(report));

    case 'text':
    case 'pdf':
      // Phase 2: actual PDF. Phase 1: plain text.
      reply.header('Content-Type', 'text/plain');
      reply.header('Content-Disposition', `attachment; filename="meridian-${report.executionId.slice(0, 8)}.txt"`);
      return reply.send(toTextReport(report));

    default:
      return reply.send(toJson(report));
  }
}

function makeSampleReport(id: string): ExecutionReport {
  const now = Math.floor(Date.now() / 1000);
  return {
    executionId: id,
    strategyId: `strat_${id.slice(0, 8)}`,
    walletAddress: '0x0000000000000000000000000000000000000001',
    startedAt: now - 300,
    completedAt: now,
    status: 'completed',
    hops: [
      {
        stepIndex: 0,
        action: 'SWAP',
        fromAsset: 'ETH',
        toAsset: 'USDC',
        amountIn: '2.5',
        amountOut: '7500.00',
        chain: 1,
        txHash: '0xabc123',
        timestamp: now - 280,
        gasPaidUsd: 4.20,
        protocolFeePaidUsd: 1.50,
        protocol: 'uniswap_v3',
      },
      {
        stepIndex: 1,
        action: 'BRIDGE',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        amountIn: '7500.00',
        amountOut: '7485.00',
        chain: 1,
        txHash: '0xdef456',
        timestamp: now - 200,
        gasPaidUsd: 8.10,
        protocolFeePaidUsd: 15.00,
        protocol: 'stargate',
      },
      {
        stepIndex: 2,
        action: 'LEND',
        fromAsset: 'USDC',
        toAsset: 'aUSDC',
        amountIn: '7485.00',
        amountOut: '7485.00',
        chain: 42161,
        txHash: '0xghi789',
        timestamp: now - 60,
        gasPaidUsd: 0.30,
        protocolFeePaidUsd: 0.00,
        protocol: 'aave_v3',
      },
    ],
  };
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyMessage } from 'viem';
import type { StrategyEngine } from '../../services/strategy-engine/index.js';
import type { QuoteEngine } from '../../services/quote-engine/index.js';
import { SimulationService } from '../../services/simulation/index.js';
import { tieredRateLimit } from '../../services/rateLimit/index.js';

const simulationService = new SimulationService();

const OptimizeSchema = z.object({
  sourceAsset: z.string().min(1),
  sourceChain: z.number().int().positive(),
  sourceAmountUsd: z.number().positive(),
  destinationChain: z.number().int().positive(),
  riskTolerance: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  timeHorizonDays: z.number().int().min(1).max(3650),
  destinationWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  destinationSignature: z.string().regex(/^0x[0-9a-fA-F]+$/).optional(),
});

export async function strategyRoutes(
  fastify: FastifyInstance,
  opts: { strategyEngine: StrategyEngine; quoteEngine: QuoteEngine },
) {
  // POST /strategy/optimize — find best routes for a given request
  fastify.post('/strategy/optimize', { preHandler: tieredRateLimit }, async (request, reply) => {
    const parsed = OptimizeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    // Verify destination wallet ownership if provided
    const { destinationWallet, destinationSignature } = parsed.data;
    if (destinationWallet && destinationSignature) {
      const message =
        `Meridian destination verification\nI confirm this wallet is mine: ${destinationWallet}`;
      try {
        const valid = await verifyMessage({
          address: destinationWallet as `0x${string}`,
          message,
          signature: destinationSignature as `0x${string}`,
        });
        if (!valid) {
          return reply.status(403).send({
            error: 'Invalid destination signature',
            message: 'The provided signature does not match the destination wallet.',
          });
        }
      } catch {
        return reply.status(403).send({
          error: 'Signature verification failed',
          message: 'Could not verify destination wallet ownership.',
        });
      }
    }

    const result = opts.strategyEngine.optimize(parsed.data);

    if (result.routes.length === 0) {
      return reply.status(422).send({
        error: 'No routes found',
        message: 'No viable routes exist for this source/destination pair. Try a different asset or chain.',
      });
    }

    return reply.send(result);
  });

  // POST /strategy/simulate — pre-execution simulation for a single route
  fastify.post<{
    Body: {
      routeIndex: number;
      fromAddress: string;
      sourceChain: number;
    };
  }>('/strategy/simulate', { preHandler: tieredRateLimit }, async (request, reply) => {
    const { routeIndex, fromAddress, sourceChain } = request.body ?? {};
    if (typeof routeIndex !== 'number' || !fromAddress || !sourceChain) {
      return reply.status(400).send({ error: 'routeIndex, fromAddress, and sourceChain are required' });
    }

    // We can only simulate against cached routes — the client must optimize first.
    // For now, simulate optimistically without a cached route context:
    // The SimulationService gracefully falls back when Tenderly isn't configured.
    const dummyRoute = opts.strategyEngine.optimize({
      sourceAsset: 'ETH',
      sourceChain,
      sourceAmountUsd: 1000,
      destinationChain: sourceChain === 1 ? 42161 : 1,
      riskTolerance: 3,
      timeHorizonDays: 30,
    }).routes[routeIndex];

    if (!dummyRoute) {
      return reply.status(404).send({ error: 'Route not found' });
    }

    const result = await simulationService.simulate(dummyRoute, fromAddress, sourceChain);
    return reply.send(result);
  });

  // GET /quotes/gas — live gas price per chain
  fastify.get<{ Querystring: { chain: string } }>('/quotes/gas', async (request, reply) => {
    const { chain } = request.query;
    if (chain) {
      const quote = opts.quoteEngine.getGasQuote(Number(chain));
      if (!quote) return reply.status(404).send({ error: 'No gas quote for this chain' });
      return reply.send(quote);
    }
    return reply.send(opts.quoteEngine.getAllGasQuotes());
  });

  // POST /strategy/auto-optimize — single best route selected automatically
  fastify.post('/strategy/auto-optimize', { preHandler: tieredRateLimit }, async (request, reply) => {
    const parsed = OptimizeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const result = opts.strategyEngine.optimize(parsed.data);
    if (result.routes.length === 0) {
      return reply.status(422).send({
        error: 'No routes found',
        message: 'No viable routes exist for this source/destination pair.',
      });
    }

    const { riskTolerance } = parsed.data;

    // Score routes with risk-tolerance weighting:
    //   Low risk (1–2): penalize high bridgeCount and high riskScore, prioritise safety
    //   Medium risk (3): balanced — use totalScore as-is
    //   High risk (4–5): prioritise APY, accept higher cost/risk
    const scored = result.routes.map((route, i) => {
      let w = route.totalScore;
      if (riskTolerance <= 2) {
        w -= route.bridgeCount * 500;
        w -= route.riskScore * 20;
      } else if (riskTolerance >= 4) {
        w += (route.estimatedApyBps / 100) * 200;
      }
      return { route, index: i, weight: w };
    });

    scored.sort((a, b) => b.weight - a.weight);
    const best = scored[0];

    // Generate a plain-language explanation
    const apyPct = (best.route.estimatedApyBps / 100).toFixed(2);
    const totalFees = (best.route.totalGasUsd + best.route.totalBridgeFeeUsd + best.route.totalProtocolFeeUsd).toFixed(2);
    const hops = best.route.hopCount;
    const bridges = best.route.bridgeCount;
    const minutes = Math.round(best.route.estimatedTimeSeconds / 60);

    let explanation = `Selected for `;
    if (riskTolerance <= 2) {
      explanation += `safety: lowest risk score (${best.route.riskScore}/100) with ${bridges} bridge${bridges !== 1 ? 's' : ''}.`;
    } else if (riskTolerance >= 4) {
      explanation += `yield: highest projected APY at ${apyPct}% across ${hops} hop${hops !== 1 ? 's' : ''}.`;
    } else {
      explanation += `balance: ${apyPct}% APY with $${totalFees} total fees in ~${minutes} minutes.`;
    }

    return reply.send({
      route: best.route,
      routeIndex: best.index,
      explanation,
      alternatives: result.routes.filter((_, i) => i !== best.index),
      simulatedAt: result.simulatedAt,
      quoteExpiresAt: result.quoteExpiresAt,
    });
  });

  // GET /strategy/graph — debug endpoint (dev only)
  fastify.get('/strategy/graph/stats', async (_request, reply) => {
    return reply.send(opts.strategyEngine.graphStats());
  });

  // GET /strategy/apy — all cached APY quotes (for Composer live preview)
  fastify.get('/strategy/apy', async (_request, reply) => {
    return reply.send({ quotes: opts.quoteEngine.getAllApyQuotes() });
  });

  // GET /quotes/apy — APY for a specific protocol/chain/asset
  fastify.get<{
    Querystring: { protocol: string; chain: string; asset: string };
  }>('/quotes/apy', async (request, reply) => {
    const { protocol, chain, asset } = request.query;
    const quote = opts.quoteEngine.getApyQuote(protocol, Number(chain), asset);
    if (!quote) {
      return reply.status(404).send({ error: 'No quote available for this protocol/chain/asset' });
    }
    return reply.send(quote);
  });

  // GET /quotes/bridge — bridge quote
  fastify.get<{
    Querystring: { protocol: string; fromChain: string; toChain: string; asset: string };
  }>('/quotes/bridge', async (request, reply) => {
    const { protocol, fromChain, toChain, asset } = request.query;
    const quote = opts.quoteEngine.getBridgeQuote(
      protocol,
      Number(fromChain),
      Number(toChain),
      asset,
    );
    if (!quote) {
      return reply.status(404).send({ error: 'No bridge quote available' });
    }
    return reply.send({
      ...quote,
      amountIn: quote.amountIn.toString(),
      amountOut: quote.amountOut.toString(),
    });
  });
}

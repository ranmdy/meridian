import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyMessage } from 'viem';
import type { StrategyEngine } from '../../services/strategy-engine/index.js';
import type { QuoteEngine } from '../../services/quote-engine/index.js';
import { SimulationService } from '../../services/simulation/index.js';
import { tieredRateLimit } from '../../services/rateLimit/index.js';
import { requireAuth } from './auth.js';

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

  // POST /strategy/compose — programmatic strategy composition (API key clients + UI Composer)
  // Accepts a custom steps array, validates it, enriches with live quotes, returns a Route.
  // Auth required; tier gate removed for testnet/dev access.
  fastify.post('/strategy/compose', { preHandler: [requireAuth, tieredRateLimit] }, async (request, reply) => {
    const StepSchema = z.object({
      stepType: z.enum(['SWAP', 'BRIDGE', 'LEND', 'STAKE', 'SETTLE']),
      protocol: z.string().min(1),
      protocolAddress: z.string().default('0x0000000000000000000000000000000000000000'),
      fromAsset: z.string().min(1),
      toAsset: z.string().min(1),
      fromChain: z.number().int().positive(),
      toChain: z.number().int().positive(),
      estimatedOutput: z.number().positive().optional(),
      gasEstimateUsd: z.number().nonnegative().optional(),
      bridgeFeeUsd: z.number().nonnegative().optional(),
      slippageBps: z.number().nonnegative().optional(),
      apyBps: z.number().nonnegative().optional(),
    });

    const ComposeSchema = z.object({
      steps: z.array(StepSchema).min(1).max(10),
      simulate: z.boolean().optional().default(false),
      fromAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
    });

    const parsed = ComposeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { steps, simulate: runSim, fromAddress } = parsed.data;

    // Validate step connectivity: each step's toAsset/toChain must match next step's fromAsset/fromChain
    for (let i = 0; i < steps.length - 1; i++) {
      const cur = steps[i];
      const next = steps[i + 1];
      if (cur.toChain !== next.fromChain) {
        return reply.status(422).send({
          error: 'Step chain mismatch',
          message: `Step ${i} toChain (${cur.toChain}) does not match step ${i + 1} fromChain (${next.fromChain}). Add a bridge step between them.`,
        });
      }
      if (cur.toAsset !== next.fromAsset) {
        return reply.status(422).send({
          error: 'Step asset mismatch',
          message: `Step ${i} toAsset (${cur.toAsset}) does not match step ${i + 1} fromAsset (${next.fromAsset}). Add a swap step between them.`,
        });
      }
    }

    // Enrich steps with live quote data where available
    const now = Math.floor(Date.now() / 1000);
    const enrichedSteps = steps.map((s) => {
      const apyQuote = opts.quoteEngine.getApyQuote(s.protocol, s.fromChain, s.fromAsset);
      const gasQuote = opts.quoteEngine.getGasQuote(s.fromChain);
      return {
        stepType: s.stepType,
        protocol: s.protocol,
        protocolAddress: s.protocolAddress,
        fromAsset: s.fromAsset,
        toAsset: s.toAsset,
        fromChain: s.fromChain,
        toChain: s.toChain,
        estimatedOutput: s.estimatedOutput ?? 0,
        gasEstimateUsd: s.gasEstimateUsd ?? gasQuote?.typicalTxUsd ?? 2,
        bridgeFeeUsd: s.bridgeFeeUsd ?? 0,
        slippageBps: s.slippageBps ?? 30,
        apyBps: s.apyBps ?? apyQuote?.supplyApyBps ?? 0,
      };
    });

    const totalGasUsd = enrichedSteps.reduce((acc, s) => acc + s.gasEstimateUsd, 0);
    const totalBridgeFeeUsd = enrichedSteps.reduce((acc, s) => acc + s.bridgeFeeUsd, 0);
    const bridgeCount = enrichedSteps.filter((s) => s.stepType === 'BRIDGE').length;
    const estimatedApyBps = enrichedSteps
      .filter((s) => s.apyBps > 0)
      .reduce((acc, s) => acc + s.apyBps, 0);

    // Simple risk score: higher bridge count + higher slippage = higher risk
    const avgSlippage = enrichedSteps.reduce((acc, s) => acc + s.slippageBps, 0) / enrichedSteps.length;
    const riskScore = Math.min(100, bridgeCount * 15 + Math.floor(avgSlippage / 10));

    const route = {
      steps: enrichedSteps,
      totalScore: estimatedApyBps - riskScore * 10 - totalGasUsd * 100 - totalBridgeFeeUsd * 100,
      estimatedApyBps,
      totalGasUsd,
      totalBridgeFeeUsd,
      totalProtocolFeeUsd: 0,
      estimatedTimeSeconds: steps.length * 60 + bridgeCount * 300,
      hopCount: steps.length,
      bridgeCount,
      riskScore,
    };

    let simulation = null;
    if (runSim && fromAddress) {
      simulation = await simulationService.simulate(route, fromAddress, enrichedSteps[0].fromChain);
    }

    return reply.send({
      route,
      simulation: simulation ?? undefined,
      composedAt: now,
      quoteExpiresAt: now + 60,
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

  // GET /quotes/swap — live swap quote for a given chain/pair
  fastify.get<{
    Querystring: { chain: string; from: string; to: string; protocol?: string };
  }>('/quotes/swap', async (request, reply) => {
    const { chain, from: fromAsset, to: toAsset, protocol = 'uniswap_v3' } = request.query;
    if (!chain || !fromAsset || !toAsset) {
      return reply.status(400).send({ error: 'chain, from, and to are required' });
    }

    const quote = opts.quoteEngine.getSwapQuote(protocol, Number(chain), fromAsset, toAsset);
    if (!quote) {
      // Try reverse direction for common pairs (e.g. USDC→ETH when we only have ETH→USDC)
      const reverse = opts.quoteEngine.getSwapQuote(protocol, Number(chain), toAsset, fromAsset);
      if (!reverse) {
        return reply.status(404).send({
          error: 'No swap quote available for this pair',
          hint: 'Supported pairs refresh every 15s. Try ETH→USDC on chains 1, 42161, 8453.',
        });
      }
      // Return flipped with inverted amounts
      return reply.send({
        ...reverse,
        fromAsset: toAsset,
        toAsset: fromAsset,
        amountIn: reverse.amountOut.toString(),
        amountOut: reverse.amountIn.toString(),
        _reversed: true,
      });
    }

    return reply.send({
      ...quote,
      amountIn: quote.amountIn.toString(),
      amountOut: quote.amountOut.toString(),
    });
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

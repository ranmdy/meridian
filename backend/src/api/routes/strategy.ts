import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyMessage } from 'viem';
import type { StrategyEngine } from '../../services/strategy-engine/index.js';
import type { QuoteEngine } from '../../services/quote-engine/index.js';

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
  fastify.post('/strategy/optimize', async (request, reply) => {
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

  // GET /strategy/graph — debug endpoint (dev only)
  fastify.get('/strategy/graph/stats', async (_request, reply) => {
    return reply.send(opts.strategyEngine.graphStats());
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

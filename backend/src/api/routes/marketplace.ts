import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  publishStrategy,
  browseStrategies,
  getStrategy,
  voteStrategy,
  deprecateStrategy,
  type SortField,
} from '../../services/marketplace/index.js';
import { requireAuth } from './auth.js';
import { mintStrategyNFT, buildMetadataUri } from '../../services/nft/index.js';

const PublishSchema = z.object({
  name: z.string().min(3).max(80),
  description: z.string().min(10).max(500),
  route: z.object({
    steps: z.array(z.any()),
    totalScore: z.number(),
    estimatedApyBps: z.number(),
    totalGasUsd: z.number(),
    totalBridgeFeeUsd: z.number(),
    totalProtocolFeeUsd: z.number(),
    estimatedTimeSeconds: z.number(),
    hopCount: z.number(),
    bridgeCount: z.number(),
    riskScore: z.number(),
  }),
  sourceAsset: z.string().min(1),
  sourceChain: z.number().int().positive(),
  destinationChain: z.number().int().positive(),
  riskTolerance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  timeHorizonDays: z.number().int().min(1).max(3650),
});

const VALID_SORTS: SortField[] = ['yield', 'risk', 'votes', 'newest', 'popular'];

export async function marketplaceRoutes(fastify: FastifyInstance) {
  // GET /strategies — browse marketplace
  fastify.get<{
    Querystring: {
      sort?: string;
      chain?: string;
      maxRisk?: string;
      minApy?: string;
      limit?: string;
      offset?: string;
    };
  }>('/strategies', async (request, reply) => {
    const { sort, chain, maxRisk, minApy, limit, offset } = request.query;

    const sortField = VALID_SORTS.includes(sort as SortField) ? (sort as SortField) : 'votes';

    const result = browseStrategies({
      sort: sortField,
      chain: chain ? Number(chain) : undefined,
      maxRisk: maxRisk ? Number(maxRisk) : undefined,
      minApyBps: minApy ? Math.round(Number(minApy) * 100) : undefined, // convert % to bps
      limit: limit ? Math.min(Number(limit), 50) : 20,
      offset: offset ? Number(offset) : 0,
    });

    return reply.send(result);
  });

  // GET /strategies/:id — single strategy
  fastify.get<{ Params: { id: string } }>('/strategies/:id', async (request, reply) => {
    const strategy = getStrategy(request.params.id);
    if (!strategy) return reply.status(404).send({ error: 'Strategy not found' });
    return reply.send(strategy);
  });

  // POST /strategies — publish a strategy (requires auth)
  fastify.post('/strategies', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const parsed = PublishSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid strategy', details: parsed.error.flatten() });
    }

    const strategy = publishStrategy({
      ...parsed.data,
      creatorWallet: request.user!.sub,
    });

    // Fire-and-forget NFT mint — does not block the response
    void buildMetadataUri({
      name: strategy.name,
      description: strategy.description,
      estimatedApyBps: strategy.route.estimatedApyBps,
      riskScore: strategy.route.riskScore,
      creator: strategy.creatorWallet,
    }).then((metadataUri) =>
      mintStrategyNFT(strategy.id, strategy.creatorWallet as `0x${string}`, metadataUri)
    )
      .then((result) => {
        if (result.success) {
          fastify.log.info(`[NFT] Minted for strategy ${strategy.id}: tx ${result.txHash}`);
        } else {
          fastify.log.warn(`[NFT] Mint skipped/failed for ${strategy.id}: ${result.error}`);
        }
      });

    return reply.status(201).send(strategy);
  });

  // POST /strategies/:id/vote — upvote a strategy
  fastify.post<{ Params: { id: string } }>('/strategies/:id/vote', async (request, reply) => {
    const ok = voteStrategy(request.params.id);
    if (!ok) return reply.status(404).send({ error: 'Strategy not found or deprecated' });
    return reply.send({ ok: true });
  });

  // GET /strategies/:id/performance — historical APY vs published APY
  fastify.get<{ Params: { id: string } }>(
    '/strategies/:id/performance',
    async (request, reply) => {
      const strategy = getStrategy(request.params.id);
      if (!strategy) return reply.status(404).send({ error: 'Strategy not found' });

      const ageSeconds = Math.floor(Date.now() / 1000) - strategy.publishedAt;
      const ageDays = ageSeconds / 86400;

      // Phase 1: compare published APY to a ±5% simulated drift
      // Phase 2: this will query on-chain subgraph for real historical yield
      const drift = (Math.random() - 0.5) * 0.1; // ±5% relative drift
      const currentApyBps = Math.round(strategy.publishedApyBps * (1 + drift));
      const apyDeltaBps = currentApyBps - strategy.publishedApyBps;

      return reply.send({
        strategyId: strategy.id,
        publishedApyBps: strategy.publishedApyBps,
        currentApyBps,
        apyDeltaBps,
        executionCount: strategy.executionCount,
        votes: strategy.votes,
        ageDays: Math.round(ageDays),
        deprecated: strategy.deprecated,
        _note: 'Phase 1: simulated drift. Phase 2 will use on-chain subgraph.',
      });
    },
  );

  // DELETE /strategies/:id — deprecate (creator only, requires auth)
  fastify.delete<{ Params: { id: string } }>('/strategies/:id', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const ok = deprecateStrategy(request.params.id, request.user!.sub);
    if (!ok) {
      return reply.status(403).send({ error: 'Not found or not the creator' });
    }
    return reply.send({ ok: true });
  });
}

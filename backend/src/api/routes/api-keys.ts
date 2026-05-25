import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createApiKey,
  revokeApiKey,
  listApiKeys,
  getApiKeyStats,
  type ApiKeyTier,
} from '../../services/api-keys/index.js';
import { requireAuth } from './auth.js';

const CreateKeySchema = z.object({
  tier: z.enum(['starter', 'growth', 'enterprise']),
  name: z.string().min(1).max(64),
  environment: z.enum(['test', 'live']).optional(),
});

export async function apiKeyRoutes(fastify: FastifyInstance) {
  // GET /api-keys — list all keys for the authed wallet
  fastify.get('/api-keys', { preHandler: requireAuth }, async (request, reply) => {
    const keys = listApiKeys(request.user!.sub);
    const stats = getApiKeyStats(request.user!.sub);
    return reply.send({ keys, stats });
  });

  // POST /api-keys — create a new API key
  fastify.post('/api-keys', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = CreateKeySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { tier, name, environment } = parsed.data;

    // Enforce key limits per wallet (max 10 active keys)
    const existing = listApiKeys(request.user!.sub);
    const active = existing.filter((k) => !k.revokedAt);
    if (active.length >= 10) {
      return reply.status(429).send({
        error: 'API key limit reached',
        message: 'Maximum 10 active API keys per account. Revoke an existing key first.',
      });
    }

    const { record, rawKey } = createApiKey({
      walletAddress: request.user!.sub,
      tier: tier as ApiKeyTier,
      name,
      environment,
    });

    // Return the raw key ONCE — it cannot be retrieved again
    return reply.status(201).send({
      id: record.id,
      rawKey,        // shown once; user must store it securely
      tier: record.tier,
      name: record.name,
      environment: record.environment,
      requestsPerMinute: record.requestsPerMinute,
      requestsPerMonth: record.requestsPerMonth,
      createdAt: record.createdAt,
      _warning: 'Store this key securely — it will not be shown again.',
    });
  });

  // DELETE /api-keys/:id — revoke an API key
  fastify.delete<{ Params: { id: string } }>(
    '/api-keys/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const ok = revokeApiKey(request.params.id, request.user!.sub);
      if (!ok) {
        return reply.status(404).send({ error: 'Key not found or not owned by this wallet' });
      }
      return reply.send({ ok: true, id: request.params.id, revoked: true });
    },
  );

  // GET /api-keys/usage — per-key usage breakdown for the authed wallet
  fastify.get('/api-keys/usage', { preHandler: requireAuth }, async (request, reply) => {
    const keys = listApiKeys(request.user!.sub);
    const stats = getApiKeyStats(request.user!.sub);

    const breakdown = keys.map((k) => ({
      id: k.id,
      name: k.name,
      tier: k.tier,
      environment: k.environment,
      usageThisMonth: k.usageThisMonth,
      requestsPerMonth: k.requestsPerMonth,
      utilizationPct: k.requestsPerMonth > 0
        ? Math.round((k.usageThisMonth / k.requestsPerMonth) * 100)
        : 0,
      lastUsedAt: k.lastUsedAt,
      active: !k.revokedAt,
    }));

    return reply.send({
      breakdown,
      totals: stats,
      generatedAt: Math.floor(Date.now() / 1000),
    });
  });
}

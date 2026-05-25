import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  registerWebhook,
  deregisterWebhook,
  listWebhooks,
  type WebhookEvent,
} from '../../services/webhooks/index.js';
import { requireAuth } from './auth.js';

const VALID_EVENTS: WebhookEvent[] = [
  'StrategyStarted',
  'StepExecuted',
  'StrategyCompleted',
  'StrategyFailed',
];

const RegisterSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16).max(256),
  events: z.array(z.enum(['StrategyStarted', 'StepExecuted', 'StrategyCompleted', 'StrategyFailed'])).min(1),
});

export async function webhookRoutes(fastify: FastifyInstance) {
  // GET /webhooks — list registered webhooks (auth required)
  fastify.get('/webhooks', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const hooks = listWebhooks(request.user!.sub);
    // Don't return the secret
    return reply.send(hooks.map(({ secret: _s, ...rest }) => rest));
  });

  // POST /webhooks — register a new webhook (auth required)
  fastify.post('/webhooks', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { url, secret, events } = parsed.data;
    const hook = registerWebhook(request.user!.sub, url, secret, events as WebhookEvent[]);

    return reply.status(201).send({
      id: hook.id,
      url: hook.url,
      events: hook.events,
      createdAt: hook.createdAt,
      active: hook.active,
    });
  });

  // DELETE /webhooks/:id — deregister a webhook (auth required)
  fastify.delete<{ Params: { id: string } }>('/webhooks/:id', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const ok = deregisterWebhook(request.params.id, request.user!.sub);
    if (!ok) return reply.status(404).send({ error: 'Webhook not found or not owned by you' });
    return reply.send({ ok: true });
  });

  // GET /webhooks/events — list available event types
  fastify.get('/webhooks/events', async (_request, reply) => {
    return reply.send({ events: VALID_EVENTS });
  });
}

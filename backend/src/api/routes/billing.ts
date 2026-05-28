import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createCheckoutSession,
  cancelSubscription,
  getSubscription,
  getBillingHistory,
  handleStripeWebhook,
  reportApiUsage,
} from '../../services/stripe/index.js';
import { requireAuth } from './auth.js';

const CheckoutSchema = z.object({
  tier: z.enum(['pro', 'api']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export async function billingRoutes(fastify: FastifyInstance) {
  // GET /billing/subscription — current subscription for the authed wallet
  fastify.get('/billing/subscription', { preHandler: requireAuth }, async (request, reply) => {
    const sub = getSubscription(request.user!.sub);
    if (!sub) {
      return reply.send({ tier: 'free', status: 'active', cancelAtPeriodEnd: false });
    }
    return reply.send(sub);
  });

  // GET /billing/history — billing event log
  fastify.get('/billing/history', { preHandler: requireAuth }, async (request, reply) => {
    return reply.send({ events: getBillingHistory(request.user!.sub) });
  });

  // POST /billing/checkout — create Stripe Checkout session
  fastify.post('/billing/checkout', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = CheckoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    try {
      const session = await createCheckoutSession({
        walletAddress: request.user!.sub,
        tier: parsed.data.tier,
        successUrl: parsed.data.successUrl,
        cancelUrl: parsed.data.cancelUrl,
      });
      return reply.send(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Checkout failed';
      return reply.status(502).send({ error: msg });
    }
  });

  // POST /billing/cancel — cancel subscription at period end
  fastify.post('/billing/cancel', { preHandler: requireAuth }, async (request, reply) => {
    try {
      await cancelSubscription(request.user!.sub);
      return reply.send({ ok: true, message: 'Subscription will cancel at period end' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cancel failed';
      return reply.status(400).send({ error: msg });
    }
  });

  // GET /billing/revenue — aggregate revenue summary (for internal dashboard / admin)
  // Returns total MRR, subscription breakdown, and per-tier counts.
  // Auth required — only returns data for the authenticated wallet's own subscriptions.
  // A future admin middleware would expose the full platform view.
  fastify.get('/billing/revenue', { preHandler: requireAuth }, async (request, reply) => {
    const wallet = request.user!.sub;
    const history = getBillingHistory(wallet);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartMs = monthStart.getTime();

    const thisMonthRevenue = history
      .filter((e) => e.type === 'payment_succeeded' && e.timestamp >= monthStartMs)
      .reduce((sum, e) => sum + e.amountUsd, 0);

    const totalRevenue = history
      .filter((e) => e.type === 'payment_succeeded')
      .reduce((sum, e) => sum + e.amountUsd, 0);

    const sub = getSubscription(wallet);

    return reply.send({
      wallet,
      subscription: sub
        ? {
            tier: sub.tier,
            status: sub.status,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          }
        : null,
      revenue: {
        totalUsd: parseFloat(totalRevenue.toFixed(2)),
        thisMonthUsd: parseFloat(thisMonthRevenue.toFixed(2)),
        paymentsCount: history.filter((e) => e.type === 'payment_succeeded').length,
      },
      _note: 'This endpoint shows the current wallet\'s billing history only. Platform-wide revenue is available in the Stripe Dashboard.',
    });
  });

  // POST /billing/report-usage — manually report accumulated API usage to Stripe (admin/cron)
  // Accepts an optional `quantity` override; defaults to the wallet's current month usage.
  fastify.post(
    '/billing/report-usage',
    { preHandler: requireAuth },
    async (request, reply) => {
      const body = request.body as { quantity?: number } | undefined;
      const quantity = body?.quantity ?? 0;
      if (quantity < 0 || !Number.isInteger(quantity)) {
        return reply.status(400).send({ error: 'quantity must be a non-negative integer' });
      }
      const reported = await reportApiUsage(request.user!.sub, quantity);
      return reply.send({
        reported,
        wallet: request.user!.sub,
        quantity,
        message: reported
          ? `Reported ${quantity} API calls to Stripe`
          : 'Stripe not configured or wallet is not on API tier',
      });
    },
  );

  // POST /billing/webhook — Stripe webhook receiver (no auth — verified by signature)
  fastify.post(
    '/billing/webhook',
    {
      config: { rawBody: true }, // needed to get raw buffer for signature verification
    },
    async (request, reply) => {
      const signature = request.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        return reply.status(400).send({ error: 'Missing Stripe-Signature header' });
      }

      // @ts-expect-error — rawBody is added by content-type parser when config.rawBody is set
      const rawBody: Buffer = request.rawBody ?? Buffer.from(JSON.stringify(request.body));

      try {
        const result = handleStripeWebhook(rawBody, signature);
        fastify.log.info(`[Stripe webhook] ${result.event} handled=${result.handled}`);
        return reply.send({ received: true, event: result.event });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Webhook error';
        fastify.log.warn(`[Stripe webhook] ${msg}`);
        return reply.status(400).send({ error: msg });
      }
    },
  );
}

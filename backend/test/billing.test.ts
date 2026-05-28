import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCheckoutSession,
  cancelSubscription,
  getSubscription,
  getBillingHistory,
  handleStripeWebhook,
  reportApiUsage,
  type SubscriptionTier,
} from '../src/services/stripe/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const wallet = (suffix: string) => `0xtest${suffix}000000000000000000000000000000000`;

function makeWebhookEvent(type: string, data: Record<string, unknown>): Buffer {
  return Buffer.from(JSON.stringify({ type, data: { object: data } }));
}

// ─── createCheckoutSession (dev mode — no STRIPE_SECRET_KEY) ──────────────────

describe('createCheckoutSession (dev mode)', () => {
  it('returns a session with a URL and sessionId', async () => {
    const w = wallet('checkout1');
    const session = await createCheckoutSession({
      walletAddress: w,
      tier: 'pro',
      successUrl: 'http://localhost:3000/success',
      cancelUrl: 'http://localhost:3000/cancel',
    });
    expect(typeof session.sessionId).toBe('string');
    expect(typeof session.url).toBe('string');
    expect(session.tier).toBe('pro');
  });

  it('auto-grants pro tier in dev mode', async () => {
    const w = wallet('checkout2');
    await createCheckoutSession({
      walletAddress: w,
      tier: 'pro',
      successUrl: 'http://localhost:3000/success',
      cancelUrl: 'http://localhost:3000/cancel',
    });
    const sub = getSubscription(w);
    expect(sub).not.toBeNull();
    expect(sub!.tier).toBe('pro');
    expect(sub!.status).toBe('active');
  });

  it('auto-grants api tier in dev mode', async () => {
    const w = wallet('checkout3');
    await createCheckoutSession({
      walletAddress: w,
      tier: 'api',
      successUrl: 'http://localhost:3000/success',
      cancelUrl: 'http://localhost:3000/cancel',
    });
    const sub = getSubscription(w);
    expect(sub?.tier).toBe('api');
  });
});

// ─── getSubscription ──────────────────────────────────────────────────────────

describe('getSubscription', () => {
  it('returns null for an unknown wallet', () => {
    expect(getSubscription('0x0000000000000000000000000000000000000000')).toBeNull();
  });

  it('is case-insensitive for wallet address', async () => {
    const w = wallet('case1');
    await createCheckoutSession({
      walletAddress: w,
      tier: 'pro',
      successUrl: 'http://x.com/ok',
      cancelUrl: 'http://x.com/cancel',
    });
    // Look up with uppercase
    expect(getSubscription(w.toUpperCase())).not.toBeNull();
  });
});

// ─── cancelSubscription ───────────────────────────────────────────────────────

describe('cancelSubscription', () => {
  it('marks an active subscription as canceled', async () => {
    const w = wallet('cancel1');
    await createCheckoutSession({
      walletAddress: w,
      tier: 'pro',
      successUrl: 'http://x.com/ok',
      cancelUrl: 'http://x.com/cancel',
    });
    await cancelSubscription(w);
    const sub = getSubscription(w);
    expect(sub?.status).toBe('canceled');
    expect(sub?.cancelAtPeriodEnd).toBe(true);
  });

  it('throws when no subscription exists', async () => {
    await expect(cancelSubscription('0x9999999999999999999999999999999999999999')).rejects.toThrow();
  });
});

// ─── getBillingHistory ────────────────────────────────────────────────────────

describe('getBillingHistory', () => {
  it('returns empty array for unknown wallet', () => {
    expect(getBillingHistory('0xdeadbeef000000000000000000000000000000aa')).toEqual([]);
  });

  it('returns events after a checkout', async () => {
    const w = wallet('history1');
    await createCheckoutSession({
      walletAddress: w,
      tier: 'pro',
      successUrl: 'http://x.com/ok',
      cancelUrl: 'http://x.com/cancel',
    });
    const events = getBillingHistory(w);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.type).toBe('subscription_created');
  });
});

// ─── handleStripeWebhook ──────────────────────────────────────────────────────

describe('handleStripeWebhook (no signature secret)', () => {
  it('handles checkout.session.completed', () => {
    const w = wallet('webhook1');
    const body = makeWebhookEvent('checkout.session.completed', {
      id: 'cs_test_1',
      customer: 'cus_test_1',
      subscription: 'sub_test_1',
      metadata: { walletAddress: w, tier: 'pro' },
    });
    const result = handleStripeWebhook(body, 't=0,v1=skip');
    expect(result.handled).toBe(true);
    expect(result.event).toBe('checkout.session.completed');
    expect(getSubscription(w)?.tier).toBe('pro');
  });

  it('handles invoice.payment_succeeded', () => {
    const w = wallet('webhook2');
    const body = makeWebhookEvent('invoice.payment_succeeded', {
      id: 'in_test_1',
      amount_paid: 2900,
      metadata: { walletAddress: w },
    });
    const result = handleStripeWebhook(body, 't=0,v1=skip');
    expect(result.handled).toBe(true);
    const events = getBillingHistory(w);
    expect(events.some((e) => e.type === 'payment_succeeded')).toBe(true);
  });

  it('handles customer.subscription.deleted', async () => {
    const w = wallet('webhook3');
    // First create a subscription to delete
    await createCheckoutSession({
      walletAddress: w,
      tier: 'pro',
      successUrl: 'http://x.com/ok',
      cancelUrl: 'http://x.com/cancel',
    });
    const sub = getSubscription(w);
    const body = makeWebhookEvent('customer.subscription.deleted', {
      id: sub!.stripeSubscriptionId,
    });
    handleStripeWebhook(body, 't=0,v1=skip');
    expect(getSubscription(w)?.status).toBe('canceled');
  });

  // ── invoice.paid ────────────────────────────────────────────────────────────

  it('handles invoice.paid (canonical renewal event)', async () => {
    const w = wallet('invpaid1');
    await createCheckoutSession({
      walletAddress: w,
      tier: 'pro',
      successUrl: 'http://x.com/ok',
      cancelUrl: 'http://x.com/cancel',
    });
    const sub = getSubscription(w)!;
    const futureEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

    const body = makeWebhookEvent('invoice.paid', {
      id: 'in_paid_1',
      subscription: sub.stripeSubscriptionId,
      amount_paid: 2900,
      lines: { data: [{ period: { end: futureEnd } }] },
    });
    const result = handleStripeWebhook(body, 't=0,v1=skip');
    expect(result.handled).toBe(true);
    expect(result.event).toBe('invoice.paid');
    // currentPeriodEnd should be updated
    expect(getSubscription(w)?.currentPeriodEnd).toBe(futureEnd);
    // payment event should be logged
    expect(getBillingHistory(w).some((e) => e.type === 'payment_succeeded')).toBe(true);
  });

  it('invoice.paid clears past_due status back to active', async () => {
    const w = wallet('invpaid2');
    await createCheckoutSession({
      walletAddress: w,
      tier: 'pro',
      successUrl: 'http://x.com/ok',
      cancelUrl: 'http://x.com/cancel',
    });
    const sub = getSubscription(w)!;

    // Simulate past_due via invoice.payment_failed
    const failBody = makeWebhookEvent('invoice.payment_failed', {
      id: 'in_fail_1',
      subscription: sub.stripeSubscriptionId,
      amount_due: 2900,
    });
    handleStripeWebhook(failBody, 't=0,v1=skip');
    expect(getSubscription(w)?.status).toBe('past_due');

    // Now pay — status should go back to active
    const payBody = makeWebhookEvent('invoice.paid', {
      id: 'in_paid_2',
      subscription: sub.stripeSubscriptionId,
      amount_paid: 2900,
      lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 86400 } }] },
    });
    handleStripeWebhook(payBody, 't=0,v1=skip');
    expect(getSubscription(w)?.status).toBe('active');
  });

  it('invoice.payment_succeeded with subscription ID updates currentPeriodEnd', async () => {
    const w = wallet('invsucc1');
    await createCheckoutSession({
      walletAddress: w,
      tier: 'pro',
      successUrl: 'http://x.com/ok',
      cancelUrl: 'http://x.com/cancel',
    });
    const sub = getSubscription(w)!;
    const futureEnd = Math.floor(Date.now() / 1000) + 60 * 24 * 3600;

    const body = makeWebhookEvent('invoice.payment_succeeded', {
      id: 'in_succ_1',
      subscription: sub.stripeSubscriptionId,
      amount_paid: 2900,
      lines: { data: [{ period: { end: futureEnd } }] },
    });
    handleStripeWebhook(body, 't=0,v1=skip');
    expect(getSubscription(w)?.currentPeriodEnd).toBe(futureEnd);
  });

  it('handles usage_record.summary.applied', () => {
    const body = makeWebhookEvent('usage_record.summary.applied', { id: 'urs_test' });
    const result = handleStripeWebhook(body, 't=0,v1=skip');
    expect(result.handled).toBe(true);
  });

  it('returns handled=false for unknown event types', () => {
    const body = makeWebhookEvent('payment_intent.created', { id: 'pi_test' });
    const result = handleStripeWebhook(body, 't=0,v1=skip');
    expect(result.handled).toBe(false);
  });

  it('throws on stale webhook when STRIPE_WEBHOOK_SECRET is set', () => {
    const original = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    try {
      const body = makeWebhookEvent('test', {});
      // t=0 (Unix epoch) is way too old
      expect(() => handleStripeWebhook(body, 't=0,v1=abc')).toThrow('too old');
    } finally {
      if (original === undefined) {
        delete process.env.STRIPE_WEBHOOK_SECRET;
      } else {
        process.env.STRIPE_WEBHOOK_SECRET = original;
      }
    }
  });
});

// ─── reportApiUsage ───────────────────────────────────────────────────────────

describe('reportApiUsage (dev mode — no STRIPE_SECRET_KEY)', () => {
  it('returns false when STRIPE_SECRET_KEY is not set', async () => {
    const w = wallet('usage1');
    await createCheckoutSession({
      walletAddress: w, tier: 'api',
      successUrl: 'http://x.com/ok', cancelUrl: 'http://x.com/cancel',
    });
    // No STRIPE_SECRET_KEY set in test env → false
    const result = await reportApiUsage(w, 100);
    expect(result).toBe(false);
  });

  it('returns false for a non-api-tier wallet', async () => {
    const w = wallet('usage2');
    await createCheckoutSession({
      walletAddress: w, tier: 'pro',
      successUrl: 'http://x.com/ok', cancelUrl: 'http://x.com/cancel',
    });
    const result = await reportApiUsage(w, 50);
    expect(result).toBe(false);
  });

  it('returns false for an unknown wallet', async () => {
    const result = await reportApiUsage('0x0000000000000000000000000000000000000000', 10);
    expect(result).toBe(false);
  });

  it('returns false for zero quantity', async () => {
    const w = wallet('usage3');
    await createCheckoutSession({
      walletAddress: w, tier: 'api',
      successUrl: 'http://x.com/ok', cancelUrl: 'http://x.com/cancel',
    });
    const result = await reportApiUsage(w, 0);
    expect(result).toBe(false);
  });
});

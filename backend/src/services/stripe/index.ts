/**
 * Stripe Subscription Service
 *
 * Manages Pro subscription lifecycle:
 *   - Create checkout session  → user pays → webhook confirms → grant pro tier
 *   - Cancel subscription      → webhook confirms → revoke pro tier
 *   - Retrieve billing history → from in-memory log (Phase 2: Stripe API)
 *
 * Phase 1 (current):
 *   - All subscription state is in-memory (resets on restart)
 *   - Stripe webhook signature is verified when STRIPE_WEBHOOK_SECRET is set
 *   - When STRIPE_SECRET_KEY is not set, checkout URLs are fake dev stubs
 *
 * Phase 2:
 *   - Persist to PostgreSQL
 *   - Real Stripe Checkout + Customer Portal
 *   - Subscription metering for API tier
 *
 * Env vars (all optional in dev):
 *   STRIPE_SECRET_KEY       — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET   — whsec_... (required in production)
 *   STRIPE_PRO_PRICE_ID     — price_... (monthly $29 price)
 *   STRIPE_API_PRICE_ID     — price_... (monthly $299 API tier price)
 */

import { createHmac } from 'node:crypto';
import { grantProAccess, registerApiKey } from '../rateLimit/index.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'pro' | 'api';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export interface Subscription {
  walletAddress: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: number;  // Unix timestamp
  cancelAtPeriodEnd: boolean;
  createdAt: number;
}

export interface BillingEvent {
  id: string;
  walletAddress: string;
  type: 'payment_succeeded' | 'payment_failed' | 'subscription_created' | 'subscription_canceled';
  amountUsd: number;
  timestamp: number;
}

// ─── In-memory store ───────────────────────────────────────────────────────────

const subscriptions = new Map<string, Subscription>();   // wallet → subscription
const billingHistory: BillingEvent[] = [];

// ─── Checkout ──────────────────────────────────────────────────────────────────

export interface CheckoutSession {
  sessionId: string;
  url: string;          // redirect user here
  tier: SubscriptionTier;
}

/**
 * Create a Stripe Checkout session for a Pro or API subscription.
 * In dev mode (no STRIPE_SECRET_KEY), returns a stubbed session.
 */
export async function createCheckoutSession(opts: {
  walletAddress: string;
  tier: SubscriptionTier;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSession> {
  const { walletAddress, tier, successUrl, cancelUrl } = opts;

  if (!process.env.STRIPE_SECRET_KEY) {
    // Dev stub — simulate a checkout that auto-succeeds
    const sessionId = `cs_dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    console.log(`[Stripe] Dev mode: auto-granting ${tier} for ${walletAddress}`);
    // Immediately grant the tier in dev
    activateSubscription(walletAddress, tier, `dev_${sessionId}`, `sub_dev_${sessionId}`);
    billingHistory.push({
      id: sessionId,
      walletAddress: walletAddress.toLowerCase(),
      type: 'subscription_created',
      amountUsd: tier === 'api' ? 299 : 29,
      timestamp: Date.now(),
    });
    return {
      sessionId,
      url: `${successUrl}?session_id=${sessionId}&tier=${tier}`,
      tier,
    };
  }

  const priceId = tier === 'api'
    ? (process.env.STRIPE_API_PRICE_ID ?? '')
    : (process.env.STRIPE_PRO_PRICE_ID ?? '');

  if (!priceId) {
    throw new Error(`STRIPE_${tier.toUpperCase()}_PRICE_ID not configured`);
  }

  const body = new URLSearchParams({
    'mode': 'subscription',
    'payment_method_types[]': 'card',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': successUrl,
    'cancel_url': cancelUrl,
    'metadata[walletAddress]': walletAddress,
    'metadata[tier]': tier,
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe checkout failed: ${err}`);
  }

  const session = await res.json() as { id: string; url: string };
  return { sessionId: session.id, url: session.url, tier };
}

// ─── Cancel ────────────────────────────────────────────────────────────────────

/**
 * Cancel a subscription at period end.
 * In dev mode, immediately marks the sub as canceled.
 */
export async function cancelSubscription(walletAddress: string): Promise<void> {
  const sub = subscriptions.get(walletAddress.toLowerCase());
  if (!sub || sub.status === 'canceled') {
    throw new Error('No active subscription found');
  }

  if (!process.env.STRIPE_SECRET_KEY || !sub.stripeSubscriptionId?.startsWith('sub_')) {
    // Dev mode — immediate cancel
    sub.status = 'canceled';
    sub.cancelAtPeriodEnd = true;
    subscriptions.set(walletAddress.toLowerCase(), sub);
    console.log(`[Stripe] Dev mode: subscription canceled for ${walletAddress}`);
    return;
  }

  const res = await fetch(
    `https://api.stripe.com/v1/subscriptions/${sub.stripeSubscriptionId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe cancel failed: ${err}`);
  }

  sub.status = 'canceled';
  sub.cancelAtPeriodEnd = true;
  subscriptions.set(walletAddress.toLowerCase(), sub);
}

// ─── Accessors ─────────────────────────────────────────────────────────────────

export function getSubscription(walletAddress: string): Subscription | null {
  return subscriptions.get(walletAddress.toLowerCase()) ?? null;
}

export function getBillingHistory(walletAddress: string): BillingEvent[] {
  return billingHistory.filter((e) => e.walletAddress === walletAddress.toLowerCase());
}

// ─── Internal activation ──────────────────────────────────────────────────────

function activateSubscription(
  walletAddress: string,
  tier: SubscriptionTier,
  customerId: string,
  subscriptionId: string,
  periodEnd?: number,
): void {
  const wallet = walletAddress.toLowerCase();
  subscriptions.set(wallet, {
    walletAddress: wallet,
    tier,
    status: 'active',
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    createdAt: Date.now(),
  });

  // Grant access in the rate-limiter
  if (tier === 'pro') {
    grantProAccess(wallet);
  } else if (tier === 'api') {
    grantProAccess(wallet); // api users also get pro-level access
    // Register an API key if needed — in production, keys are issued separately
    const apiKey = `sk_${wallet.slice(2, 8)}_${Date.now().toString(36)}`;
    registerApiKey(apiKey, wallet, 1000);
    console.log(`[Stripe] API key issued for ${wallet}: ${apiKey}`);
  }
}

// ─── Stripe webhook handler ────────────────────────────────────────────────────

const WEBHOOK_TOLERANCE_SECS = 300; // 5 minutes

export interface WebhookResult {
  handled: boolean;
  event?: string;
}

/**
 * Verify a Stripe webhook signature and process the event.
 * Pass the raw body bytes and the `Stripe-Signature` header value.
 */
export function handleStripeWebhook(
  rawBody: Buffer,
  signature: string,
): WebhookResult {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (webhookSecret) {
    // Verify signature: t=timestamp,v1=hmac,...
    const parts = signature.split(',');
    const tPart  = parts.find((p) => p.startsWith('t='));
    const v1Part = parts.find((p) => p.startsWith('v1='));

    if (!tPart || !v1Part) return { handled: false };

    const timestamp = parseInt(tPart.slice(2), 10);
    const expected  = v1Part.slice(3);

    // Replay protection
    if (Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECS) {
      throw new Error('Stripe webhook timestamp too old');
    }

    const payload = `${timestamp}.${rawBody.toString('utf8')}`;
    const computed = createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    if (computed !== expected) {
      throw new Error('Stripe webhook signature mismatch');
    }
  }

  const event = JSON.parse(rawBody.toString('utf8')) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const wallet  = session['metadata'] ? (session['metadata'] as Record<string, string>)['walletAddress'] : '';
      const tier    = (session['metadata'] as Record<string, string> | undefined)?.['tier'] as SubscriptionTier ?? 'pro';
      const customerId = String(session['customer'] ?? '');
      const subId   = String(session['subscription'] ?? '');
      if (wallet) {
        activateSubscription(wallet, tier, customerId, subId);
        billingHistory.push({
          id: String(session['id'] ?? Date.now()),
          walletAddress: wallet.toLowerCase(),
          type: 'subscription_created',
          amountUsd: tier === 'api' ? 299 : 29,
          timestamp: Date.now(),
        });
      }
      return { handled: true, event: event.type };
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const wallet  = (invoice['metadata'] as Record<string, string> | undefined)?.['walletAddress'];
      if (wallet) {
        billingHistory.push({
          id: String(invoice['id'] ?? Date.now()),
          walletAddress: wallet.toLowerCase(),
          type: 'payment_succeeded',
          amountUsd: Number(invoice['amount_paid'] ?? 0) / 100,
          timestamp: Date.now(),
        });
      }
      return { handled: true, event: event.type };
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subId   = String(invoice['subscription'] ?? '');
      // Find subscription by Stripe sub ID
      for (const [wallet, sub] of subscriptions.entries()) {
        if (sub.stripeSubscriptionId === subId) {
          sub.status = 'past_due';
          subscriptions.set(wallet, sub);
          billingHistory.push({
            id: String(invoice['id'] ?? Date.now()),
            walletAddress: wallet,
            type: 'payment_failed',
            amountUsd: Number(invoice['amount_due'] ?? 0) / 100,
            timestamp: Date.now(),
          });
          break;
        }
      }
      return { handled: true, event: event.type };
    }

    case 'customer.subscription.deleted': {
      const sub     = event.data.object;
      const subId   = String(sub['id'] ?? '');
      for (const [wallet, s] of subscriptions.entries()) {
        if (s.stripeSubscriptionId === subId) {
          s.status = 'canceled';
          subscriptions.set(wallet, s);
          billingHistory.push({
            id: `sub_del_${Date.now()}`,
            walletAddress: wallet,
            type: 'subscription_canceled',
            amountUsd: 0,
            timestamp: Date.now(),
          });
          break;
        }
      }
      return { handled: true, event: event.type };
    }

    default:
      return { handled: false, event: event.type };
  }
}

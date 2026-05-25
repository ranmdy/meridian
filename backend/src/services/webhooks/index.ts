/**
 * Webhook Notification Service
 *
 * Delivers POST notifications to user-registered webhook URLs when strategy events occur.
 *
 * Events: StrategyStarted, StepExecuted, StrategyCompleted, StrategyFailed
 *
 * Delivery guarantees:
 *   - At-least-once delivery (max 3 attempts with exponential backoff)
 *   - HMAC-SHA256 signature on payload so the recipient can verify authenticity
 *   - Timeout: 10 seconds per attempt
 *   - Phase 2: persist registered hooks + delivery log in PostgreSQL
 */

import { createHmac } from 'node:crypto';

export type WebhookEvent =
  | 'StrategyStarted'
  | 'StepExecuted'
  | 'StrategyCompleted'
  | 'StrategyFailed';

export interface WebhookRegistration {
  id: string;
  walletAddress: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  createdAt: number;
  active: boolean;
}

export interface WebhookPayload {
  event: WebhookEvent;
  strategyId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── In-memory store (Phase 2: PostgreSQL) ────────────────────────────────────

const hooks = new Map<string, WebhookRegistration>();

function makeId(): string {
  return `wh_${Math.random().toString(36).slice(2)}`;
}

export function registerWebhook(
  walletAddress: string,
  url: string,
  secret: string,
  events: WebhookEvent[],
): WebhookRegistration {
  const reg: WebhookRegistration = {
    id: makeId(),
    walletAddress: walletAddress.toLowerCase(),
    url,
    secret,
    events,
    createdAt: Math.floor(Date.now() / 1000),
    active: true,
  };
  hooks.set(reg.id, reg);
  return reg;
}

export function deregisterWebhook(id: string, walletAddress: string): boolean {
  const hook = hooks.get(id);
  if (!hook || hook.walletAddress !== walletAddress.toLowerCase()) return false;
  hook.active = false;
  return true;
}

export function listWebhooks(walletAddress: string): WebhookRegistration[] {
  return Array.from(hooks.values()).filter(
    (h) => h.walletAddress === walletAddress.toLowerCase() && h.active,
  );
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

async function attemptDelivery(hook: WebhookRegistration, payload: WebhookPayload): Promise<boolean> {
  const body = JSON.stringify(payload);
  const sig = signPayload(body, hook.secret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Meridian-Signature': `sha256=${sig}`,
        'X-Meridian-Event': payload.event,
        'X-Meridian-Delivery': `${payload.strategyId}-${Date.now()}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

async function deliverWithRetry(hook: WebhookRegistration, payload: WebhookPayload, maxAttempts = 3): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s
      await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
    }
    const ok = await attemptDelivery(hook, payload);
    if (ok) return;
  }
  // Phase 2: mark hook as failed in DB for manual review
}

/**
 * Emit an event to all registered webhooks that subscribed to it.
 * Fire-and-forget: does not await delivery.
 */
export function emitWebhookEvent(
  walletAddress: string,
  event: WebhookEvent,
  strategyId: string,
  data: Record<string, unknown> = {},
): void {
  const wallet = walletAddress.toLowerCase();
  const payload: WebhookPayload = {
    event,
    strategyId,
    timestamp: Math.floor(Date.now() / 1000),
    data,
  };

  for (const hook of hooks.values()) {
    if (!hook.active) continue;
    if (hook.walletAddress !== wallet) continue;
    if (!hook.events.includes(event)) continue;
    void deliverWithRetry(hook, payload);
  }
}

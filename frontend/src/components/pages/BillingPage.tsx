'use client';

import { useState, useEffect } from 'react';
import { Panel, Tag, PageHead, Spinner } from '@/src/components/ui';
import { useAuthStore } from '@/src/stores/auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type SubscriptionTier = 'free' | 'pro' | 'api';
type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

interface Subscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string;
}

interface BillingEvent {
  id: string;
  type: 'payment_succeeded' | 'payment_failed' | 'subscription_created' | 'subscription_canceled';
  amountUsd: number;
  timestamp: number;
}

async function authGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function authPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: 'Error' })); throw new Error((e as { error: string }).error); }
  return res.json() as Promise<T>;
}

// Display mapping
const TIER_DISPLAY: Record<SubscriptionTier, { name: string; price: number; rpm: number; limit: number; features: string[] }> = {
  free: {
    name: 'Free', price: 0, rpm: 60, limit: 10_000,
    features: ['Manual routes', '5 published strategies', 'Community support'],
  },
  pro: {
    name: 'Growth', price: 49, rpm: 200, limit: 100_000,
    features: ['Auto-AI routes', 'Unlimited publishes', 'Webhooks', 'Email support'],
  },
  api: {
    name: 'Enterprise', price: 299, rpm: 600, limit: 1_000_000,
    features: ['Dedicated solver', 'Private routes', 'SAML SSO', 'Priority simulation', 'Slack support'],
  },
};

const PLANS: SubscriptionTier[] = ['free', 'pro', 'api'];

function fmtDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtEventType(type: BillingEvent['type']): string {
  const map: Record<BillingEvent['type'], string> = {
    payment_succeeded: 'Payment',
    payment_failed: 'Payment failed',
    subscription_created: 'Subscription started',
    subscription_canceled: 'Subscription canceled',
  };
  return map[type] ?? type;
}

export function BillingPage() {
  const { token, isAuthenticated } = useAuthStore();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<SubscriptionTier | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      authGet<Subscription>('/billing/subscription', token),
      authGet<{ events: BillingEvent[] }>('/billing/history', token),
    ])
      .then(([subscription, history]) => {
        setSub(subscription);
        setEvents(history.events);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function handleUpgrade(tier: SubscriptionTier) {
    if (!token) return;
    setCheckoutBusy(tier);
    setError(null);
    try {
      const origin = window.location.origin;
      const res = await authPost<{ url: string }>('/billing/checkout', token, {
        tier,
        successUrl: `${origin}/billing?success=1`,
        cancelUrl: `${origin}/billing`,
      });
      window.location.href = res.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setCheckoutBusy(null);
    }
  }

  async function handleCancel() {
    if (!token || !confirm('Cancel your subscription at the end of this billing period?')) return;
    setCancelBusy(true);
    try {
      await authPost('/billing/cancel', token, {});
      setSub(prev => prev ? { ...prev, cancelAtPeriodEnd: true } : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setCancelBusy(false);
    }
  }

  const currentTier = sub?.tier ?? 'free';
  const display = TIER_DISPLAY[currentTier];

  if (!isAuthenticated()) {
    return (
      <div className="shell" style={{ paddingBottom: 32 }}>
        <PageHead
          eyebrow="Billing"
          title={<span>Plan & <em className="serif-it">usage</em>.</span>}
          desc="Sign in to manage your subscription."
        />
        <div className="panel mt-8 p-10 text-center">
          <div className="caption c-ink-3">Sign in with your wallet to view billing.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell" style={{ paddingBottom: 32 }}>
      <PageHead
        eyebrow={`Billing · ${display.name}`}
        title={<span>Plan & <em className="serif-it">usage</em>.</span>}
        desc="Your subscription covers API requests, AI-route generation, and webhook deliveries. Execution fees on routes (0.08%) are separate and charged on-chain."
        right={
          sub && sub.tier !== 'free' ? (
            <div className="col items-end gap-1">
              <span className="meta">
                {sub.cancelAtPeriodEnd ? 'Cancels' : 'Renews'}
              </span>
              <span className="num-md">{fmtDate(sub.currentPeriodEnd)}</span>
              <span className="caption mono c-ink-3">${display.price}/mo · {sub.status}</span>
            </div>
          ) : (
            <div className="col items-end gap-1">
              <span className="meta">Current plan</span>
              <span className="num-md">{display.name}</span>
              <span className="caption mono c-ink-3">Free tier</span>
            </div>
          )
        }
      />

      {loading && (
        <div className="panel mt-8 p-8 flex justify-center"><Spinner size={16} /></div>
      )}

      {error && (
        <div className="mt-4 caption" style={{ color: 'var(--bad)' }}>✕ {error}</div>
      )}

      {sub?.cancelAtPeriodEnd && (
        <div className="panel mt-6 p-4" style={{ background: 'color-mix(in oklch, var(--warn) 8%, transparent)', borderColor: 'var(--warn)' }}>
          <div className="caption" style={{ color: 'var(--warn)' }}>
            ⚠ Your subscription will cancel on {fmtDate(sub.currentPeriodEnd)}. You will retain access until then.
          </div>
        </div>
      )}

      {/* PLANS */}
      <Panel title="Plans" sub="Pick the one that fits your shape of usage." className="mt-6" noPad>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {PLANS.map((planId, i) => {
            const p = TIER_DISPLAY[planId];
            const isCurrent = currentTier === planId;
            const isBusy = checkoutBusy === planId;
            return (
              <div
                key={planId}
                className="p-6 col gap-4"
                style={{
                  borderRight: i < 2 ? '1px solid color-mix(in oklch, var(--ink) 14%, transparent)' : 'none',
                  background: isCurrent ? 'color-mix(in oklch, var(--signal) 4%, transparent)' : 'transparent',
                  position: 'relative',
                }}
              >
                {isCurrent && (
                  <span className="mono c-signal" style={{ position: 'absolute', top: 18, right: 18, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    ● current
                  </span>
                )}
                <div className="col gap-1">
                  <div className="eyebrow">
                    {planId === 'api' ? 'Scale' : planId === 'pro' ? 'Most popular' : 'Free'}
                  </div>
                  <div className="display-it" style={{ fontSize: 56 }}>{p.name}</div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="num-xl">${p.price}</span>
                  <span className="caption mono c-ink-3">/ month</span>
                </div>
                <div className="caption mono c-ink-3">{p.rpm} rpm · {p.limit.toLocaleString()} req/mo</div>
                <hr />
                <ul className="col gap-2" style={{ padding: 0, margin: 0, listStyle: 'none' }}>
                  {p.features.map(f => (
                    <li key={f} className="flex gap-2" style={{ fontSize: 13 }}>
                      <span className="c-ink-3 mono">+</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <div className="col gap-2">
                    <button className="btn btn-outline" disabled>Current plan</button>
                    {planId !== 'free' && !sub?.cancelAtPeriodEnd && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--bad)' }}
                        onClick={() => void handleCancel()}
                        disabled={cancelBusy}
                      >
                        {cancelBusy ? <><Spinner size={10} /> Canceling…</> : 'Cancel subscription'}
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    className={'btn ' + (planId === 'api' ? 'btn-primary' : 'btn-signal')}
                    onClick={() => planId !== 'free' && void handleUpgrade(planId)}
                    disabled={isBusy || planId === 'free'}
                  >
                    {isBusy ? (
                      <><Spinner size={12} /> Redirecting…</>
                    ) : planId === 'free' ? (
                      'Downgrade'
                    ) : planId === 'api' ? (
                      'Contact sales →'
                    ) : (
                      'Upgrade →'
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* BILLING HISTORY */}
      <Panel title="Billing history" sub="Recent transactions" className="mt-5" noPad>
        {events.length === 0 ? (
          <div className="p-8 text-center caption muted">No billing history yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Plan</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => (
                <tr key={ev.id}>
                  <td><span className="mono" style={{ fontSize: 12 }}>{ev.id.slice(0, 16)}…</span></td>
                  <td>{new Date(ev.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                  <td className="muted">{fmtEventType(ev.type)}</td>
                  <td className="text-right mono">${ev.amountUsd.toFixed(2)}</td>
                  <td>
                    <Tag tone={ev.type === 'payment_failed' ? 'bad' : ev.type === 'subscription_canceled' ? 'warn' : 'ok'}>
                      {ev.type === 'payment_failed' ? 'failed' : ev.type === 'subscription_canceled' ? 'canceled' : 'paid'}
                    </Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

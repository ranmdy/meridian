'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/stores/auth';

interface Subscription {
  tier: 'free' | 'pro' | 'api';
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: number;
}

interface BillingEvent {
  id: string;
  type: 'payment_succeeded' | 'payment_failed' | 'subscription_created' | 'subscription_canceled';
  amountUsd: number;
  timestamp: number;
}

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  pro:  'Pro — $29/month',
  api:  'Business API — $299/month',
};

const TIER_COLORS: Record<string, string> = {
  free: 'text-gray-400',
  pro:  'text-indigo-400',
  api:  'text-amber-400',
};

const EVENT_LABELS: Record<string, string> = {
  payment_succeeded:   '✓ Payment succeeded',
  payment_failed:      '✗ Payment failed',
  subscription_created: '◈ Subscription started',
  subscription_canceled: '✕ Subscription canceled',
};

export function BillingPanel() {
  const { isAuthenticated } = useAuthStore();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<BillingEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated()) return;
    setIsLoading(true);
    try {
      const [subRes, histRes] = await Promise.all([
        fetch('/billing/subscription', { credentials: 'include' }),
        fetch('/billing/history', { credentials: 'include' }),
      ]);
      if (subRes.ok) setSub(await subRes.json());
      if (histRes.ok) {
        const { events } = await histRes.json();
        setHistory(events ?? []);
      }
    } catch {
      setError('Failed to load billing info');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  const handleUpgrade = useCallback(async (tier: 'pro' | 'api') => {
    setCheckoutLoading(tier);
    setError(null);
    try {
      const res = await fetch('/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier,
          successUrl: `${window.location.origin}/billing?upgraded=1`,
          cancelUrl: `${window.location.origin}/billing`,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setCheckoutLoading(null);
    }
  }, []);

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel your subscription at the end of the billing period?')) return;
    setCancelLoading(true);
    setError(null);
    try {
      const res = await fetch('/billing/cancel', { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setCancelLoading(false);
    }
  }, [load]);

  if (!isAuthenticated()) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>Sign in to manage your subscription.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading billing info…</div>;
  }

  const tier = sub?.tier ?? 'free';
  const status = sub?.status ?? 'active';

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {error && (
        <div className="bg-red-900/40 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Current plan */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
          Current Plan
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-xl font-bold ${TIER_COLORS[tier]}`}>
              {TIER_LABELS[tier]}
            </div>
            <div className="text-sm text-gray-400 mt-1 capitalize">
              Status: {status}
              {sub?.cancelAtPeriodEnd && ' (canceling at period end)'}
              {sub?.currentPeriodEnd && ` · renews ${new Date(sub.currentPeriodEnd * 1000).toLocaleDateString()}`}
            </div>
          </div>

          {tier !== 'free' && !sub?.cancelAtPeriodEnd && (
            <button
              onClick={() => void handleCancel()}
              disabled={cancelLoading}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30 disabled:opacity-50 transition-colors"
            >
              {cancelLoading ? 'Canceling…' : 'Cancel plan'}
            </button>
          )}
        </div>
      </div>

      {/* Plans */}
      {tier === 'free' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Pro */}
          <div className="bg-gray-900 border border-indigo-800 rounded-xl p-5">
            <div className="text-indigo-400 font-bold text-lg mb-1">Pro</div>
            <div className="text-2xl font-bold text-white mb-3">$29<span className="text-sm text-gray-400">/mo</span></div>
            <ul className="text-sm text-gray-300 space-y-1 mb-5">
              <li>✓ Unlimited saved strategies</li>
              <li>✓ Priority execution queue</li>
              <li>✓ Advanced analytics</li>
              <li>✓ 300 API calls/min</li>
              <li>✓ Tax report export</li>
            </ul>
            <button
              onClick={() => void handleUpgrade('pro')}
              disabled={checkoutLoading !== null}
              className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {checkoutLoading === 'pro' ? 'Redirecting…' : 'Upgrade to Pro'}
            </button>
          </div>

          {/* Business API */}
          <div className="bg-gray-900 border border-amber-800 rounded-xl p-5">
            <div className="text-amber-400 font-bold text-lg mb-1">Business API</div>
            <div className="text-2xl font-bold text-white mb-3">$299<span className="text-sm text-gray-400">/mo</span></div>
            <ul className="text-sm text-gray-300 space-y-1 mb-5">
              <li>✓ Everything in Pro</li>
              <li>✓ 1,000 API calls/hr</li>
              <li>✓ API key access</li>
              <li>✓ Dedicated relayer</li>
              <li>✓ SLA: 99.9% uptime</li>
            </ul>
            <button
              onClick={() => void handleUpgrade('api')}
              disabled={checkoutLoading !== null}
              className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {checkoutLoading === 'api' ? 'Redirecting…' : 'Upgrade to Business'}
            </button>
          </div>
        </div>
      )}

      {/* Billing history */}
      {history.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Billing History
          </h2>
          <div className="space-y-3">
            {history.map((event) => (
              <div key={event.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{EVENT_LABELS[event.type] ?? event.type}</span>
                <div className="flex items-center gap-3">
                  {event.amountUsd > 0 && (
                    <span className="text-gray-400">${event.amountUsd.toFixed(2)}</span>
                  )}
                  <span className="text-gray-500 text-xs">
                    {new Date(event.timestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

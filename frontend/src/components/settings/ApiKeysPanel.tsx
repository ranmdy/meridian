'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/stores/auth';

interface ApiKey {
  id: string;
  tier: string;
  name: string;
  environment: string;
  requestsPerMinute: number;
  requestsPerMonth: number;
  usageThisMonth: number;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

interface KeyStats {
  totalKeys: number;
  activeKeys: number;
  totalRequestsThisMonth: number;
}

const TIER_LABELS: Record<string, string> = {
  starter:    'Starter — 10 rpm / 10k/mo',
  growth:     'Growth — 60 rpm / 100k/mo',
  enterprise: 'Enterprise — 300 rpm / 1M/mo',
};

const TIER_COLORS: Record<string, string> = {
  starter:    'text-gray-300 bg-gray-800 border-gray-700',
  growth:     'text-indigo-300 bg-indigo-950/40 border-indigo-800',
  enterprise: 'text-amber-300 bg-amber-950/40 border-amber-800',
};

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

export function ApiKeysPanel() {
  const { token, isAuthenticated } = useAuthStore();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [stats, setStats] = useState<KeyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createTier, setCreateTier] = useState<'starter' | 'growth' | 'enterprise'>('starter');
  const [createName, setCreateName] = useState('');
  const [createEnv, setCreateEnv] = useState<'test' | 'live'>('test');
  const [creating, setCreating] = useState(false);

  // Raw key display (shown once)
  const [rawKey, setRawKey] = useState<string | null>(null);

  // Revoke
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated()) return;
    setLoading(true);
    try {
      const data = await api.apiKeys.list(token ?? undefined);
      setKeys(data.keys);
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!createName.trim() || !token) return;
    setCreating(true);
    setError(null);
    try {
      const result = await api.apiKeys.create(createTier, createName.trim(), createEnv, token);
      setRawKey(result.rawKey);
      setShowCreate(false);
      setCreateName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!token) return;
    setRevoking(id);
    setError(null);
    try {
      await api.apiKeys.revoke(id, token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke key');
    } finally {
      setRevoking(null);
    }
  };

  if (!isAuthenticated()) {
    return (
      <div className="glass p-6 text-center text-gray-500 text-sm">
        Sign in with your wallet to manage API keys.
      </div>
    );
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Active Keys', value: stats.activeKeys },
            { label: 'Total Keys', value: stats.totalKeys },
            { label: 'Requests This Month', value: fmtNum(stats.totalRequestsThisMonth) },
          ].map((s) => (
            <div key={s.label} className="glass p-4">
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className="text-xl font-bold text-gray-100">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Raw key display modal */}
      {rawKey && (
        <div className="glass border border-amber-700 p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-amber-400 font-semibold text-sm">Save your API key now</p>
              <p className="text-gray-400 text-xs mt-0.5">This key will not be shown again.</p>
            </div>
            <button
              onClick={() => setRawKey(null)}
              className="text-gray-600 hover:text-gray-400 text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-green-400 break-all">
              {rawKey}
            </code>
            <button
              onClick={() => void navigator.clipboard.writeText(rawKey)}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors whitespace-nowrap"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Create form */}
      {showCreate ? (
        <div className="glass p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-200">New API Key</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Production bot"
                maxLength={64}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-meridian-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Environment</label>
              <select
                value={createEnv}
                onChange={(e) => setCreateEnv(e.target.value as 'test' | 'live')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-meridian-500"
              >
                <option value="test">Test (sandbox)</option>
                <option value="live">Live (production)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Tier</label>
            <div className="grid grid-cols-3 gap-2">
              {(['starter', 'growth', 'enterprise'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setCreateTier(t)}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors ${
                    createTier === t
                      ? TIER_COLORS[t] + ' ring-1 ring-offset-0 ring-current'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span className="capitalize block font-semibold">{t}</span>
                  <span className="text-gray-500 font-normal">
                    {t === 'starter' ? '10 rpm' : t === 'growth' ? '60 rpm' : '300 rpm'}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void handleCreate()}
              disabled={!createName.trim() || creating}
              className="px-4 py-2 bg-meridian-600 hover:bg-meridian-500 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
            >
              {creating ? 'Creating…' : 'Create Key'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setCreateName(''); }}
              className="px-4 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">API Keys</h2>
          <button
            onClick={() => setShowCreate(true)}
            disabled={activeKeys.length >= 10}
            title={activeKeys.length >= 10 ? 'Maximum 10 active keys' : undefined}
            className="px-4 py-2 bg-meridian-600 hover:bg-meridian-500 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
          >
            + New Key
          </button>
        </div>
      )}

      {/* Active keys */}
      {loading ? (
        <div className="text-gray-500 text-sm text-center py-8">Loading…</div>
      ) : activeKeys.length === 0 && !showCreate ? (
        <div className="glass p-8 text-center space-y-2">
          <p className="text-gray-400 text-sm">No active API keys.</p>
          <p className="text-gray-600 text-xs">Create a key to access the Meridian API programmatically.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeKeys.map((k) => (
            <div key={k.id} className="glass p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-100">{k.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs border ${TIER_COLORS[k.tier]}`}>
                      {k.tier}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs border ${
                      k.environment === 'live'
                        ? 'text-green-400 bg-green-950/30 border-green-800'
                        : 'text-gray-400 bg-gray-800 border-gray-700'
                    }`}>
                      {k.environment}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-gray-500 mt-1">{k.id}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                    <span>{fmtNum(k.requestsPerMinute)} rpm</span>
                    <span>·</span>
                    <span>{fmtNum(k.usageThisMonth)} / {fmtNum(k.requestsPerMonth)} this month</span>
                    <span>·</span>
                    <span>Created {fmtDate(k.createdAt)}</span>
                    {k.lastUsedAt && (
                      <>
                        <span>·</span>
                        <span>Last used {fmtDate(k.lastUsedAt)}</span>
                      </>
                    )}
                  </div>
                  {/* Usage bar */}
                  <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden w-full max-w-xs">
                    <div
                      className="h-full bg-meridian-600 rounded-full"
                      style={{ width: `${Math.min(100, (k.usageThisMonth / k.requestsPerMonth) * 100)}%` }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => void handleRevoke(k.id)}
                  disabled={revoking === k.id}
                  className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/50 border border-red-800 text-red-400 text-xs rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  {revoking === k.id ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Revoked keys (collapsed) */}
      {revokedKeys.length > 0 && (
        <details className="group">
          <summary className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer select-none list-none flex items-center gap-1">
            <span className="group-open:hidden">▶</span>
            <span className="hidden group-open:inline">▼</span>
            {revokedKeys.length} revoked key{revokedKeys.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2">
            {revokedKeys.map((k) => (
              <div key={k.id} className="glass p-3 opacity-50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 line-through">{k.name}</span>
                  <span className="text-xs text-gray-600 font-mono">{k.id}</span>
                  <span className="text-xs text-red-700">revoked {fmtDate(k.revokedAt!)}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Docs note */}
      <div className="text-xs text-gray-600 border-t border-gray-800 pt-4">
        Include your key in requests as <code className="text-gray-500">Authorization: Bearer mk_…</code>
        {' '}or <code className="text-gray-500">X-Api-Key: mk_…</code> header.
        {' '}{TIER_LABELS[activeKeys[0]?.tier ?? 'starter']}
      </div>
    </div>
  );
}

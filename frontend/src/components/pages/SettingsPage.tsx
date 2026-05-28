'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Panel, Tag, StatBox, PageHead, Field, Segmented, Spinner } from '@/src/components/ui';
import { TIERS } from '@/src/lib/mockData';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/stores/auth';

type ApiKey = {
  id: string; tier: string; name: string; environment: string;
  requestsPerMinute: number; requestsPerMonth: number; usageThisMonth: number;
  createdAt: number; lastUsedAt: number | null; revokedAt: number | null;
};
type Stats = { totalKeys: number; activeKeys: number; totalRequestsThisMonth: number };

function fmtTs(ts: number | null): string {
  if (!ts) return 'never';
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtTsShort(ts: number | null): string {
  if (!ts) return 'never';
  return new Date(ts * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function SettingsPage() {
  const { token, isAuthenticated } = useAuthStore();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [tier, setTier] = useState('free');
  const [env, setEnv] = useState<'test' | 'live'>('test');
  const [newName, setNewName] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const loadKeys = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api.apiKeys.list(token)
      .then(r => { setKeys(r.keys); setStats(r.stats); })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load keys'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  async function handleCreate() {
    if (!token || !newName.trim()) return;
    setCreateBusy(true);
    setError(null);
    try {
      const res = await api.apiKeys.create(tier, newName.trim(), env, token);
      setRevealedKey(res.rawKey);
      setCreating(false);
      setNewName('');
      loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!token) return;
    try {
      await api.apiKeys.revoke(id, token);
      loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed');
    }
  }

  function copyKey() {
    if (revealedKey) navigator.clipboard.writeText(revealedKey).catch(() => {});
  }

  const activeKeys = keys.filter(k => !k.revokedAt);
  const revokedKeys = keys.filter(k => k.revokedAt);

  if (!isAuthenticated()) {
    return (
      <div className="shell" style={{ paddingBottom: 32 }}>
        <PageHead
          eyebrow="Settings · Developer"
          title={<span>API <em className="serif-it">keys</em>.</span>}
          desc="Sign in with your wallet to manage API keys."
        />
        <div className="panel mt-8 p-10 text-center">
          <div className="serif-it c-ink-3" style={{ fontSize: 36 }}>⊙</div>
          <div className="caption mt-3 c-ink-3">Sign in to access API keys.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell" style={{ paddingBottom: 32 }}>
      <PageHead
        eyebrow="Settings · Developer"
        title={<span>API <em className="serif-it">keys</em>.</span>}
        desc="Programmatic access to optimize, simulate, and execute routes. Keys scoped per environment. Revoke at any time."
      />

      <div className="grid mt-8" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatBox label="Active keys" value={stats ? String(stats.activeKeys) : '—'} />
        <StatBox label="Total keys" value={stats ? String(stats.totalKeys) : '—'} />
        <StatBox label="Requests · this month" value={stats ? stats.totalRequestsThisMonth.toLocaleString() : '—'} />
        <StatBox label="Rate-limit hits" value="0" sub="last 30 days" />
      </div>

      {error && (
        <div className="mt-4 caption" style={{ color: 'var(--bad)' }}>✕ {error}</div>
      )}

      <Panel
        className="mt-6"
        title="Keys"
        sub={stats ? `${stats.activeKeys} active, ${revokedKeys.length} revoked` : undefined}
        right={
          <button className="btn btn-signal btn-sm" onClick={() => { setCreating(true); setTimeout(() => nameRef.current?.focus(), 50); }}>
            + New key
          </button>
        }
        noPad
      >
        {/* Create form */}
        {creating && (
          <div className="px-5 py-5 hairline-b" style={{ background: 'color-mix(in oklch, var(--ink) 3%, transparent)' }}>
            <div className="serif" style={{ fontSize: 22, marginBottom: 16 }}>New key</div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Name">
                <input
                  ref={nameRef}
                  className="input"
                  placeholder="e.g. Production · API gateway"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
                />
              </Field>
              <Field label="Environment">
                <Segmented
                  options={[{ label: 'Test', value: 'test' }, { label: 'Live', value: 'live' }]}
                  value={env}
                  onChange={v => setEnv(v as 'test' | 'live')}
                />
              </Field>
            </div>
            <div className="mt-4">
              <div className="label mb-2">Tier</div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {TIERS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTier(t.id)}
                    className="card-flat p-4 text-left"
                    style={{ borderColor: tier === t.id ? 'var(--ink)' : undefined, borderWidth: tier === t.id ? 2 : 1, cursor: 'pointer' }}
                  >
                    <div className="between gap-2">
                      <div className="serif" style={{ fontSize: 18 }}>{t.name}</div>
                      {tier === t.id && <span className="mono c-signal" style={{ fontSize: 11 }}>●</span>}
                    </div>
                    <div className="mono mt-2" style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                      {t.rpm} rpm · {t.limit.toLocaleString()} /mo
                    </div>
                    <div className="num-md mt-1">
                      {t.price === 0 ? 'Free' : '$' + t.price}
                      <span className="c-ink-3" style={{ fontSize: 11 }}>{t.price === 0 ? '' : '/mo'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button className="btn btn-outline" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn btn-signal" onClick={() => void handleCreate()} disabled={createBusy || !newName.trim()}>
                {createBusy ? <><Spinner size={10} /> Creating…</> : 'Create key'}
              </button>
            </div>
          </div>
        )}

        {/* Revealed key banner */}
        {revealedKey && (
          <div className="px-5 py-5 hairline-b" style={{ background: 'color-mix(in oklch, var(--warn) 8%, transparent)' }}>
            <div className="flex gap-3 items-start">
              <span className="serif-it" style={{ fontSize: 24, color: 'var(--warn)' }}>!</span>
              <div className="col flex-1 gap-2">
                <div className="serif" style={{ fontSize: 20 }}>Save this key now — it won&apos;t be shown again.</div>
                <div className="flex gap-2 items-center">
                  <code className="input mono" style={{ background: 'var(--paper)', fontSize: 13 }}>{revealedKey}</code>
                  <button className="btn btn-outline btn-sm" onClick={copyKey}>Copy</button>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRevealedKey(null)}>Dismiss</button>
            </div>
          </div>
        )}

        {loading && keys.length === 0 ? (
          <div className="p-8 flex justify-center"><Spinner size={16} /></div>
        ) : activeKeys.length === 0 && !creating ? (
          <div className="p-8 text-center caption muted">No active keys. Create one to get started.</div>
        ) : (
          <div className="divide-y">
            {activeKeys.map(k => (
              <div key={k.id} className="px-5 py-5">
                <div className="between gap-4">
                  <div className="col gap-2 flex-1">
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{k.name}</span>
                      <Tag tone={k.environment === 'live' ? 'ok' : 'neutral'}>{k.environment}</Tag>
                      <Tag tone={k.tier === 'enterprise' ? 'warn' : k.tier === 'growth' ? 'info' : 'neutral'}>{k.tier}</Tag>
                    </div>
                    <div className="mono c-ink-3" style={{ fontSize: 12 }}>
                      {k.id}
                      <span className="muted-2"> ····················· </span>
                      <span className="muted-2">hidden</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => { if (confirm('Revoke this key? This cannot be undone.')) void handleRevoke(k.id); }}
                    >
                      Revoke
                    </button>
                  </div>
                </div>

                <div className="grid mt-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                  <div>
                    <div className="label mb-1">Rate</div>
                    <div className="mono">{k.requestsPerMinute} req/min</div>
                  </div>
                  <div>
                    <div className="label mb-1">Used · month</div>
                    <div className="mono">{k.usageThisMonth.toLocaleString()} / {k.requestsPerMonth.toLocaleString()}</div>
                    <div className="bar mt-2">
                      <div className="bar-fill" style={{ background: 'var(--ink)', width: (Math.min(100, (k.usageThisMonth / k.requestsPerMonth) * 100)) + '%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="label mb-1">Created</div>
                    <div className="mono">{fmtTs(k.createdAt)}</div>
                  </div>
                  <div>
                    <div className="label mb-1">Last used</div>
                    <div className="mono">{fmtTsShort(k.lastUsedAt)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {revokedKeys.length > 0 && (
        <Panel title="Revoked" sub={`${revokedKeys.length} ${revokedKeys.length === 1 ? 'key' : 'keys'}`} className="mt-5" noPad>
          <div className="divide-y">
            {revokedKeys.map(k => (
              <div key={k.id} className="row">
                <div className="flex gap-3 items-center flex-1">
                  <span className="mono muted" style={{ fontSize: 12 }}>{k.id}</span>
                  <span className="muted">{k.name}</span>
                  <Tag tone="neutral">{k.environment}</Tag>
                </div>
                <span className="caption mono muted">revoked {fmtTs(k.revokedAt)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="mt-8 caption muted">
        Reference: <a href="https://docs.meridian.dev/api" target="_blank" rel="noopener noreferrer" className="arr">docs.meridian.dev/api ↗</a> · Webhooks beta available on request.
      </div>
    </div>
  );
}

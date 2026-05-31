'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { PageHead, Spinner } from '@/src/components/ui';
import { api, type ExecutionStatus, type StepStatus, type RouteStep } from '@/src/lib/api';
import { useExecutionStore } from '@/src/stores/execution';

// ── Constants ─────────────────────────────────────────────────────────────────
const TERMINAL = new Set(['completed', 'failed', 'emergency_exited']);
const POLL_MS = 3000;
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const EXPLORER: Record<number, string> = {
  1: 'https://etherscan.io/tx/', 8453: 'https://basescan.org/tx/',
  42161: 'https://arbiscan.io/tx/', 56: 'https://bscscan.com/tx/',
  137: 'https://polygonscan.com/tx/', 10: 'https://optimistic.etherscan.io/tx/',
  43114: 'https://snowtrace.io/tx/', 534352: 'https://scrollscan.com/tx/',
  324: 'https://explorer.zksync.io/tx/',
};

function fmtElapsed(secs?: number): string {
  if (!secs) return '0:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtTime(ts?: number): string {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function truncateTx(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

// ── Step metadata helpers ──────────────────────────────────────────────────────
const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum', 8453: 'Base', 42161: 'Arbitrum', 137: 'Polygon',
  56: 'BNB', 10: 'Optimism', 43114: 'Avalanche', 534352: 'Scroll', 324: 'zkSync',
};

function fmtProtocol(p: string): string {
  return p.replace(/_/g, ' ').replace(/\bv(\d)/gi, 'V$1').replace(/\b\w/g, c => c.toUpperCase());
}

function stepLabel(meta: RouteStep): string {
  const proto = fmtProtocol(meta.protocol);
  const type = meta.stepType.charAt(0) + meta.stepType.slice(1).toLowerCase();
  if (meta.stepType === 'BRIDGE') {
    const from = CHAIN_NAMES[meta.fromChain] ?? String(meta.fromChain);
    const to = CHAIN_NAMES[meta.toChain] ?? String(meta.toChain);
    return `${proto} · Bridge ${meta.fromAsset} (${from} → ${to})`;
  }
  if (meta.stepType === 'SWAP') {
    return `${proto} · Swap ${meta.fromAsset} → ${meta.toAsset}`;
  }
  if (meta.stepType === 'LEND') {
    return `${proto} · Lend ${meta.fromAsset}`;
  }
  if (meta.stepType === 'STAKE') {
    return `${proto} · Stake ${meta.fromAsset}`;
  }
  return `${proto} · ${type} ${meta.fromAsset}`;
}

// ── Step icon ─────────────────────────────────────────────────────────────────
function StepIcon({ step, isLive }: { step: StepStatus; isLive: boolean }) {
  const base: React.CSSProperties = {
    width: 32, height: 32, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600,
  };
  if (step.status === 'done') {
    return <div style={{ ...base, background: 'var(--ok)', color: 'white' }}>✓</div>;
  }
  if (step.status === 'failed') {
    return <div style={{ ...base, background: 'var(--bad)', color: 'white' }}>✕</div>;
  }
  if (isLive || step.status === 'in_progress') {
    return (
      <div style={{ ...base, background: 'var(--info)', color: 'white' }}>
        <span className="pulse">●</span>
      </div>
    );
  }
  return (
    <div style={{ ...base, border: '1px solid color-mix(in oklch, var(--ink) 25%, transparent)', color: 'var(--ink-4)' }}>
      {String(step.index + 1).padStart(2, '0')}
    </div>
  );
}

// ── Export buttons ────────────────────────────────────────────────────────────
function ExportButtons({ executionId }: { executionId: string }) {
  const download = useCallback(async (format: 'csv' | 'json' | 'text') => {
    const url = `${BASE_URL}/executions/${executionId}/report?format=${format}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return;
    const cd = res.headers.get('content-disposition') ?? '';
    const match = cd.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] ?? `meridian-${executionId}.${format}`;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [executionId]);

  return (
    <div className="flex gap-2 flex-wrap">
      <button className="btn btn-outline" onClick={() => void download('csv')}>CSV ↓</button>
      <button className="btn btn-outline" onClick={() => void download('json')}>JSON ↓</button>
      <button className="btn btn-outline" onClick={() => void download('text')}>PDF ↓</button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function ExecutionPage({ id }: { id: string }) {
  const { updateStatus, stepMeta } = useExecutionStore();
  const routeSteps = stepMeta[id] ?? [];
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const setAndStore = useCallback((s: ExecutionStatus) => {
    setStatus(s);
    updateStatus(s);
  }, [updateStatus]);

  useEffect(() => {
    let active = true;

    function startPolling() {
      const poll = async () => {
        if (!active) return;
        try {
          const s = await api.strategy.status(id);
          setAndStore(s);
          if (!TERMINAL.has(s.status)) {
            timerRef.current = setTimeout(() => void poll(), POLL_MS);
          }
        } catch (err) {
          if (active) setError(err instanceof Error ? err.message : 'Status fetch failed');
        }
      };
      void poll();
    }

    // Try WebSocket first, fall back to polling
    const wsUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/^http/, 'ws');
    try {
      const ws = new WebSocket(`${wsUrl}/ws/strategy/${id}`);
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'get_status' }));
      ws.onmessage = () => {
        void api.strategy.status(id).then(s => { if (active) setAndStore(s); }).catch(() => {});
      };
      ws.onerror = () => { ws.close(); startPolling(); };
      ws.onclose = () => { if (active) startPolling(); };
    } catch {
      startPolling();
    }

    // Initial fetch regardless
    void api.strategy.status(id)
      .then(s => { if (active) setAndStore(s); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Status fetch failed'); });

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [id, setAndStore]);

  const isComplete = status?.status === 'completed';
  const isFailed = status?.status === 'failed' || status?.status === 'emergency_exited';
  const isLive = !isComplete && !isFailed;

  return (
    <div className="shell-narrow" style={{ paddingBottom: 48 }}>
      <div className="py-6">
        <Link href="/" className="caption">← Back to routes</Link>
      </div>

      <PageHead
        eyebrow={<>Execution · <span className="mono" style={{ textTransform: 'none' }}>{id}</span></>}
        title={
          isComplete
            ? <span>Strategy <em className="serif-it">complete</em>.</span>
            : isFailed
            ? <span>Execution <em className="serif-it">failed</em>.</span>
            : <span>In <em className="serif-it">flight</em>.</span>
        }
        desc={
          isComplete
            ? 'Assets delivered to destination wallet.'
            : 'Updates every 3 seconds against on-chain confirmations. You can close this tab and return any time.'
        }
      />

      {/* Error state */}
      {error && !status && (
        <div className="panel mt-8 p-5" style={{ borderColor: 'var(--bad)' }}>
          <div className="caption" style={{ color: 'var(--bad)' }}>✕ {error}</div>
          <button className="btn btn-outline btn-sm mt-3" onClick={() => { setError(null); window.location.reload(); }}>
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {!status && !error && (
        <div className="panel mt-8 p-10 flex justify-center">
          <Spinner size={20} />
        </div>
      )}

      {status && (
        <div className="panel mt-8">
          {/* Status header */}
          <div className="px-5 py-4 hairline-b between">
            <div className="flex gap-3 items-center">
              {isLive && <span className="dot pulse" style={{ width: 10, height: 10, background: 'var(--info)' }} />}
              {isComplete && <span style={{ width: 10, height: 10, borderRadius: 0, background: 'var(--ok)', display: 'inline-block' }} />}
              {isFailed && <span style={{ width: 10, height: 10, background: 'var(--bad)', display: 'inline-block' }} />}
              <div className="col">
                <div className="label">Status</div>
                <div className="serif" style={{ fontSize: 22 }}>
                  {isComplete
                    ? 'Complete'
                    : isFailed
                    ? status.status === 'emergency_exited' ? 'Emergency exit' : 'Failed'
                    : (() => {
                      const m = routeSteps[status.currentStep];
                      const proto = m ? ` · ${fmtProtocol(m.protocol)}` : '';
                      return `Step ${status.currentStep + 1} of ${status.totalSteps}${proto} · in progress`;
                    })()}
                </div>
              </div>
            </div>
            <div className="col items-end gap-1">
              <span className="meta">Elapsed</span>
              <span className="num-md">{fmtElapsed(status.elapsedSeconds)}</span>
            </div>
          </div>

          {/* Progress track */}
          {status.steps.length > 0 && (
            <div className="px-5 py-5 hairline-b">
              <div style={{ display: 'flex', gap: 4 }}>
                {status.steps.map((s, i) => {
                  const color = s.status === 'done'
                    ? 'var(--ok)'
                    : s.status === 'in_progress'
                    ? 'var(--info)'
                    : s.status === 'failed'
                    ? 'var(--bad)'
                    : 'color-mix(in oklch, var(--ink) 10%, transparent)';
                  return <div key={i} style={{ flex: 1, height: 6, background: color }} />;
                })}
              </div>
              <div className="flex justify-between mt-2">
                {status.steps.map((s, i) => {
                  const m = routeSteps[i];
                  const tick = m ? fmtProtocol(m.protocol).split(' ')[0] : String(i + 1).padStart(2, '0');
                  return (
                    <span key={i} className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      {tick}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step list */}
          <div className="divide-y">
            {status.steps.map((s) => {
              const isStepLive = s.status === 'in_progress';
              const txUrl = s.txHash && s.chain && EXPLORER[s.chain]
                ? `${EXPLORER[s.chain]}${s.txHash}`
                : s.txHash
                ? `https://etherscan.io/tx/${s.txHash}`
                : null;
              const meta = routeSteps[s.index];
              const label = meta ? stepLabel(meta) : `Step ${s.index + 1}`;

              return (
                <div key={s.index} className="px-5 py-5 flex gap-4 items-start">
                  <StepIcon step={s} isLive={isStepLive} />
                  <div className="col gap-1 flex-1">
                    <div className="flex items-center gap-3">
                      <div style={{ fontSize: 14, color: s.status === 'pending' ? 'var(--ink-3)' : 'var(--ink)', fontWeight: 500 }}>
                        {label}
                      </div>
                      {isStepLive && (
                        <span className="mono c-info" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                          ● live
                        </span>
                      )}
                      {s.status === 'failed' && (
                        <span className="tag tag-bad" style={{ fontSize: 11 }}>failed</span>
                      )}
                    </div>
                    {(txUrl || s.completedAt || (s.estimatedCompletionAt && isStepLive)) && (
                      <div className="flex gap-3 items-center mt-1 flex-wrap">
                        {txUrl && (
                          <a
                            href={txUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mono c-info"
                            style={{ fontSize: 11 }}
                          >
                            tx {truncateTx(s.txHash!)} ↗
                          </a>
                        )}
                        {s.completedAt && (
                          <span className="mono c-ink-3" style={{ fontSize: 11 }}>· {fmtTime(s.completedAt)}</span>
                        )}
                        {s.estimatedCompletionAt && isStepLive && (
                          <span className="mono c-ink-3" style={{ fontSize: 11 }}>ETA {fmtTime(s.estimatedCompletionAt)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Completion banner */}
          {isComplete && (
            <div
              className="px-5 py-8 text-center"
              style={{
                background: 'color-mix(in oklch, var(--ok) 6%, transparent)',
                borderTop: '1px solid color-mix(in oklch, var(--ok) 30%, transparent)',
              }}
            >
              <div style={{ width: 56, height: 56, margin: '0 auto', background: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 30 }}>
                ✓
              </div>
              <div className="serif mt-4" style={{ fontSize: 28 }}>Strategy <em className="serif-it">complete</em>.</div>
              <div className="body mt-1">Assets delivered to destination wallet.</div>
            </div>
          )}

          {/* Failed banner */}
          {isFailed && (
            <div
              className="px-5 py-6 text-center"
              style={{
                background: 'color-mix(in oklch, var(--bad) 6%, transparent)',
                borderTop: '1px solid color-mix(in oklch, var(--bad) 30%, transparent)',
              }}
            >
              <div className="serif" style={{ fontSize: 22 }}>
                {status.status === 'emergency_exited'
                  ? <>Emergency exit triggered. Assets returned to source wallet.</>
                  : <>Execution failed. No funds were moved.</>
                }
              </div>
              <Link href="/" className="btn btn-outline mt-4" style={{ display: 'inline-block' }}>
                Try again →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Export + share panel */}
      {status && (
        <div className="panel mt-5">
          <div className="section-head">
            <div className="col gap-1">
              <div className="title" style={{ fontSize: 22 }}>Export report</div>
              <div className="caption">For accounting · compatible with Koinly, CoinTracker, TaxBit, Coinpanda.</div>
            </div>
          </div>
          <div className="p-5 flex gap-2 flex-wrap">
            <ExportButtons executionId={id} />
            <button
              className="btn btn-outline"
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                const text = encodeURIComponent(`Just executed a cross-chain DeFi strategy with @MeridianDeFi — fully autonomous routing. Try it ↓`);
                window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener,noreferrer');
              }}
            >
              Share on X →
            </button>
            <Link href="/" className="btn btn-primary">Run another</Link>
          </div>
        </div>
      )}

      <div className="caption text-center mt-6 muted">
        Tracking id <span className="mono">{id}</span> · ledger updated every 3s · auto-resumes on reconnect
      </div>
    </div>
  );
}

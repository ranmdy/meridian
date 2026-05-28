'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Panel, PageHead, Spinner } from '@/src/components/ui';
import { fmtUsd } from '@/src/lib/mockData';
import { api, type ExecutionStatus } from '@/src/lib/api';
import { useAuthStore } from '@/src/stores/auth';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Position {
  chain: number;
  asset: string;
  amountUsd: number;
  count: number;
}

const CHAIN_NAME: Record<number, string> = {
  1: 'Ethereum', 42161: 'Arbitrum', 8453: 'Base', 137: 'Polygon',
  56: 'BNB Chain', 10: 'Optimism', 43114: 'Avalanche', 534352: 'Scroll', 324: 'zkSync Era',
};

const ASSET_COLOR: Record<string, string> = {
  ETH: 'var(--c-slate)', USDC: 'var(--c-moss)', USDT: 'var(--c-moss)',
  WBTC: 'var(--c-clay)', DAI: 'var(--c-ochre)', default: 'var(--ink-3)',
};

function fmtElapsed(secs?: number): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

// ── Decorative chart (30-day simulated, no real data) ─────────────────────────
function PerfChart() {
  const points = useMemo(() => {
    let v = 138_000;
    return Array.from({ length: 30 }, (_, i) => {
      v += (Math.sin(i * 0.4) + 0.3) * 240 + Math.cos(i * 0.7) * 120;
      return { d: i, v };
    });
  }, []);

  const W = 700, H = 200, P = 24;
  const min = Math.min(...points.map(p => p.v));
  const max = Math.max(...points.map(p => p.v));
  const xs = (i: number) => P + (i / (points.length - 1)) * (W - P * 2);
  const ys = (v: number) => H - P - ((v - min) / (max - min)) * (H - P * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.v).toFixed(1)}`).join(' ');
  const area = path + ` L ${xs(points.length - 1)} ${H - P} L ${xs(0)} ${H - P} Z`;

  return (
    <div className="panel">
      <div className="section-head">
        <div className="col gap-1">
          <div className="title">Net value</div>
          <div className="caption">30-day trend (illustrative)</div>
        </div>
        <div className="flex gap-2">
          {['24h', '7d', '30d', '90d', 'YTD'].map(p => (
            <button key={p} className={'pill ' + (p === '30d' ? 'active' : '')}>{p}</button>
          ))}
        </div>
      </div>
      <div className="p-5">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220, display: 'block' }}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="color-mix(in oklch, var(--ink) 7%, transparent)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#grid)" />
          <path d={area} fill="color-mix(in oklch, var(--signal) 12%, transparent)" />
          <path d={path} fill="none" stroke="var(--signal)" strokeWidth="1.5" />
          {points.map((p, i) => i % 5 === 0 ? (
            <circle key={i} cx={xs(i)} cy={ys(p.v)} r={1.5} fill="var(--signal)" />
          ) : null)}
        </svg>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function PortfolioPage() {
  const { wallet, token, isAuthenticated } = useAuthStore();
  const [positions, setPositions] = useState<Position[]>([]);
  const [executions, setExecutions] = useState<ExecutionStatus[]>([]);
  const [totalExecs, setTotalExecs] = useState(0);
  const [completedExecs, setCompletedExecs] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!wallet || !token) return;
    setLoading(true);
    Promise.all([
      api.user.portfolio(wallet),
      api.user.executions(wallet, 20),
    ])
      .then(([portfolio, execHistory]) => {
        setPositions(portfolio.positions);
        setTotalExecs(portfolio.totalExecutions);
        setCompletedExecs(portfolio.completedExecutions);
        setExecutions(execHistory.executions);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet, token]);

  const totalUsd = positions.reduce((sum, p) => sum + p.amountUsd, 0);

  // Group positions by chain
  const byChain = useMemo(() => {
    const map = new Map<number, { chain: number; positions: Position[]; total: number }>();
    for (const pos of positions) {
      const existing = map.get(pos.chain);
      if (existing) {
        existing.positions.push(pos);
        existing.total += pos.amountUsd;
      } else {
        map.set(pos.chain, { chain: pos.chain, positions: [pos], total: pos.amountUsd });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [positions]);

  // Allocation for bar
  const alloc = positions.map(p => ({
    key: `${p.chain}:${p.asset}`,
    asset: p.asset,
    usd: p.amountUsd,
    pct: totalUsd > 0 ? (p.amountUsd / totalUsd) * 100 : 0,
    color: ASSET_COLOR[p.asset] ?? ASSET_COLOR.default,
  })).sort((a, b) => b.usd - a.usd);

  if (!isAuthenticated()) {
    return (
      <div className="shell" style={{ paddingBottom: 32 }}>
        <PageHead
          eyebrow="Portfolio"
          title={<span>Holdings, <em className="serif-it">consolidated</em>.</span>}
          desc="Connect and sign in with your wallet to view your portfolio."
        />
        <div className="panel mt-8 p-10 text-center">
          <div className="serif-it c-ink-3" style={{ fontSize: 36 }}>⊙</div>
          <div className="caption mt-3 c-ink-3">Sign in with your wallet to see your portfolio.</div>
          <Link href="/" className="btn btn-signal mt-4" style={{ display: 'inline-block' }}>
            Go to routes →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="shell" style={{ paddingBottom: 32 }}>
      <PageHead
        eyebrow={`Portfolio · ${wallet ? wallet.slice(0, 6) + '…' + wallet.slice(-4) : ''}`}
        title={<span>Holdings, <em className="serif-it">consolidated</em>.</span>}
        desc="Execution-derived positions across every supported chain. Updated from on-chain confirmations."
        right={
          <div className="col items-end gap-1">
            <span className="meta">Total value</span>
            {loading ? <Spinner size={16} /> : (
              <span className="num-xl">{fmtUsd(totalUsd, 2)}</span>
            )}
          </div>
        }
      />

      {loading && positions.length === 0 && (
        <div className="panel mt-8 p-10 flex justify-center"><Spinner size={20} /></div>
      )}

      {!loading && positions.length === 0 && (
        <div className="panel mt-8 p-10 text-center">
          <div className="caption c-ink-3">No positions yet. Execute a strategy to see holdings here.</div>
        </div>
      )}

      {positions.length > 0 && (
        <>
          {/* ALLOCATION BAR */}
          <Panel title="Allocation" sub="By position, % of total" className="mt-8" noPad>
            <div className="p-5">
              <div style={{ display: 'flex', height: 14, border: '1px solid color-mix(in oklch, var(--ink) 20%, transparent)' }}>
                {alloc.map((a, i) => (
                  <div
                    key={a.key}
                    style={{
                      width: a.pct + '%', background: a.color,
                      borderRight: i < alloc.length - 1 ? '1px solid var(--paper)' : 'none',
                    }}
                    title={`${a.asset} ${a.pct.toFixed(1)}%`}
                  />
                ))}
              </div>
              <div className="grid mt-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                {alloc.map(a => (
                  <div key={a.key} className="flex items-center gap-2" style={{ fontSize: 12 }}>
                    <span className="dot-sq" style={{ background: a.color, width: 10, height: 10 }} />
                    <span style={{ fontWeight: 500 }}>{a.asset}</span>
                    <span className="mono ml-auto">{a.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <div className="grid mt-5" style={{ gridTemplateColumns: '2fr 1fr', gap: 20 }}>
            <PerfChart />
            <div className="panel p-5 col gap-4">
              <div className="label">Summary</div>
              <div className="col gap-3">
                {[
                  { l: 'Total executions', v: String(totalExecs), c: 'var(--ink)' },
                  { l: 'Completed', v: String(completedExecs), c: 'var(--ok)' },
                  { l: 'Total positions', v: String(positions.length), c: 'var(--ink)' },
                  { l: 'Chains active', v: String(byChain.length), c: 'var(--ink)' },
                ].map((s, i, arr) => (
                  <div
                    key={i}
                    className="between"
                    style={{ paddingBottom: 10, borderBottom: i < arr.length - 1 ? '1px solid color-mix(in oklch, var(--ink) 10%, transparent)' : 'none' }}
                  >
                    <span className="caption">{s.l}</span>
                    <span className="mono" style={{ color: s.c, fontWeight: 500 }}>{s.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CHAIN-GROUPED POSITIONS */}
          <div className="mt-5 col gap-4">
            {byChain.map(group => (
              <Panel
                key={group.chain}
                title={CHAIN_NAME[group.chain] ?? `Chain ${group.chain}`}
                sub={`${group.positions.length} ${group.positions.length === 1 ? 'position' : 'positions'}`}
                right={
                  <div className="col items-end gap-1">
                    <span className="num-md">{fmtUsd(group.total)}</span>
                    <span className="caption mono c-ink-3">
                      {totalUsd > 0 ? ((group.total / totalUsd) * 100).toFixed(1) : '0'}% of total
                    </span>
                  </div>
                }
                noPad
              >
                <div className="divide-y">
                  {group.positions.map(pos => (
                    <div key={`${pos.chain}:${pos.asset}`} className="px-5 py-4 between">
                      <div className="flex gap-3 items-center">
                        <span className="dot-sq" style={{ background: ASSET_COLOR[pos.asset] ?? ASSET_COLOR.default, width: 12, height: 12 }} />
                        <div className="col gap-1">
                          <span style={{ fontWeight: 500, fontSize: 15 }}>{pos.asset}</span>
                          <span className="mono c-ink-3" style={{ fontSize: 11 }}>
                            {pos.count} execution{pos.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <span className="mono" style={{ fontSize: 14 }}>{fmtUsd(pos.amountUsd)}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        </>
      )}

      {/* EXECUTION HISTORY */}
      <Panel title="Execution history" sub="Recent strategy runs" className="mt-5" noPad>
        {executions.length === 0 ? (
          <div className="p-8 text-center caption muted">No executions yet.</div>
        ) : (
          <div className="divide-y">
            {executions.map(e => (
              <Link
                key={e.executionId}
                href={`/execution/${e.executionId}`}
                className="row"
                style={{ textDecoration: 'none' }}
              >
                <div className="flex gap-4 items-center flex-1">
                  <span className="mono" style={{ fontSize: 12, width: 180 }}>{e.executionId.slice(0, 18)}…</span>
                  <span
                    className="tag"
                    style={{
                      color: e.status === 'completed'
                        ? 'var(--ok)'
                        : e.status === 'failed' || e.status === 'emergency_exited'
                        ? 'var(--bad)'
                        : 'var(--info)',
                    }}
                  >
                    {e.status}
                  </span>
                  <span className="mono c-ink-3" style={{ fontSize: 12 }}>
                    {e.currentStep + 1}/{e.totalSteps} steps
                  </span>
                </div>
                <div className="flex gap-4 items-center">
                  <span className="mono c-ink-3" style={{ fontSize: 11 }}>{fmtElapsed(e.elapsedSeconds)}</span>
                  <span className="c-ink-3">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import {
  Tag, PageHead, StepChain, KindBadge,
  Field, Segmented, RiskLevels, Spinner, Modal,
} from '@/src/components/ui';
import { CHAINS, ASSETS, SAVED_STRATEGIES, fmtUsd, fmtPct, riskColor } from '@/src/lib/mockData';
import { api, type Route as ApiRoute, type SimulationResult } from '@/src/lib/api';
import { useAuthStore } from '@/src/stores/auth';
import { useExecutionStore } from '@/src/stores/execution';

// ── Constants ─────────────────────────────────────────────────────────────────
const CHAIN_ID: Record<string, number> = {
  Ethereum: 1, Arbitrum: 42161, Base: 8453, Polygon: 137,
  'BNB Chain': 56, Optimism: 10, Avalanche: 43114, Scroll: 534352, 'zkSync Era': 324,
};
const CHAIN_NAME: Record<number, string> = {
  1: 'Ethereum', 42161: 'Arbitrum', 8453: 'Base', 137: 'Polygon',
  56: 'BNB Chain', 10: 'Optimism', 43114: 'Avalanche', 534352: 'Scroll', 324: 'zkSync Era',
};

function getRiskLabel(score: number): string {
  if (score < 25) return 'Low';
  if (score < 50) return 'Moderate';
  if (score < 75) return 'High';
  return 'Very High';
}

// ── Quote expiry countdown ────────────────────────────────────────────────────
function useExpiryCountdown(expiresAt: number | null): number | null {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) { setSecs(null); return; }
    const update = () => setSecs(Math.max(0, expiresAt - Math.floor(Date.now() / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return secs;
}

// ── Display types ─────────────────────────────────────────────────────────────
interface DisplayRoute {
  rank: number;
  apy: number;
  feePct: number;
  totalFeeUsd: number;
  timeMin: number;
  risk: number;
  riskLabel: string;
  steps: Array<{ kind: string; label: string; from?: string; to?: string; token?: string; apy?: number }>;
}

function n(v: number | null | undefined): number { return v ?? 0; }

function toDisplayRoute(r: ApiRoute, rank: number, sourceAmountUsd: number): DisplayRoute {
  const totalFeeUsd = n(r.totalGasUsd) + n(r.totalBridgeFeeUsd) + n(r.totalProtocolFeeUsd);
  return {
    rank,
    apy: n(r.estimatedApyBps) / 100,
    feePct: sourceAmountUsd > 0 ? (totalFeeUsd / sourceAmountUsd) * 100 : 0,
    totalFeeUsd,
    timeMin: n(r.estimatedTimeSeconds) / 60,
    risk: n(r.riskScore),
    riskLabel: getRiskLabel(r.riskScore),
    steps: r.steps.map(s => {
      if (s.stepType === 'BRIDGE') {
        return {
          kind: s.stepType, label: s.protocol,
          from: CHAIN_NAME[s.fromChain] ?? `chain:${s.fromChain}`,
          to: CHAIN_NAME[s.toChain] ?? `chain:${s.toChain}`,
        };
      }
      if (s.stepType === 'LEND' || s.stepType === 'STAKE') {
        return { kind: s.stepType, label: s.protocol, token: s.toAsset, apy: s.apyBps / 100 };
      }
      return { kind: s.stepType, label: s.protocol, from: s.fromAsset, to: s.toAsset };
    }),
  };
}

// ── Route Card ────────────────────────────────────────────────────────────────
function RouteCard({ r, selected, onSelect }: { r: DisplayRoute; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="text-left"
      style={{
        display: 'block', width: '100%', padding: 0,
        background: selected ? 'color-mix(in oklch, var(--signal) 4%, var(--card))' : 'transparent',
        position: 'relative', cursor: 'pointer',
      }}
    >
      {selected && (
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--signal)' }} />
      )}
      <div className="p-5 grid" style={{ gridTemplateColumns: '90px 1fr auto', gap: 24, alignItems: 'center' }}>
        <div className="col gap-2">
          <div className="serif-it" style={{ fontSize: 38, lineHeight: 1, letterSpacing: '-0.03em' }}>
            #{r.rank}
          </div>
          {r.rank === 1 && <Tag tone="signal">Best</Tag>}
        </div>
        <div className="col gap-3">
          <div className="flex items-baseline gap-3">
            <span className="num-lg" style={{ fontSize: 36 }}>
              {r.apy.toFixed(2)}
              <span style={{ fontSize: 18, color: 'var(--ink-3)' }}>%</span>
            </span>
            <span className="label" style={{ alignSelf: 'baseline' }}>net APY</span>
          </div>
          <StepChain steps={r.steps} />
        </div>
        <div className="col gap-1 text-right">
          <div className="flex gap-4 items-baseline">
            <div className="col items-end">
              <div className="label">Fee</div>
              <div className="mono">{r.feePct.toFixed(2)}%</div>
            </div>
            <div className="col items-end">
              <div className="label">Time</div>
              <div className="mono">{r.timeMin.toFixed(1)}m</div>
            </div>
            <div className="col items-end">
              <div className="label">Risk</div>
              <div className="mono" style={{ color: riskColor(r.risk) }}>{r.risk}</div>
            </div>
          </div>
          {selected && (
            <span className="mono c-signal mt-2" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              ↳ selected
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Saved Strategies Panel ────────────────────────────────────────────────────
function SavedStrategiesPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel">
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'transparent', cursor: 'pointer',
          borderBottom: open ? '1px solid color-mix(in oklch, var(--ink) 14%, transparent)' : 'none',
          width: '100%', display: 'flex', alignItems: 'baseline',
          justifyContent: 'space-between', padding: '18px 20px',
        }}
      >
        <div className="flex items-baseline gap-3">
          <div className="title" style={{ fontSize: 22 }}>Saved</div>
          <span className="tag">{SAVED_STRATEGIES.length}</span>
        </div>
        <span className="mono c-ink-3" style={{ fontSize: 11 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="divide-y">
          {SAVED_STRATEGIES.map((s, i) => (
            <div key={i} className="row">
              <div className="col gap-1 flex-1">
                <div style={{ fontWeight: 500 }}>{s.name}</div>
                <div className="caption mono muted">{s.meta}</div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-outline btn-sm">Load</button>
                <button className="btn btn-ghost btn-sm">×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Templates Panel ───────────────────────────────────────────────────────────
type TemplateItem = {
  id: string; name: string; description: string;
  category: string; difficulty: string;
  estimatedApyBps: number; riskLevel: number;
  sourceAsset: string; sourceChain: number; destinationChain: number;
  timeHorizonDays: number; tags: string[];
};

const TEMPLATE_CATS = ['all', 'lending', 'staking', 'farming', 'bridge', 'leverage'];

function TemplatesPanel({ onApply }: { onApply: (t: TemplateItem) => void }) {
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState<'popular' | 'apy' | 'risk'>('popular');
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.templates.list({ category: cat === 'all' ? undefined : cat, sort })
      .then(r => setItems(r.templates))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [cat, sort]);

  return (
    <div className="panel">
      <div className="section-head">
        <div className="col gap-1">
          <div className="title">Templates</div>
          <div className="caption">Pre-built strategies you can fork into the form above.</div>
        </div>
        <select
          className="select" style={{ width: 180 }}
          value={sort}
          onChange={e => setSort(e.target.value as 'popular' | 'apy' | 'risk')}
        >
          <option value="popular">Most popular</option>
          <option value="apy">Highest APY</option>
          <option value="risk">Lowest risk</option>
        </select>
      </div>
      <div className="px-5 py-3 hairline-b flex gap-2 flex-wrap">
        {TEMPLATE_CATS.map(c => (
          <button key={c} className={'pill' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="p-8 flex justify-center"><Spinner size={16} /></div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center caption muted">No templates found.</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {items.map((t, i) => (
            <div
              key={t.id}
              className="p-5 col gap-3"
              style={{
                borderRight: i % 2 === 0 ? '1px solid color-mix(in oklch, var(--ink) 10%, transparent)' : 'none',
                borderBottom: i < items.length - 2 ? '1px solid color-mix(in oklch, var(--ink) 10%, transparent)' : 'none',
              }}
            >
              <div className="between gap-2">
                <div className="serif" style={{ fontSize: 22, lineHeight: 1.15 }}>{t.name}</div>
                <Tag tone={t.difficulty === 'simple' ? 'ok' : t.difficulty === 'moderate' ? 'warn' : 'bad'}>
                  {t.difficulty}
                </Tag>
              </div>
              <div className="body" style={{ fontSize: 13 }}>{t.description}</div>
              <div className="flex gap-4 items-baseline mt-1">
                <div className="num-md">
                  {(t.estimatedApyBps / 100).toFixed(1)}
                  <span className="c-ink-3" style={{ fontSize: 13 }}>%</span>
                </div>
                <span className="mono c-ink-3" style={{ fontSize: 11 }}>
                  · {CHAIN_NAME[t.sourceChain] ?? t.sourceChain} → {CHAIN_NAME[t.destinationChain] ?? t.destinationChain}
                </span>
              </div>
              <div className="between mt-1">
                <div className="flex gap-2">
                  {t.tags.map(tag => (
                    <span key={tag} className="mono c-ink-3" style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      #{tag}
                    </span>
                  ))}
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => onApply(t)}>Use →</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Home Page ─────────────────────────────────────────────────────────────────
export function HomePage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { isAuthenticated } = useAuthStore();
  const { setStepMeta } = useExecutionStore();

  // Form state
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [risk, setRisk] = useState(2);
  const [amount, setAmount] = useState('25000');
  const [srcAsset, setSrcAsset] = useState('USDC');
  const [srcChain, setSrcChain] = useState('Ethereum');
  const [dstChain, setDstChain] = useState('Base');
  const [dstWallet, setDstWallet] = useState('');
  const [timeHorizon, setTimeHorizon] = useState('30');

  // Route state
  const [routes, setRoutes] = useState<DisplayRoute[]>([]);
  const [rawRoutes, setRawRoutes] = useState<ApiRoute[]>([]);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [quoteExpiresAt, setQuoteExpiresAt] = useState<number | null>(null);
  const [optimizeBusy, setOptimizeBusy] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  // Simulation state
  const [sim, setSim] = useState<SimulationResult | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  // Execution state
  const [execBusy, setExecBusy] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [showRisk, setShowRisk] = useState(false);

  const countdown = useExpiryCountdown(quoteExpiresAt);
  const quoteExpired = countdown !== null && countdown <= 0;

  // Pre-fill dstWallet from connected address (once)
  useEffect(() => {
    if (address && !dstWallet) setDstWallet(address);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Auto-simulate when selected route changes
  useEffect(() => {
    if (!rawRoutes[selectedIdx] || !address) return;
    const srcId = CHAIN_ID[srcChain];
    if (!srcId) return;
    setSimBusy(true);
    setSim(null);
    api.strategy.simulate(selectedIdx, address, srcId)
      .then(setSim)
      .catch(() => setSim(null))
      .finally(() => setSimBusy(false));
  }, [selectedIdx, rawRoutes, address, srcChain]);

  // ── Optimize ──────────────────────────────────────────────────────────────
  async function optimize() {
    const srcId = CHAIN_ID[srcChain];
    const dstId = CHAIN_ID[dstChain];
    if (!srcId || !dstId) { setOptimizeError('Unknown chain selection'); return; }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) { setOptimizeError('Enter a valid amount'); return; }

    setOptimizeBusy(true);
    setOptimizeError(null);
    setAiExplanation(null);

    const req = {
      sourceAsset: srcAsset,
      sourceChain: srcId,
      sourceAmountUsd: amountNum,
      destinationChain: dstId,
      riskTolerance: Math.min(5, Math.max(1, risk)) as 1 | 2 | 3 | 4 | 5,
      timeHorizonDays: parseInt(timeHorizon) || 30,
      destinationWallet: dstWallet || undefined,
    };

    try {
      if (mode === 'auto') {
        const res = await api.strategy.autoOptimize(req);
        const all = [res.route, ...res.alternatives];
        setRawRoutes(all);
        setRoutes(all.map((r, i) => toDisplayRoute(r, i + 1, amountNum)));
        setAiExplanation(res.explanation);
        setQuoteExpiresAt(res.quoteExpiresAt);
        setSelectedIdx(res.routeIndex);
      } else {
        const res = await api.strategy.optimize(req);
        setRawRoutes(res.routes);
        setRoutes(res.routes.map((r, i) => toDisplayRoute(r, i + 1, amountNum)));
        setQuoteExpiresAt(res.quoteExpiresAt);
        setSelectedIdx(0);
      }
    } catch (e: unknown) {
      setOptimizeError(e instanceof Error ? e.message : 'Optimize failed');
    } finally {
      setOptimizeBusy(false);
    }
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  async function doExecute() {
    if (!isConnected || !address) { setExecError('Connect your wallet first'); return; }
    if (!isAuthenticated()) { setExecError('Sign in with your wallet first'); return; }
    if (quoteExpired) { setExecError('Quote expired — re-optimize'); return; }

    const selected = routes[selectedIdx];
    const raw = rawRoutes[selectedIdx];
    if (!selected || !raw) return;

    const srcId = CHAIN_ID[srcChain];
    const dstId = CHAIN_ID[dstChain];
    if (!srcId || !dstId) return;

    setExecBusy(true);
    setExecError(null);
    try {
      const res = await api.strategy.execute({
        strategyId: crypto.randomUUID(),
        walletAddress: address,
        sourceAsset: srcAsset,
        sourceChain: srcId,
        destinationChain: dstId,
        sourceAmountUsd: parseFloat(amount) || 0,
        stepCount: raw.steps.length,
        quoteExpiresAt: quoteExpiresAt ?? undefined,
      });
      setStepMeta(res.executionId, raw.steps);
      router.push(`/execution/${res.executionId}`);
    } catch (e: unknown) {
      setExecError(e instanceof Error ? e.message : 'Execute failed');
      setExecBusy(false);
    }
  }

  function handleExecuteClick() {
    const selected = routes[selectedIdx];
    if (!selected) return;
    if (selected.risk >= 40) {
      setShowRisk(true);
    } else {
      doExecute();
    }
  }

  function applyTemplate(t: TemplateItem) {
    const sName = CHAIN_NAME[t.sourceChain];
    const dName = CHAIN_NAME[t.destinationChain];
    if (sName) setSrcChain(sName);
    if (dName) setDstChain(dName);
    setSrcAsset(t.sourceAsset);
    setTimeHorizon(String(t.timeHorizonDays));
    setRisk(Math.min(5, Math.max(1, t.riskLevel)));
  }

  const selected = routes[selectedIdx];

  return (
    <div className="shell" style={{ paddingBottom: 32 }}>
      <PageHead
        eyebrow="01 · Route"
        title={<span>Configure a <em className="serif-it">strategy</em>.</span>}
        desc="Specify what you have, where it should end up, and how much volatility you can stomach. Meridian builds the cheapest path that clears your risk."
        right={
          <div className="col gap-2 items-end">
            <span className="meta">Live oracle prices</span>
            {countdown !== null ? (
              <span className={`mono ${countdown <= 10 ? 'c-bad' : 'c-ink-3'}`} style={{ fontSize: 11 }}>
                Quoted · expires in {countdown}s
              </span>
            ) : (
              <span className="mono c-ink-3" style={{ fontSize: 11 }}>Enter params and optimize</span>
            )}
          </div>
        }
      />

      <div className="grid mt-6" style={{ gridTemplateColumns: 'minmax(0, 420px) minmax(0, 1fr)', gap: 28 }}>
        {/* LEFT — FORM */}
        <div className="col gap-5">
          <div className="panel">
            <div className="section-head">
              <div className="title" style={{ fontSize: 22 }}>Strategy</div>
              <Segmented
                options={[{ label: 'Manual', value: 'manual' }, { label: 'Auto · AI', value: 'auto' }]}
                value={mode}
                onChange={v => setMode(v as 'manual' | 'auto')}
              />
            </div>

            <div className="p-5 col gap-5">
              {/* SOURCE */}
              <div className="col gap-3">
                <div className="eyebrow">A · Source</div>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Asset">
                    <select className="select" value={srcAsset} onChange={e => setSrcAsset(e.target.value)}>
                      {Object.keys(ASSETS).map(a => <option key={a}>{a}</option>)}
                    </select>
                  </Field>
                  <Field label="Chain">
                    <select className="select" value={srcChain} onChange={e => setSrcChain(e.target.value)}>
                      {CHAINS.filter(c => typeof c.id === 'number').map(c => (
                        <option key={String(c.id)}>{c.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Amount" sub="USD">
                  <div className="relative">
                    <input
                      className="input mono"
                      value={amount}
                      onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                      style={{ paddingRight: 60, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}
                    />
                    <span className="absolute mono c-ink-3" style={{ right: 12, top: 13, fontSize: 12 }}>USD</span>
                  </div>
                </Field>
              </div>

              <hr />

              {/* DESTINATION */}
              <div className="col gap-3">
                <div className="eyebrow">B · Destination</div>
                <Field label="Chain">
                  <select className="select" value={dstChain} onChange={e => setDstChain(e.target.value)}>
                    {CHAINS.filter(c => typeof c.id === 'number' && c.name !== srcChain).map(c => (
                      <option key={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Wallet" sub={dstWallet === address ? 'Same as connected wallet' : ''}>
                  <input
                    className="input mono"
                    value={dstWallet}
                    onChange={e => setDstWallet(e.target.value)}
                    placeholder="0x…"
                    style={{ fontSize: 12 }}
                  />
                </Field>
              </div>

              <hr />

              {/* PARAMETERS */}
              <div className="col gap-3">
                <div className="eyebrow">C · Parameters</div>
                <Field label="Risk tolerance">
                  <RiskLevels value={risk} onChange={setRisk} />
                </Field>
                <Field label="Time horizon" sub="days">
                  <input
                    className="input mono"
                    value={timeHorizon}
                    onChange={e => setTimeHorizon(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              </div>

              {optimizeError && (
                <div className="caption" style={{ color: 'var(--bad)', fontSize: 12 }}>✕ {optimizeError}</div>
              )}

              <button
                className="btn btn-signal btn-lg btn-block"
                onClick={optimize}
                disabled={optimizeBusy}
                style={{ marginTop: 4 }}
              >
                {optimizeBusy
                  ? <><Spinner size={12} /> Optimizing…</>
                  : <>Optimize route <span style={{ opacity: 0.7, marginLeft: 4 }}>→</span></>
                }
              </button>
            </div>
          </div>

          <SavedStrategiesPanel />
        </div>

        {/* RIGHT — ROUTES + SIM */}
        <div className="col gap-5">
          <div className="panel">
            <div className="section-head">
              <div className="col gap-1">
                <div className="title">
                  {routes.length > 0 ? `${routes.length} routes found` : 'Routes'}
                </div>
                <div className="caption">
                  {routes.length > 0
                    ? 'Ranked by net APY after fees, gas, and slippage.'
                    : 'Optimize to see available routes.'}
                </div>
              </div>
              {routes.length > 0 && (
                <button className="btn btn-outline btn-sm" onClick={optimize} disabled={optimizeBusy}>
                  {optimizeBusy ? <Spinner size={10} /> : 'Re-quote'}
                </button>
              )}
            </div>

            {/* AI explanation */}
            {mode === 'auto' && aiExplanation && (
              <div className="px-5 py-4 hairline-b" style={{ background: 'color-mix(in oklch, var(--ink) 4%, transparent)' }}>
                <div className="flex gap-3 items-start">
                  <span className="serif-it" style={{ fontSize: 22, color: 'var(--signal)' }}>✦</span>
                  <div className="col gap-1">
                    <div className="label">AI selection</div>
                    <div className="lede" style={{ fontSize: 16 }}>{aiExplanation}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Empty / loading state */}
            {routes.length === 0 && !optimizeBusy && (
              <div className="p-10 col items-center gap-3">
                <div className="serif-it c-ink-3" style={{ fontSize: 36 }}>⊙</div>
                <div className="caption text-center c-ink-3">
                  Fill in the form and click <strong>Optimize route</strong> to see available paths.
                </div>
              </div>
            )}
            {optimizeBusy && (
              <div className="p-10 flex justify-center"><Spinner size={20} /></div>
            )}

            {/* Route list */}
            {routes.length > 0 && (
              <div className="divide-y">
                {routes.map((r, i) => (
                  <RouteCard key={i} r={r} selected={selectedIdx === i} onSelect={() => setSelectedIdx(i)} />
                ))}
              </div>
            )}

            {/* SIMULATION */}
            {selected && (
              <div className="hairline-t">
                <div className="px-5 py-4 between hairline-b">
                  <div className="eyebrow">Simulation · route #{selected.rank}</div>
                  {simBusy ? (
                    <span className="flex items-center gap-2 caption"><Spinner size={10} /> Simulating…</span>
                  ) : sim ? (
                    sim.allStepsPass
                      ? <span className="caption mono c-ok">✓ All steps pass</span>
                      : <span className="caption mono c-bad">✕ Simulation failed</span>
                  ) : null}
                </div>

                <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  {[
                    { l: 'Net APY', v: fmtPct(n(sim ? sim.estimatedApyBps / 100 : selected.apy)), c: 'var(--ink)' },
                    { l: 'Gas cost', v: fmtUsd(n(sim ? sim.totalGasUsd : selected.totalFeeUsd)), c: 'var(--ink-2)' },
                    {
                      l: 'Slippage',
                      v: rawRoutes[selectedIdx]?.steps?.length
                        ? `${(rawRoutes[selectedIdx].steps.reduce((a, s) => a + n(s.slippageBps), 0) / 100).toFixed(2)}%`
                        : '—',
                      c: 'var(--ink-2)',
                    },
                    { l: 'Risk', v: `${selected.riskLabel} · ${selected.risk}`, c: riskColor(selected.risk) },
                  ].map((s, i) => (
                    <div
                      key={i}
                      className="p-4"
                      style={{ borderRight: i < 3 ? '1px solid color-mix(in oklch, var(--ink) 10%, transparent)' : 'none' }}
                    >
                      <div className="label mb-1">{s.l}</div>
                      <div className="num-md" style={{ color: s.c }}>{s.v}</div>
                    </div>
                  ))}
                </div>

                {/* Exploit alerts */}
                {sim?.exploitAlerts && sim.exploitAlerts.length > 0 && (
                  <div className="px-5 py-3 hairline-t hairline-b" style={{ background: 'color-mix(in oklch, var(--bad) 6%, transparent)' }}>
                    {sim.exploitAlerts.map((a, i) => (
                      <div key={i} className="caption" style={{ color: 'var(--bad)', fontSize: 12 }}>⚠ {a}</div>
                    ))}
                  </div>
                )}

                {/* Step breakdown */}
                <div className="px-5 py-4 hairline-t col gap-2">
                  {selected.steps.map((s, i) => {
                    const stepSim = sim?.steps[i];
                    return (
                      <div key={i} className="flex items-center gap-3" style={{ fontSize: 12 }}>
                        <span className={`mono ${stepSim ? (stepSim.passed ? 'c-ok' : 'c-bad') : 'c-ok'}`}>
                          {stepSim ? (stepSim.passed ? '✓' : '✕') : '✓'}
                        </span>
                        <span className="mono c-ink-3" style={{ width: 26 }}>{String(i + 1).padStart(2, '0')}</span>
                        <KindBadge kind={s.kind.toLowerCase()} />
                        <span style={{ flex: 1 }}>
                          {s.label}
                          {s.from && <span className="muted"> · {s.from} → {s.to || s.token}</span>}
                        </span>
                        <span className="mono muted">{stepSim ? fmtUsd(n(stepSim.gasUsd)) : ''}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Execute CTA */}
                <div className="p-5 col gap-3">
                  {execError && (
                    <div className="caption text-center" style={{ color: 'var(--bad)', fontSize: 12 }}>✕ {execError}</div>
                  )}
                  <button
                    className="btn btn-signal btn-lg btn-block"
                    onClick={handleExecuteClick}
                    disabled={execBusy || quoteExpired}
                  >
                    {execBusy ? (
                      <><Spinner size={12} /> Submitting…</>
                    ) : quoteExpired ? (
                      'Quote expired — re-optimize'
                    ) : (
                      `Execute route #${selected.rank} · ${fmtUsd(parseFloat(amount || '0'))} → ${dstChain}`
                    )}
                  </button>
                  <div className="caption text-center muted" style={{ fontSize: 11 }}>
                    Interacting with 3rd-party DeFi protocols. Meridian is non-custodial. Funds are not insured.
                  </div>
                </div>
              </div>
            )}
          </div>

          <TemplatesPanel onApply={applyTemplate} />
        </div>
      </div>

      {/* Risk confirmation modal */}
      <Modal open={showRisk} onClose={() => setShowRisk(false)}>
        <div className="p-6 col gap-4">
          <div className="eyebrow c-bad">Confirm high-risk execution</div>
          <div className="h2">
            This route scores <span className="c-bad serif-it">{selected?.risk}</span> on the risk index.
          </div>
          <div className="body">
            High scores reflect bridge dependencies, leverage, smart-contract concentration, or all three.
            Read the path. Confirm if you accept the trade-off.
          </div>
          <div className="card-flat p-3 mono" style={{ fontSize: 12, lineHeight: 1.6 }}>
            · Funds traverse {selected?.steps.length} protocols.<br />
            · Bridge exposure during {selected ? selected.timeMin.toFixed(1) : '—'}m window.<br />
            · APY ceiling assumes current rates hold for ≥ 7 days.
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn btn-outline" onClick={() => setShowRisk(false)}>Cancel</button>
            <button
              className="btn btn-signal"
              disabled={execBusy}
              onClick={() => { setShowRisk(false); doExecute(); }}
            >
              {execBusy ? <><Spinner size={12} /> Submitting…</> : 'I understand — proceed'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

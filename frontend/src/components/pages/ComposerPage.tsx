'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Field } from '@/src/components/ui';
import { PALETTE_ITEMS, KIND_COLORS } from '@/src/components/composer/palette';
import { api, type Route, type SimulationResult } from '@/src/lib/api';
import { useExecutionStore } from '@/src/stores/execution';

const NODE_W = 184;
const NODE_H = 86;
let __nodeSeq = 100;
function nextNodeId() { return 'n' + (++__nodeSeq); }

function n(v: number | null | undefined): number { return v ?? 0; }

interface CanvasNode {
  id: string;
  kind: 'wallet' | 'bridge' | 'swap' | 'lend' | 'stake';
  protocol: string;
  label: string;
  chain: number;
  chainName: string;
  asset: string;
  toAsset?: string;
  toChain?: number;
  apyBps?: number;
  slippageBps?: number;
  x: number;
  y: number;
}

interface DragState {
  id: string;
  offX: number;
  offY: number;
}

interface ComposeResult {
  route: Route;
  simulation?: SimulationResult;
  quoteExpiresAt: number;
}

const KINDS = ['wallet', 'bridge', 'swap', 'lend', 'stake'] as const;

export function ComposerPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { setStepMeta } = useExecutionStore();

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('1000');

  const [nodes, setNodes] = useState<CanvasNode[]>([
    { id: 'n1', kind: 'wallet', protocol: 'wallet', label: 'ETH Wallet',    chain: 1,    chainName: 'Ethereum', asset: 'ETH',  x: 60,  y: 140 },
    { id: 'n2', kind: 'bridge', protocol: 'across', label: 'Across → Base', chain: 1,    chainName: 'Ethereum', asset: 'USDC', x: 300, y: 140 },
    { id: 'n3', kind: 'lend',   protocol: 'aave_v3',label: 'Aave v3 (Base)',chain: 8453, chainName: 'Base',     asset: 'USDC', apyBps: 520, x: 540, y: 140 },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeResult, setComposeResult] = useState<ComposeResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);

  const filteredItems = PALETTE_ITEMS.filter(p => {
    if (filter !== 'all' && p.kind !== filter) return false;
    if (search && !(
      p.label.toLowerCase().includes(search.toLowerCase()) ||
      p.chainName.toLowerCase().includes(search.toLowerCase())
    )) return false;
    return true;
  });

  const grouped = useMemo(() => {
    const g: Record<string, typeof PALETTE_ITEMS> = {};
    filteredItems.forEach(p => { (g[p.kind] = g[p.kind] || []).push(p); });
    return g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  const ordered = [...nodes].sort((a, b) => a.x - b.x);
  const edges = ordered.slice(0, -1).map((nd, i) => ({ from: nd.id, to: ordered[i + 1].id }));

  const hasWallet = ordered.length > 0 && ordered[0].kind === 'wallet';
  const lastKind = ordered.length > 0 ? ordered[ordered.length - 1].kind : '';
  const ends = lastKind === 'lend' || lastKind === 'stake';
  const valid = nodes.length >= 2 && hasWallet && ends;

  const orderedSteps = ordered.filter(nd => nd.kind !== 'wallet');
  const projectedApy = orderedSteps.reduce((acc, nd) => nd.apyBps ? nd.apyBps / 100 : acc, 0);

  const selected = nodes.find(nd => nd.id === selectedId) ?? null;

  // ── Drag to reposition nodes ────────────────────────────────────────────────
  function onNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    setSelectedId(id);
    const node = nodes.find(nd => nd.id === id);
    if (!node || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    dragState.current = {
      id,
      offX: e.clientX - rect.left + canvasRef.current.scrollLeft - node.x,
      offY: e.clientY - rect.top  + canvasRef.current.scrollTop  - node.y,
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup',   onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    const ds = dragState.current;
    if (!ds || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(8, e.clientX - rect.left + canvasRef.current.scrollLeft - ds.offX);
    const y = Math.max(8, e.clientY - rect.top  + canvasRef.current.scrollTop  - ds.offY);
    setNodes(prev => prev.map(nd => nd.id === ds.id ? { ...nd, x, y } : nd));
  }

  function onPointerUp() {
    dragState.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup',   onPointerUp);
  }

  // ── Palette drag → canvas drop ──────────────────────────────────────────────
  function onPaletteDragStart(e: React.DragEvent, idx: number) {
    e.dataTransfer.setData('text/plain', String(idx));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function onCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const idx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (isNaN(idx) || idx < 0 || idx >= PALETTE_ITEMS.length) return;
    const proto = PALETTE_ITEMS[idx];
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + canvasRef.current.scrollLeft - NODE_W / 2;
    const y = e.clientY - rect.top  + canvasRef.current.scrollTop  - NODE_H / 2;
    const id = nextNodeId();
    setNodes(prev => [
      ...prev,
      { id, kind: proto.kind, protocol: proto.protocol, label: proto.label,
        chain: proto.chain, chainName: proto.chainName, asset: proto.asset,
        apyBps: proto.apyBps, x: Math.max(8, x), y: Math.max(8, y) },
    ]);
    setSelectedId(id);
    setComposeResult(null);
  }

  function deleteNode(id: string) {
    setNodes(prev => prev.filter(nd => nd.id !== id));
    if (selectedId === id) setSelectedId(null);
    setComposeResult(null);
  }

  function clearCanvas() {
    setNodes([]);
    setSelectedId(null);
    setComposeResult(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'Delete' || e.key === 'Backspace') &&
          selectedId &&
          (document.activeElement as HTMLElement)?.tagName !== 'INPUT') {
        deleteNode(selectedId);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function updateSelected(patch: Partial<CanvasNode>) {
    setNodes(prev => prev.map(nd => nd.id === selectedId ? { ...nd, ...patch } : nd));
    setComposeResult(null);
  }

  // ── Compose ─────────────────────────────────────────────────────────────────
  async function handleCompose() {
    if (!valid) return;
    setComposing(true);
    setComposeError(null);
    setComposeResult(null);
    try {
      const steps = orderedSteps.map((nd, i) => {
        const next = orderedSteps[i + 1];
        return {
          stepType: nd.kind.toUpperCase() as 'SWAP' | 'BRIDGE' | 'LEND' | 'STAKE',
          protocol: nd.protocol,
          fromAsset: nd.asset,
          toAsset: nd.toAsset ?? (next?.asset ?? nd.asset),
          fromChain: nd.chain,
          toChain: nd.toChain ?? (next?.chain ?? nd.chain),
          slippageBps: nd.slippageBps,
          apyBps: nd.apyBps,
        };
      });
      const res = await api.strategy.compose({ steps, simulate: true, fromAddress: address });
      setComposeResult({ route: res.route, simulation: res.simulation, quoteExpiresAt: res.quoteExpiresAt });
      setSelectedId(null); // show route summary panel
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Compose failed');
    } finally {
      setComposing(false);
    }
  }

  // ── Execute ─────────────────────────────────────────────────────────────────
  async function handleExecute() {
    if (!composeResult || !address) return;
    const walletNode = ordered.find(nd => nd.kind === 'wallet');
    const lastNode = ordered[ordered.length - 1];
    setExecuting(true);
    setExecuteError(null);
    try {
      const res = await api.strategy.execute({
        strategyId: crypto.randomUUID(),
        walletAddress: address,
        sourceAsset:   walletNode?.asset  ?? orderedSteps[0]?.asset  ?? 'USDC',
        sourceChain:   walletNode?.chain  ?? orderedSteps[0]?.chain  ?? 1,
        destinationChain: lastNode.chain,
        sourceAmountUsd: parseFloat(amount) || 1000,
        stepCount: orderedSteps.length,
        quoteExpiresAt: composeResult.quoteExpiresAt,
      });
      setStepMeta(res.executionId, composeResult.route.steps);
      router.push('/execution/' + res.executionId);
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : 'Execute failed');
      setExecuting(false);
    }
  }

  // ── Status label ─────────────────────────────────────────────────────────────
  const statusLabel = valid
    ? composeResult ? 'composed · ready to execute' : 'ready to compose'
    : !hasWallet ? 'must start with a wallet'
    : !ends       ? 'must end at lend / stake'
    :               'add at least 2 nodes';

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>

      {/* ── TOOLBAR ────────────────────────────────────────────────────────── */}
      <div
        className="hairline-b"
        style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 20px',
                 background: 'var(--paper)', flexShrink: 0, gap: 12 }}
      >
        <span className="eyebrow">Composer</span>
        <span className="mono c-ink-3" style={{ fontSize: 11 }}>
          {orderedSteps.length} steps · {edges.length} edges
        </span>
        <div style={{ flex: 1 }} />
        <label className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>USD</label>
        <input
          className="input mono"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{ width: 90, fontSize: 12, height: 30 }}
          placeholder="1000"
        />
        <span className="mono" style={{ fontSize: 11, color: valid ? 'var(--ok)' : 'var(--warn)' }}>
          ● {statusLabel}
        </span>
        <button className="btn btn-outline btn-sm" onClick={clearCanvas}>Clear</button>
        <button
          className="btn btn-signal btn-sm"
          disabled={!valid || composing}
          onClick={handleCompose}
        >
          {composing ? 'Composing…' : composeResult ? 'Re-compose' : 'Compose & Simulate →'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ── PALETTE ──────────────────────────────────────────────────────── */}
        <aside className="hairline-r" style={{ width: 280, background: 'var(--paper)', overflow: 'auto', flexShrink: 0 }}>
          <div className="p-4 hairline-b">
            <div className="label mb-2">Palette</div>
            <input
              className="input mono"
              placeholder="search protocols…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 12 }}
            />
            <div className="flex gap-1 flex-wrap mt-3">
              <button className={'pill ' + (filter === 'all' ? 'active' : '')} onClick={() => setFilter('all')}>all</button>
              {KINDS.map(k => (
                <button key={k} className={'pill ' + (filter === k ? 'active' : '')} onClick={() => setFilter(k)}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, background: KIND_COLORS[k], marginRight: 4, flexShrink: 0 }} />
                  {k}
                </button>
              ))}
            </div>
          </div>

          {KINDS.filter(k => grouped[k]?.length).map(k => (
            <div key={k} className="p-4 hairline-b">
              <div className="eyebrow mb-3" style={{ color: KIND_COLORS[k] }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, background: KIND_COLORS[k], marginRight: 6 }} />
                {k} · {grouped[k].length}
              </div>
              <div className="col gap-2">
                {grouped[k].map(p => {
                  const idx = PALETTE_ITEMS.indexOf(p);
                  return (
                    <div
                      key={idx}
                      className="card-flat p-3"
                      draggable
                      onDragStart={e => onPaletteDragStart(e, idx)}
                      style={{ cursor: 'grab', borderLeft: '3px solid ' + KIND_COLORS[k] }}
                    >
                      <div className="between gap-2">
                        <div className="col gap-1" style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{p.label}</div>
                          <div className="caption mono c-ink-3" style={{ fontSize: 11 }}>{p.chainName} · {p.asset}</div>
                        </div>
                        {p.apyBps && (
                          <span className="mono" style={{ fontSize: 12, color: KIND_COLORS[k], fontWeight: 500 }}>
                            {(p.apyBps / 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="p-4 caption muted">
            Drag a protocol onto the canvas. Nodes auto-connect left → right by x-position.
            Select + press <span className="mono">Delete</span> to remove.
          </div>
        </aside>

        {/* ── CANVAS ───────────────────────────────────────────────────────── */}
        <main
          ref={canvasRef}
          className="dot-bg"
          style={{ flex: 1, position: 'relative', background: 'var(--paper-2)', overflow: 'auto', minWidth: 0 }}
          onClick={() => setSelectedId(null)}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={onCanvasDrop}
        >
          <div style={{ position: 'relative', width: 1400, height: 700, minWidth: '100%', minHeight: '100%' }}>

            {/* Edges */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              {edges.map((e, i) => {
                const from = nodes.find(nd => nd.id === e.from);
                const to   = nodes.find(nd => nd.id === e.to);
                if (!from || !to) return null;
                const x1 = from.x + NODE_W, y1 = from.y + 40;
                const x2 = to.x,             y2 = to.y   + 40;
                const mx = (x1 + x2) / 2;
                const stroke = from.kind === 'bridge' ? KIND_COLORS.bridge : 'var(--ink-3)';
                return (
                  <g key={i}>
                    <path
                      d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                      stroke={stroke} strokeWidth="1.5" fill="none"
                      strokeDasharray={from.kind === 'bridge' ? '4 3' : undefined}
                    />
                    <circle cx={x2} cy={y2} r="3.5" fill={stroke} />
                    <text
                      x={(x1 + x2) / 2} y={Math.min(y1, y2) - 8}
                      fontSize="9" fontFamily="JetBrains Mono"
                      fill="var(--ink-3)" textAnchor="middle"
                      style={{ letterSpacing: '0.1em' }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Nodes */}
            {nodes.map(node => {
              const stepNo = ordered.findIndex(o => o.id === node.id) + 1;
              const isSel  = selectedId === node.id;
              const apy    = node.apyBps ? node.apyBps / 100 : null;
              return (
                <div
                  key={node.id}
                  onPointerDown={e => onNodePointerDown(e, node.id)}
                  onClick={e => { e.stopPropagation(); setSelectedId(node.id); }}
                  style={{
                    position: 'absolute', left: node.x, top: node.y, width: NODE_W,
                    background: 'var(--card)',
                    borderTop: '1px solid ' + (isSel ? 'var(--ink)' : 'color-mix(in oklch, var(--ink) 20%, transparent)'),
                    borderRight: '1px solid ' + (isSel ? 'var(--ink)' : 'color-mix(in oklch, var(--ink) 20%, transparent)'),
                    borderBottom: '1px solid ' + (isSel ? 'var(--ink)' : 'color-mix(in oklch, var(--ink) 20%, transparent)'),
                    borderLeft: '3px solid ' + KIND_COLORS[node.kind],
                    cursor: 'grab', fontSize: 12, touchAction: 'none', userSelect: 'none',
                    boxShadow: isSel ? '0 0 0 3px color-mix(in oklch, var(--signal) 30%, transparent)' : 'none',
                  }}
                >
                  <div className="px-3 py-2 hairline-b between" style={{ background: 'color-mix(in oklch, var(--ink) 3%, transparent)' }}>
                    <span className="eyebrow" style={{ color: KIND_COLORS[node.kind] }}>{node.kind}</span>
                    <span className="mono c-ink-3" style={{ fontSize: 10 }}>{String(stepNo).padStart(2, '0')}</span>
                  </div>
                  <div className="px-3 py-2 col gap-1">
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{node.label}</div>
                    <div className="caption mono c-ink-3" style={{ fontSize: 11 }}>{node.chainName} · {node.asset}</div>
                    {apy && (
                      <div className="mono mt-1" style={{ fontSize: 12, color: KIND_COLORS[node.kind] }}>
                        + {apy.toFixed(2)}% APY
                      </div>
                    )}
                  </div>
                  {isSel && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteNode(node.id); }}
                      onPointerDown={e => e.stopPropagation()}
                      title="Delete node"
                      style={{
                        position: 'absolute', top: -10, right: -10, width: 20, height: 20,
                        background: 'var(--bad)', color: 'white', fontSize: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >×</button>
                  )}
                  {node.kind !== 'wallet' && (
                    <span style={{ position: 'absolute', left: -4, top: 36, width: 8, height: 8, background: 'var(--ink)' }} />
                  )}
                  {node.kind !== 'lend' && node.kind !== 'stake' && (
                    <span style={{ position: 'absolute', right: -4, top: 36, width: 8, height: 8, background: 'var(--ink)' }} />
                  )}
                </div>
              );
            })}

            {nodes.length === 0 && (
              <div className="center col gap-2" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <div className="serif-it" style={{ fontSize: 30, color: 'var(--ink-3)' }}>Empty canvas.</div>
                <div className="caption muted">Drag a wallet from the palette to begin a route.</div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="card-flat p-3" style={{ position: 'fixed', right: 316, bottom: 16, background: 'var(--card)' }}>
            <div className="label mb-2">Legend</div>
            <div className="col gap-1">
              {KINDS.map(k => (
                <div key={k} className="flex items-center gap-2" style={{ fontSize: 11 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, background: KIND_COLORS[k] }} />
                  <span className="mono uppercase" style={{ color: 'var(--ink-2)', letterSpacing: '0.1em' }}>{k}</span>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* ── INSPECTOR ────────────────────────────────────────────────────── */}
        <aside className="hairline-l" style={{ width: 300, background: 'var(--paper)', overflow: 'auto', flexShrink: 0 }}>
          {selected ? (
            /* Node editor */
            <>
              <div className="p-4 hairline-b">
                <div className="between">
                  <div className="eyebrow" style={{ color: KIND_COLORS[selected.kind] }}>{selected.kind}</div>
                  <button className="mono c-ink-3" style={{ fontSize: 11 }} onClick={() => deleteNode(selected.id)}>delete</button>
                </div>
                <div className="serif mt-2" style={{ fontSize: 18 }}>{selected.label}</div>
                <div className="caption mono c-ink-3 mt-1" style={{ fontSize: 11 }}>{selected.chainName}</div>
              </div>

              <div className="p-4 col gap-3 hairline-b">
                {selected.kind === 'swap' && (
                  <>
                    <Field label="From asset">
                      <input className="input mono" value={selected.asset} style={{ fontSize: 12 }}
                        onChange={e => updateSelected({ asset: e.target.value })} />
                    </Field>
                    <Field label="To asset">
                      <input className="input mono" value={selected.toAsset ?? ''} placeholder="e.g. cbETH" style={{ fontSize: 12 }}
                        onChange={e => updateSelected({ toAsset: e.target.value })} />
                    </Field>
                    <Field label="Slippage (bps)">
                      <input className="input mono" value={selected.slippageBps ?? 50} style={{ fontSize: 12 }}
                        onChange={e => updateSelected({ slippageBps: parseInt(e.target.value) || 50 })} />
                    </Field>
                  </>
                )}
                {(selected.kind === 'lend' || selected.kind === 'stake') && (
                  <>
                    <Field label="Asset">
                      <input className="input mono" value={selected.asset} style={{ fontSize: 12 }}
                        onChange={e => updateSelected({ asset: e.target.value })} />
                    </Field>
                    <Field label="APY (bps)" sub="basis points">
                      <input className="input mono" value={selected.apyBps ?? 0} style={{ fontSize: 12 }}
                        onChange={e => updateSelected({ apyBps: parseInt(e.target.value) || 0 })} />
                    </Field>
                  </>
                )}
                {selected.kind === 'bridge' && (
                  <>
                    <Field label="Asset">
                      <input className="input mono" value={selected.asset} style={{ fontSize: 12 }}
                        onChange={e => updateSelected({ asset: e.target.value })} />
                    </Field>
                    <Field label="From chain ID">
                      <input className="input mono" value={selected.chain} style={{ fontSize: 12 }}
                        onChange={e => updateSelected({ chain: parseInt(e.target.value) || selected.chain })} />
                    </Field>
                    <Field label="To chain ID" sub="defaults to next node">
                      <input className="input mono" value={selected.toChain ?? ''} placeholder="auto" style={{ fontSize: 12 }}
                        onChange={e => updateSelected({ toChain: parseInt(e.target.value) || undefined })} />
                    </Field>
                  </>
                )}
                {selected.kind === 'wallet' && (
                  <Field label="Asset">
                    <input className="input mono" value={selected.asset} style={{ fontSize: 12 }}
                      onChange={e => updateSelected({ asset: e.target.value })} />
                  </Field>
                )}
              </div>

              <div className="p-4 col gap-2">
                <div className="label">Step position</div>
                <div className="num-lg">
                  {String(ordered.findIndex(o => o.id === selected.id) + 1).padStart(2, '0')}
                  <span style={{ fontSize: 13, color: 'var(--ink-3)' }}> of {nodes.length}</span>
                </div>
                <div className="caption mono c-ink-3">Drag node horizontally to reorder.</div>
              </div>
            </>
          ) : (
            /* Route summary / execute panel */
            <div className="p-4 col gap-4">
              <div className="eyebrow">Route summary</div>

              {composeError && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--bad)', padding: 8, background: 'color-mix(in oklch, var(--bad) 10%, transparent)' }}>
                  {composeError}
                </div>
              )}

              {composeResult ? (
                <>
                  <div className="col gap-3">
                    <div>
                      <div className="label mb-1">Composed APY</div>
                      <div className="num-lg" style={{ color: 'var(--ok)' }}>
                        {(n(composeResult.route.estimatedApyBps) / 100).toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="label mb-1">Gas + fees</div>
                      <div className="num-md">
                        ${(n(composeResult.route.totalGasUsd) + n(composeResult.route.totalBridgeFeeUsd) + n(composeResult.route.totalProtocolFeeUsd)).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="label mb-1">Risk score</div>
                      <div className="num-md" style={{ color: n(composeResult.route.riskScore) >= 40 ? 'var(--warn)' : 'var(--ink)' }}>
                        {n(composeResult.route.riskScore)} / 100
                      </div>
                    </div>
                    {composeResult.simulation && (
                      <div>
                        <div className="label mb-2">Simulation</div>
                        <div className="col gap-1">
                          {composeResult.simulation.steps.map((s, i) => (
                            <div key={i} className="between mono" style={{ fontSize: 11 }}>
                              <span>Step {String(i + 1).padStart(2, '0')}</span>
                              <span style={{ color: s.passed ? 'var(--ok)' : 'var(--bad)' }}>
                                {s.passed ? '✓ pass' : `✗ ${s.revertReason ?? 'fail'}`}
                              </span>
                            </div>
                          ))}
                          <div className="between mono mt-1" style={{ fontSize: 11, borderTop: '1px solid var(--ink-4)', paddingTop: 6 }}>
                            <span>All pass</span>
                            <span style={{ color: composeResult.simulation.allStepsPass ? 'var(--ok)' : 'var(--bad)' }}>
                              {composeResult.simulation.allStepsPass ? '✓ yes' : '✗ no'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {executeError && (
                    <div className="mono" style={{ fontSize: 11, color: 'var(--bad)' }}>{executeError}</div>
                  )}

                  <button
                    className="btn btn-signal"
                    disabled={executing || !address}
                    onClick={handleExecute}
                    style={{ width: '100%' }}
                  >
                    {executing ? 'Executing…' : !address ? 'Connect wallet to execute' : 'Execute strategy →'}
                  </button>
                </>
              ) : (
                /* Pre-compose summary */
                <>
                  <div className="col gap-3">
                    <div>
                      <div className="label mb-1">Projected APY</div>
                      <div className="num-lg" style={{ color: valid ? 'var(--ink)' : 'var(--ink-4)' }}>
                        {valid ? projectedApy.toFixed(2) + '%' : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="label mb-1">Steps</div>
                      <div className="num-md">{orderedSteps.length}</div>
                    </div>
                    <div>
                      <div className="label mb-1">Status</div>
                      <div className="mono" style={{ fontSize: 13, color: valid ? 'var(--ok)' : 'var(--warn)' }}>
                        {valid ? '✓ ready to compose' : '○ incomplete'}
                      </div>
                    </div>
                    {valid && (
                      <button className="btn btn-signal" onClick={handleCompose} disabled={composing}>
                        {composing ? 'Composing…' : 'Compose & Simulate →'}
                      </button>
                    )}
                  </div>
                  <hr />
                  <div className="caption muted">
                    Select a node to edit its parameters.
                    Click "Compose &amp; Simulate" to get a real route with Tenderly simulation.
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

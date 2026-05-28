'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { Field } from '@/src/components/ui';
import { PROTOCOLS, KIND_COLOR, type Protocol } from '@/src/lib/mockData';

const NODE_W = 184;
const NODE_H = 86;
let __nodeSeq = 100;
function nextNodeId() { return 'n' + (++__nodeSeq); }

interface CanvasNode {
  id: string;
  kind: string;
  label: string;
  chain: string;
  apy?: number;
  x: number;
  y: number;
}

interface DragState {
  id: string;
  offX: number;
  offY: number;
}

export function ComposerPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [nodes, setNodes] = useState<CanvasNode[]>([
    { id: 'n1', kind: 'wallet', label: 'EVM Wallet', chain: 'Ethereum', x: 60, y: 140 },
    { id: 'n2', kind: 'bridge', label: 'Across', chain: 'cross-chain', x: 300, y: 140 },
    { id: 'n3', kind: 'swap', label: 'Aerodrome', chain: 'Base', x: 540, y: 140 },
    { id: 'n4', kind: 'lend', label: 'Moonwell', chain: 'Base', apy: 14.82, x: 780, y: 140 },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>('n3');

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);

  const kinds = ['wallet', 'bridge', 'swap', 'lend', 'stake'];

  const filteredProtocols = PROTOCOLS.filter(p => {
    if (filter !== 'all' && p.kind !== filter) return false;
    if (search && !(p.label.toLowerCase().includes(search.toLowerCase()) || p.chain.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const grouped = useMemo(() => {
    const g: Record<string, Protocol[]> = {};
    filteredProtocols.forEach(p => {
      (g[p.kind] = g[p.kind] || []).push(p);
    });
    return g;
  }, [filter, search]);

  const ordered = [...nodes].sort((a, b) => a.x - b.x);
  const edges = ordered.slice(0, -1).map((n, i) => ({ from: n.id, to: ordered[i + 1].id }));

  const hasWallet = ordered.length > 0 && ordered[0].kind === 'wallet';
  const ends = ordered.length > 0 && (ordered[ordered.length - 1].kind === 'lend' || ordered[ordered.length - 1].kind === 'stake');
  const valid = nodes.length >= 2 && hasWallet && ends;
  const projectedApy = ordered.reduce((acc, n) => n.apy ? n.apy : acc, 0);

  const selected = nodes.find(n => n.id === selectedId) || null;

  function onNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    setSelectedId(id);
    const node = nodes.find(n => n.id === id);
    if (!node || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    dragState.current = {
      id,
      offX: e.clientX - rect.left + canvasRef.current.scrollLeft - node.x,
      offY: e.clientY - rect.top + canvasRef.current.scrollTop - node.y,
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    const ds = dragState.current;
    if (!ds || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(8, e.clientX - rect.left + canvasRef.current.scrollLeft - ds.offX);
    const y = Math.max(8, e.clientY - rect.top + canvasRef.current.scrollTop - ds.offY);
    setNodes(prev => prev.map(n => n.id === ds.id ? { ...n, x, y } : n));
  }

  function onPointerUp() {
    dragState.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  function onPaletteDragStart(e: React.DragEvent, p: Protocol) {
    e.dataTransfer.setData('text/plain', p.id);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function onCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const pid = e.dataTransfer.getData('text/plain');
    const proto = PROTOCOLS.find(p => p.id === pid);
    if (!proto || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + canvasRef.current.scrollLeft - NODE_W / 2;
    const y = e.clientY - rect.top + canvasRef.current.scrollTop - NODE_H / 2;
    const id = nextNodeId();
    setNodes(prev => [
      ...prev,
      { id, kind: proto.kind, label: proto.label, chain: proto.chain, apy: proto.apy, x: Math.max(8, x), y: Math.max(8, y) },
    ]);
    setSelectedId(id);
  }

  function deleteNode(id: string) {
    setNodes(prev => prev.filter(n => n.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function clearCanvas() {
    setNodes([]);
    setSelectedId(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && (document.activeElement as HTMLElement)?.tagName !== 'INPUT') {
        deleteNode(selectedId);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  function updateSelected(patch: Partial<CanvasNode>) {
    setNodes(prev => prev.map(n => n.id === selectedId ? { ...n, ...patch } : n));
  }

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      {/* TOOLBAR */}
      <div
        className="hairline-b"
        style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 20px', background: 'var(--paper)', flexShrink: 0 }}
      >
        <div className="flex gap-4 items-center">
          <span className="eyebrow">Composer</span>
          <span className="mono c-ink-3" style={{ fontSize: 11 }}>
            {nodes.length} nodes · {edges.length} edges · {nodes.length} steps
          </span>
        </div>
        <div className="ml-auto flex gap-2 items-center">
          <span className="mono" style={{ fontSize: 11, marginRight: 8, color: valid ? 'var(--ok)' : 'var(--warn)' }}>
            ● {valid
              ? 'route valid · ready to optimize'
              : !hasWallet
              ? 'must start with a wallet'
              : !ends
              ? 'must end at lend / stake'
              : 'add at least 2 nodes'
            }
          </span>
          <button className="btn btn-outline btn-sm" onClick={clearCanvas}>Clear</button>
          <button className="btn btn-ghost btn-sm">Save draft</button>
          <button
            className="btn btn-signal btn-sm"
            disabled={!valid}
          >
            Run strategy →
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* PALETTE */}
        <aside
          className="hairline-r"
          style={{ width: 280, background: 'var(--paper)', overflow: 'auto', flexShrink: 0 }}
        >
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
              <button
                className={'pill ' + (filter === 'all' ? 'active' : '')}
                onClick={() => setFilter('all')}
              >
                all
              </button>
              {kinds.map(k => (
                <button
                  key={k}
                  className={'pill ' + (filter === k ? 'active' : '')}
                  onClick={() => setFilter(k)}
                >
                  <span className="dot-sq" style={{ color: KIND_COLOR[k], width: 6, height: 6 }} /> {k}
                </button>
              ))}
            </div>
          </div>
          {kinds.filter(k => grouped[k]?.length).map(k => (
            <div key={k} className="p-4 hairline-b">
              <div className="eyebrow mb-3" style={{ color: KIND_COLOR[k] }}>
                <span className="dot-sq" style={{ color: KIND_COLOR[k], marginRight: 6 }} />
                {k} · {grouped[k].length}
              </div>
              <div className="col gap-2">
                {grouped[k].map(p => (
                  <div
                    key={p.id}
                    className="card-flat p-3"
                    draggable
                    onDragStart={e => onPaletteDragStart(e, p)}
                    style={{ cursor: 'grab', borderLeft: '3px solid ' + KIND_COLOR[k] }}
                  >
                    <div className="between gap-2">
                      <div className="col gap-1" style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{p.label}</div>
                        <div className="caption mono c-ink-3" style={{ fontSize: 11 }}>{p.chain}</div>
                      </div>
                      {p.apy && (
                        <span className="mono" style={{ fontSize: 12, color: KIND_COLOR[k], fontWeight: 500 }}>
                          {p.apy.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="p-4 caption muted">
            Drag a protocol onto the canvas. Nodes auto-connect left → right to set execution order — drag to reorder.
            Select a node and press <span className="mono">Delete</span> to remove.
          </div>
        </aside>

        {/* CANVAS */}
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
            <svg
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
            >
              {edges.map((e, i) => {
                const from = nodes.find(n => n.id === e.from);
                const to = nodes.find(n => n.id === e.to);
                if (!from || !to) return null;
                const x1 = from.x + NODE_W;
                const y1 = from.y + 40;
                const x2 = to.x;
                const y2 = to.y + 40;
                const mx = (x1 + x2) / 2;
                const involvesSwap = from.kind === 'swap' || to.kind === 'swap';
                const stroke = involvesSwap ? 'var(--c-ochre)' : 'var(--ink)';
                return (
                  <g key={i}>
                    <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} stroke={stroke} strokeWidth="1.5" fill="none" />
                    <circle cx={x2} cy={y2} r="3.5" fill={stroke} />
                    <text
                      x={(x1 + x2) / 2}
                      y={Math.min(y1, y2) - 8}
                      fontSize="9"
                      fontFamily="JetBrains Mono"
                      fill="var(--ink-3)"
                      textAnchor="middle"
                      style={{ letterSpacing: '0.1em' }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Nodes */}
            {nodes.map(n => {
              const stepNo = ordered.findIndex(o => o.id === n.id) + 1;
              const isSel = selectedId === n.id;
              return (
                <div
                  key={n.id}
                  onPointerDown={e => onNodePointerDown(e, n.id)}
                  onClick={e => { e.stopPropagation(); setSelectedId(n.id); }}
                  style={{
                    position: 'absolute',
                    left: n.x,
                    top: n.y,
                    width: NODE_W,
                    background: 'var(--card)',
                    border: '1px solid ' + (isSel ? 'var(--ink)' : 'color-mix(in oklch, var(--ink) 20%, transparent)'),
                    borderLeft: '3px solid ' + KIND_COLOR[n.kind],
                    cursor: 'grab',
                    fontSize: 12,
                    boxShadow: isSel ? '0 0 0 3px color-mix(in oklch, var(--signal) 30%, transparent)' : 'none',
                    touchAction: 'none',
                    userSelect: 'none',
                  }}
                >
                  <div
                    className="px-3 py-2 hairline-b between"
                    style={{ background: 'color-mix(in oklch, var(--ink) 3%, transparent)' }}
                  >
                    <span className="eyebrow" style={{ color: KIND_COLOR[n.kind] }}>{n.kind}</span>
                    <span className="mono c-ink-3" style={{ fontSize: 10 }}>{String(stepNo).padStart(2, '0')}</span>
                  </div>
                  <div className="px-3 py-2 col gap-1">
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{n.label}</div>
                    <div className="caption mono c-ink-3" style={{ fontSize: 11 }}>{n.chain}</div>
                    {n.apy && (
                      <div className="mono mt-1" style={{ fontSize: 12, color: KIND_COLOR[n.kind] }}>
                        + {n.apy.toFixed(2)}% APY
                      </div>
                    )}
                  </div>
                  {isSel && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteNode(n.id); }}
                      onPointerDown={e => e.stopPropagation()}
                      title="Delete node"
                      style={{
                        position: 'absolute', top: -10, right: -10, width: 20, height: 20,
                        background: 'var(--bad)', color: 'white', fontSize: 12, lineHeight: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ×
                    </button>
                  )}
                  {n.kind !== 'wallet' && (
                    <span style={{ position: 'absolute', left: -4, top: 36, width: 8, height: 8, background: 'var(--ink)' }} />
                  )}
                  {n.kind !== 'lend' && n.kind !== 'stake' && (
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
              {kinds.map(k => (
                <div key={k} className="flex items-center gap-2" style={{ fontSize: 11 }}>
                  <span className="dot-sq" style={{ color: KIND_COLOR[k] }} />
                  <span className="mono uppercase" style={{ color: 'var(--ink-2)', letterSpacing: '0.1em' }}>{k}</span>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* INSPECTOR */}
        <aside
          className="hairline-l"
          style={{ width: 300, background: 'var(--paper)', overflow: 'auto', flexShrink: 0 }}
        >
          {selected ? (
            <>
              <div className="p-4 hairline-b">
                <div className="between">
                  <div className="eyebrow" style={{ color: KIND_COLOR[selected.kind] }}>{selected.kind}</div>
                  <button className="mono c-ink-3" style={{ fontSize: 11 }} onClick={() => deleteNode(selected.id)}>delete</button>
                </div>
                <div className="serif mt-2" style={{ fontSize: 20 }}>
                  {selected.label} <span className="serif-it muted">on {selected.chain}</span>
                </div>
              </div>
              <div className="p-4 col gap-3 hairline-b">
                <Field label="Label">
                  <input
                    className="input"
                    value={selected.label}
                    onChange={e => updateSelected({ label: e.target.value })}
                  />
                </Field>
                <Field label="Chain">
                  <input
                    className="input mono"
                    value={selected.chain}
                    onChange={e => updateSelected({ chain: e.target.value })}
                    style={{ fontSize: 12 }}
                  />
                </Field>
                {selected.kind === 'swap' && (
                  <>
                    <Field label="Slippage tolerance"><input className="input mono" defaultValue="0.50%" /></Field>
                    <Field label="From token"><input className="input mono" defaultValue="USDC" /></Field>
                    <Field label="To token"><input className="input mono" defaultValue="cbETH" /></Field>
                  </>
                )}
                {(selected.kind === 'lend' || selected.kind === 'stake') && (
                  <Field label="Target APY" sub="estimate">
                    <input
                      className="input mono"
                      value={(selected.apy || 0).toFixed(2) + '%'}
                      onChange={e => updateSelected({ apy: parseFloat(e.target.value) || 0 })}
                    />
                  </Field>
                )}
                {selected.kind === 'bridge' && (
                  <Field label="Max bridge time" sub="minutes">
                    <input className="input mono" defaultValue="5" />
                  </Field>
                )}
              </div>
              <div className="p-4 col gap-2">
                <div className="label">Step position</div>
                <div className="num-lg">
                  {String(ordered.findIndex(o => o.id === selected.id) + 1).padStart(2, '0')}
                  <span style={{ fontSize: 13, color: 'var(--ink-3)' }}> of {nodes.length}</span>
                </div>
                <div className="caption mono c-ink-3">Drag node horizontally to change order.</div>
              </div>
            </>
          ) : (
            <div className="p-4 col gap-4">
              <div className="eyebrow">Route summary</div>
              <div className="col gap-3">
                <div>
                  <div className="label mb-1">Projected APY</div>
                  <div className="num-lg" style={{ color: valid ? 'var(--ink)' : 'var(--ink-4)' }}>
                    {valid ? projectedApy.toFixed(2) + '%' : '—'}
                  </div>
                </div>
                <div>
                  <div className="label mb-1">Steps</div>
                  <div className="num-md">{nodes.length}</div>
                </div>
                <div>
                  <div className="label mb-1">Status</div>
                  <div className="mono" style={{ fontSize: 13, color: valid ? 'var(--ok)' : 'var(--warn)' }}>
                    {valid ? '✓ valid route' : '○ incomplete'}
                  </div>
                </div>
              </div>
              <hr />
              <div className="caption muted">
                Select a node to edit its parameters, or drag a new protocol from the palette.
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useMemo } from 'react';

// ── Data ────────────────────────────────────────────────────────────
const CHAINS: Record<string, { id: string; name: string; short: string; color: string; x: number; y: number }> = {
  eth:  { id:'eth',  name:'Ethereum', short:'ETH',  color:'#7b8bff', x:0.18, y:0.40 },
  arb:  { id:'arb',  name:'Arbitrum', short:'ARB',  color:'#28a0f0', x:0.46, y:0.22 },
  base: { id:'base', name:'Base',     short:'BASE', color:'#1962ff', x:0.46, y:0.62 },
  op:   { id:'op',   name:'Optimism', short:'OP',   color:'#ff0420', x:0.72, y:0.30 },
  poly: { id:'poly', name:'Polygon',  short:'MATIC',color:'#8247e5', x:0.72, y:0.72 },
  sol:  { id:'sol',  name:'Solana',   short:'SOL',  color:'#14f195', x:0.88, y:0.50 },
};

const PROTO: Record<string, { name: string; type: string }> = {
  aave:   { name:'Aave v3',     type:'Lending' },
  comp:   { name:'Compound',    type:'Lending' },
  morpho: { name:'Morpho Blue', type:'Lending' },
  pendle: { name:'Pendle',      type:'Yield' },
  gmx:    { name:'GMX v2',      type:'Perps LP' },
  curve:  { name:'Curve',       type:'Stable LP' },
  uni:    { name:'Uniswap v3',  type:'Concentrated LP' },
  lido:   { name:'Lido',        type:'Staking' },
  ether:  { name:'Etherfi',     type:'Re-staking' },
  spark:  { name:'Spark',       type:'Lending' },
};

const ASSETS: Record<string, { color: string }> = {
  ETH:    { color:'#627eea' },
  USDC:   { color:'#2775ca' },
  USDT:   { color:'#26a17b' },
  WBTC:   { color:'#f7931a' },
  DAI:    { color:'#f5ac37' },
  wstETH: { color:'#00a3ff' },
  weETH:  { color:'#7b8bff' },
  ARB:    { color:'#28a0f0' },
};

const PROTO_STATS = {
  tvl:'1.84B', tvlChg:'+2.4%', vol24:'184.2M', vol24Chg:'+12.8%',
  routes24:'42,184', routesChg:'+1,920 today', chains:6, protos:38, avgSave:'+1.84%',
};

const POSITIONS_BASE = [
  { id:'p-001', asset:'wstETH', chain:'arb',  protocol:'aave',   value:148290.12, deployed:140000, apy:8.42,  age:'42d', risk:32 },
  { id:'p-002', asset:'USDC',   chain:'base', protocol:'morpho', value:96420.55,  deployed:95000,  apy:7.91,  age:'18d', risk:24 },
  { id:'p-003', asset:'weETH',  chain:'eth',  protocol:'pendle', value:62180.40,  deployed:60000,  apy:16.20, age:'9d',  risk:54 },
  { id:'p-004', asset:'USDC',   chain:'eth',  protocol:'spark',  value:81244.18,  deployed:80000,  apy:6.18,  age:'62d', risk:18 },
  { id:'p-005', asset:'ETH',    chain:'op',   protocol:'gmx',    value:34121.05,  deployed:35000,  apy:22.80, age:'5d',  risk:72 },
  { id:'p-006', asset:'wstETH', chain:'eth',  protocol:'lido',   value:55480.66,  deployed:54000,  apy:3.40,  age:'94d', risk:12 },
  { id:'p-007', asset:'DAI',    chain:'poly', protocol:'comp',   value:18045.20,  deployed:18000,  apy:5.95,  age:'24d', risk:28 },
  { id:'p-008', asset:'USDT',   chain:'arb',  protocol:'curve',  value:42830.40,  deployed:42000,  apy:9.10,  age:'31d', risk:40 },
];

const ACTIVE_ROUTES_BASE = [
  { id:'r-9214', pair:'ETH → wstETH', via:'Lido · Pendle · Aave', fromChain:'eth', toChain:'arb',  apy:14.20, amount:42500, eta:'~4m', steps:['Swap on Uniswap','Bridge via Stargate','Lend on Aave','Settle'], stepIdx:1, progress:38 },
  { id:'r-9213', pair:'USDC → USDC',  via:'Across · Morpho',      fromChain:'eth', toChain:'base', apy:9.74,  amount:18000, eta:'~2m', steps:['Bridge via Across','Deposit on Morpho','Settle'],                  stepIdx:2, progress:72 },
  { id:'r-9211', pair:'wstETH → weETH',via:'Pendle · Etherfi',    fromChain:'arb', toChain:'arb',  apy:18.40, amount:8200,  eta:'~6m', steps:['Unwind Pendle PT','Bridge to Mainnet','Stake on Etherfi','Bridge back','Settle'], stepIdx:0, progress:14 },
];

const OPPORTUNITIES = [
  { id:'o1', sym:'WBTC',   name:'Bitcoin Carry · Aave',    color:'#f7931a', apy:14.20, chg24:+3.22, tvl:'124.2M', risk:38 },
  { id:'o2', sym:'ETH',    name:'ETH Looper · Etherfi',    color:'#627eea', apy:21.80, chg24:-2.42, tvl:'48.9M',  risk:64 },
  { id:'o3', sym:'USDC',   name:'USDC Stack · Morpho',     color:'#2775ca', apy:9.74,  chg24:+2.67, tvl:'266.5M', risk:24 },
  { id:'o4', sym:'wstETH', name:'wstETH Loop · Aave',      color:'#00a3ff', apy:11.40, chg24:+1.04, tvl:'62.6M',  risk:42 },
  { id:'o5', sym:'DAI',    name:'DAI Yield · Spark',        color:'#f5ac37', apy:8.18,  chg24:+0.42, tvl:'50.9M',  risk:18 },
  { id:'o6', sym:'ARB',    name:'ARB Perp LP · GMX',        color:'#28a0f0', apy:22.80, chg24:+6.12, tvl:'34.5M',  risk:72 },
];

function genPnl(start: number, range: number, vol: number) {
  const out: number[] = [];
  void start; // seed unused — wiggle uses sin/cos only
  for (let i = 0; i < 180; i++) {
    const t = i / 179;
    const eased = Math.pow(t, 0.85);
    const base = start + range * eased;
    // deterministic-ish wiggle using sin/cos
    const wiggle = Math.sin(i * 0.21) * vol * 0.6 + Math.cos(i * 0.09) * vol * 0.4;
    out.push(Math.max(start * 0.92, base + wiggle));
  }
  return out;
}

const PERSONAS = {
  casual: { name:'Casual', multiplier:0.06, pnlStart:6800,    pnlRange:1100,   pnlVol:90,    activePositions:4, activeRoutes:1, portfolioLabel:'Portfolio' },
  whale:  { name:'Whale',  multiplier:1,    pnlStart:420000,  pnlRange:78000,  pnlVol:4200,  activePositions:8, activeRoutes:3, portfolioLabel:'Portfolio' },
  dao:    { name:'DAO',    multiplier:8.4,  pnlStart:3840000, pnlRange:620000, pnlVol:38000, activePositions:8, activeRoutes:3, portfolioLabel:'Treasury' },
};

function buildView(personaKey: string) {
  const p = PERSONAS[personaKey as keyof typeof PERSONAS] || PERSONAS.whale;
  const m = p.multiplier;
  const positions = POSITIONS_BASE.slice(0, p.activePositions).map(x => ({
    ...x, value: +(x.value * m).toFixed(2), deployed: +(x.deployed * m).toFixed(2),
  }));
  const totalValue = positions.reduce((s, x) => s + x.value, 0);
  const totalDeployed = positions.reduce((s, x) => s + x.deployed, 0);
  const totalYield = totalValue - totalDeployed;
  const wAvgApy = positions.reduce((s, x) => s + x.apy * x.value, 0) / Math.max(1, totalValue);
  const activeRoutes = ACTIVE_ROUTES_BASE.slice(0, p.activeRoutes).map(r => ({ ...r, amount: +(r.amount * m).toFixed(0) }));
  const pnl = genPnl(p.pnlStart, p.pnlRange, p.pnlVol);
  return { meta: p, positions, totalValue, totalDeployed, totalYield, wAvgApy, activeRoutes, pnl };
}

function fmtUSD(n: number | null, decimals?: number): string {
  if (n == null) return '—';
  const d = decimals != null ? decimals : (Math.abs(n) >= 100000 ? 0 : 2);
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Icons ────────────────────────────────────────────────────────────
function Ico({ d, size = 16, sw = 1.6 }: { d: React.ReactNode; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
  );
}
const ICO = {
  home:    <Ico d={<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z"/>}/>,
  find:    <Ico d={<><path d="M3 17l5-5 4 4 9-9"/><path d="M14 7h7v7"/></>}/>,
  routes:  <Ico d={<><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v6a4 4 0 004 4h6"/></>}/>,
  markets: <Ico d={<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>}/>,
  wallet:  <Ico d={<><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 13h3"/></>}/>,
  user:    <Ico d={<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></>}/>,
  trend:   <Ico d={<path d="M12 21c4 0 7-3 7-7 0-3-2-5-4-7l-1 2c-1-2-2-4-2-7-3 2-7 7-7 12 0 4 3 7 7 7z"/>}/>,
  help:    <Ico d={<><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2.2-2.5 3.5M12 17h.01"/></>}/>,
  docs:    <Ico d={<><path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z"/><path d="M14 3v5h5"/></>}/>,
  bell:    <Ico d={<><path d="M6 8a6 6 0 0112 0v5l2 3H4l2-3z"/><path d="M10 19a2 2 0 004 0"/></>}/>,
  search:  <Ico d={<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>}/>,
  arrow:   <Ico d={<><path d="M5 12h14M13 6l6 6-6 6"/></>}/>,
  chev_dn: <Ico d={<path d="M6 9l6 6 6-6"/>}/>,
  chev_up: <Ico d={<path d="M6 15l6-6 6 6"/>}/>,
  bolt:    <Ico d={<path d="M13 2L4 14h7l-2 8 9-12h-7z"/>}/>,
  close:   <Ico d={<path d="M6 6l12 12M18 6l-12 12"/>}/>,
  ext:     <Ico d={<path d="M14 4h6v6M20 4l-9 9M14 14v6H4V8h6"/>}/>,
  refresh: <Ico d={<><path d="M3 12a9 9 0 0115.5-6M21 4v6h-6M21 12a9 9 0 01-15.5 6M3 20v-6h6"/></>}/>,
  plus:    <Ico d={<path d="M12 5v14M5 12h14"/>}/>,
  print:   <Ico d={<><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="1"/><path d="M6 14h12v7H6z"/></>}/>,
  bag:     <Ico d={<><path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 016 0v2"/></>}/>,
  globe:   <Ico d={<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></>}/>,
  star:    <Ico d={<path d="M12 3l2.6 5.5 6.1.8-4.4 4.2 1.1 6L12 16.8 6.6 19.5l1.1-6L3.3 9.3l6.1-.8z"/>}/>,
  star_f:  <Ico sw={1.2} d={<path d="M12 3l2.6 5.5 6.1.8-4.4 4.2 1.1 6L12 16.8 6.6 19.5l1.1-6L3.3 9.3l6.1-.8z" fill="currentColor"/>}/>,
};

// ── Brand Mark ───────────────────────────────────────────────────────
function BrandMark({ size = 28 }: { size?: number }) {
  const w = size, h = Math.round(size * (84 / 144));
  return (
    <svg width={w} height={h} viewBox="0 0 144 84" fill="none" aria-hidden="true">
      <defs>
        <mask id="apex-cut">
          <rect width="144" height="84" fill="white"/>
          <circle cx="72" cy="18" r="10" fill="black"/>
        </mask>
      </defs>
      <path d="M12 72C32 4 112 4 132 72" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" mask="url(#apex-cut)"/>
      <circle cx="12" cy="72" r="3.5" fill="currentColor"/>
      <circle cx="132" cy="72" r="3.5" fill="currentColor"/>
      <circle cx="72" cy="18" r="8" stroke="currentColor" strokeWidth="2.2"/>
      <circle cx="72" cy="18" r="3.5" fill="#FF4D4D"/>
    </svg>
  );
}

// ── SimpleLine sparkline ─────────────────────────────────────────────
function SimpleLine({ data, color }: { data: number[]; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(220);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(es => setW(Math.max(100, es[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const h = 54;
  const min = Math.min(...data), max = Math.max(...data);
  const rng = Math.max(0.0001, max - min);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / rng) * (h - 8) - 4]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0].toFixed(1)} ${p[1].toFixed(1)}` : `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`)).join(' ');
  return (
    <div ref={ref} style={{ height: h }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
        <path d={d} fill="none" stroke={color} strokeWidth="1.5"/>
      </svg>
    </div>
  );
}

// ── LightAreaChart ───────────────────────────────────────────────────
function LightAreaChart({ data }: { data: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sz, setSz] = useState({ w: 600, h: 230 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(es => {
      const r = es[0].contentRect;
      setSz({ w: Math.max(200, r.width), h: Math.max(120, r.height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const { w, h } = sz;
  const pL = 52, pR = 8, pT = 12, pB = 22;
  const iw = w - pL - pR, ih = h - pT - pB;
  const min = Math.min(...data), max = Math.max(...data);
  const rng = Math.max(1, max - min);
  const x = (i: number) => pL + (i / (data.length - 1)) * iw;
  const y = (v: number) => pT + ih - ((v - min) / rng) * ih;
  const d = data.map((v, i) => (i === 0 ? `M${x(i).toFixed(1)} ${y(v).toFixed(1)}` : `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join(' ');
  const da = d + ` L${x(data.length - 1)} ${pT + ih} L${pL} ${pT + ih} Z`;
  const ticks = [max, min + rng * 0.66, min + rng * 0.33, min];
  const xticks = Array.from({ length: 5 }, (_, k) => {
    const i = Math.round((k / 4) * (data.length - 1));
    return { i, label: k === 4 ? 'Today' : `D-${data.length - 1 - i}` };
  });
  return (
    <div ref={ref} style={{ height: 240, position: 'relative' }}>
      <svg width={w} height={h}>
        <defs>
          <linearGradient id="lac" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.12"/>
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pL} x2={w - pR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 4"/>
            <text x={pL - 8} y={y(t) + 3} textAnchor="end" fontSize="10.5"
                  fontFamily="var(--font-jetbrains-mono)" fill="var(--ink-4)">
              {t >= 1_000_000 ? '$' + (t / 1_000_000).toFixed(2) + 'M' : t >= 1000 ? '$' + (t / 1000).toFixed(1) + 'k' : '$' + Math.round(t)}
            </text>
          </g>
        ))}
        {xticks.map(({ i, label }) => (
          <text key={i} x={x(i)} y={h - 6} textAnchor="middle" fontSize="10"
                fontFamily="var(--font-jetbrains-mono)" fill="var(--ink-4)">{label}</text>
        ))}
        <path d={da} fill="url(#lac)"/>
        <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.8"/>
        <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="3.2" fill="var(--ink)"/>
        <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="7" fill="var(--ink)" opacity="0.18"/>
      </svg>
    </div>
  );
}

// ── LightMesh ────────────────────────────────────────────────────────
function LightMesh({ routes }: { routes: typeof ACTIVE_ROUTES_BASE }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 520, h: 280 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(es => {
      const r = es[0].contentRect;
      setBox({ w: Math.max(280, r.width), h: Math.max(240, r.height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const chains = Object.values(CHAINS);
  const pad = 56;
  const pt = (c: typeof CHAINS[string]) => ({ x: pad + c.x * (box.w - pad * 2), y: 36 + c.y * (box.h - 72) });
  const pairs: [typeof CHAINS[string], typeof CHAINS[string]][] = [];
  for (let i = 0; i < chains.length; i++)
    for (let j = i + 1; j < chains.length; j++)
      pairs.push([chains[i], chains[j]]);

  function curvePath(a: typeof CHAINS[string], b: typeof CHAINS[string], lift = 0.15) {
    const ax = pt(a), bx = pt(b);
    const mx = (ax.x + bx.x) / 2, my = (ax.y + bx.y) / 2;
    const dx = bx.x - ax.x, dy = bx.y - ax.y;
    const nx = -dy, ny = dx;
    const len = Math.hypot(nx, ny) || 1;
    const off = lift * Math.hypot(dx, dy);
    const cx = mx + (nx / len) * off, cy = my + (ny / len) * off;
    return `M ${ax.x} ${ax.y} Q ${cx} ${cy} ${bx.x} ${bx.y}`;
  }

  const tvlMap: Record<string, string> = { eth:'$842M', arb:'$284M', base:'$312M', op:'$118M', poly:'$162M', sol:'$98M' };

  return (
    <div ref={ref} className="light-mesh">
      <svg viewBox={`0 0 ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="lhalo">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.06"/>
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0"/>
          </radialGradient>
        </defs>
        {pairs.map(([a, b], i) => {
          const ax = pt(a), bx = pt(b);
          return <line key={i} x1={ax.x} y1={ax.y} x2={bx.x} y2={bx.y} stroke="var(--line-2)" strokeWidth="1" opacity="0.6"/>;
        })}
        {routes.map((r, i) => {
          const a = CHAINS[r.fromChain], b = CHAINS[r.toChain];
          if (!a || !b) return null;
          return (
            <path key={r.id} d={curvePath(a, b, 0.18 + i * 0.05)}
                  fill="none" stroke="var(--ink)" strokeWidth="1.6"
                  strokeDasharray="5 7" style={{ animation: `mflow ${1.6 + i * 0.3}s linear infinite` }}/>
          );
        })}
        {chains.map(c => {
          const p = pt(c);
          const active = routes.some(r => r.fromChain === c.id || r.toChain === c.id);
          return (
            <g key={c.id} transform={`translate(${p.x},${p.y})`}>
              {active && <circle r="30" fill="url(#lhalo)"/>}
              <circle r="16" fill="var(--canvas)" stroke={c.color} strokeWidth="1.4"/>
              <circle r="5" fill={c.color}/>
              <text textAnchor="middle" y="32" fontSize="10.5" fontWeight="600"
                    fontFamily="var(--font-jetbrains-mono)" fill="var(--ink-2)">{c.short}</text>
              <text textAnchor="middle" y="44" fontSize="9.5"
                    fontFamily="var(--font-jetbrains-mono)" fill="var(--ink-4)">{tvlMap[c.id]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Rail ─────────────────────────────────────────────────────────────
function Rail({ active, onNav }: { active: string; onNav: (p: string) => void }) {
  const items = [
    { k:'home',    l:'Home',    i:ICO.home },
    { k:'find',    l:'Find',    i:ICO.find },
    { k:'routes',  l:'Routes',  i:ICO.routes },
    { k:'markets', l:'Markets', i:ICO.markets },
    { k:'wallet',  l:'Wallet',  i:ICO.wallet },
    { k:'profile', l:'Profile', i:ICO.user },
    { k:'trend',   l:'Trend',   i:ICO.trend },
  ];
  return (
    <div className="rail">
      <div className="rail-logo" onClick={() => onNav('home')} title="Meridian">
        <BrandMark size={32}/>
      </div>
      {items.map(it => (
        <div key={it.k} className={`rail-item${active === it.k ? ' on' : ''}`} onClick={() => onNav(it.k)}>
          {it.i}
          <span className="lbl">{it.l}</span>
        </div>
      ))}
      <div className="rail-foot">
        <div className={`rail-item${active === 'help' ? ' on' : ''}`} style={{ padding: '8px 0' }} onClick={() => onNav('help')}>
          {ICO.help}
        </div>
        <div className={`rail-item${active === 'docs' ? ' on' : ''}`} style={{ padding: '8px 0' }} onClick={() => onNav('docs')}>
          {ICO.docs}
        </div>
      </div>
    </div>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────
function Topbar({ onNav, page }: { onNav: (p: string) => void; page: string }) {
  return (
    <div className="topbar">
      <div className="tb-search">{ICO.search}<span>Search assets, routes, protocols…</span></div>
      <nav className="tb-nav">
        <a className={page==='routes'?'on':''} onClick={() => onNav('routes')}>Routes</a>
        <a className={page==='markets'?'on':''} onClick={() => onNav('markets')}>Markets</a>
        <a className={page==='trend'?'on':''} onClick={() => onNav('trend')}>Trend</a>
        <a className={page==='docs'?'on':''} onClick={() => onNav('docs')}>Docs</a>
      </nav>
      <div className="tb-right">
        <span className="tb-select">English {ICO.chev_dn}</span>
        <span className="tb-select">USD {ICO.chev_dn}</span>
        <span className="tb-bell">{ICO.bell}</span>
        <button className="wallet-btn" onClick={() => onNav('wallet')}>
          <span className="pip">{ICO.wallet}</span>Wallet
        </button>
      </div>
    </div>
  );
}

// ── CrumbRow ──────────────────────────────────────────────────────────
function CrumbRow({ page, onNav }: { page: string; onNav: (p: string) => void }) {
  const label: Record<string, string> = { home:'Command', find:'Find', routes:'Routes', markets:'Markets', trend:'Trend', wallet:'Wallet', profile:'Profile', help:'Help', docs:'Docs' };
  return (
    <div className="crumb-row">
      <span onClick={() => onNav('home')} style={{ cursor:'default' }}>{ICO.home}</span>
      <span style={{ color:'var(--ink-4)' }}>›</span>
      <span className="here">{label[page] || 'Main'}</span>
      <span className="right">
        <span className="it" onClick={() => onNav('help')}>{ICO.help} Help Chat</span>
        <span className="it" onClick={() => onNav('docs')}>{ICO.docs} Docs</span>
        <span className="it">{ICO.print} Print</span>
      </span>
    </div>
  );
}

// ── Footer ────────────────────────────────────────────────────────────
function Footer() {
  return (
    <div className="footer">
      <span>Meridian is non-custodial · {PROTO_STATS.chains} chains · {PROTO_STATS.protos} protocols</span>
      <span style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
          <span className="serif-it" style={{ fontSize:13, color:'var(--ink-3)' }}>proudly built by</span>
          <a href="https://github.com/Ranmdy" target="_blank" rel="noopener"
             style={{ display:'inline-flex', alignItems:'center', gap:5, color:'var(--ink)', fontWeight:600, textDecoration:'none', padding:'3px 9px', borderRadius:7, border:'1px solid var(--line)', background:'var(--canvas-2)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.1c-3.2.69-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 015.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.73.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55C20.21 21.4 23.5 17.1 23.5 12.02 23.5 5.66 18.35.5 12 .5z"/></svg>
            Ranmdy
          </a>
        </span>
        <span className="mono" style={{ color:'var(--ink-4)' }}>v2.4.1</span>
      </span>
    </div>
  );
}

// ── Sidebar (Home) ────────────────────────────────────────────────────
function Sidebar() {
  const watchlist = [
    { sym:'ETH',    name:'Ethereum',  value:'$3,481',  delta:+2.41 },
    { sym:'WBTC',   name:'Bitcoin',   value:'$64,433', delta:+3.22 },
    { sym:'USDC',   name:'USD Coin',  value:'$1.00',   delta:+0.01 },
    { sym:'wstETH', name:'Lido stETH',value:'$3,892',  delta:+2.18 },
    { sym:'ARB',    name:'Arbitrum',  value:'$1.04',   delta:-1.42 },
    { sym:'DAI',    name:'Dai',       value:'$1.00',   delta:-0.02 },
  ];
  const routeItems = [
    { label:'Overview', on:true,  badge:null, icon:ICO.markets },
    { label:'Active',   on:false, badge:3,    icon:ICO.routes  },
    { label:'Discover', on:false, badge:null, icon:ICO.find    },
    { label:'History',  on:false, badge:null, icon:ICO.docs    },
  ];
  const stratItems = [
    { label:'Trending',       icon:ICO.trend },
    { label:'Auto-compound',  icon:ICO.bolt  },
    { label:'Delta neutral',  icon:ICO.bag   },
    { label:'Cross-chain',    icon:ICO.globe },
  ];
  return (
    <aside className="side">
      <div className="side-group">
        <div className="head">Routes<span className="chev">{ICO.chev_up}</span></div>
        <div className="body">
          {routeItems.map(({label,on,badge,icon})=>(
            <div key={label} className={`side-item${on?' on':''}`}>
              <span className="ico">{icon}</span>
              <span>{label}</span>
              {badge!=null&&<span style={{marginLeft:'auto',font:"500 11px var(--font-mono)",color:'var(--ink-4)'}}>{badge}</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="side-group">
        <div className="head">Strategies<span className="chev">{ICO.chev_up}</span></div>
        <div className="body">
          {stratItems.map(({label,icon})=>(
            <div key={label} className="side-item">
              <span className="ico">{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="side-group">
        <div className="head">Watchlist<span className="chev">{ICO.chev_up}</span></div>
        <div className="body">
          {watchlist.map(a=>{
            const up = a.delta >= 0;
            const color = ASSETS[a.sym]?.color || '#999';
            return (
              <div key={a.sym} className="side-asset">
                <span style={{width:22,height:22,borderRadius:'50%',background:`linear-gradient(135deg,${color},color-mix(in oklab,${color} 55%,#000))`,color:'#fff',display:'grid',placeItems:'center',font:"600 9.5px var(--font-mono)"}}>{a.sym[0]}</span>
                <span className="lab"><span className="a">{a.name}</span><span className="b">{a.sym}</span></span>
                <span className="v">{a.value}<span className={`d ${up?'up':'dn'}`}>{up?'+':''}{a.delta.toFixed(2)}%</span></span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

// ── Snapshot ──────────────────────────────────────────────────────────
function Snapshot({ view }: { view: ReturnType<typeof buildView> }) {
  const { totalValue, totalYield, totalDeployed, wAvgApy, activeRoutes, positions, meta, pnl } = view;
  const pctGain = (totalYield / Math.max(1, totalDeployed)) * 100;
  const inFlight = activeRoutes.reduce((s, r) => s + Number(r.amount), 0);
  const avgRisk = Math.round(positions.reduce((s, p) => s + p.risk, 0) / Math.max(1, positions.length));
  const dollars = Math.floor(totalValue);
  const cents = Math.round((totalValue - dollars) * 100).toString().padStart(2, '0');
  const today = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric' });

  return (
    <div className="snap">
      <div className="snap-top">
        <div className="snap-eyebrow">
          <span className="serif-it">{meta.portfolioLabel} · today, {today}</span>
        </div>
        <div className="snap-actions">
          <button className="btn-soft">Export</button>
          <button className="btn-soft">{ICO.refresh} Sync</button>
          <button className="btn-ink">{ICO.bolt} New route</button>
        </div>
      </div>
      <div className="snap-hero">
        <div>
          <div className="snap-label">Total value across {PROTO_STATS.chains} chains</div>
          <div className="snap-num">
            <span className="mono curr">$</span>
            <span className="mono">{dollars.toLocaleString('en-US')}</span>
            <span className="mono dec">.{cents}</span>
          </div>
          <div className="snap-delta">
            <span className={`trend ${totalYield >= 0 ? 'up' : 'dn'}`}>{totalYield >= 0 ? '▲' : '▼'} {fmtUSD(Math.abs(totalYield), 0)}</span>
            <span className="trend-pct">{totalYield >= 0 ? '+' : ''}{pctGain.toFixed(2)}%</span>
            <span className="trend-since">vs deployed · all-time</span>
          </div>
        </div>
        <div className="snap-spark">
          <SimpleLine data={pnl.slice(-90)} color="var(--ink)"/>
          <div className="snap-spark-labels"><span>D-90</span><span>D-60</span><span>D-30</span><span>Today</span></div>
        </div>
      </div>
      <div className="snap-kpis">
        <div className="kpi-cell">
          <div className="l">Net yield · 30d</div>
          <div className="v"><span className="mono" style={{color:'var(--green)'}}>+{fmtUSD(totalYield * 0.18, 0)}</span></div>
          <div className="s">{fmtUSD(totalYield * 0.006, 0)} <span style={{color:'var(--ink-4)'}}>/ day · 7d avg</span></div>
        </div>
        <div className="kpi-cell">
          <div className="l">Weighted APY</div>
          <div className="v"><span className="mono">{wAvgApy.toFixed(2)}%</span></div>
          <div className="s"><span style={{color:'var(--green)'}}>▲ 0.42</span> vs last week</div>
        </div>
        <div className="kpi-cell">
          <div className="l">In flight</div>
          <div className="v"><span className="mono">{fmtUSD(inFlight, 0)}</span></div>
          <div className="s">{activeRoutes.length} active routes</div>
        </div>
        <div className="kpi-cell">
          <div className="l">Position risk</div>
          <div className="v"><span className="mono">{avgRisk}<span style={{color:'var(--ink-4)',fontSize:13}}>/100</span></span></div>
          <div className="s">{avgRisk < 30 ? 'Conservative' : avgRisk < 60 ? 'Moderate' : 'Aggressive'} · {positions.filter(p => p.risk >= 60).length} flagged</div>
        </div>
        <div className="kpi-cell">
          <div className="l">APY uplift</div>
          <div className="v"><span className="mono">{PROTO_STATS.avgSave}</span></div>
          <div className="s">vs single-chain · 30d</div>
        </div>
      </div>
    </div>
  );
}

// ── ChartPanel ────────────────────────────────────────────────────────
function ChartPanel({ view }: { view: ReturnType<typeof buildView> }) {
  const [range, setRange] = useState('30D');
  const slice = ({ '7D':7, '30D':30, '90D':90, '180D':180 } as Record<string,number>)[range];
  return (
    <div className="panel">
      <div className="panel-h">
        <h3>Value over time</h3>
        <span className="sub">· USD · net of fees</span>
        <span className="right" style={{display:'flex',gap:2,padding:2,border:'1px solid var(--line)',borderRadius:8,background:'var(--canvas-2)'}}>
          {['7D','30D','90D','180D'].map(r=>(
            <button key={r} style={{padding:'4px 9px',borderRadius:6,border:0,background:range===r?'var(--canvas)':'transparent',color:range===r?'var(--ink)':'var(--ink-3)',font:"500 11.5px var(--font-mono)",boxShadow:range===r?'0 0 0 1px var(--line)':'none'}} onClick={()=>setRange(r)}>{r}</button>
          ))}
        </span>
      </div>
      <div style={{padding:'0 18px 18px'}}>
        <LightAreaChart data={view.pnl.slice(-slice)}/>
      </div>
    </div>
  );
}

// ── MeshPanel ─────────────────────────────────────────────────────────
function MeshPanel({ routes }: { routes: typeof ACTIVE_ROUTES_BASE }) {
  const liveValue = routes.reduce((s, r) => s + Number(r.amount), 0);
  const avgApy = routes.reduce((s, r) => s + r.apy, 0) / Math.max(1, routes.length);
  return (
    <div className="panel">
      <div className="panel-h">
        <h3>Network · live</h3>
        <span className="sub">· in-flight routes</span>
        <span className="right pill green"><span className="dot"/>{routes.length} active</span>
      </div>
      <LightMesh routes={routes}/>
      <div className="mesh-stats">
        <div><span className="v">{fmtUSD(liveValue, 0)}</span><span>in flight</span></div>
        <div><span className="v" style={{color:'var(--green)'}}>{avgApy.toFixed(2)}%</span><span>avg destination APY</span></div>
        <div><span className="v">{routes.length}</span><span>routes live</span></div>
      </div>
    </div>
  );
}

// ── RoutesStrip ───────────────────────────────────────────────────────
function RoutesStrip({ routes }: { routes: typeof ACTIVE_ROUTES_BASE }) {
  return (
    <div className="panel">
      <div className="panel-h">
        <h3>Routes in flight</h3>
        <span className="sub">· auto-refresh 4s</span>
        <span className="right btn-link">All routes {ICO.arrow}</span>
      </div>
      <div className="routes-strip">
        {routes.map(r => {
          const a = CHAINS[r.fromChain], b = CHAINS[r.toChain];
          const stepLabel = r.steps[r.stepIdx] || r.steps[r.steps.length - 1];
          return (
            <div key={r.id} className="rs-card">
              <div className="rs-top">
                <span className="rs-id mono">{r.id}</span>
                <span className="pill green" style={{marginLeft:'auto'}}><span className="dot"/>Live</span>
              </div>
              <div className="rs-pair">
                <span className="rs-chain" style={{borderLeftColor:a.color}}>{a.short}</span>
                <span className="rs-arr">→</span>
                <span className="rs-chain" style={{borderLeftColor:b.color}}>{b.short}</span>
              </div>
              <div className="rs-name mono">{r.pair}</div>
              <div className="rs-step">◌ {stepLabel}</div>
              <div className="rs-bar"><span style={{width:r.progress+'%'}}/></div>
              <div className="rs-meta">
                <span className="mono">{fmtUSD(Number(r.amount), 0)}</span>
                <span className="mono" style={{color:'var(--green)'}}>{r.apy.toFixed(2)}% APY</span>
                <span style={{marginLeft:'auto',color:'var(--ink-4)'}}>ETA {r.eta}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PositionsTable ────────────────────────────────────────────────────
function PositionsTable({ positions, onSelect }: { positions: typeof POSITIONS_BASE; onSelect: (r: any) => void }) {
  return (
    <div className="panel">
      <div className="panel-h">
        <h3>Open positions</h3>
        <span className="sub mono">· {positions.length}</span>
        <span className="right btn-link">Manage {ICO.arrow}</span>
      </div>
      <table className="tbl ledger">
        <thead>
          <tr>
            <th style={{width:24}}></th><th>Asset</th><th>Protocol</th><th>Chain</th>
            <th className="r">Deployed</th><th className="r">Value</th><th className="r">P&amp;L</th>
            <th className="r">APY</th><th className="r">Age</th><th className="r">Risk</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const proto = PROTO[p.protocol];
            const a = ASSETS[p.asset] || { color:'#999' };
            const c = CHAINS[p.chain];
            const pnl = p.value - p.deployed;
            return (
              <tr key={p.id} onClick={() => onSelect({ id:p.id, sym:p.asset, name:`${p.asset} · ${proto.name}`, color:a.color, proto:proto.name, apy:p.apy, chg24:(pnl/p.deployed)*100, tvl:fmtUSD(p.value,0).replace('$',''), risk:p.risk })} style={{cursor:'default'}}>
                <td className="rank mono">{String(i+1).padStart(2,'0')}</td>
                <td>
                  <div className="ent">
                    <span className="ico" style={{background:`linear-gradient(135deg,${a.color},color-mix(in oklab,${a.color} 55%,#000))`}}>{p.asset[0]}</span>
                    <span className="lab"><span className="nm">{p.asset}</span><span className="sy">{p.id}</span></span>
                  </div>
                </td>
                <td><span style={{color:'var(--ink)',fontWeight:500}}>{proto.name}</span><div style={{fontSize:11,color:'var(--ink-4)'}}>{proto.type}</div></td>
                <td><span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12}}><span style={{width:8,height:8,background:c.color,borderRadius:2}}/>{c.short}</span></td>
                <td className="r">{fmtUSD(p.deployed,0)}</td>
                <td className="r">{fmtUSD(p.value,0)}</td>
                <td className="r"><span className={pnl>=0?'up':'dn'}>{pnl>=0?'+':''}{fmtUSD(pnl,0)}</span></td>
                <td className="r"><span style={{color:'var(--ink)'}}>{p.apy.toFixed(2)}%</span></td>
                <td className="r" style={{color:'var(--ink-3)'}}>{p.age}</td>
                <td className="r"><span style={{color:p.risk<30?'var(--green)':p.risk<60?'var(--amber)':'var(--red)',fontWeight:600}}>{p.risk}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── PositionDrawer ────────────────────────────────────────────────────
function PositionDrawer({ row, onClose }: { row: any; onClose: () => void }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  const open = !!row;
  const steps = row ? [
    { ico:'$', lab:'Wallet', sub:'Ethereum' },
    { ico:'↔', lab:`Swap → ${row.sym}`, sub:'Uniswap v3' },
    { ico:'⇌', lab:'Bridge', sub:'Stargate' },
    { ico:'%', lab:'Deposit', sub:row.proto },
  ] : [];
  return (
    <>
      <div className={`scrim${open?' open':''}`} onClick={onClose}/>
      <aside className={`drawer${open?' open':''}`}>
        {open && (
          <>
            <div className="drawer-hd">
              <span style={{width:34,height:34,borderRadius:'50%',background:`linear-gradient(135deg,${row.color},color-mix(in oklab,${row.color} 55%,#000))`,color:'#fff',display:'grid',placeItems:'center',font:"600 12px var(--font-mono)"}}>{row.sym[0]}</span>
              <div>
                <div style={{fontWeight:700}}>{row.name}</div>
                <div style={{fontSize:11.5,color:'var(--ink-4)',fontFamily:'var(--font-mono)'}}>{row.sym} · {row.proto}</div>
              </div>
              <button className="close" onClick={onClose}>{ICO.close}</button>
            </div>
            <div className="drawer-body">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                {[
                  {l:'APY',v:`${row.apy.toFixed(2)}%`,cls:'',s:'net of fees · 30d'},
                  {l:'24h change',v:`${row.chg24>=0?'+':''}${row.chg24.toFixed(2)}%`,cls:row.chg24>=0?'green':'red',s:'vs yesterday'},
                  {l:'TVL',v:`$${row.tvl}`,cls:'',s:'across all hops'},
                  {l:'Risk score',v:String(row.risk),cls:row.risk<30?'green':row.risk<60?'amber':'red',s:row.risk<30?'Conservative':row.risk<60?'Moderate':'Aggressive'},
                ].map(m=>(
                  <div key={m.l} className="metric">
                    <div className="l">{m.l}</div>
                    <div className={`v${m.cls?' '+m.cls:''}`}>{m.v}</div>
                    <div className="s">{m.s}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:11,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-4)',fontWeight:700,marginBottom:10}}>Route preview</div>
              <div style={{display:'grid',gridTemplateColumns:`repeat(${steps.length},1fr)`,padding:'10px 4px 6px',background:'var(--canvas-2)',borderRadius:10,border:'1px solid var(--line)'}}>
                {steps.map((s,i)=>(
                  <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,position:'relative'}}>
                    <div style={{width:34,height:34,borderRadius:9,background:'var(--canvas)',border:'1px solid var(--line)',display:'grid',placeItems:'center',font:"600 13px var(--font-mono)",color:'var(--ink)',position:'relative',zIndex:1}}>{s.ico}</div>
                    {i<steps.length-1&&<div style={{position:'absolute',top:17,left:'calc(50% + 20px)',right:'calc(-50% + 20px)',height:1,background:'repeating-linear-gradient(90deg,var(--ink-5) 0 4px,transparent 4px 8px)'}}/>}
                    <div style={{fontSize:11.5,color:'var(--ink)',fontWeight:600,textAlign:'center'}}>{s.lab}</div>
                    <div style={{fontSize:10.5,color:'var(--ink-4)',textAlign:'center'}}>{s.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:20,fontSize:11,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-4)',fontWeight:700,marginBottom:10}}>Transparency</div>
              <div className="metric" style={{padding:16}}>
                <div style={{fontSize:13,color:'var(--ink-2)',lineHeight:1.55}}>Underlying assets sit in <b style={{color:'var(--ink)'}}>{row.proto}</b>. Smart contract audited by <span className="mono" style={{color:'var(--ink)'}}>Spearbit · Trail of Bits</span>. Meridian holds no signing authority.</div>
              </div>
            </div>
            <div className="drawer-foot">
              <button className="btn-soft">Save to watchlist</button>
              <button className="btn-ink" style={{marginLeft:'auto'}}>Execute route {ICO.arrow}</button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

// ── Activity ──────────────────────────────────────────────────────────
function Activity() {
  const rows = [
    { t:'2s',  kind:'live',  msg:<>Route <b style={{color:'var(--ink)'}}>r-9213</b> bridged <b style={{color:'var(--ink)'}}>18,000 USDC</b> Ethereum → Base via <b style={{color:'var(--ink)'}}>Across</b></> },
    { t:'1m',  kind:'live',  msg:<>Yield accrued <b style={{color:'var(--ink)'}}>+$12.40</b> on wstETH/Aave (Arbitrum)</> },
    { t:'4m',  kind:'green', msg:<>Position <b style={{color:'var(--ink)'}}>p-002</b> rebalanced — APY improved <b style={{color:'var(--ink)'}}>7.18% → 7.91%</b></> },
    { t:'12m', kind:'live',  msg:<>Route <b style={{color:'var(--ink)'}}>r-9214</b> initiated · ETH→wstETH · est. <b style={{color:'var(--ink)'}}>14.20% APY</b></> },
    { t:'34m', kind:'amber', msg:<>Risk score on <b style={{color:'var(--ink)'}}>GMX v2</b> position moved <b style={{color:'var(--ink)'}}>68 → 72</b></> },
    { t:'1h',  kind:'green', msg:<>Withdrawal settled · <b style={{color:'var(--ink)'}}>$24,180 DAI</b> → 0x9f…ae21</> },
  ];
  return (
    <div className="panel">
      <div className="panel-h"><h3>Activity</h3><span className="sub">· last 24h</span><span className="right btn-link">All {ICO.arrow}</span></div>
      <div className="feed">
        {rows.map((r,i)=>(
          <div key={i} className="feed-row">
            <span className={`feed-dot${r.kind==='green'?' green':r.kind==='amber'?' amber':' ink'}`}/>
            <div className="feed-msg">{r.msg}</div>
            <div className="feed-time">{r.t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── OpportunitiesTable ────────────────────────────────────────────────
function OpportunitiesTable({ onSelect }: { onSelect: (r: any) => void }) {
  return (
    <div className="panel">
      <div className="panel-h"><h3>Top opportunities</h3><span className="sub">· ranked by APY</span><span className="right btn-link">View all {ICO.arrow}</span></div>
      <table className="tbl">
        <thead><tr><th style={{width:34}}></th><th style={{width:30}}>#</th><th>Strategy</th><th className="r">APY</th><th className="r">24h</th><th className="r">TVL</th></tr></thead>
        <tbody>
          {OPPORTUNITIES.map((r,i)=>(
            <tr key={r.id} onClick={()=>onSelect(r)} style={{cursor:'default'}}>
              <td><span className={`star${i<3?' on':''}`}>{i<3?ICO.star_f:ICO.star}</span></td>
              <td className="rank">{i+1}</td>
              <td><div className="ent"><span className="ico" style={{background:`linear-gradient(135deg,${r.color},color-mix(in oklab,${r.color} 55%,#000))`}}>{r.sym[0]}</span><span className="lab"><span className="nm">{r.name}</span><span className="sy">{r.sym}</span></span></div></td>
              <td className="r">{r.apy.toFixed(2)}%</td>
              <td className="r"><span className={r.chg24>=0?'up':'dn'}>{r.chg24>=0?'+':''}{r.chg24.toFixed(2)}%</span></td>
              <td className="r">${r.tvl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── StrategiesPanel ───────────────────────────────────────────────────
function StrategiesPanel() {
  const strats = [
    {name:'Atlas Stable',code:'STBL',g:'A'},{name:'Helios LRT',code:'LRT',g:'H'},
    {name:'Orbit Carry',code:'CARR',g:'O'},{name:'Vega Basis',code:'BASIS',g:'V'},
    {name:'Lyra T-Yield',code:'YLD',g:'L'},{name:'Polaris Stable',code:'PLR',g:'P'},
  ];
  return (
    <div className="panel">
      <div className="panel-h"><h3>Featured strategies</h3><span className="right btn-link">View all {ICO.arrow}</span></div>
      <div className="strat-grid">
        {strats.map(s=>(
          <div key={s.name} className="strat-tile">
            <span className="ico">{s.g}</span>
            <span className="lab"><span className="nm">{s.name}</span><span className="sy">{s.code}</span></span>
            <span className="ar">{ICO.arrow}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HomePage ──────────────────────────────────────────────────────────
function HomePage({ view, onSelect }: { view: ReturnType<typeof buildView>; onSelect: (r: any) => void }) {
  return (
    <>
      <Sidebar/>
      <div className="page">
        <Snapshot view={view}/>
        <div className="row-2" style={{marginBottom:'var(--gap)'}}>
          <ChartPanel view={view}/>
          <MeshPanel routes={view.activeRoutes}/>
        </div>
        {view.activeRoutes.length > 0 && (
          <div style={{marginBottom:'var(--gap)'}}><RoutesStrip routes={view.activeRoutes}/></div>
        )}
        <div style={{marginBottom:'var(--gap)'}}><PositionsTable positions={view.positions} onSelect={onSelect}/></div>
        <div className="row-2" style={{marginBottom:'var(--gap)'}}>
          <StrategiesPanel/>
          <OpportunitiesTable onSelect={onSelect}/>
        </div>
        <Activity/>
      </div>
    </>
  );
}

// ── Seg tabs ──────────────────────────────────────────────────────────
function Seg({ tabs, value, onChange }: { tabs:{k:string;label:string;count?:number}[]; value:string; onChange:(v:string)=>void }) {
  return (
    <div className="seg">
      {tabs.map(t=>(
        <button key={t.k} className={value===t.k?'on':''} onClick={()=>onChange(t.k)}>
          {t.label}{t.count!=null&&<span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── PageHdr ───────────────────────────────────────────────────────────
function PageHdr({ eyebrow, title, lede, actions }: { eyebrow:string; title:string; lede?:string; actions?:React.ReactNode }) {
  return (
    <div className="page-hdr">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

// ── ChainSwatch ───────────────────────────────────────────────────────
function ChainSwatch({ chainId }: { chainId: string }) {
  const c = CHAINS[chainId]; if (!c) return null;
  return <span style={{display:'inline-flex',alignItems:'center',gap:6,font:"600 11.5px var(--font-mono)",color:'var(--ink-2)'}}><span style={{width:9,height:9,background:c.color,borderRadius:2}}/>{c.short}</span>;
}

// ── FindPage ──────────────────────────────────────────────────────────
function FindPage() {
  const [selected, setSelected] = useState(0);
  const cands = [
    { rank:1, label:'BEST',   apy:14.20, hops:['ETH→USDC (Uniswap v3)','USDC→Arbitrum (Stargate)','USDC Lend (Aave v3)','Settle'], fees:12.40, time:'~8m', risk:42 },
    { rank:2, label:null,     apy:11.85, hops:['ETH→USDC (Uniswap v3)','USDC→Arbitrum (Across)','USDC Lend (Compound v3)','Settle'], fees:9.10, time:'~12m', risk:31 },
    { rank:3, label:'SAFEST', apy:9.50,  hops:['ETH→Arbitrum (Hop)','ETH Lend (Aave v3)','Settle'], fees:6.20, time:'~6m', risk:22 },
  ];
  return (
    <>
      <aside className="side">
        <div className="side-group">
          <div className="head">Routes<span className="chev">{ICO.chev_up}</span></div>
          <div className="body">
            {([['Overview',null,true],['Active',3,false],['Pending',1,false],['History',null,false],['Saved',5,false]] as [string,number|null,boolean][]).map(([l,b,on])=>(
              <div key={l} className={`side-item${on?' on':''}`}>
                <span>{l}</span>
                {b!=null&&<span style={{marginLeft:'auto',font:"500 11px var(--font-mono)",color:'var(--ink-4)'}}>{b}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="side-group">
          <div className="head">Filter by chain<span className="chev">{ICO.chev_up}</span></div>
          <div className="body">
            {Object.values(CHAINS).map(c=>(
              <div key={c.id} className="side-item">
                <span style={{width:9,height:9,borderRadius:3,background:c.color,flexShrink:0}}/>
                <span>{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
      <div className="page">
        <PageHdr eyebrow="Find · route discovery" title="Build a route"
          lede="Define a source asset and a destination. Meridian compares every viable path across 6 chains and 38 protocols and shows you the trade-offs."
          actions={<><button className="btn-soft">Reset</button><button className="btn-soft">Save preset</button></>}/>
        <div className="row-2">
          <div className="panel">
            <div className="panel-h"><h3>Strategy</h3><span className="sub">· non-custodial</span></div>
            <div className="form-grid">
              <div className="form-row">
                <div className="form-field"><label>Source asset</label><select defaultValue="ETH">{['ETH','USDC','USDT','WBTC','DAI','wstETH'].map(o=><option key={o}>{o}</option>)}</select></div>
                <div className="form-field"><label>Source chain</label><select defaultValue="eth">{Object.values(CHAINS).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              </div>
              <div className="form-field">
                <label>Amount</label>
                <div className="input"><span className="pre">$</span><input type="text" defaultValue="25000"/><span style={{color:'var(--ink-4)',font:"500 11.5px var(--font-mono)"}}>USD</span></div>
              </div>
              <div className="form-field"><label>Destination chain</label><select defaultValue="arb">{Object.values(CHAINS).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="form-field">
                <label>Destination wallet <span style={{color:'var(--amber)',textTransform:'none',letterSpacing:0,fontWeight:500}}>· verified by signature</span></label>
                <div className="row-inline">
                  <div className="input"><input type="text" defaultValue="0x7c4f…2f1c" className="mono"/></div>
                  <div className="verified">✓ Verified</div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Risk tolerance · <span style={{textTransform:'none',letterSpacing:0,color:'var(--ink-2)'}}>Moderate</span></label>
                  <input type="range" min="1" max="5" defaultValue="3" className="slider"/>
                  <div className="slider-row"><span>Conservative</span><span>Aggressive</span></div>
                </div>
                <div className="form-field"><label>Time horizon</label><div className="input"><input type="text" defaultValue="30"/><span style={{color:'var(--ink-4)',font:"500 11.5px var(--font-mono)"}}>days</span></div></div>
              </div>
              <button className="btn-ink" style={{justifyContent:'center'}}>{ICO.find} Find best routes</button>
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>3 routes found</h3><span className="sub mono">· vs single-chain Aave</span><span className="right btn-link">Re-rank {ICO.refresh}</span></div>
            <div className="cand-list">
              {cands.map((c,i)=>(
                <div key={c.rank} className={`cand${selected===i?' sel':''}`} onClick={()=>setSelected(i)}>
                  <div>
                    <div className="h">
                      <span className="rank">ROUTE #{c.rank}</span>
                      {c.label&&<span className="tag-best">{c.label}</span>}
                      <span className="apy">{c.apy.toFixed(2)}%<small>APY</small></span>
                    </div>
                    <div className="hops">{c.hops.map((h,j)=>(
                      <span key={j} className="hop-wrap">
                        <span className="hop">{h}</span>
                        {j<c.hops.length-1&&<span className="hop-arr">›</span>}
                      </span>
                    ))}</div>
                    <div className="stats">
                      <div className="s"><div className="l">Fees · est</div><div className="v">${c.fees.toFixed(2)}</div></div>
                      <div className="s"><div className="l">Time · est</div><div className="v">{c.time}</div></div>
                      <div className="s"><div className="l">Risk</div><div className={`v ${c.risk<30?'green':c.risk<60?'amber':'red'}`}>{c.risk}/100</div></div>
                    </div>
                  </div>
                  <div className="pick"/>
                </div>
              ))}
            </div>
            <div style={{padding:'14px 22px',borderTop:'1px solid var(--line)',display:'flex',gap:10,alignItems:'center',background:'var(--canvas-2)'}}>
              <span style={{fontSize:12,color:'var(--ink-3)'}}>3rd-party protocols · not insured</span>
              <button className="btn-ink" style={{marginLeft:'auto'}}>Execute route #{selected+1} {ICO.arrow}</button>
            </div>
          </div>
        </div>
        <div className="panel" style={{marginTop:'var(--gap)'}}>
          <div className="panel-h"><h3>Why route #{selected+1}?</h3><span className="sub">· transparent ranking</span></div>
          <div style={{padding:'4px 22px 22px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:18}}>
            {[
              {l:'APY advantage',  v:'+1.84% vs single-chain', s:'Trailing 30-day uplift versus Aave on a single chain.'},
              {l:'Fee profile',    v:'$12.40 across 3 hops',   s:'Includes swap fees, bridge fees, and destination gas.'},
              {l:'Audit coverage', v:'Spearbit · ToB · OZ',    s:'Every protocol on this path has been audited by ≥ 2 firms.'},
            ].map((b,i)=>(
              <div key={i} style={{padding:'14px 16px',background:'var(--canvas-2)',border:'1px solid var(--line)',borderRadius:10}}>
                <div style={{fontSize:10.5,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-4)',fontWeight:600}}>{b.l}</div>
                <div style={{font:"700 16px var(--font-mono)",color:'var(--ink)',margin:'6px 0 4px'}}>{b.v}</div>
                <div style={{fontSize:12,color:'var(--ink-3)',lineHeight:1.5}}>{b.s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── RoutesPage ────────────────────────────────────────────────────────
function RoutesPage({ view }: { view: ReturnType<typeof buildView> }) {
  const [tab, setTab] = useState('active');
  return (
    <>
      <aside className="side">
        <div className="side-group">
          <div className="head">Routes<span className="chev">{ICO.chev_up}</span></div>
          <div className="body">
            {([['Overview',null],['Active',3],['Pending',1],['History',null],['Saved',5]] as [string,number|null][]).map(([l,b])=>(
              <div key={l} className={`side-item${tab===l.toLowerCase()?' on':''}`} onClick={()=>setTab(l.toLowerCase())}>
                <span>{l}</span>
                {b!=null&&<span style={{marginLeft:'auto',font:"500 11px var(--font-mono)",color:'var(--ink-4)'}}>{b}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="side-group">
          <div className="head">Filter by chain<span className="chev">{ICO.chev_up}</span></div>
          <div className="body">
            {Object.values(CHAINS).map(c=>(
              <div key={c.id} className="side-item">
                <span style={{width:9,height:9,borderRadius:3,background:c.color,flexShrink:0}}/>
                <span>{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
      <div className="page">
        <PageHdr eyebrow="Routes · execution log" title="Active & history"
          lede="Every route is signed and executed by you. Meridian only orchestrates — it never holds your funds."
          actions={<Seg tabs={[{k:'active',label:'Active',count:view.activeRoutes.length},{k:'pending',label:'Pending',count:1},{k:'history',label:'History'},{k:'saved',label:'Saved',count:5}]} value={tab} onChange={setTab}/>}/>
        {tab==='active'&&(
          <>
            <div className="big-stats">
              <div className="big-stat"><div className="l">In flight</div><div className="v">{fmtUSD(view.activeRoutes.reduce((s,r)=>s+Number(r.amount),0),0)}</div><div className="s">across {view.activeRoutes.length} routes</div></div>
              <div className="big-stat"><div className="l">Avg dest. APY</div><div className="v green">{(view.activeRoutes.reduce((s,r)=>s+r.apy,0)/Math.max(1,view.activeRoutes.length)).toFixed(2)}%</div><div className="s">post-bridge</div></div>
              <div className="big-stat"><div className="l">Avg ETA</div><div className="v">~6m</div><div className="s">remaining</div></div>
              <div className="big-stat"><div className="l">Today&apos;s routes</div><div className="v">14</div><div className="s">+3 vs yesterday</div></div>
            </div>
            <div className="panel">
              <div className="panel-h"><h3>Active routes</h3><span className="sub">· auto-refresh 4s</span><span className="right btn-link">Export {ICO.ext}</span></div>
              {view.activeRoutes.map(r=>(
                <div key={r.id} style={{padding:'18px 22px',borderTop:'1px solid var(--line)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                    <span style={{font:"500 11px var(--font-mono)",color:'var(--ink-4)',letterSpacing:'.04em'}}>{r.id.toUpperCase()}</span>
                    <span className="pill green"><span className="dot"/>Live</span>
                    <span style={{fontSize:13,color:'var(--ink)',fontWeight:600,marginLeft:6}}>{r.pair}</span>
                    <span style={{fontSize:12,color:'var(--ink-3)'}}>· {r.via}</span>
                    <span style={{marginLeft:'auto',font:"700 16px var(--font-mono)",color:'var(--green)'}}>{r.apy.toFixed(2)}%</span>
                    <span style={{fontSize:11,color:'var(--ink-4)',fontFamily:'var(--font-mono)'}}>APY</span>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:`repeat(${r.steps.length},1fr) auto`,gap:0,alignItems:'center'}}>
                    {r.steps.map((s,i)=>(
                      <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:4,padding:i===0?'0 12px 0 0':'0 12px 0 12px',borderLeft:i===0?'none':'1px dashed var(--line)'}}>
                        <span style={{font:"600 10px var(--font-mono)",letterSpacing:'.06em',padding:'2px 7px',borderRadius:4,background:i<r.stepIdx?'var(--green-soft)':i===r.stepIdx?'var(--ink)':'var(--canvas-2)',color:i<r.stepIdx?'var(--green)':i===r.stepIdx?'#fff':'var(--ink-4)'}}>{i<r.stepIdx?'DONE':i===r.stepIdx?'LIVE':'QUEUE'}</span>
                        <span style={{fontSize:12,fontWeight:600,color:'var(--ink)'}}>{s}</span>
                      </div>
                    ))}
                    <div style={{textAlign:'right',font:"500 11px var(--font-mono)",color:'var(--ink-4)'}}>ETA {r.eta}</div>
                  </div>
                  <div style={{height:4,background:'var(--canvas-2)',borderRadius:2,marginTop:14,overflow:'hidden'}}><div style={{width:r.progress+'%',height:'100%',background:'var(--ink)',borderRadius:2,transition:'width .6s'}}/></div>
                  <div style={{display:'flex',gap:18,marginTop:10,fontSize:12,color:'var(--ink-3)'}}>
                    <span>Amount <b style={{color:'var(--ink)',fontFamily:'var(--font-mono)'}}>{fmtUSD(Number(r.amount),0)}</b></span>
                    <span>From <ChainSwatch chainId={r.fromChain}/></span>
                    <span>To <ChainSwatch chainId={r.toChain}/></span>
                    <span style={{marginLeft:'auto'}}><a className="btn-link">View on explorer {ICO.ext}</a></span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {tab==='history'&&(
          <div className="panel">
            <div className="panel-h"><h3>History</h3><span className="sub">· last 30 days · 142 routes</span><span className="right btn-link">Export CSV {ICO.ext}</span></div>
            <table className="tbl ledger">
              <thead><tr><th>Date</th><th>Route</th><th>From → To</th><th className="r">Amount</th><th className="r">Fees</th><th className="r">Realized APY</th><th className="r">Saved vs single-chain</th><th className="r">Status</th></tr></thead>
              <tbody>
                {[
                  {d:'May 24 · 14:22',r:'ETH → wstETH · Lido · Aave',f:'eth',t:'arb', amt:42500,fees:12.40,apy:14.20,save:1.84,st:'Settled'},
                  {d:'May 24 · 11:08',r:'USDC → USDC · Across · Morpho',f:'eth',t:'base',amt:18000,fees:9.10,apy:9.74,save:1.42,st:'Settled'},
                  {d:'May 24 · 09:31',r:'wstETH → weETH · Pendle · Etherfi',f:'arb',t:'arb',amt:8200,fees:6.20,apy:18.40,save:2.18,st:'Settled'},
                  {d:'May 23 · 19:14',r:'ETH → ETH · Hop · Aave',f:'eth',t:'op',amt:60000,fees:14.20,apy:6.18,save:0.84,st:'Settled'},
                  {d:'May 23 · 16:42',r:'USDC → DAI · Curve · Spark',f:'arb',t:'poly',amt:24500,fees:7.40,apy:7.91,save:1.08,st:'Settled'},
                  {d:'May 22 · 21:08',r:'WBTC → WBTC · Across · GMX',f:'eth',t:'arb',amt:84200,fees:18.60,apy:22.80,save:3.42,st:'Settled'},
                  {d:'May 22 · 12:55',r:'ETH → wstETH · Lido (single)',f:'eth',t:'eth',amt:32000,fees:4.80,apy:3.40,save:0,st:'Refunded'},
                  {d:'May 21 · 08:31',r:'USDT → USDT · Stargate · Curve',f:'eth',t:'arb',amt:14200,fees:8.20,apy:9.10,save:0.94,st:'Settled'},
                ].map((row,i)=>(
                  <tr key={i}>
                    <td className="mono" style={{color:'var(--ink-3)',fontSize:12}}>{row.d}</td>
                    <td><span style={{color:'var(--ink)',fontWeight:500}}>{row.r}</span></td>
                    <td><span style={{display:'inline-flex',gap:8,alignItems:'center'}}><ChainSwatch chainId={row.f}/><span style={{color:'var(--ink-4)'}}>→</span><ChainSwatch chainId={row.t}/></span></td>
                    <td className="r">{fmtUSD(row.amt,0)}</td>
                    <td className="r">${row.fees.toFixed(2)}</td>
                    <td className="r"><span style={{color:'var(--ink)'}}>{row.apy.toFixed(2)}%</span></td>
                    <td className="r"><span style={{color:row.save>0?'var(--green)':'var(--ink-4)'}}>{row.save>0?'+':''}{row.save.toFixed(2)}%</span></td>
                    <td className="r"><span className={row.st==='Settled'?'pill green':'pill amber'} style={{fontSize:10.5}}>{row.st}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab==='pending'&&(
          <div className="panel">
            <div className="panel-h"><h3>Pending</h3><span className="sub">· awaiting signature</span></div>
            <div style={{padding:'40px 22px',textAlign:'center',color:'var(--ink-3)'}}>
              <div style={{font:"600 18px var(--font-sans)",color:'var(--ink)',marginBottom:6}}>1 route awaiting your signature</div>
              <p style={{maxWidth:420,margin:'0 auto 14px',fontSize:13}}>Open your wallet to approve <b className="mono" style={{color:'var(--ink)'}}>r-9220</b> — wstETH → Pendle PT on Arbitrum.</p>
              <button className="btn-ink">Open wallet</button>
            </div>
          </div>
        )}
        {tab==='saved'&&(
          <div className="row-3" style={{gap:'var(--gap)'}}>
            {[
              {name:'USDC Yield Stack',   desc:'Bridge USDC to Base, deposit Morpho, auto-compound weekly.',              apy:9.74,  hops:3},
              {name:'wstETH Looper',      desc:'Stake ETH on Lido, loop on Aave Arbitrum for leveraged yield.',           apy:14.20, hops:4},
              {name:'Stable Triangle',   desc:'Rebalance USDC across Aave / Compound / Spark on highest rate.',          apy:8.18,  hops:3},
              {name:'BTC Carry',          desc:'Bridge WBTC to Arbitrum, GMX delta-neutral basis.',                       apy:14.30, hops:5},
              {name:'DAI Conservative',   desc:'Single-chain DAI on Spark with auto top-up.',                             apy:5.95,  hops:1},
            ].map(s=>(
              <div key={s.name} className="panel" style={{padding:18}}>
                <div style={{fontWeight:700,fontSize:14,color:'var(--ink)'}}>{s.name}</div>
                <div style={{fontSize:12.5,color:'var(--ink-3)',margin:'6px 0 14px',lineHeight:1.5,minHeight:54}}>{s.desc}</div>
                <div style={{display:'flex',alignItems:'baseline',gap:14}}>
                  <span style={{font:"700 18px var(--font-mono)",color:'var(--green)'}}>{s.apy.toFixed(2)}%</span>
                  <span style={{fontSize:11,color:'var(--ink-4)',letterSpacing:'.04em'}}>{s.hops} hops</span>
                  <button className="btn-soft" style={{marginLeft:'auto'}}>Execute</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── MarketsPage ───────────────────────────────────────────────────────
function MarketsPage() {
  const [chainFilt, setChainFilt] = useState('all');
  const [riskFilt,  setRiskFilt]  = useState('all');
  const rows = [
    {id:'m1', sym:'WBTC',   name:'BTC Carry · Aave',       proto:'Aave v3 · GMX',    chain:'arb',  apy:14.20,chg:+3.22,tvl:'124.2M',risk:38,hops:3},
    {id:'m2', sym:'ETH',    name:'ETH Looper · Etherfi',   proto:'Etherfi · Pendle', chain:'eth',  apy:21.80,chg:-2.42,tvl:'48.9M', risk:64,hops:5},
    {id:'m3', sym:'USDC',   name:'USDC Stack · Morpho',    proto:'Morpho · Spark',   chain:'base', apy:9.74, chg:+2.67,tvl:'266.5M',risk:24,hops:3},
    {id:'m4', sym:'wstETH', name:'wstETH Loop · Aave',     proto:'Aave v3',          chain:'arb',  apy:11.40,chg:+1.04,tvl:'62.6M', risk:42,hops:3},
    {id:'m5', sym:'DAI',    name:'DAI Yield · Spark',      proto:'Spark · MakerDAO', chain:'eth',  apy:8.18, chg:+0.42,tvl:'50.9M', risk:18,hops:1},
    {id:'m6', sym:'ARB',    name:'ARB Perp LP · GMX',      proto:'GMX v2',           chain:'arb',  apy:22.80,chg:+6.12,tvl:'34.5M', risk:72,hops:2},
    {id:'m7', sym:'USDT',   name:'USDT Stable · Curve',    proto:'Curve · Convex',   chain:'eth',  apy:7.50, chg:+1.12,tvl:'82.6M', risk:24,hops:2},
    {id:'m8', sym:'ETH',    name:'ETH Restake · Eigen',    proto:'Eigenlayer',       chain:'eth',  apy:18.40,chg:-2.67,tvl:'39.7M', risk:54,hops:4},
    {id:'m9', sym:'USDC',   name:'USDC Lend · Compound',   proto:'Compound v3',      chain:'base', apy:6.18, chg:+0.18,tvl:'112.3M',risk:14,hops:1},
    {id:'m10',sym:'wstETH', name:'wstETH PT · Pendle',     proto:'Pendle',           chain:'eth',  apy:16.20,chg:+1.84,tvl:'88.1M', risk:48,hops:2},
    {id:'m11',sym:'WBTC',   name:'WBTC LP · Uniswap v3',   proto:'Uniswap v3',       chain:'arb',  apy:12.40,chg:-0.62,tvl:'18.4M', risk:54,hops:1},
    {id:'m12',sym:'USDC',   name:'USDC Curve 3pool',       proto:'Curve',            chain:'poly', apy:5.95, chg:+0.04,tvl:'42.8M', risk:18,hops:1},
  ];
  const filtered = rows.filter(r=>{
    if (chainFilt!=='all' && r.chain!==chainFilt) return false;
    if (riskFilt==='conservative' && r.risk>=30) return false;
    if (riskFilt==='moderate' && (r.risk<30||r.risk>=60)) return false;
    if (riskFilt==='aggressive' && r.risk<60) return false;
    return true;
  });
  return (
    <>
      <aside className="side">
        <div className="side-group">
          <div className="head">Strategy type<span className="chev">{ICO.chev_up}</span></div>
          <div className="body">{['Lending','Concentrated LP','Stable LP','Yield (Pendle)','Restaking','Perps LP','Delta neutral'].map(s=><div key={s} className="side-item"><span>{s}</span></div>)}</div>
        </div>
        <div className="side-group">
          <div className="head">Chains<span className="chev">{ICO.chev_up}</span></div>
          <div className="body">{Object.values(CHAINS).map(c=><div key={c.id} className="side-item"><span style={{width:9,height:9,borderRadius:3,background:c.color,flexShrink:0}}/><span>{c.name}</span></div>)}</div>
        </div>
        <div className="side-group">
          <div className="head">Risk<span className="chev">{ICO.chev_up}</span></div>
          <div className="body">
            {['Conservative (0–30)','Moderate (30–60)','Aggressive (60+)'].map(r=><div key={r} className="side-item"><span>{r}</span></div>)}
          </div>
        </div>
      </aside>
      <div className="page">
        <PageHdr eyebrow="Markets · cross-chain" title="Lending & yield"
          lede="Every strategy Meridian can route into. Compare APY, risk, and depth across chains and protocols in one place."
          actions={<><button className="btn-soft">Compare</button><button className="btn-ink">{ICO.bolt} Route into a strategy</button></>}/>
        <div className="big-stats">
          <div className="big-stat"><div className="l">Tracked TVL</div><div className="v">$1.84B</div><div className="s"><span style={{color:'var(--green)'}}>+2.4%</span> 24h</div></div>
          <div className="big-stat"><div className="l">24h volume routed</div><div className="v">$184.2M</div><div className="s"><span style={{color:'var(--green)'}}>+12.8%</span> vs yesterday</div></div>
          <div className="big-stat"><div className="l">Strategies</div><div className="v">36</div><div className="s">across 38 protocols</div></div>
          <div className="big-stat"><div className="l">Median APY</div><div className="v">9.42%</div><div className="s"><span style={{color:'var(--green)'}}>+0.42</span> vs last week</div></div>
        </div>
        <div className="filt-row">
          <span className="grp-lbl">Chain</span>
          <span className={`filt${chainFilt==='all'?' on':''}`} onClick={()=>setChainFilt('all')}>All</span>
          {Object.values(CHAINS).map(c=>(
            <span key={c.id} className={`filt${chainFilt===c.id?' on':''}`} onClick={()=>setChainFilt(c.id)}>
              <span className="sw" style={{background:c.color,opacity:1}}/>{c.short}
            </span>
          ))}
          <span style={{width:18}}/>
          <span className="grp-lbl">Risk</span>
          <span className={`filt${riskFilt==='all'?' on':''}`} onClick={()=>setRiskFilt('all')}>All</span>
          <span className={`filt${riskFilt==='conservative'?' on':''}`} onClick={()=>setRiskFilt('conservative')}>Conservative</span>
          <span className={`filt${riskFilt==='moderate'?' on':''}`} onClick={()=>setRiskFilt('moderate')}>Moderate</span>
          <span className={`filt${riskFilt==='aggressive'?' on':''}`} onClick={()=>setRiskFilt('aggressive')}>Aggressive</span>
        </div>
        <div className="panel">
          <table className="tbl ledger">
            <thead><tr><th style={{width:28}}>#</th><th>Strategy</th><th>Protocols</th><th>Chain</th><th className="r">APY</th><th className="r">24h</th><th className="r">TVL</th><th className="r">Hops</th><th className="r">Risk</th></tr></thead>
            <tbody>{filtered.map((r,i)=>(
              <tr key={r.id}>
                <td className="rank">{String(i+1).padStart(2,'0')}</td>
                <td><div className="ent"><span className="ico" style={{background:`linear-gradient(135deg,${ASSETS[r.sym]?.color||'#999'},#000)`}}>{r.sym[0]}</span><span className="lab"><span className="nm">{r.name}</span><span className="sy">{r.sym}</span></span></div></td>
                <td style={{color:'var(--ink-2)',fontSize:12.5}}>{r.proto}</td>
                <td><ChainSwatch chainId={r.chain}/></td>
                <td className="r" style={{color:'var(--ink)'}}>{r.apy.toFixed(2)}%</td>
                <td className="r"><span className={r.chg>=0?'up':'dn'}>{r.chg>=0?'+':''}{r.chg.toFixed(2)}%</span></td>
                <td className="r">${r.tvl}</td>
                <td className="r" style={{color:'var(--ink-3)'}}>{r.hops}</td>
                <td className="r"><span style={{color:r.risk<30?'var(--green)':r.risk<60?'var(--amber)':'var(--red)',fontWeight:600}}>{r.risk}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── TrendPage ─────────────────────────────────────────────────────────
function TrendPage() {
  const [period, setPeriod] = useState('24h');
  return (
    <>
      <Sidebar/>
      <div className="page">
        <PageHdr eyebrow="Trend · what's moving" title="Pulse"
          lede="Where capital is flowing in the last few hours — across chains, strategies and assets."
          actions={<Seg tabs={[{k:'1h',label:'1h'},{k:'24h',label:'24h'},{k:'7d',label:'7d'},{k:'30d',label:'30d'}]} value={period} onChange={setPeriod}/>}/>
        <div className="feat-row">
          <div className="feat"><div className="l">▲ Top gainer</div><div className="nm">ETH Restake · Eigen</div><div className="sy">eETH · Eigenlayer</div><div className="delta up">+38.4%<small>vs yesterday</small></div><div className="sub">APY 18.40% · TVL $39.7M</div></div>
          <div className="feat"><div className="l">▼ Top decliner</div><div className="nm">USDC Stack · Morpho</div><div className="sy">USDC · Morpho · Spark</div><div className="delta dn">−12.8%<small>vs yesterday</small></div><div className="sub">APY 9.74% · TVL $266.5M</div></div>
          <div className="feat"><div className="l">↻ Most routed</div><div className="nm">ETH → wstETH</div><div className="sy">Ethereum → Arbitrum</div><div className="delta up" style={{color:'var(--ink)'}}>$42.8M<small>routed today</small></div><div className="sub">1,284 routes · 14.20% avg APY</div></div>
        </div>
        <div className="row-2-1">
          <div className="panel">
            <div className="panel-h"><h3>Most-routed pairs</h3><span className="sub">· last {period}</span><span className="right btn-link">All pairs {ICO.arrow}</span></div>
            <table className="tbl ledger">
              <thead><tr><th>#</th><th>Pair</th><th>From → To</th><th className="r">Volume</th><th className="r">Routes</th><th className="r">Avg APY</th></tr></thead>
              <tbody>{[
                {p:'ETH → wstETH',   f:'eth', t:'arb',  vol:'42.8M',n:1284,apy:14.20},
                {p:'USDC → USDC',    f:'eth', t:'base', vol:'31.4M',n:982, apy:9.74},
                {p:'wstETH → weETH', f:'arb', t:'arb',  vol:'18.2M',n:412, apy:18.40},
                {p:'WBTC → WBTC',    f:'eth', t:'arb',  vol:'16.9M',n:284, apy:14.30},
                {p:'USDT → DAI',     f:'arb', t:'poly', vol:'12.1M',n:248, apy:7.91},
                {p:'ETH → ETH',      f:'eth', t:'op',   vol:'9.4M', n:198, apy:6.18},
                {p:'DAI → USDC',     f:'eth', t:'arb',  vol:'8.2M', n:142, apy:7.50},
              ].map((r,i)=>(
                <tr key={i}>
                  <td className="rank">{String(i+1).padStart(2,'0')}</td>
                  <td style={{color:'var(--ink)',fontWeight:500,fontFamily:'var(--font-mono)'}}>{r.p}</td>
                  <td><span style={{display:'inline-flex',gap:8,alignItems:'center'}}><ChainSwatch chainId={r.f}/><span style={{color:'var(--ink-4)'}}>→</span><ChainSwatch chainId={r.t}/></span></td>
                  <td className="r">${r.vol}</td>
                  <td className="r" style={{color:'var(--ink-3)'}}>{r.n.toLocaleString()}</td>
                  <td className="r" style={{color:'var(--green)'}}>{r.apy.toFixed(2)}%</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Top chains</h3><span className="sub">· 24h flow</span></div>
            <div className="barlist">
              {[{id:'eth',v:'$842M',pct:100},{id:'arb',v:'$284M',pct:34},{id:'base',v:'$312M',pct:37},{id:'op',v:'$118M',pct:14},{id:'poly',v:'$162M',pct:19},{id:'sol',v:'$98M',pct:12}].map(b=>{
                const c=CHAINS[b.id];
                return <div key={b.id} className="row"><div className="lbl"><span className="dot" style={{background:c.color}}/>{c.short}</div><div className="bar" style={{'--p':b.pct+'%'} as any}/><div className="v">{b.v}</div></div>;
              })}
            </div>
          </div>
        </div>
        <div style={{marginTop:'var(--gap)'}}>
          <div style={{display:'flex',alignItems:'baseline',marginBottom:10}}>
            <h2 style={{margin:0,fontSize:18,fontWeight:700,color:'var(--ink)',letterSpacing:'-0.01em'}}>Newly listed</h2>
            <span style={{marginLeft:8,color:'var(--ink-4)',fontSize:12.5}}>· this week</span>
            <span style={{marginLeft:'auto'}} className="btn-link">Browse all {ICO.arrow}</span>
          </div>
          <div className="row-3">
            {[
              {name:'Luna Restake',   desc:'Multi-AVS restaking with auto-rotation by slashing-risk score.',                     apy:24.8, risk:68},
              {name:'Aether Carry',   desc:'Cross-chain ETH basis trade with funding harvest on GMX & Hyperliquid.',             apy:18.2, risk:54},
              {name:'Quartz Stable',  desc:'Single-tier stablecoin lending with full audit + insurance bundle.',                  apy:6.8,  risk:14},
            ].map(s=>(
              <div key={s.name} className="panel" style={{padding:20}}>
                <span className="pill tint" style={{marginBottom:10}}>NEW</span>
                <div style={{fontWeight:700,fontSize:15,color:'var(--ink)',marginTop:6}}>{s.name}</div>
                <div style={{fontSize:13,color:'var(--ink-3)',margin:'6px 0 14px',lineHeight:1.5,minHeight:60}}>{s.desc}</div>
                <div style={{display:'flex',gap:18,paddingTop:12,borderTop:'1px dashed var(--line)'}}>
                  <div><div style={{fontSize:10,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-4)',fontWeight:600}}>APY</div><div style={{font:`600 14px var(--font-mono)`,color:'var(--green)'}}>{s.apy}%</div></div>
                  <div><div style={{fontSize:10,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-4)',fontWeight:600}}>Risk</div><div style={{font:`600 14px var(--font-mono)`,color:s.risk<30?'var(--green)':s.risk<60?'var(--amber)':'var(--red)'}}>{s.risk}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── WalletPage ────────────────────────────────────────────────────────
const ASSET_NAMES: Record<string,string> = {
  WBTC:'Bitcoin', ETH:'Ethereum', USDC:'USD Coin', USDT:'Tether', DAI:'Dai', wstETH:'Lido stETH', weETH:'Etherfi ETH', ARB:'Arbitrum',
};
const ASSET_PRICES: Record<string,number> = {
  WBTC:64433, ETH:3481, wstETH:3481, weETH:3481, USDC:1, USDT:1, DAI:1, ARB:1.12,
};

function WalletPage({ view }: { view: ReturnType<typeof buildView> }) {
  const [tab, setTab] = useState('holdings');
  const idle = [
    {sym:'ETH', chain:'eth', value:28430, deployed:28000, proto:'Wallet (idle)', delta:1.53},
    {sym:'USDC',chain:'arb', value:12450, deployed:12450, proto:'Wallet (idle)', delta:0.00},
  ];
  const holdings = view.positions.map(p=>({sym:p.asset,chain:p.chain,value:p.value,deployed:p.deployed,proto:PROTO[p.protocol].name,delta:((p.value-p.deployed)/p.deployed)*100}));
  const allRows = [...idle, ...holdings];
  const ACTIVITY = [
    {kind:'green', msg:'Route r-9214 settled — ETH → wstETH · Aave Arbitrum · $42,500', t:'2m ago'},
    {kind:'green', msg:'Yield accrued +$184.20 on wstETH · Aave Arbitrum', t:'14m ago'},
    {kind:'amber', msg:'Risk alert: weETH · Pendle moved from band 2 to band 3 (risk 54)', t:'1h ago'},
    {kind:'green', msg:'Route r-9213 settled — USDC · Morpho Base · $18,000', t:'2h ago'},
    {kind:'ink',   msg:'Position rebalanced: wstETH Lido → wstETH Aave (+1.02% APY)', t:'4h ago'},
    {kind:'green', msg:'Yield accrued +$96.44 on USDC · Morpho Blue Base', t:'6h ago'},
    {kind:'amber', msg:'Slippage warning on r-9210: 0.48% vs 0.50% max — route continued', t:'8h ago'},
    {kind:'green', msg:'Route r-9211 settled — wstETH → weETH · Etherfi · $8,200', t:'12h ago'},
    {kind:'ink',   msg:'API key mk_live_••••a2f1 used for quote request', t:'1d ago'},
    {kind:'green', msg:'Route r-9208 settled — USDT · Curve Arbitrum · $14,200', t:'2d ago'},
  ];
  return (
    <>
      <aside className="side">
        <div className="side-group">
          <div className="head">Connected wallets<span className="chev">{ICO.chev_up}</span></div>
          <div className="body">
            {[['0x7c…a2f1','#7b8bff',true],['0x9f…ae21','#4fd1c5',false],['treasury.eth','#fbbf24',false]].map(([l,c,on])=>(
              <div key={l as string} className={`side-item${on?' on':''}`}><span style={{width:9,height:9,borderRadius:3,background:c as string}}/><span>{l as string}</span></div>
            ))}
          </div>
        </div>
        <div className="side-group">
          <div className="head">View<span className="chev">{ICO.chev_up}</span></div>
          <div className="body">
            {[['holdings','Holdings',true],['activity','Activity',false],['apps','dApp connections',false],['approvals','Approvals',false]].map(([k,l])=>(
              <div key={k as string} className={`side-item${tab===k?' on':''}`} onClick={()=>setTab(k as string)}><span>{l as string}</span></div>
            ))}
          </div>
        </div>
      </aside>
      <div className="page">
        <PageHdr eyebrow="Wallet · 0x7c…a2f1" title="Holdings" lede="Every asset Meridian sees across chains, protocols and wallet balances. Filters on the left scope the view."/>
        <div className="identity">
          <div className="avatar"/>
          <div className="info">
            <div className="nm">whale.eth</div>
            <div className="ens mono">0x7c4f1d2a8b9e3a1f5c0d8e9b4a2f1c7d6e4a2f1c</div>
            <div className="meta">
              <div className="m"><div className="l">Total balance</div><div className="v">{fmtUSD(view.totalValue+40880,0)}</div></div>
              <div className="m"><div className="l">Deployed</div><div className="v">{fmtUSD(view.totalDeployed,0)}</div></div>
              <div className="m"><div className="l">Idle</div><div className="v">$40,880</div></div>
              <div className="m"><div className="l">Chains active</div><div className="v">6</div></div>
            </div>
          </div>
          <div className="actions">
            <span className="badge">✓ Self-custody · MetaMask</span>
            <button className="btn-soft">Disconnect</button>
            <button className="btn-ink">{ICO.bolt} Deposit</button>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14}}>
          <Seg tabs={[{k:'holdings',label:'Holdings',count:allRows.length},{k:'activity',label:'Activity'},{k:'apps',label:'dApp connections',count:7},{k:'approvals',label:'Token approvals',count:14}]} value={tab} onChange={setTab}/>
          <span style={{marginLeft:'auto',display:'flex',gap:8}}><button className="btn-soft">{ICO.refresh} Refresh</button><button className="btn-soft">Export</button></span>
        </div>
        {tab==='holdings'&&(
          <div className="panel">
            <table className="tbl ledger">
              <thead><tr><th>Asset</th><th>Where</th><th>Chain</th><th className="r">Balance</th><th className="r">USD value</th><th className="r">P&amp;L</th><th className="r"/></tr></thead>
              <tbody>{allRows.map((r,i)=>{
                const a=ASSETS[r.sym]||{color:'#999'};const pnl=r.value-r.deployed;
                const price=ASSET_PRICES[r.sym]||1;
                const bal=(r.value/price).toFixed(['USDC','USDT','DAI'].includes(r.sym)?0:4);
                return (
                  <tr key={i}>
                    <td><div className="ent"><span className="ico" style={{background:`linear-gradient(135deg,${a.color},color-mix(in oklab,${a.color} 55%,#000))`}}>{r.sym[0]}</span><span className="lab"><span className="nm">{r.sym}</span><span className="sy">{ASSET_NAMES[r.sym]||r.sym}</span></span></div></td>
                    <td style={{color:'var(--ink-2)',fontSize:12.5}}>{r.proto}</td>
                    <td><ChainSwatch chainId={r.chain}/></td>
                    <td className="r">{bal} {r.sym}</td>
                    <td className="r">{fmtUSD(r.value,0)}</td>
                    <td className="r"><span className={pnl>=0?'up':'dn'}>{pnl>=0?'+':''}{fmtUSD(pnl,0)}</span><div style={{fontSize:10.5,color:'var(--ink-4)'}}>{r.delta>=0?'+':''}{r.delta.toFixed(2)}%</div></td>
                    <td className="r"><a className="btn-link">Manage {ICO.arrow}</a></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        {tab==='activity'&&(
          <div className="panel">
            <div className="panel-h"><h3>Recent activity</h3><span className="sub">· this wallet</span></div>
            <div className="feed">
              {ACTIVITY.map((r,i)=>(
                <div key={i} className="feed-row">
                  <span className={`feed-dot ${r.kind}`}/>
                  <div className="feed-msg">{r.msg}</div>
                  <div className="feed-time">{r.t}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab==='apps'&&(
          <div className="row-2">
            {[
              {name:'Aave v3',     url:'app.aave.com',       when:'Connected 18d ago', perms:'Read · Write · Approve'},
              {name:'Morpho Blue', url:'app.morpho.org',     when:'Connected 12d ago', perms:'Read · Write · Approve'},
              {name:'Pendle',      url:'app.pendle.finance',  when:'Connected 9d ago',  perms:'Read · Write'},
              {name:'GMX v2',      url:'app.gmx.io',         when:'Connected 5d ago',  perms:'Read · Write · Approve'},
              {name:'Uniswap v3',  url:'app.uniswap.org',    when:'Connected 32d ago', perms:'Read · Approve'},
              {name:'Stargate',    url:'stargate.finance',   when:'Connected 28d ago', perms:'Read · Approve'},
              {name:'Etherfi',     url:'app.etherfi.io',     when:'Connected 9d ago',  perms:'Read · Write'},
            ].map(a=>(
              <div key={a.name} className="panel" style={{padding:'14px 18px',display:'flex',gap:14,alignItems:'center'}}>
                <div style={{width:38,height:38,borderRadius:9,background:'var(--canvas-2)',border:'1px solid var(--line)',display:'grid',placeItems:'center',font:"600 14px var(--font-mono)",color:'var(--ink)'}}>{a.name[0]}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,color:'var(--ink)'}}>{a.name}</div>
                  <div style={{fontSize:11.5,color:'var(--ink-4)',fontFamily:'var(--font-mono)'}}>{a.url} · {a.when}</div>
                  <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:2}}>{a.perms}</div>
                </div>
                <button className="btn-soft">Revoke</button>
              </div>
            ))}
          </div>
        )}
        {tab==='approvals'&&(
          <div className="panel">
            <div className="panel-h"><h3>Token approvals</h3><span className="sub">· 14 active · last reviewed 9d ago</span><span className="right btn-link">Revoke all {ICO.arrow}</span></div>
            <table className="tbl ledger">
              <thead><tr><th>Asset</th><th>Spender</th><th>Chain</th><th className="r">Allowance</th><th className="r">Last used</th><th className="r"/></tr></thead>
              <tbody>
                {[
                  {sym:'USDC',   spender:'Aave v3',    chain:'arb',  amt:'Unlimited', when:'2h'},
                  {sym:'ETH',    spender:'Uniswap v3', chain:'eth',  amt:'1,000.0',   when:'12h'},
                  {sym:'wstETH', spender:'Pendle',     chain:'eth',  amt:'Unlimited', when:'3d'},
                  {sym:'USDC',   spender:'Morpho',     chain:'base', amt:'500,000',   when:'5d'},
                  {sym:'WBTC',   spender:'GMX v2',     chain:'arb',  amt:'Unlimited', when:'1d'},
                  {sym:'DAI',    spender:'Spark',      chain:'eth',  amt:'250,000',   when:'2d'},
                ].map((r,i)=>{
                  const a=ASSETS[r.sym]||{color:'#999'};
                  return (
                    <tr key={i}>
                      <td><div className="ent"><span className="ico" style={{background:`linear-gradient(135deg,${a.color},#000)`}}>{r.sym[0]}</span><span className="lab"><span className="nm">{r.sym}</span></span></div></td>
                      <td style={{color:'var(--ink-2)',fontSize:12.5}}>{r.spender}</td>
                      <td><ChainSwatch chainId={r.chain}/></td>
                      <td className="r">{r.amt}</td>
                      <td className="r" style={{color:'var(--ink-3)'}}>{r.when}</td>
                      <td className="r"><button className="btn-soft">Revoke</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ── ProfilePage ───────────────────────────────────────────────────────
function ProfilePage() {
  const [toggles, setToggles] = useState({
    autoCompound:true, notifRebalance:true, notifRisk:true, notifPrice:false,
    mfa:true, devices:false, api:false, sessionLimit:true,
  });
  const tog = (k: keyof typeof toggles) => setToggles(p=>({...p,[k]:!p[k]}));
  const T = ({k}: {k: keyof typeof toggles}) => <span className={`toggle${toggles[k]?' on':''}`} onClick={()=>tog(k)}/>;
  return (
    <>
      <aside className="side">
        <div className="side-group">
          <div className="head">Account<span className="chev">{ICO.chev_up}</span></div>
          <div className="body">{['Identity','Preferences','Notifications','Security','API keys','Connected dApps','Billing'].map((l,i)=><div key={l} className={`side-item${i===0?' on':''}`}><span>{l}</span></div>)}</div>
        </div>
      </aside>
      <div className="page">
        <PageHdr eyebrow="Profile" title="Account"
          lede="Identity, preferences, security and integrations for your Meridian session. Nothing here changes on-chain custody — your keys, your funds."/>
        <div className="identity">
          <div className="avatar"/>
          <div className="info">
            <div className="nm">whale.eth</div>
            <div className="ens mono">0x7c4f1d2a8b9e3a1f5c0d8e9b4a2f1c7d6e4a2f1c</div>
            <div className="meta">
              <div className="m"><div className="l">Member since</div><div className="v">Mar 2024</div></div>
              <div className="m"><div className="l">Routes executed</div><div className="v">142</div></div>
              <div className="m"><div className="l">Lifetime saved</div><div className="v" style={{color:'var(--green)'}}>+$8,420</div></div>
              <div className="m"><div className="l">Risk preference</div><div className="v">Moderate</div></div>
            </div>
          </div>
          <div className="actions"><span className="badge">Pro · early access</span><button className="btn-soft">Edit profile</button></div>
        </div>
        <div className="row-2" style={{alignItems:'flex-start'}}>
          <div className="panel">
            <div className="panel-h"><h3>Preferences</h3><span className="sub">· execution defaults</span></div>
            <div className="set-grp">
              <div className="set-row"><div className="l">Auto-compound yield<span className="s">Re-deploy accrued yield on the same strategy every 7 days.</span></div><T k="autoCompound"/></div>
              <div className="set-row"><div className="l">Slippage tolerance<span className="s">Maximum acceptable slippage on any single hop.</span></div><div className="v">0.50%</div></div>
              <div className="set-row"><div className="l">Gas priority<span className="s">Speed vs cost tradeoff for ordering on-chain.</span></div><div className="v">Normal</div></div>
              <div className="set-row"><div className="l">Default risk band<span className="s">Filter strategies above this risk score by default.</span></div><div className="v">≤ 60</div></div>
              <div className="set-row"><div className="l">Preferred chains<span className="s">Routes favor these chains when ties are close.</span></div><div className="v">Arbitrum · Base</div></div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Notifications</h3><span className="sub">· email + push</span></div>
            <div className="set-grp">
              <div className="set-row"><div className="l">Rebalance suggestions<span className="s">Alert when a better-ranked route appears for one of your positions.</span></div><T k="notifRebalance"/></div>
              <div className="set-row"><div className="l">Risk-score changes<span className="s">Alert when a position you hold moves up a risk band.</span></div><T k="notifRisk"/></div>
              <div className="set-row"><div className="l">Price alerts<span className="s">Watchlist assets crossing thresholds.</span></div><T k="notifPrice"/></div>
              <div className="set-row"><div className="l">Weekly digest<span className="s">Summary of routes, yield and risk every Monday.</span></div><div className="v">Enabled</div></div>
            </div>
          </div>
        </div>
        <div className="row-2" style={{marginTop:'var(--gap)',alignItems:'flex-start'}}>
          <div className="panel">
            <div className="panel-h"><h3>Security</h3><span className="sub">· session</span></div>
            <div className="set-grp">
              <div className="set-row"><div className="l">Two-factor authentication<span className="s">Required for sensitive actions (re-route, save preset).</span></div><T k="mfa"/></div>
              <div className="set-row"><div className="l">Trusted devices<span className="s">Skip 2FA on this device for 30 days.</span></div><T k="devices"/></div>
              <div className="set-row"><div className="l">Session timeout<span className="s">Automatically disconnect inactive sessions.</span></div><T k="sessionLimit"/></div>
              <div className="set-row"><div className="l">Recent sessions<span className="s">Active on 2 devices.</span></div><a className="btn-link">View all {ICO.arrow}</a></div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>API & integrations</h3><span className="sub">· developer</span></div>
            <div className="set-grp">
              <div className="set-row"><div className="l">API access<span className="s">Programmatic read & write via REST and Webhooks.</span></div><T k="api"/></div>
              <div className="set-row"><div className="l">Active keys<span className="s">mk_live_••••a2f1 — created 9d ago, last used 2h ago.</span></div><a className="btn-link">Rotate {ICO.refresh}</a></div>
              <div className="set-row"><div className="l">Webhooks<span className="s">Route lifecycle, settlement and risk events.</span></div><a className="btn-link">3 endpoints {ICO.arrow}</a></div>
              <div className="set-row"><div className="l">Telegram bot<span className="s">Mirror alerts to a private channel.</span></div><a className="btn-link">Connect {ICO.arrow}</a></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── HelpPage ──────────────────────────────────────────────────────────
function HelpPage() {
  const [active, setActive] = useState(0);
  const threads = [
    {t:'Why is my route stuck at "Bridge via Stargate"?', s:'Bridges typically settle in 2-12 min…', when:'2m'},
    {t:'Can I cancel an in-flight route?',                s:'Routes that are mid-execution can be paused…', when:'1h'},
    {t:'How are risk scores calculated?',                  s:'A score is the weighted sum of audit coverage, TVL depth…', when:'4h'},
    {t:'Where is my withdrawn DAI?',                      s:'Withdrawals settle to the originating wallet…', when:'1d'},
    {t:'API rate limits',                                  s:'Pro tier: 600 req/min on read, 60 req/min on write…', when:'2d'},
    {t:'Tax export for 2024',                             s:'CSV exports include realized P&L per route…', when:'3d'},
  ];
  return (
    <div className="page" style={{display:'flex',flexDirection:'column',flex:1}}>
      <PageHdr eyebrow="Help · support" title="How can we help?"
        lede="Search the knowledge base, browse common questions, or open a chat with our team — usually <2 minutes during business hours."
        actions={<><button className="btn-soft">{ICO.docs} Docs</button><button className="btn-ink">{ICO.bolt} New thread</button></>}/>
      <div className="help-layout" style={{flex:1}}>
        <div className="help-list">
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--line)',fontSize:11,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-4)',fontWeight:600}}>Recent threads</div>
          {threads.map((it,i)=>(
            <div key={i} className={`it${i===active?' on':''}`} onClick={()=>setActive(i)}>
              <div className="t">{it.t}</div>
              <div className="s">{it.s}</div>
              <div className="when">{it.when}</div>
            </div>
          ))}
        </div>
        <div className="chat-pane">
          <div style={{padding:'14px 22px',borderBottom:'1px solid var(--line)',display:'flex',alignItems:'center',gap:12}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:'var(--ink)'}}>{threads[active].t}</div>
              <div style={{fontSize:11.5,color:'var(--ink-4)'}}>Started 2m ago · Meridian Support online</div>
            </div>
            <span className="pill green" style={{marginLeft:'auto'}}><span className="dot"/>Online</span>
          </div>
          <div className="chat-thread">
            <div className="bubble you"><div className="who">You · 2m</div>My ETH→wstETH route has been on &quot;Bridge via Stargate&quot; for 8 minutes. Is something wrong?</div>
            <div className="bubble bot"><div className="who">Maya · Meridian Support · 1m</div>Hi! I can see route <b className="mono">r-9214</b> on your account. Stargate is currently averaging 4-6 minute settlement on the ETH→ARB lane, but the destination chain processed a large block recently. You should see it settle in the next ~2 min — no action needed.</div>
            <div className="bubble bot"><div className="who">Maya · Meridian Support · 1m</div>I&apos;ll keep this thread open until it settles. If it&apos;s still stuck after 15 minutes, we can manually refund the source funds — Meridian&apos;s smart contract handles it without a wallet signature.</div>
            <div className="bubble you"><div className="who">You · just now</div>Got it, thanks. Are bridge times normally this variable?</div>
            <div className="bubble bot"><div className="who">Maya · Meridian Support · just now</div>For canonical bridges (Stargate, Hop, Across) — yes, 4-12 minutes is normal. The &quot;ETA&quot; shown in your route card is a 7-day average; we&apos;ll be adding p95 figures next week so you can see worst-case at a glance.</div>
          </div>
          <div className="chat-foot">
            <input type="text" placeholder="Reply to Maya…"/>
            <button className="btn-soft">{ICO.bolt}</button>
            <button className="btn-ink">Send {ICO.arrow}</button>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'var(--gap)'}}>
          <div className="kb-card">
            <h3>Popular articles</h3>
            {['How are risk scores calculated?','Cancelling or refunding routes','Understanding bridge ETAs','Exporting for taxes','Connecting a hardware wallet'].map(a=>(
              <div key={a} className="it"><span>{a}</span><span className="arr">{ICO.arrow}</span></div>
            ))}
          </div>
          <div className="kb-card">
            <h3>Status</h3>
            <div className="it"><span style={{width:7,height:7,borderRadius:99,background:'var(--green)',display:'inline-block',marginRight:8}}/>All systems normal</div>
            <div style={{fontSize:11.5,color:'var(--ink-4)',padding:'8px 0 4px'}}>
              Route execution · 99.98% · 24h<br/>
              API · 184ms p50 · 412ms p95<br/>
              Last incident: 12 days ago
            </div>
            <a className="btn-link" style={{marginTop:6}}>Status page {ICO.ext}</a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DocsPage ──────────────────────────────────────────────────────────
type DocSection = { title: string; lede: string; body: Array<{kind:string;text?:string;html?:React.ReactNode}> };
function DocsPage() {
  const [active, setActive] = useState('what');
  const sections: Record<string, DocSection> = {
    what: {
      title:'What is Meridian?',
      lede:"Meridian is a non-custodial cross-chain router. You define a destination, we find the best path across 6 chains and 38 protocols.",
      body:[
        {kind:'h2', text:'The premise'},
        {kind:'p',  text:"Every asset has a destination — a place where it should earn, settle, or rest. Today that decision is fragmented across dozens of dApps, bridges, and chains. You either pick something arbitrary or you stay parked in idle ETH."},
        {kind:'p',  text:"Meridian compares every viable path between your starting asset and your target outcome and presents you with three concrete choices, ranked by APY, fees, time and risk. You sign each hop — Meridian only orchestrates."},
        {kind:'h2', text:'What Meridian does not do'},
        {kind:'callout', html:<><b>Custody.</b> Meridian holds no signing authority over your funds. Every approval, swap, bridge and deposit is signed in your wallet. If our service disappears tomorrow, your assets are exactly where the underlying protocols put them — you can withdraw directly from Aave, Morpho, etc. with no Meridian dependency.</>},
        {kind:'h2', text:'Quick start'},
        {kind:'code', text:`# 1. Connect a wallet (MetaMask, Rabby, Frame, ...)\n# 2. Pick a source asset + destination chain\n# 3. Review the 3 routes Meridian proposes\n# 4. Sign each hop as it presents\n# 5. Monitor execution on /routes`},
      ],
    },
    routes: {
      title:'How routes work',
      lede:'A route is a deterministic sequence of swaps, bridges and deposits. Each route is computed at request time from on-chain state.',
      body:[
        {kind:'h2', text:'Anatomy of a route'},
        {kind:'p',  text:'Every route has 1-6 hops. A hop is one of: swap, bridge, lend, stake, LP-deposit, or settle. Meridian quotes the marginal cost and time of each hop against current mempool state.'},
        {kind:'code', text:`Route #r-9214\n  ETH → USDC      Uniswap v3 · Ethereum     ~12s    $4.20 gas\n  USDC → USDC     Stargate · ETH→Arbitrum   ~6m     $3.10 fee\n  USDC Lend       Aave v3 · Arbitrum        ~14s    $0.80 gas\n  Settle          Destination wallet         —       —\n  ─────────────\n  Total           ~6.5m                              $8.10 + 0.05% slippage`},
        {kind:'h2', text:'Why three?'},
        {kind:'p',  text:"Most route-finders show one \"best\" path. We show three because the right answer depends on what you care about: max APY, lowest fees, lowest risk. The three slots usually correspond to (1) highest APY, (2) cheapest, (3) fewest hops or lowest-risk."},
      ],
    },
    strategies: {
      title:'Strategies vs. routes',
      lede:'Strategies are pre-built route templates. Routes are the concrete on-chain executions you sign.',
      body:[
        {kind:'h2', text:'When to use strategies'},
        {kind:'p',  text:'If you want a recurring pattern — "keep my USDC at the best lending rate across L2s" — save it as a strategy. Meridian re-evaluates daily and surfaces a re-route when the savings exceed the gas cost.'},
        {kind:'h2', text:'Custom vs. featured'},
        {kind:'p',  text:'Featured strategies are curated by Meridian Labs with extra checks (insurance availability, audit recency, oracle health). Custom strategies are anything you build in the Find page and save.'},
      ],
    },
    risk: {
      title:'Risk scoring',
      lede:'A score from 0–100 summarizing audit coverage, TVL depth, oracle exposure and bridge risk. Higher = riskier.',
      body:[
        {kind:'h2', text:'Components'},
        {kind:'p',  text:"Each component contributes between 0 and 25 to the total score. We never combine them into a black-box rating — you can expand any position to see the breakdown."},
        {kind:'code', text:`audit_coverage    0..25   (lower = more audited)\noracle_exposure   0..25   (lower = fewer or harder-to-manipulate oracles)\ntvl_depth         0..25   (lower = deeper, more battle-tested)\nbridge_risk       0..25   (lower = canonical / message-passing bridges)`},
        {kind:'callout', html:<><b>Important.</b> Risk scores are not predictions. They&apos;re a snapshot of structural fragility on the day they&apos;re computed. A score of 18 does not mean &quot;this can&apos;t go to zero.&quot;</>},
      ],
    },
    api: {
      title:'API reference',
      lede:'REST endpoints for everything in the dashboard. Authenticate with a Pro-tier API key.',
      body:[
        {kind:'h2', text:'Authentication'},
        {kind:'code', text:`curl https://api.meridian.xyz/v1/routes \\\n  -H "Authorization: Bearer mk_live_••••a2f1"`},
        {kind:'h2', text:'POST /v1/routes/quote'},
        {kind:'p',  text:'Returns 1-5 candidate routes for a given source/destination/amount.'},
        {kind:'code', text:`{\n  "source": { "asset": "ETH", "chain": "ethereum" },\n  "destination": { "chain": "arbitrum", "wallet": "0x..." },\n  "amount_usd": 25000,\n  "risk_max": 60,\n  "horizon_days": 30\n}`},
        {kind:'h2', text:'POST /v1/routes/{id}/execute'},
        {kind:'p',  text:'Returns a sequence of unsigned transactions to be signed in your wallet.'},
      ],
    },
    faq: {
      title:'FAQ',
      lede:'Quick answers to the things most people ask in the first week.',
      body:[
        {kind:'h2', text:'Is Meridian custodial?'},
        {kind:'p',  text:'No. Meridian never holds your keys or has authority over your funds. Every hop is signed by your wallet.'},
        {kind:'h2', text:'What chains are supported?'},
        {kind:'p',  text:'Ethereum mainnet, Arbitrum, Base, Optimism, Polygon and Solana. We add chains based on protocol coverage rather than chasing every new L2.'},
        {kind:'h2', text:'Can I refund a stuck route?'},
        {kind:'p',  text:"Yes — Meridian's smart contract holds a settler role that can refund source-side funds after 15 minutes of inactivity, with no additional signature required."},
        {kind:'h2', text:'Where is the team based?'},
        {kind:'p',  text:'Distributed — NYC, London, Singapore. We do weekly office hours in our Discord.'},
      ],
    },
  };
  const tocGroups = [
    {gh:'Concepts', items:[{k:'what',label:'What is Meridian?'},{k:'routes',label:'How routes work'},{k:'strategies',label:'Strategies'},{k:'risk',label:'Risk scoring'}]},
    {gh:'Developers', items:[{k:'api',label:'API reference'}]},
    {gh:'More', items:[{k:'faq',label:'FAQ'}]},
  ];
  const s = sections[active];
  return (
    <div className="page" style={{display:'flex',flexDirection:'column',flex:1}}>
      <PageHdr eyebrow="Docs" title="Documentation"
        lede="Concepts, route mechanics, risk scoring and the public API. Last updated May 24, 2026."
        actions={<div className="tb-search" style={{width:240,flex:'none'}}>{ICO.search}<span>Search docs…</span></div>}/>
      <div className="docs-layout" style={{flex:1}}>
        <nav className="docs-toc">
          {tocGroups.map((g,gi)=>(
            <div key={gi} className="grp">
              <div className="gh">{g.gh}</div>
              {g.items.map(it=><a key={it.k} className={active===it.k?'on':''} onClick={()=>setActive(it.k)}>{it.label}</a>)}
            </div>
          ))}
        </nav>
        <article className="docs-content">
          <h1 className="dh">{s.title}</h1>
          <p className="dlede">{s.lede}</p>
          {s.body.map((b,i)=>{
            if (b.kind==='h2') return <h2 key={i} className="dh2">{b.text}</h2>;
            if (b.kind==='p')  return <p  key={i} className="dp">{b.text}</p>;
            if (b.kind==='code') return <pre key={i} className="code">{b.text}</pre>;
            if (b.kind==='callout') return <div key={i} className="callout">{b.html||b.text}</div>;
            return null;
          })}
          <div style={{marginTop:32,padding:'16px 20px',background:'var(--canvas-2)',border:'1px solid var(--line)',borderRadius:10,display:'flex',alignItems:'center',gap:14}}>
            <div style={{flex:1,fontSize:13,color:'var(--ink-2)'}}>
              <b style={{color:'var(--ink)'}}>Was this helpful?</b><br/>
              <span style={{color:'var(--ink-4)',fontSize:12}}>If something here is wrong or unclear, ping us on Discord — we maintain these docs in public.</span>
            </div>
            <button className="btn-soft">Helpful</button>
            <button className="btn-soft">Needs work</button>
            <button className="btn-soft">Open on GitHub {ICO.ext}</button>
          </div>
        </article>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [page, setPage] = useState('home');
  const [persona, setPersona] = useState('whale');
  const [mode, setMode] = useState('light');
  const [drawerRow, setDrawerRow] = useState<any>(null);

  const view = useMemo(() => buildView(persona), [persona]);
  const [liveView, setLiveView] = useState(view);
  useEffect(() => setLiveView(view), [view]);

  // Route simulation
  useEffect(() => {
    const id = setInterval(() => {
      setLiveView(v => ({
        ...v,
        activeRoutes: v.activeRoutes.map(r => ({
          ...r,
          progress: Math.min(100, r.progress + 2 + Math.random() * 3),
          stepIdx: Math.min(r.steps.length - 1, Math.floor((Math.min(100, r.progress + 2) / 100) * r.steps.length)),
        })),
      }));
    }, 1600);
    return () => clearInterval(id);
  }, []);

  // Apply theme to meridian root (isolates from root layout's dark class)
  useEffect(() => {
    const el = document.getElementById('meridian-root');
    if (el) el.dataset.mode = mode;
  }, [mode]);

  const fullBleed = page === 'help' || page === 'docs';

  function renderPage() {
    switch (page) {
      case 'find':    return <FindPage/>;
      case 'routes':  return <RoutesPage view={liveView}/>;
      case 'markets': return <MarketsPage/>;
      case 'trend':   return <TrendPage/>;
      case 'wallet':  return <WalletPage view={liveView}/>;
      case 'profile': return <ProfilePage/>;
      case 'help':    return <HelpPage/>;
      case 'docs':    return <DocsPage/>;
      default:        return <HomePage view={liveView} onSelect={setDrawerRow}/>;
    }
  }

  return (
    <>
      {/* Tweaks bar */}
      <div style={{position:'fixed',bottom:16,right:16,zIndex:80,display:'flex',gap:8,padding:'8px 12px',background:'var(--canvas)',border:'1px solid var(--line)',borderRadius:12,boxShadow:'0 4px 24px rgba(0,0,0,.1)',fontSize:12,alignItems:'center'}}>
        <span style={{color:'var(--ink-4)',marginRight:4}}>Demo:</span>
        <select value={persona} onChange={e=>setPersona(e.target.value)} style={{background:'var(--canvas-2)',border:'1px solid var(--line)',borderRadius:6,padding:'3px 8px',fontSize:12,color:'var(--ink)',fontFamily:'inherit'}}>
          <option value="casual">Casual</option>
          <option value="whale">Whale</option>
          <option value="dao">DAO Treasury</option>
        </select>
        <button onClick={()=>setMode(m=>m==='light'?'dark':'light')} className="btn-soft" style={{padding:'3px 10px',fontSize:11}}>
          {mode==='light'?'🌙 Dark':'☀️ Light'}
        </button>
      </div>

      <div className="shell">
        <Rail active={page} onNav={setPage}/>
        <div className="workspace">
          <Topbar onNav={setPage} page={page}/>
          <CrumbRow page={page} onNav={setPage}/>
          {fullBleed ? (
            renderPage()
          ) : (
            <div style={{display:'flex',flex:1,minHeight:0}}>
              {renderPage()}
            </div>
          )}
          <Footer/>
        </div>
      </div>

      <PositionDrawer row={drawerRow} onClose={()=>setDrawerRow(null)}/>
    </>
  );
}

'use client';

import Link from 'next/link';
import { Panel, PageHead } from '@/src/components/ui';

const PRINCIPLES = [
  { n: '01', t: 'Non-custodial, always', b: 'Meridian never holds your keys or your assets. The software computes a path; your wallet signs each step. There is no Meridian account that can be frozen, drained, or subpoenaed into moving your funds.' },
  { n: '02', t: 'Simulate before you sign', b: 'Every route is forked against live chain state and replayed locally before a single transaction is broadcast. You see the gas, the slippage, and the failure modes first — not after.' },
  { n: '03', t: 'Price the risk, then decide', b: 'Bridges fail. Leverage liquidates. We score every route on a single risk index and refuse to hide it behind a green checkmark. The number is the point.' },
  { n: '04', t: 'Open by default', b: 'The routing core is MIT-licensed. Strategies are publishable and forkable. Nothing about the path you take should be a black box you rent by the month.' },
];

const STATS = [
  { k: 'Total routed', v: '$1.42B', s: 'since launch' },
  { k: 'Protocols', v: '38', s: 'across 10 chains' },
  { k: 'Avg settle', v: '2.6m', s: 'per multi-step route' },
  { k: 'Failed routes', v: '0.4%', s: 'auto-refunded' },
];

const TIMELINE = [
  { y: '2023', t: 'Solver prototype', b: 'A weekend hack to find the cheapest USDC bridge. It beat every aggregator on the board.' },
  { y: '2024', t: 'Public beta', b: 'Multi-step routing across 6 chains. First $100M routed. Marketplace opens to the public.' },
  { y: '2025', t: 'AI route selection', b: 'Risk-adjusted route ranking ships. Composer launches for hand-built strategies.' },
  { y: '2026', t: 'Open core', b: 'Routing engine open-sourced under MIT. Self-hosting documented. You are here.' },
];

export function AboutPage() {
  return (
    <div className="shell" style={{ paddingBottom: 32 }}>
      <PageHead
        eyebrow="About · the thesis"
        title={<span>Capital should move to <em className="serif-it">yield</em>, not to <em className="serif-it">us</em>.</span>}
        desc="Meridian is a routing layer for on-chain yield. We find the cheapest, safest path from what you hold to where it earns — and then we get out of the way."
      />

      {/* MANIFESTO */}
      <div className="grid mt-10" style={{ gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'start' }}>
        <div className="col gap-5">
          <div className="lede" style={{ fontSize: 24, lineHeight: 1.35 }}>
            Most yield never gets earned. It dies in the gap between <em className="serif-it">where the money is</em> and <em className="serif-it">where the rate is</em> — a gap measured in bridges, swaps, gas, and the patience to do all three correctly.
          </div>
          <p className="body" style={{ fontSize: 15, lineHeight: 1.7 }}>
            Meridian closes that gap. You declare an intent — this asset, this risk budget, this destination — and the solver returns a ranked set of executable paths. Each one is simulated against live state, priced to the basis point, and signed by you, step by step.
          </p>
          <p className="body" style={{ fontSize: 15, lineHeight: 1.7 }}>
            We are not a fund. We are not a custodian. We are not a yield aggregator that pools your deposits into a vault we control. We are a compiler: intent in, transactions out, and your keys never leave your hands.
          </p>
        </div>
        <div className="panel">
          <div className="section-head">
            <div className="title" style={{ fontSize: 22 }}>By the numbers</div>
            <span className="caption mono c-ink-3">live</span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {STATS.map((s, i) => (
              <div
                key={i}
                className="p-5"
                style={{
                  borderRight: i % 2 === 0 ? '1px solid color-mix(in oklch, var(--ink) 10%, transparent)' : 'none',
                  borderBottom: i < 2 ? '1px solid color-mix(in oklch, var(--ink) 10%, transparent)' : 'none',
                }}
              >
                <div className="label mb-2">{s.k}</div>
                <div className="num-lg">{s.v}</div>
                <div className="caption muted mt-1">{s.s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PRINCIPLES */}
      <Panel title="Principles" sub="The four rules we don't break" className="mt-10" noPad>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {PRINCIPLES.map((p, i) => (
            <div
              key={p.n}
              className="p-6 col gap-3"
              style={{
                borderRight: i % 2 === 0 ? '1px solid color-mix(in oklch, var(--ink) 10%, transparent)' : 'none',
                borderBottom: i < 2 ? '1px solid color-mix(in oklch, var(--ink) 10%, transparent)' : 'none',
              }}
            >
              <div className="flex items-baseline gap-3">
                <span className="serif-it c-signal" style={{ fontSize: 32, lineHeight: 1 }}>{p.n}</span>
                <span className="serif" style={{ fontSize: 24 }}>{p.t}</span>
              </div>
              <p className="body" style={{ fontSize: 14, lineHeight: 1.65 }}>{p.b}</p>
            </div>
          ))}
        </div>
      </Panel>

      {/* TIMELINE */}
      <Panel title="How we got here" sub="2023 — present" className="mt-5" noPad>
        <div className="divide-y">
          {TIMELINE.map(t => (
            <div key={t.y} className="px-6 py-5 flex gap-6 items-baseline">
              <div className="serif-it" style={{ fontSize: 34, color: 'var(--ink-3)', width: 90, flexShrink: 0 }}>{t.y}</div>
              <div className="col gap-1">
                <div className="serif" style={{ fontSize: 20 }}>{t.t}</div>
                <p className="body" style={{ fontSize: 14, maxWidth: 620 }}>{t.b}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* TEAM / CTA */}
      <div className="grid mt-5" style={{ gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
        <Panel title="Who builds it" noPad>
          <div className="p-6 col gap-4">
            <p className="body" style={{ fontSize: 15, lineHeight: 1.7 }}>
              A small team of protocol engineers and one stubborn solver. We ship in the open, we answer in the repo, and we run our own capital through every route before it reaches you.
            </p>
            <div className="flex gap-3 flex-wrap">
              <a className="btn btn-outline" href="https://github.com/ranmdy" target="_blank" rel="noopener noreferrer">
                Read the source ↗
              </a>
              <Link className="btn btn-ghost" href="/marketplace">Browse strategies →</Link>
            </div>
          </div>
        </Panel>
        <div
          className="panel center col gap-3 p-8"
          style={{ background: 'color-mix(in oklch, var(--signal) 5%, var(--card))' }}
        >
          <div className="serif" style={{ fontSize: 26, textAlign: 'center', lineHeight: 1.1 }}>
            Route your first <em className="serif-it">strategy</em>.
          </div>
          <div className="caption muted text-center">No deposit. No account. Connect a wallet and quote.</div>
          <Link className="btn btn-signal btn-lg mt-2" href="/">Open the router →</Link>
        </div>
      </div>
    </div>
  );
}

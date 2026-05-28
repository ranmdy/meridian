'use client';

import { Panel, PageHead } from '@/src/components/ui';

const BLOCKED = [
  'Cuba', 'Iran', 'North Korea', 'Syria', 'Russia',
  'Crimea region', 'Donetsk', 'Luhansk',
  'Belarus (state entities)', 'Myanmar (specific entities)',
];

export function BlockedPage() {
  return (
    <div className="shell-narrow" style={{ paddingBottom: 48 }}>
      <PageHead
        eyebrow="Restricted jurisdictions"
        title={<span>Where Meridian is <em className="serif-it">not</em> available.</span>}
        desc="To comply with US OFAC sanctions and equivalent regimes, Meridian's services are unavailable from the following jurisdictions. Connecting from these regions is detected at the routing layer."
      />

      <div className="panel mt-8 p-8 col gap-5 items-center text-center">
        <div
          style={{
            width: 64, height: 64,
            border: '2px solid var(--bad)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--bad)',
            fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 36,
          }}
        >
          !
        </div>
        <div className="serif" style={{ fontSize: 32, lineHeight: 1.05 }}>Access from your region is blocked.</div>
        <div className="body" style={{ maxWidth: 480 }}>
          Our routing layer detected an inbound connection from a restricted jurisdiction. The full block list is published below.
        </div>
      </div>

      <Panel title="Current block list" sub="Last reviewed 22 Apr 2026" className="mt-5" noPad>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {BLOCKED.map((b, i) => (
            <div
              key={b}
              className="px-5 py-3"
              style={{
                borderBottom: i < BLOCKED.length - (BLOCKED.length % 2 === 0 ? 2 : 1)
                  ? '1px solid color-mix(in oklch, var(--ink) 10%, transparent)'
                  : 'none',
                borderRight: i % 2 === 0
                  ? '1px solid color-mix(in oklch, var(--ink) 10%, transparent)'
                  : 'none',
              }}
            >
              <div className="flex items-center gap-3">
                <span className="mono c-ink-3" style={{ fontSize: 11, width: 28 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 14 }}>{b}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="What you can do" className="mt-5">
        <ul className="col gap-3" style={{ padding: 0, margin: 0, listStyle: 'none' }}>
          <li className="flex gap-3">
            <span className="mono c-ink-3">01</span>
            <span>If you believe you&apos;re seeing this in error, contact <a className="arr" href="mailto:compliance@meridian.dev">compliance@meridian.dev</a> with a screenshot.</span>
          </li>
          <li className="flex gap-3">
            <span className="mono c-ink-3">02</span>
            <span>Read-only documentation and the open marketplace remain available without restriction.</span>
          </li>
          <li className="flex gap-3">
            <span className="mono c-ink-3">03</span>
            <span>Self-hosting the protocol contracts is permitted under our MIT-licensed core. See the repo for instructions.</span>
          </li>
        </ul>
      </Panel>

      <div className="caption muted text-center mt-6">
        Compliance contact · <a className="arr" href="mailto:compliance@meridian.dev">compliance@meridian.dev</a> · Policy ref MR-COMP-04
      </div>
    </div>
  );
}

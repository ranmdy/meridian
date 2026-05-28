'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHead, Field } from '@/src/components/ui';

export function TermsPage() {
  const [accepted, setAccepted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [residence, setResidence] = useState('');
  const [scope, setScope] = useState({ self: true, agent: false });

  const ok = accepted && scrolled && residence && (scope.self || scope.agent);

  return (
    <div className="shell-narrow" style={{ paddingBottom: 48 }}>
      <PageHead
        eyebrow="Required · before first execution"
        title={<span>Terms of <em className="serif-it">access</em>.</span>}
        desc="Meridian is non-custodial software. You sign every transaction with your own wallet. We don't take possession of your assets and we don't promise any yield. Read what that means before you proceed."
      />

      <div className="panel mt-8">
        <div className="section-head">
          <div className="title" style={{ fontSize: 22 }}>The terms</div>
          <span className="caption mono c-ink-3">v 2.4 · effective 14 May 2026</span>
        </div>
        <div
          className="p-6"
          style={{ maxHeight: 360, overflowY: 'auto', fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)' }}
          onScroll={e => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolled(true);
          }}
        >
          <p><strong className="c-ink">01 · Non-custodial software.</strong> Meridian provides routing software. Meridian does not take possession of your private keys or your assets. Transactions are signed by you, in your wallet. We can not pause, reverse, or insure them.</p>
          <p><strong className="c-ink">02 · No guarantee of yield.</strong> Displayed APYs are estimates derived from on-chain state at the time of quotation. Yield is variable and can become zero or negative.</p>
          <p><strong className="c-ink">03 · Third-party protocols.</strong> Routes interact with smart contracts operated by third parties. Their failure is not our liability. We provide simulations, but simulations are not a substitute for protocol audit reports.</p>
          <p><strong className="c-ink">04 · Bridge risk.</strong> Cross-chain steps depend on bridge solvency. Bridges have failed historically. Use the risk index to size exposure.</p>
          <p><strong className="c-ink">05 · MEV.</strong> Public-mempool swaps are subject to MEV. We route through private RPCs by default for swaps over $10,000; you can opt out per execution.</p>
          <p><strong className="c-ink">06 · Geographic restrictions.</strong> Residents of OFAC-sanctioned jurisdictions are prohibited. See <Link href="/blocked" className="arr">Restrictions</Link> for the current list.</p>
          <p><strong className="c-ink">07 · Taxes.</strong> Each step may be a taxable event in your jurisdiction. Export reports to your accountant.</p>
          <p><strong className="c-ink">08 · Logging.</strong> Public on-chain data tied to your wallet address is indexed for performance dashboards. We do not store private keys. We do not store seed phrases. We can&apos;t, because we never receive them.</p>
          <p><strong className="c-ink">09 · Termination.</strong> You can stop using Meridian at any time. Your funds remain in your wallet. Your published strategies remain readable by anyone who has the URL until you delete them.</p>
          <p><strong className="c-ink">10 · Arbitration.</strong> Disputes are arbitrated under JAMS rules in San Francisco. You retain the right to opt out within 30 days of first execution by email.</p>
          <p className="caption mt-4">Scroll to the bottom to enable the acceptance toggle.</p>
        </div>
        <div className="hairline-t p-5 col gap-4">
          <Field label="Country of residence">
            <select className="select" value={residence} onChange={e => setResidence(e.target.value)}>
              <option value="">Select…</option>
              <option>United States</option>
              <option>United Kingdom</option>
              <option>Germany</option>
              <option>France</option>
              <option>Singapore</option>
              <option>Japan</option>
              <option>Brazil</option>
              <option>Australia</option>
            </select>
          </Field>
          <div>
            <div className="label mb-2">I am acting on behalf of</div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { id: 'self' as const,  l: 'Myself', s: 'Individual user' },
                { id: 'agent' as const, l: 'An entity', s: 'Authorised agent' },
              ].map(o => (
                <button
                  key={o.id}
                  className="card-flat p-4 text-left"
                  onClick={() => setScope({ ...scope, [o.id]: !scope[o.id] })}
                  style={{
                    borderColor: scope[o.id] ? 'var(--ink)' : undefined,
                    borderWidth: scope[o.id] ? 2 : 1,
                  }}
                >
                  <div className="flex between items-center gap-2">
                    <span style={{ fontWeight: 500 }}>{o.l}</span>
                    <span className="mono c-ink-3" style={{ fontSize: 13 }}>{scope[o.id] ? '✓' : ''}</span>
                  </div>
                  <div className="caption muted">{o.s}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <button
              className={'toggle ' + (accepted ? 'on' : '')}
              onClick={() => scrolled && setAccepted(!accepted)}
              disabled={!scrolled}
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <div className="col gap-1">
              <span style={{ fontSize: 14 }}>I have read and accept the terms above.</span>
              {!scrolled && <span className="caption mono c-ink-3">Scroll the document to enable.</span>}
            </div>
          </div>
        </div>
        <div className="hairline-t p-5 between">
          <Link href="/" className="btn btn-ghost">← Back</Link>
          <Link
            href="/"
            className={'btn btn-signal btn-lg' + (ok ? '' : ' btn-disabled')}
            style={{ pointerEvents: ok ? 'auto' : 'none', opacity: ok ? 1 : 0.4 }}
          >
            Accept & continue →
          </Link>
        </div>
      </div>

      <div className="caption muted text-center mt-6">
        Full legal text at <a className="arr" href="#">legal.meridian.dev/terms ↗</a> · This page is a summary checkpoint.
      </div>
    </div>
  );
}

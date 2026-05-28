import Link from 'next/link';

export function Footer() {
  return (
    <footer
      className="shell"
      style={{
        paddingTop: 48,
        paddingBottom: 36,
        marginTop: 56,
        borderTop: '1px solid color-mix(in oklch, var(--ink) 12%, transparent)',
      }}
    >
      <div className="between flex-wrap gap-4">
        <div className="col gap-2">
          <div className="flex items-center gap-2">
            <span className="nav-brand-mark">M</span>
            <span className="serif" style={{ fontSize: 18 }}>Meridian</span>
            <span className="caption mono c-ink-3" style={{ marginLeft: 8 }}>v2.4 · build 7a3c91</span>
          </div>
          <div className="caption muted" style={{ maxWidth: 460 }}>
            Non-custodial. Funds never leave your wallet to Meridian. You sign every step.
          </div>
        </div>
        <div className="flex gap-6">
          <Link className="caption" href="/about">About</Link>
          <Link className="caption" href="/terms">Terms</Link>
          <Link className="caption" href="/blocked">Restrictions</Link>
          <a className="caption" href="#">Docs ↗</a>
          <a className="caption" href="#">Status ↗</a>
        </div>
      </div>
      <div
        className="between flex-wrap gap-3"
        style={{
          marginTop: 28,
          paddingTop: 20,
          borderTop: '1px solid color-mix(in oklch, var(--ink) 10%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="caption mono c-ink-3">Built by</span>
          <span className="serif-it" style={{ fontSize: 18, color: 'var(--ink)' }}>ranmdy</span>
        </div>
        <div className="flex gap-5">
          <a
            className="caption arr mono"
            href="https://x.com/ranmdy_"
            target="_blank"
            rel="noopener noreferrer"
          >
            X · @ranmdy_
          </a>
          <a
            className="caption arr mono"
            href="https://github.com/ranmdy"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub · ranmdy
          </a>
        </div>
      </div>
    </footer>
  );
}

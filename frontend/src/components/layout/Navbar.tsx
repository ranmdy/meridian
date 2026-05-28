'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useTheme } from '@/src/hooks/useTheme';
import { useSignIn } from '@/src/hooks/useSignIn';
import { useAuthStore } from '@/src/stores/auth';

const NAV_LINKS = [
  { href: '/',            label: 'Routes' },
  { href: '/composer',    label: 'Composer' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/portfolio',   label: 'Portfolio' },
  { href: '/billing',     label: 'Billing' },
  { href: '/settings',    label: 'API' },
  { href: '/about',       label: 'About' },
];

const CONNECTOR_META: Record<string, { label: string; glyph: string }> = {
  injected:       { label: 'MetaMask',       glyph: '🦊' },
  metaMask:       { label: 'MetaMask',       glyph: '🦊' },
  walletConnect:  { label: 'WalletConnect',  glyph: '◈' },
  coinbaseWallet: { label: 'Coinbase Wallet',glyph: '◎' },
};

function fmtAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

// ── Connect Wallet Modal ─────────────────────────────────────────────────────
function ConnectModal({ onClose }: { onClose: () => void }) {
  const { connect, connectors, isPending } = useConnect();
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className="modal-back"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="p-6 col gap-4">
          <div className="between">
            <div className="col gap-1">
              <div className="eyebrow">Connect a wallet</div>
              <div className="serif" style={{ fontSize: 22 }}>
                Sign in to <em className="serif-it">Meridian</em>.
              </div>
            </div>
            <button className="btn btn-ghost btn-sm mono" onClick={onClose}>×</button>
          </div>

          <p className="body" style={{ fontSize: 13 }}>
            Connecting signs a message (SIWE — Sign-In With Ethereum). No gas. No transaction. Your keys never leave your wallet.
          </p>

          <div className="col gap-2">
            {connectors.map((connector) => {
              const meta = CONNECTOR_META[connector.id] ?? { label: connector.name, glyph: '◆' };
              return (
                <button
                  key={connector.uid}
                  className="card-flat p-4 text-left"
                  style={{ cursor: 'pointer', width: '100%' }}
                  disabled={isPending}
                  onClick={() => connect({ connector })}
                >
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 22, width: 28, textAlign: 'center' as const }}>
                      {meta.glyph}
                    </span>
                    <div className="col gap-1 flex-1">
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{meta.label}</span>
                      <span className="caption mono c-ink-3" style={{ fontSize: 11 }}>{connector.id}</span>
                    </div>
                    {isPending && <span className="spinner" />}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="caption muted text-center" style={{ fontSize: 11 }}>
            Non-custodial · Meridian never sees your private keys
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Wallet dropdown (shown when connected) ───────────────────────────────────
function WalletDropdown({
  address,
  chainName,
  signInState,
  onSignIn,
  onDisconnect,
  onClose,
}: {
  address: string;
  chainName?: string;
  signInState: string;
  onSignIn: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const isSigning =
    signInState === 'fetching_nonce' ||
    signInState === 'awaiting_signature' ||
    signInState === 'verifying';

  const signingLabel: Record<string, string> = {
    fetching_nonce:     'Fetching nonce…',
    awaiting_signature: 'Check your wallet…',
    verifying:          'Verifying…',
  };

  return (
    <div
      ref={ref}
      className="card"
      style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 260, zIndex: 50 }}
    >
      <div className="p-4 col gap-1 hairline-b">
        <div className="label">Wallet</div>
        <div className="mono" style={{ fontSize: 13, wordBreak: 'break-all' }}>{address}</div>
        {chainName && <div className="caption mono c-ink-3">{chainName}</div>}
      </div>

      <div className="p-4 col gap-2">
        {signInState === 'success' ? (
          <div className="flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--ok)', display: 'inline-block' }} />
            <span className="caption" style={{ color: 'var(--ok)' }}>Authenticated</span>
          </div>
        ) : isSigning ? (
          <div className="flex items-center gap-2">
            <span className="spinner" />
            <span className="caption">{signingLabel[signInState] ?? 'Signing…'}</span>
          </div>
        ) : (
          <button className="btn btn-signal btn-sm btn-block" onClick={onSignIn}>
            Sign message to authenticate
          </button>
        )}

        <button
          className="btn btn-ghost btn-sm btn-block"
          style={{ color: 'var(--bad)', marginTop: 4 }}
          onClick={onDisconnect}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

// ── Main Navbar ──────────────────────────────────────────────────────────────
export function Navbar() {
  const pathname = usePathname();
  const [theme, toggleTheme] = useTheme();
  const [showModal, setShowModal]     = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const { address, isConnected, chain } = useAccount();
  const { disconnect }                  = useDisconnect();
  const { signIn, signOut, state: signInState, error: signInError } = useSignIn();
  const { isAuthenticated } = useAuthStore();

  // Auto-trigger SIWE once wallet connects
  useEffect(() => {
    if (isConnected && address && !isAuthenticated()) {
      setShowModal(false);
      signIn(address);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  // Close modal on connect
  useEffect(() => {
    if (isConnected) setShowModal(false);
  }, [isConnected]);

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  function handleDisconnect() {
    setShowDropdown(false);
    signOut();
    disconnect();
  }

  const isSigning =
    signInState === 'fetching_nonce' ||
    signInState === 'awaiting_signature' ||
    signInState === 'verifying';

  const authenticated = isAuthenticated();

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          {/* Brand */}
          <Link href="/" className="nav-brand" style={{ textDecoration: 'none' }}>
            <span className="nav-brand-mark">M</span>
            <span>Meridian</span>
          </Link>

          {/* Nav links */}
          <nav className="nav-links">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={'nav-link' + (isActive(href) ? ' active' : '')}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="nav-right">
            {/* Theme toggle */}
            <button
              className="btn btn-ghost btn-sm mono"
              onClick={toggleTheme}
              title="Toggle theme"
            >
              {theme === 'dark' ? '☼' : '☾'} {theme === 'dark' ? 'Light' : 'Dark'}
            </button>

            {/* Auth error indicator */}
            {signInError && (
              <span
                className="caption mono"
                style={{ fontSize: 11, color: 'var(--bad)', cursor: 'pointer' }}
                title={signInError}
                onClick={() => address && signIn(address)}
              >
                ✕ retry
              </span>
            )}

            {!isConnected ? (
              /* Not connected — show Sign in */
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowModal(true)}
              >
                Sign in
              </button>
            ) : (
              <>
                {/* Chain badge */}
                {chain && (
                  <span className="btn btn-outline btn-sm mono" style={{ cursor: 'default', pointerEvents: 'none' }}>
                    {chain.name}
                  </span>
                )}

                {/* Address / signing state button */}
                <div style={{ position: 'relative' }}>
                  <button
                    className="btn btn-outline btn-sm mono"
                    style={authenticated ? { borderColor: 'var(--ok)', color: 'var(--ok)' } : {}}
                    onClick={() => setShowDropdown((v) => !v)}
                  >
                    {isSigning ? (
                      <><span className="spinner spinner-sm" style={{ marginRight: 6 }} />Signing…</>
                    ) : (
                      <>
                        {authenticated && (
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--ok)', display: 'inline-block', marginRight: 6 }} />
                        )}
                        {address ? fmtAddr(address) : '—'}
                      </>
                    )}
                  </button>

                  {showDropdown && address && (
                    <WalletDropdown
                      address={address}
                      chainName={chain?.name}
                      signInState={signInState}
                      onSignIn={() => signIn(address)}
                      onDisconnect={handleDisconnect}
                      onClose={() => setShowDropdown(false)}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {showModal && <ConnectModal onClose={() => setShowModal(false)} />}
    </>
  );
}

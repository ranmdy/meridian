'use client';

import { useAccount } from 'wagmi';
import { useAuthStore } from '@/src/stores/auth';
import { useSignIn } from '@/src/hooks/useSignIn';

const STATE_LABELS: Record<string, string> = {
  idle:               'Sign in',
  fetching_nonce:     'Preparing…',
  awaiting_signature: 'Sign in wallet…',
  verifying:          'Verifying…',
  success:            'Signed in',
  error:              'Retry',
};

export function SignInButton() {
  const { address, isConnected } = useAccount();
  const { wallet, isAuthenticated } = useAuthStore();
  const { signIn, signOut, state, error } = useSignIn();

  if (!isConnected || !address) return null;

  const authed = isAuthenticated();

  if (authed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-green-400 font-mono truncate max-w-[120px]" title={wallet ?? ''}>
          ✓ {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'signed in'}
        </span>
        <button
          onClick={() => void signOut()}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  const isBusy = state === 'fetching_nonce' || state === 'awaiting_signature' || state === 'verifying';

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => void signIn(address)}
        disabled={isBusy}
        className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 border border-gray-700 transition-colors"
      >
        {isBusy && (
          <span className="inline-block w-2.5 h-2.5 border border-gray-400 border-t-transparent rounded-full animate-spin mr-1" />
        )}
        {STATE_LABELS[state] ?? 'Sign in'}
      </button>
      {error && (
        <span className="text-xs text-red-400 max-w-[160px] text-right">{error}</span>
      )}
    </div>
  );
}

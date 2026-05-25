'use client';

import { useState, useCallback } from 'react';
import { useSignMessage } from 'wagmi';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/stores/auth';

type SignInState = 'idle' | 'fetching_nonce' | 'awaiting_signature' | 'verifying' | 'success' | 'error';

interface UseSignInResult {
  signIn: (wallet: string) => Promise<void>;
  signOut: () => Promise<void>;
  state: SignInState;
  error: string | null;
}

export function useSignIn(): UseSignInResult {
  const { signMessageAsync } = useSignMessage();
  const { setSession, clearSession } = useAuthStore();
  const [state, setState] = useState<SignInState>('idle');
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async (wallet: string) => {
    setState('fetching_nonce');
    setError(null);

    try {
      const { nonce, message } = await api.auth.nonce(wallet);

      setState('awaiting_signature');
      const signature = await signMessageAsync({ message });

      setState('verifying');
      const result = await api.auth.verify(nonce, signature, wallet);

      setSession(result.token, result.wallet, result.expiresAt);
      setState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setState('error');
    }
  }, [signMessageAsync, setSession]);

  const signOut = useCallback(async () => {
    await api.auth.logout().catch(() => {});
    clearSession();
    setState('idle');
    setError(null);
  }, [clearSession]);

  return { signIn, signOut, state, error };
}

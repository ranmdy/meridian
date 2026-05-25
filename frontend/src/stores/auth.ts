import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  wallet: string | null;
  expiresAt: number | null;

  setSession: (token: string, wallet: string, expiresAt: number) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      wallet: null,
      expiresAt: null,

      setSession: (token, wallet, expiresAt) => set({ token, wallet, expiresAt }),
      clearSession: () => set({ token: null, wallet: null, expiresAt: null }),
      isAuthenticated: () => {
        const { token, expiresAt } = get();
        if (!token || !expiresAt) return false;
        return expiresAt > Math.floor(Date.now() / 1000);
      },
    }),
    {
      name: 'meridian-auth',
      partialize: (s) => ({
        token: s.token,
        wallet: s.wallet,
        expiresAt: s.expiresAt,
      }),
    },
  ),
);

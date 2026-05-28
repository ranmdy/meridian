import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/src/lib/api';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  wallet: string | null;
  expiresAt: number | null;
  refreshExpiresAt: number | null;

  setSession: (
    token: string,
    wallet: string,
    expiresAt: number,
    refreshToken?: string,
    refreshExpiresAt?: number,
  ) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
  /**
   * Exchange the stored refresh token for a new access + refresh token pair.
   * Returns true if successful, false if the refresh token is expired/invalid.
   * Call this when an API request returns 401 with a valid refresh token still stored.
   */
  refreshSession: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      wallet: null,
      expiresAt: null,
      refreshExpiresAt: null,

      setSession: (token, wallet, expiresAt, refreshToken, refreshExpiresAt) =>
        set({ token, wallet, expiresAt, refreshToken: refreshToken ?? null, refreshExpiresAt: refreshExpiresAt ?? null }),

      clearSession: () =>
        set({ token: null, refreshToken: null, wallet: null, expiresAt: null, refreshExpiresAt: null }),

      isAuthenticated: () => {
        const { token, expiresAt } = get();
        if (!token || !expiresAt) return false;
        return expiresAt > Math.floor(Date.now() / 1000);
      },

      refreshSession: async () => {
        const { refreshToken, refreshExpiresAt, clearSession, setSession } = get();

        // Refresh token expired or missing
        if (!refreshToken || !refreshExpiresAt) return false;
        if (refreshExpiresAt <= Math.floor(Date.now() / 1000)) {
          clearSession();
          return false;
        }

        try {
          // Send refresh token in body (cookie is also sent automatically by browser)
          const result = await api.auth.refresh(refreshToken);
          setSession(
            result.token,
            result.wallet,
            result.expiresAt,
            undefined, // new refresh token is in HttpOnly cookie only
            result.refreshExpiresAt,
          );
          return true;
        } catch {
          clearSession();
          return false;
        }
      },
    }),
    {
      name: 'meridian-auth',
      partialize: (s) => ({
        token: s.token,
        refreshToken: s.refreshToken,
        wallet: s.wallet,
        expiresAt: s.expiresAt,
        refreshExpiresAt: s.refreshExpiresAt,
      }),
    },
  ),
);

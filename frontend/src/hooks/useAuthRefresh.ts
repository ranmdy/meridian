'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/src/stores/auth';

/**
 * Automatically refreshes the access token when it's within 5 minutes of expiry.
 * Mount this once at the app root (Providers or layout) to keep sessions alive.
 *
 * The hook polls every 60 seconds and triggers a silent refresh when:
 *   - The user is authenticated
 *   - The access token will expire within 5 minutes
 *   - A valid refresh token is stored (refreshExpiresAt is in the future)
 */
const REFRESH_BUFFER_SECS = 5 * 60; // refresh when < 5 min remain on access token
const CHECK_INTERVAL_MS = 60_000;    // check every minute

export function useAuthRefresh() {
  const { isAuthenticated, expiresAt, refreshSession } = useAuthStore();
  const refreshingRef = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (refreshingRef.current) return;
      if (!isAuthenticated()) return;
      if (!expiresAt) return;

      const secondsRemaining = expiresAt - Math.floor(Date.now() / 1000);
      if (secondsRemaining > REFRESH_BUFFER_SECS) return;

      refreshingRef.current = true;
      try {
        await refreshSession();
      } finally {
        refreshingRef.current = false;
      }
    };

    // Check immediately on mount in case the token is already near expiry
    void check();

    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isAuthenticated, expiresAt, refreshSession]);
}

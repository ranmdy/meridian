'use client';

import dynamic from 'next/dynamic';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '@/src/lib/wagmi';
import { useAuthRefresh } from '@/src/hooks/useAuthRefresh';

// SolanaProvider accesses indexedDB at init — must be client-only
const SolanaProvider = dynamic(
  () => import('@/src/components/solana/SolanaProvider').then((m) => m.SolanaProvider),
  { ssr: false }
);

const queryClient = new QueryClient();

function AuthRefreshMount() {
  useAuthRefresh();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SolanaProvider>
          <AuthRefreshMount />
          {children}
        </SolanaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

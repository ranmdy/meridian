'use client';

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '@/src/lib/wagmi';
import { SolanaProvider } from '@/src/components/solana/SolanaProvider';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SolanaProvider>
          {children}
        </SolanaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

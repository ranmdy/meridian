'use client';

/**
 * SolanaProvider
 *
 * Wraps the app with the Solana wallet adapter context.
 * Supports Phantom, Solflare, and Backpack wallets.
 *
 * Usage: wrap in layout.tsx alongside WagmiProvider for EVM wallets.
 * The two wallet contexts are independent — users can connect both.
 */

import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

const SOLANA_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl('mainnet-beta');

interface SolanaProviderProps {
  children: React.ReactNode;
}

export function SolanaProvider({ children }: SolanaProviderProps) {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    [],
  );

  return (
    <ConnectionProvider endpoint={SOLANA_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

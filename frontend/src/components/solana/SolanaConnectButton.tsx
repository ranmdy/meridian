'use client';

/**
 * SolanaConnectButton
 *
 * Shows a "Connect Solana" button or the connected wallet address.
 * Sits alongside the EVM ConnectButton in the Navbar.
 */

import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback } from 'react';

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function SolanaConnectButton() {
  const { connected, connecting, publicKey, connect, disconnect, wallet, wallets, select } =
    useWallet();

  const handleConnect = useCallback(async () => {
    // Auto-select Phantom if available, otherwise first available wallet
    if (!wallet) {
      const preferred = wallets.find((w) =>
        w.adapter.name.toLowerCase().includes('phantom'),
      ) ?? wallets[0];
      if (preferred) select(preferred.adapter.name);
      return;
    }
    try {
      await connect();
    } catch {
      // User rejected — silently ignore
    }
  }, [wallet, wallets, select, connect]);

  if (connected && publicKey) {
    return (
      <button
        onClick={() => void disconnect()}
        className="flex items-center gap-2 text-xs bg-purple-900/40 hover:bg-purple-900/60 border border-purple-700 rounded-lg px-3 py-1.5 text-purple-300 transition-colors"
        title={publicKey.toBase58()}
      >
        <span className="w-2 h-2 rounded-full bg-purple-400" />
        {shortenAddress(publicKey.toBase58())}
      </button>
    );
  }

  return (
    <button
      onClick={() => void handleConnect()}
      disabled={connecting}
      className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300 transition-colors disabled:opacity-50"
    >
      {connecting ? 'Connecting…' : '◎ Solana'}
    </button>
  );
}

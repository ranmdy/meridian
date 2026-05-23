'use client';

import { useAccount, useConnect, useDisconnect, useEnsName } from 'wagmi';

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });

  if (isConnected && address) {
    const display = ensName ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
    return (
      <div className="flex items-center gap-2">
        {chain && (
          <span className="hidden sm:block text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-full">
            {chain.name}
          </span>
        )}
        <button
          onClick={() => disconnect()}
          className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 px-4 py-2 rounded-lg transition-colors font-mono"
        >
          {display}
        </button>
      </div>
    );
  }

  // Show injected wallet first, then WalletConnect
  const injected = connectors.find((c) => c.id === 'injected');
  const walletConnect = connectors.find((c) => c.id === 'walletConnect');
  const primary = injected ?? walletConnect ?? connectors[0];

  return (
    <button
      onClick={() => primary && connect({ connector: primary })}
      disabled={isPending}
      className="text-sm bg-meridian-600 hover:bg-meridian-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors font-medium"
    >
      {isPending ? 'Connecting…' : 'Connect Wallet'}
    </button>
  );
}

'use client';

import { ConnectButton } from '@/src/components/wallet/ConnectButton';

export function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-meridian-400 font-mono font-bold text-xl tracking-tight">
            ◈ Meridian
          </span>
          <span className="hidden sm:block text-gray-500 text-sm ml-2">
            Cross-Chain DeFi Router
          </span>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="/marketplace"
            className="hidden sm:block text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Marketplace
          </a>
          <a
            href="/portfolio"
            className="hidden sm:block text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Portfolio
          </a>
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}

'use client';

/**
 * useSolanaPortfolio
 *
 * Reads SOL native balance + USDC (SPL) balance for a connected Solana wallet.
 * Uses @solana/web3.js directly — no additional dependencies.
 *
 * Returns a PortfolioAsset[] compatible with the EVM usePortfolio shape.
 */

import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { PortfolioAsset } from './usePortfolio';

// USDC SPL token mint on Solana mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Fallback prices used when no live price map is provided
const FALLBACK_PRICES_USD: Record<string, number> = {
  SOL: 160,
  USDC: 1,
};

const SOLANA_CHAIN_ID = 101; // Phantom/Solana chain identifier convention

export interface SolanaPortfolioData {
  assets: PortfolioAsset[];
  totalValueUsd: number;
  isLoading: boolean;
  error: string | null;
}

export function useSolanaPortfolio(livePrices?: Record<string, number>): SolanaPortfolioData {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [data, setData] = useState<SolanaPortfolioData>({
    assets: [],
    totalValueUsd: 0,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!connected || !publicKey) {
      setData({ assets: [], totalValueUsd: 0, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setData((d) => ({ ...d, isLoading: true, error: null }));

    async function fetchBalances() {
      if (!publicKey) return;

      try {
        // SOL native balance
        const lamports = await connection.getBalance(publicKey);
        const solBalance = lamports / LAMPORTS_PER_SOL;

        // USDC SPL token balance
        let usdcBalance = 0;
        try {
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
            mint: USDC_MINT,
          });
          const usdcAccount = tokenAccounts.value[0];
          if (usdcAccount) {
            const info = usdcAccount.account.data.parsed?.info?.tokenAmount;
            usdcBalance = info?.uiAmount ?? 0;
          }
        } catch {
          // No USDC account — that's fine
        }

        if (cancelled) return;

        const assets: PortfolioAsset[] = [];

        if (solBalance > 0) {
          const priceMap = livePrices ?? FALLBACK_PRICES_USD;
          const price = priceMap['SOL'] ?? FALLBACK_PRICES_USD['SOL'] ?? 0;
          assets.push({
            chainId:    SOLANA_CHAIN_ID,
            chainName:  'Solana',
            symbol:     'SOL',
            balance:    solBalance.toFixed(4),
            balanceRaw: BigInt(lamports),
            isNative:   true,
            valueUsd:   solBalance * price,
          });
        }

        if (usdcBalance > 0) {
          assets.push({
            chainId:    SOLANA_CHAIN_ID,
            chainName:  'Solana',
            symbol:     'USDC',
            balance:    usdcBalance.toFixed(2),
            balanceRaw: BigInt(Math.round(usdcBalance * 1_000_000)),
            isNative:   false,
            valueUsd:   usdcBalance,
          });
        }

        const totalValueUsd = assets.reduce((s, a) => s + a.valueUsd, 0);

        setData({ assets, totalValueUsd, isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setData((d) => ({
          ...d,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch Solana balances',
        }));
      }
    }

    void fetchBalances();

    return () => { cancelled = true; };
  }, [connected, publicKey, connection]);

  return data;
}

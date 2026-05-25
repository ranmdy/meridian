'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { mainnet, arbitrum, base, polygon, bsc, optimism, avalanche, scroll, zkSync } from 'viem/chains';
import type { Address } from 'viem';

// ERC-20 balanceOf ABI fragment
const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const _ERC20_DECIMALS_ABI = [
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

export interface ChainAsset {
  chainId: number;
  chainName: string;
  symbol: string;
  balance: string;          // human-readable (e.g. "1.234")
  balanceRaw: bigint;
  isNative: boolean;
}

// Token addresses per chain (zero address = native)
const TOKENS: Array<{
  symbol: string;
  isNative: boolean;
  decimals: number;
  addresses: Partial<Record<number, Address>>;
}> = [
  {
    symbol: 'ETH',
    isNative: true,
    decimals: 18,
    addresses: { 1: '0x0000000000000000000000000000000000000000' as Address },
  },
  {
    symbol: 'USDC',
    isNative: false,
    decimals: 6,
    addresses: {
      1:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
      8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
      137:   '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as Address,
      56:    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' as Address,
      10:    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as Address,  // Optimism
      43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' as Address,  // Avalanche
      534352: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4' as Address, // Scroll
      324:   '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4' as Address,  // zkSync Era
    },
  },
  {
    symbol: 'USDT',
    isNative: false,
    decimals: 6,
    addresses: {
      1:     '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
      42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address,
      137:   '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as Address,
      56:    '0x55d398326f99059fF775485246999027B3197955' as Address,
    },
  },
  {
    symbol: 'WBTC',
    isNative: false,
    decimals: 8,
    addresses: {
      1:     '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as Address,
      42161: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as Address,
    },
  },
];

const CHAINS = [
  { id: 1,     name: 'Ethereum', chain: mainnet   },
  { id: 42161, name: 'Arbitrum', chain: arbitrum  },
  { id: 8453,  name: 'Base',     chain: base      },
  { id: 137,   name: 'Polygon',  chain: polygon   },
  { id: 56,    name: 'BNB',      chain: bsc       },
  { id: 10,     name: 'Optimism', chain: optimism  },
  { id: 43114,  name: 'Avalanche',chain: avalanche },
  { id: 534352, name: 'Scroll',   chain: scroll    },
  { id: 324,    name: 'zkSync',   chain: zkSync    },
];

// Default price fallbacks — overridden by usePriceFeed when available
const DEFAULT_PRICES_USD: Record<string, number> = {
  ETH:  3000,
  USDC: 1,
  USDT: 1,
  WBTC: 60000,
  SOL:  140,
};

export interface PortfolioAsset extends ChainAsset {
  valueUsd: number;
}

export interface PortfolioData {
  assets: PortfolioAsset[];
  totalValueUsd: number;
  isLoading: boolean;
  error: string | null;
}

export function usePortfolio(address: Address | undefined, livePrices?: Record<string, number>): PortfolioData {
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setAssets([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function fetchBalances() {
      const results: PortfolioAsset[] = [];

      await Promise.allSettled(
        CHAINS.map(async ({ id, name, chain }) => {
          const client = createPublicClient({ chain, transport: http() });

          await Promise.allSettled(
            TOKENS.map(async (token) => {
              const tokenAddress = token.addresses[id];
              if (!tokenAddress) return;

              try {
                let balanceRaw: bigint;

                if (token.isNative) {
                  balanceRaw = await client.getBalance({ address: address! });
                } else {
                  balanceRaw = await client.readContract({
                    address: tokenAddress,
                    abi: ERC20_BALANCE_ABI,
                    functionName: 'balanceOf',
                    args: [address!],
                  });
                }

                if (balanceRaw === 0n) return;

                const balance = formatUnits(balanceRaw, token.decimals);
                const priceMap = livePrices ?? DEFAULT_PRICES_USD;
                const price = priceMap[token.symbol] ?? DEFAULT_PRICES_USD[token.symbol] ?? 0;
                const valueUsd = parseFloat(balance) * price;

                results.push({
                  chainId: id,
                  chainName: name,
                  symbol: token.symbol,
                  balance,
                  balanceRaw,
                  isNative: token.isNative,
                  valueUsd,
                });
              } catch {
                // Silently skip failed balance reads
              }
            }),
          );
        }),
      );

      if (!cancelled) {
        setAssets(results.sort((a, b) => b.valueUsd - a.valueUsd));
        setIsLoading(false);
      }
    }

    void fetchBalances().catch((err: Error) => {
      if (!cancelled) {
        setError(err.message);
        setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [address]);

  const totalValueUsd = assets.reduce((s, a) => s + a.valueUsd, 0);

  return { assets, totalValueUsd, isLoading, error };
}

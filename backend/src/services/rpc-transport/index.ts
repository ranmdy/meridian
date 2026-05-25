/**
 * RPC Transport Factory — Alchemy primary + QuickNode fallback
 *
 * Builds a viem `fallback()` transport for each chain.  When the primary
 * (Alchemy) endpoint fails, viem automatically retries the call on the
 * secondary (QuickNode) endpoint.
 *
 * Usage:
 *   import { rpcTransport } from './rpc-transport/index.js';
 *   const client = createPublicClient({ chain: mainnet, transport: rpcTransport(config.chains.ethereum) });
 *
 * Env vars (per chain):
 *   ETH_RPC_URL            — primary Alchemy endpoint (http or wss)
 *   ETH_RPC_URL_FALLBACK   — secondary QuickNode endpoint
 *   (same pattern for BASE, ARB, BNB, POLY, OPT, AVAX, SCROLL, ZKSYNC)
 *
 * Graceful degradation:
 *   - If only the primary is set  → uses primary only (no fallback)
 *   - If neither is set           → returns undefined (caller skips chain)
 *   - If both are set             → wraps in viem fallback() transport
 */

import { http, webSocket, fallback, type Transport } from 'viem';

export interface ChainRpcConfig {
  rpcUrl: string;
  fallbackRpcUrl: string;
}

/**
 * Returns a viem `Transport` for the given chain config:
 *   - WS transport is used when the URL starts with `ws://` or `wss://`
 *   - HTTP transport otherwise
 *   - Returns undefined when no URL is configured (caller should skip the chain)
 */
export function rpcTransport(cfg: ChainRpcConfig): Transport | undefined {
  const primary  = cfg.rpcUrl.trim();
  const secondary = cfg.fallbackRpcUrl.trim();

  if (!primary && !secondary) return undefined;

  const makeTransport = (url: string): Transport =>
    url.startsWith('ws://') || url.startsWith('wss://')
      ? webSocket(url)
      : http(url);

  if (primary && secondary) {
    return fallback(
      [makeTransport(primary), makeTransport(secondary)],
      { rank: false },   // prefer primary always; only fall back on error
    );
  }

  return makeTransport(primary || secondary);
}

/**
 * Build a map of { chainId → Transport } for all configured chains.
 * Chains with no RPC URL configured are omitted.
 */
export function buildTransportMap(
  chains: Record<string, ChainRpcConfig & { id: number }>,
): Map<number, Transport> {
  const map = new Map<number, Transport>();
  for (const cfg of Object.values(chains)) {
    const t = rpcTransport(cfg);
    if (t) map.set(cfg.id, t);
  }
  return map;
}

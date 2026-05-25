/**
 * Nonce Manager
 *
 * Prevents nonce collision when the relayer submits concurrent transactions
 * on the same chain from the same address.
 *
 * Design:
 *   - Tracks per-(chainId, address) nonces in memory.
 *   - Uses promise chaining as a mutex so concurrent callers queue up.
 *   - Fetches the pending nonce from the chain on first use.
 *   - Increments atomically after each successful submission.
 *   - Resets from chain if a "nonce too low/high" error occurs.
 *
 * Usage:
 *   const hash = await nonceManager.withNonce(publicClient, chainId, address, async (nonce) => {
 *     return walletClient.writeContract({ ...request, nonce });
 *   });
 */

import type { PublicClient, Address } from 'viem';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NonceState {
  nonce: number;
}

// ─── Error detection ──────────────────────────────────────────────────────────

const NONCE_ERROR_PATTERNS = [
  'nonce too low',
  'nonce too high',
  'replacement transaction underpriced',
  'already known',
  'invalid nonce',
];

function isNonceError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return NONCE_ERROR_PATTERNS.some((p) => msg.includes(p));
}

// ─── NonceManager ─────────────────────────────────────────────────────────────

class NonceManager {
  // Nonce state per chain/address
  private state = new Map<string, NonceState>();

  // Mutex chain per chain/address — each call chains onto the previous promise
  private mutexes = new Map<string, Promise<void>>();

  private key(chainId: number, address: Address): string {
    return `${chainId}:${address.toLowerCase()}`;
  }

  /**
   * Execute fn() with exclusive access to the nonce for (chainId, address).
   *
   * fn() is called with the correct nonce and must return the tx hash.
   * NonceManager increments the counter after fn() resolves.
   * If fn() throws a nonce-related error, the state is cleared so the next
   * call re-fetches from the chain.
   *
   * All concurrent callers for the same (chainId, address) are serialized —
   * they queue up and execute one at a time in arrival order.
   */
  async withNonce<T>(
    client: PublicClient,
    chainId: number,
    address: Address,
    fn: (nonce: number) => Promise<T>,
  ): Promise<T> {
    const k = this.key(chainId, address);

    // Chain onto any pending mutex for this key so callers are serialized
    const prev = this.mutexes.get(k) ?? Promise.resolve();

    let resolveMutex!: () => void;
    const current = new Promise<void>((r) => { resolveMutex = r; });
    this.mutexes.set(k, current);

    // Wait for the previous operation to finish before proceeding
    await prev;

    try {
      // Resolve nonce: use cached or fetch from chain
      let nonce: number;
      const cached = this.state.get(k);
      if (cached !== undefined) {
        nonce = cached.nonce;
      } else {
        // Fetch pending transaction count (includes unconfirmed txs in mempool)
        nonce = await client.getTransactionCount({ address, blockTag: 'pending' });
        console.log(`[NonceManager] Fetched nonce from chain chain=${chainId} addr=${address} nonce=${nonce}`);
      }

      // Execute the tx with this nonce
      const result = await fn(nonce);

      // Success — advance nonce for next caller
      this.state.set(k, { nonce: nonce + 1 });
      return result;
    } catch (err) {
      // On nonce mismatch errors, invalidate cached nonce so next caller re-fetches
      if (isNonceError(err)) {
        console.warn(
          `[NonceManager] Nonce error on chain=${chainId} addr=${address} — clearing cache. ${
            (err as Error).message
          }`,
        );
        this.state.delete(k);
      }
      throw err;
    } finally {
      // Always release the mutex so the next queued caller can proceed
      resolveMutex();
    }
  }

  /**
   * Manually reset the nonce for a (chainId, address) pair.
   * Use after a hard restart or when you suspect the local state is stale.
   */
  reset(chainId: number, address: Address): void {
    this.state.delete(this.key(chainId, address));
  }

  /**
   * Force-set the nonce (e.g. after fetching it externally).
   */
  set(chainId: number, address: Address, nonce: number): void {
    this.state.set(this.key(chainId, address), { nonce });
  }

  /**
   * Peek at the current cached nonce (undefined if not yet initialized).
   */
  peek(chainId: number, address: Address): number | undefined {
    return this.state.get(this.key(chainId, address))?.nonce;
  }

  /**
   * Submit a speed-up (replacement) transaction with higher gas.
   * Uses the same nonce as the stuck tx to replace it in the mempool.
   */
  async withSameNonce<T>(
    chainId: number,
    address: Address,
    stuckNonce: number,
    fn: (nonce: number) => Promise<T>,
  ): Promise<T> {
    const k = this.key(chainId, address);

    const prev = this.mutexes.get(k) ?? Promise.resolve();
    let resolveMutex!: () => void;
    const current = new Promise<void>((r) => { resolveMutex = r; });
    this.mutexes.set(k, current);

    await prev;

    try {
      const result = await fn(stuckNonce);
      // After replacement, the next nonce is stuckNonce + 1
      this.state.set(k, { nonce: stuckNonce + 1 });
      return result;
    } finally {
      resolveMutex();
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

export const nonceManager = new NonceManager();

// Re-export the type for use in tests
export type { NonceManager };

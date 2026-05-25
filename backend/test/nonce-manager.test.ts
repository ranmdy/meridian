import { describe, it, expect, vi, beforeEach } from 'vitest';

// Re-import fresh module per test group to get an un-cached singleton
const makeManager = async () => {
  vi.resetModules();
  const mod = await import('../src/services/nonce-manager/index.js');
  return new mod.NonceManager as InstanceType<typeof mod.NonceManager>;
};

// Minimal PublicClient mock
function makeClient(startNonce: number) {
  return {
    getTransactionCount: vi.fn().mockResolvedValue(startNonce),
  };
}

describe('NonceManager', () => {
  it('fetches nonce from chain on first use', async () => {
    vi.resetModules();
    const { nonceManager } = await import('../src/services/nonce-manager/index.js');
    const client = makeClient(7);

    const results: number[] = [];
    await nonceManager.withNonce(client as never, 1, '0xAaAA' as never, async (n) => {
      results.push(n);
      return '0xhash';
    });

    expect(client.getTransactionCount).toHaveBeenCalledWith({ address: '0xAaAA', blockTag: 'pending' });
    expect(results[0]).toBe(7);
  });

  it('increments nonce without hitting the chain on the second call', async () => {
    vi.resetModules();
    const { nonceManager } = await import('../src/services/nonce-manager/index.js');
    const client = makeClient(3);

    const nonces: number[] = [];
    await nonceManager.withNonce(client as never, 1, '0xBbBB' as never, async (n) => { nonces.push(n); return 'h1'; });
    await nonceManager.withNonce(client as never, 1, '0xBbBB' as never, async (n) => { nonces.push(n); return 'h2'; });

    expect(client.getTransactionCount).toHaveBeenCalledTimes(1); // only fetched once
    expect(nonces).toEqual([3, 4]);
  });

  it('serializes concurrent callers — no nonce collisions', async () => {
    vi.resetModules();
    const { nonceManager } = await import('../src/services/nonce-manager/index.js');
    const client = makeClient(10);

    const nonces: number[] = [];
    // Launch 5 concurrent calls
    await Promise.all(
      Array.from({ length: 5 }, () =>
        nonceManager.withNonce(client as never, 1, '0xCcCc' as never, async (n) => {
          nonces.push(n);
          return 'hash';
        }),
      ),
    );

    // All 5 should have unique sequential nonces
    nonces.sort((a, b) => a - b);
    expect(nonces).toEqual([10, 11, 12, 13, 14]);
  });

  it('resets nonce on "nonce too low" error', async () => {
    vi.resetModules();
    const { nonceManager } = await import('../src/services/nonce-manager/index.js');
    const client = makeClient(5);

    // First call sets cached nonce to 6
    await nonceManager.withNonce(client as never, 1, '0xDdDd' as never, async () => 'ok');

    // Simulate a nonce-too-low failure (nonce=6 is wrong, chain says 10)
    client.getTransactionCount.mockResolvedValue(10);
    await expect(
      nonceManager.withNonce(client as never, 1, '0xDdDd' as never, async () => {
        throw new Error('nonce too low');
      }),
    ).rejects.toThrow('nonce too low');

    // Next call should re-fetch from chain (returns 10)
    const nonces: number[] = [];
    await nonceManager.withNonce(client as never, 1, '0xDdDd' as never, async (n) => {
      nonces.push(n);
      return 'ok';
    });
    expect(nonces[0]).toBe(10);
    expect(client.getTransactionCount).toHaveBeenCalledTimes(2); // initial + post-error re-fetch
  });

  it('peek() returns undefined before first use', async () => {
    vi.resetModules();
    const { nonceManager } = await import('../src/services/nonce-manager/index.js');
    expect(nonceManager.peek(99, '0xEeEe' as never)).toBeUndefined();
  });

  it('set() pre-seeds the nonce', async () => {
    vi.resetModules();
    const { nonceManager } = await import('../src/services/nonce-manager/index.js');
    const client = makeClient(999); // should not be called

    nonceManager.set(1, '0xFfFf' as never, 42);
    const nonces: number[] = [];
    await nonceManager.withNonce(client as never, 1, '0xFfFf' as never, async (n) => {
      nonces.push(n);
      return 'h';
    });

    expect(nonces[0]).toBe(42);
    expect(client.getTransactionCount).not.toHaveBeenCalled();
  });

  it('reset() forces a chain re-fetch', async () => {
    vi.resetModules();
    const { nonceManager } = await import('../src/services/nonce-manager/index.js');
    const client = makeClient(1);

    await nonceManager.withNonce(client as never, 1, '0x1111' as never, async () => 'ok');
    client.getTransactionCount.mockResolvedValue(20);
    nonceManager.reset(1, '0x1111' as never);

    const nonces: number[] = [];
    await nonceManager.withNonce(client as never, 1, '0x1111' as never, async (n) => {
      nonces.push(n);
      return 'ok';
    });
    expect(nonces[0]).toBe(20);
  });

  it('different (chain, address) pairs are independent', async () => {
    vi.resetModules();
    const { nonceManager } = await import('../src/services/nonce-manager/index.js');
    const clientA = makeClient(5);
    const clientB = makeClient(100);

    const nA: number[] = [], nB: number[] = [];

    await Promise.all([
      nonceManager.withNonce(clientA as never, 1,  '0xAAAA' as never, async (n) => { nA.push(n); return 'h'; }),
      nonceManager.withNonce(clientB as never, 42, '0xAAAA' as never, async (n) => { nB.push(n); return 'h'; }),
    ]);

    expect(nA[0]).toBe(5);
    expect(nB[0]).toBe(100);
  });
});

import { describe, it, expect } from 'vitest';
import { rpcTransport, buildTransportMap } from '../src/services/rpc-transport/index.js';

describe('rpcTransport', () => {
  it('returns undefined when neither primary nor fallback is set', () => {
    expect(rpcTransport({ rpcUrl: '', fallbackRpcUrl: '' })).toBeUndefined();
  });

  it('returns a transport when only primary is set (http)', () => {
    const t = rpcTransport({ rpcUrl: 'https://eth.alchemy.io/v2/key', fallbackRpcUrl: '' });
    expect(t).toBeDefined();
    expect(typeof t).toBe('function');
  });

  it('returns a transport when only fallback is set', () => {
    const t = rpcTransport({ rpcUrl: '', fallbackRpcUrl: 'https://eth.quicknode.io' });
    expect(t).toBeDefined();
  });

  it('returns a fallback transport when both are set', () => {
    const t = rpcTransport({
      rpcUrl: 'https://eth.alchemy.io/v2/key',
      fallbackRpcUrl: 'https://eth.quicknode.io',
    });
    expect(t).toBeDefined();
    expect(typeof t).toBe('function');
  });

  it('accepts wss:// primary URL without throwing', () => {
    expect(() =>
      rpcTransport({ rpcUrl: 'wss://eth-mainnet.g.alchemy.com/v2/key', fallbackRpcUrl: '' }),
    ).not.toThrow();
  });

  it('trims whitespace from URLs', () => {
    const t = rpcTransport({ rpcUrl: '  https://eth.alchemy.io  ', fallbackRpcUrl: '  ' });
    expect(t).toBeDefined();
  });
});

describe('buildTransportMap', () => {
  it('omits chains with no RPC URL', () => {
    const map = buildTransportMap({
      eth: { id: 1, rpcUrl: '', fallbackRpcUrl: '' },
    });
    expect(map.size).toBe(0);
  });

  it('includes chains with at least one URL', () => {
    const map = buildTransportMap({
      eth:  { id: 1,     rpcUrl: 'https://eth.alchemy.io',  fallbackRpcUrl: '' },
      arb:  { id: 42161, rpcUrl: '',                        fallbackRpcUrl: 'https://arb.quicknode.io' },
      base: { id: 8453,  rpcUrl: '',                        fallbackRpcUrl: '' },
    });
    expect(map.size).toBe(2);
    expect(map.has(1)).toBe(true);
    expect(map.has(42161)).toBe(true);
    expect(map.has(8453)).toBe(false);
  });

  it('keys map by numeric chain id', () => {
    const map = buildTransportMap({
      eth: { id: 1, rpcUrl: 'https://eth.alchemy.io', fallbackRpcUrl: '' },
    });
    expect(map.get(1)).toBeDefined();
    expect(typeof map.get(1)).toBe('function');
  });
});

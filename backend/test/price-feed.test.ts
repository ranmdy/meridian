import { describe, it, expect } from 'vitest';
import { PriceFeedService } from '../src/services/price-feed/index.js';

describe('PriceFeedService', () => {
  it('pre-seeds stablecoins at $1 on construction', () => {
    const svc = new PriceFeedService();
    const usdc = svc.getPrice('USDC');
    const usdt = svc.getPrice('USDT');
    expect(usdc?.priceUsd).toBe(1.0);
    expect(usdt?.priceUsd).toBe(1.0);
  });

  it('getPrice is case-insensitive', () => {
    const svc = new PriceFeedService();
    expect(svc.getPrice('usdc')).not.toBeNull();
    expect(svc.getPrice('USDC')).not.toBeNull();
  });

  it('returns null for unknown symbol', () => {
    const svc = new PriceFeedService();
    expect(svc.getPrice('NOTAREAL')).toBeNull();
  });

  it('getAllPrices includes all pre-seeded stablecoins', () => {
    const svc = new PriceFeedService();
    const symbols = svc.getAllPrices().map((p) => p.symbol);
    expect(symbols).toContain('USDC');
    expect(symbols).toContain('USDT');
  });

  it('stablecoin source is stale (no live fetch yet)', () => {
    const svc = new PriceFeedService();
    expect(svc.getPrice('USDC')?.source).toBe('stale');
  });

  it('registers onRefresh callback', () => {
    const svc = new PriceFeedService();
    let fired = false;
    svc.onRefresh(() => { fired = true; });
    // Manually trigger through private emitter
    (svc as unknown as { emitter: { emit: (e: string, d: unknown) => void } })
      .emitter.emit('refresh', []);
    expect(fired).toBe(true);
  });

  it('stop() after start() does not throw', () => {
    const svc = new PriceFeedService({ refreshIntervalMs: 1_000_000 });
    svc.start();
    expect(() => svc.stop()).not.toThrow();
  });

  it('singleton priceFeed export exists', async () => {
    const { priceFeed } = await import('../src/services/price-feed/index.js');
    expect(priceFeed).toBeDefined();
    expect(typeof priceFeed.getPrice).toBe('function');
    expect(typeof priceFeed.getAllPrices).toBe('function');
    expect(typeof priceFeed.start).toBe('function');
    expect(typeof priceFeed.stop).toBe('function');
  });
});

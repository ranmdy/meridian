import { describe, it, expect, vi } from 'vitest';
import { BridgeListenerService, type BridgeFillEvent } from '../src/services/bridge-listener/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFill(overrides: Partial<BridgeFillEvent> = {}): BridgeFillEvent {
  return {
    bridge:       'across',
    chainId:      42161,
    originChainId: 1,
    depositId:    1n,
    recipient:    '0x1234567890123456789012345678901234567890',
    outputToken:  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    outputAmount: 1000_000n,
    blockNumber:  100n,
    txHash:       '0xabc',
    timestamp:    Date.now(),
    ...overrides,
  };
}

// ─── BridgeListenerService ─────────────────────────────────────────────────────

describe('BridgeListenerService', () => {
  it('emits fill events to registered callbacks', () => {
    const svc = new BridgeListenerService();
    const received: BridgeFillEvent[] = [];
    svc.onFill((e) => received.push(e));

    // Reach into the private emitter and emit manually
    (svc as unknown as { emitter: { emit: (e: string, d: BridgeFillEvent) => void } })
      .emitter.emit('fill', makeFill());

    expect(received).toHaveLength(1);
    expect(received[0]!.bridge).toBe('across');
  });

  it('supports multiple callbacks', () => {
    const svc = new BridgeListenerService();
    const calls: number[] = [];
    svc.onFill(() => calls.push(1));
    svc.onFill(() => calls.push(2));

    (svc as unknown as { emitter: { emit: (e: string, d: BridgeFillEvent) => void } })
      .emitter.emit('fill', makeFill());

    expect(calls).toEqual([1, 2]);
  });

  it('offFill stops delivery to that callback', () => {
    const svc = new BridgeListenerService();
    const calls: number[] = [];
    const cb: (e: BridgeFillEvent) => void = () => calls.push(1);
    svc.onFill(cb);
    svc.offFill(cb);

    (svc as unknown as { emitter: { emit: (e: string, d: BridgeFillEvent) => void } })
      .emitter.emit('fill', makeFill());

    expect(calls).toHaveLength(0);
  });

  it('stop() clears unwatchers array', async () => {
    const svc = new BridgeListenerService();
    // Inject a mock unwatcher
    const unwatchMock = vi.fn();
    (svc as unknown as { unwatchers: (() => void)[] }).unwatchers.push(unwatchMock);
    svc.stop();
    expect(unwatchMock).toHaveBeenCalledOnce();
    expect((svc as unknown as { unwatchers: (() => void)[] }).unwatchers).toHaveLength(0);
  });

  it('fill event carries all expected fields for Across', () => {
    const fill = makeFill({
      bridge: 'across',
      depositId: 42n,
      originChainId: 1,
    });
    expect(fill.depositId).toBe(42n);
    expect(fill.originChainId).toBe(1);
  });

  it('fill event carries guid for Stargate', () => {
    const fill = makeFill({
      bridge: 'stargate',
      guid: '0xdeadbeef00000000000000000000000000000000000000000000000000000000',
    });
    expect(fill.guid).toMatch(/^0x/);
  });

  it('singleton export exists', async () => {
    const { bridgeListener } = await import('../src/services/bridge-listener/index.js');
    expect(bridgeListener).toBeDefined();
    expect(typeof bridgeListener.onFill).toBe('function');
    expect(typeof bridgeListener.stop).toBe('function');
  });
});

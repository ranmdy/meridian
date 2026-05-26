import { describe, it, expect, beforeEach, vi } from 'vitest';
import { anomaly } from '../src/services/metrics/index.js';

describe('anomaly detector', () => {
  beforeEach(() => {
    anomaly.reset();
    vi.useFakeTimers();
  });

  it('stats shows zero samples initially', () => {
    const s = anomaly.stats();
    expect(s.samples).toBe(0);
    expect(s.failureRate).toBe(0);
  });

  it('records successes and failures', () => {
    anomaly.record('success');
    anomaly.record('success');
    anomaly.record('failure');
    const s = anomaly.stats();
    expect(s.samples).toBe(3);
    expect(s.failureRate).toBeCloseTo(1 / 3);
  });

  it('does not fire alert below threshold (< 50%)', () => {
    const cb = vi.fn();
    anomaly.onAlert(cb);
    // 4 success, 1 failure = 20% failure rate — below 50% threshold
    for (let i = 0; i < 4; i++) anomaly.record('success');
    anomaly.record('failure');
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not fire alert before reaching min samples (< 5)', () => {
    const cb = vi.fn();
    anomaly.onAlert(cb);
    // 4 failures — all fail but only 4 samples, below min 5
    for (let i = 0; i < 4; i++) anomaly.record('failure');
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires alert when failure rate >= 50% with >= 5 samples', () => {
    const cb = vi.fn();
    anomaly.onAlert(cb);
    // 5 failures = 100% failure rate
    for (let i = 0; i < 5; i++) anomaly.record('failure');
    expect(cb).toHaveBeenCalledOnce();
    const [rate, samples] = cb.mock.calls[0]!;
    expect(rate).toBeGreaterThanOrEqual(0.5);
    expect(samples).toBeGreaterThanOrEqual(5);
  });

  it('fires alert at exactly 50% failure rate with 10 samples', () => {
    const cb = vi.fn();
    anomaly.onAlert(cb);
    for (let i = 0; i < 5; i++) anomaly.record('success');
    for (let i = 0; i < 5; i++) anomaly.record('failure');
    expect(cb).toHaveBeenCalledOnce();
  });

  it('respects cooldown — does not fire second alert within 10 minutes', () => {
    const cb = vi.fn();
    anomaly.onAlert(cb);
    // Trigger first alert
    for (let i = 0; i < 5; i++) anomaly.record('failure');
    expect(cb).toHaveBeenCalledTimes(1);

    // Record more failures immediately (within cooldown)
    for (let i = 0; i < 5; i++) anomaly.record('failure');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires second alert after cooldown expires', () => {
    const cb = vi.fn();
    anomaly.onAlert(cb);

    // First spike
    for (let i = 0; i < 5; i++) anomaly.record('failure');
    expect(cb).toHaveBeenCalledTimes(1);

    // Advance past 10-minute cooldown
    vi.advanceTimersByTime(11 * 60 * 1000);

    // Second spike
    for (let i = 0; i < 5; i++) anomaly.record('failure');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('evicts entries older than 5-minute window', () => {
    // Record 5 failures
    for (let i = 0; i < 5; i++) anomaly.record('failure');
    expect(anomaly.stats().samples).toBe(5);

    // Advance past the 5-minute window
    vi.advanceTimersByTime(6 * 60 * 1000);

    // Record one success — old entries should be evicted
    anomaly.record('success');
    const s = anomaly.stats();
    expect(s.samples).toBe(1);
    expect(s.failureRate).toBe(0);
  });

  it('multiple callbacks all fire on alert', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    anomaly.onAlert(cb1);
    anomaly.onAlert(cb2);
    for (let i = 0; i < 5; i++) anomaly.record('failure');
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });
});

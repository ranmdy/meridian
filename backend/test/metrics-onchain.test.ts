/**
 * Tests for the onchain metrics namespace (subgraph polling → Datadog gauges).
 * We mock fetch so no real HTTP calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onchain } from '../src/services/metrics/index.js';

// ── fetch mock ──────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeResponse(stats: Record<string, string> | null, ok = true) {
  return {
    ok,
    json: async () => ({
      data: stats ? { globalStats: stats } : null,
    }),
  } as unknown as Response;
}

const SAMPLE_STATS = {
  totalStrategies: '1000',
  activeStrategies: '5',
  completedStrategies: '980',
  failedStrategies: '10',
  exitedStrategies: '5',
  totalVolume: '1000000000000',
  totalFinalAmount: '950000000000',
  uniqueUsers: '420',
  totalSteps: '4200',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('onchain metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onchain.stop();
  });

  afterEach(() => {
    onchain.stop();
  });

  it('push() succeeds and does not throw with valid response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(SAMPLE_STATS));
    await expect(onchain.push('https://api.thegraph.com/subgraphs/name/meridian')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('push() sends a POST request to the subgraph URL', async () => {
    const url = 'https://api.thegraph.com/subgraphs/name/meridian';
    mockFetch.mockResolvedValueOnce(makeResponse(SAMPLE_STATS));
    await onchain.push(url);
    const [calledUrl, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(url);
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({ 'Content-Type': 'application/json' });
    const body = JSON.parse(options.body as string) as { query: string };
    expect(body.query).toContain('globalStats');
  });

  it('push() is silent on network error (never throws)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
    await expect(onchain.push('https://api.thegraph.com/subgraphs/name/meridian')).resolves.toBeUndefined();
  });

  it('push() is silent on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(null, false));
    await expect(onchain.push('https://api.thegraph.com/subgraphs/name/meridian')).resolves.toBeUndefined();
  });

  it('push() is silent when globalStats is null', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(null));
    await expect(onchain.push('https://api.thegraph.com/subgraphs/name/meridian')).resolves.toBeUndefined();
  });

  it('push() is silent on malformed JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    } as unknown as Response);
    await expect(onchain.push('https://api.thegraph.com/subgraphs/name/meridian')).resolves.toBeUndefined();
  });

  it('start() does not call fetch when subgraphUrl is empty string', () => {
    onchain.start('', 60_000);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('start() calls push immediately when URL is provided', async () => {
    mockFetch.mockResolvedValue(makeResponse(SAMPLE_STATS));
    onchain.start('https://api.thegraph.com/subgraphs/name/meridian', 60_000);
    // The first push is async fire-and-forget — yield event loop
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('stop() prevents further polling after start()', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(makeResponse(SAMPLE_STATS));
    onchain.start('https://api.thegraph.com/subgraphs/name/meridian', 1_000);
    onchain.stop();
    vi.advanceTimersByTime(5_000);
    // fetch called at most once (the initial push before stop)
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(1);
    vi.useRealTimers();
  });
});

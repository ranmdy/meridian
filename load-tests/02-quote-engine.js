/**
 * Load test: Quote Engine — 100 concurrent requests, p95 < 500ms
 *
 * Exercises the three quote endpoints in parallel:
 *   GET /quotes/bridge  — Li.Fi aggregated bridge quotes (cached)
 *   GET /quotes/swap    — 1inch / Paraswap / 0x swap quotes (cached)
 *   GET /quotes/apy     — DeFiLlama / Compound / Morpho APY (cached)
 *
 * Redis-cached quotes should return in <50ms. The 500ms budget covers
 * a cache miss forcing a live fetch from upstream APIs.
 *
 * Run:
 *   BASE_URL=http://localhost:4000 k6 run load-tests/02-quote-engine.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

const bridgeLat = new Trend('bridge_quote_latency', true);
const swapLat   = new Trend('swap_quote_latency',   true);
const apyLat    = new Trend('apy_quote_latency',    true);
const errRate   = new Rate('quote_error_rate');

export const options = {
  stages: [
    { duration: '20s', target: 50  },
    { duration: '40s', target: 100 },
    { duration: '40s', target: 100 },
    { duration: '20s', target: 0   },
  ],
  thresholds: {
    bridge_quote_latency: ['p(95)<500'],
    swap_quote_latency:   ['p(95)<500'],
    apy_quote_latency:    ['p(95)<500'],
    quote_error_rate:     ['rate<0.02'],
  },
};

// Representative pairs across chains
const BRIDGE_SCENARIOS = [
  'from=1&to=42161&asset=USDC&amount=1000',
  'from=1&to=8453&asset=USDC&amount=5000',
  'from=42161&to=137&asset=USDC&amount=2500',
  'from=8453&to=1&asset=ETH&amount=1',
];

const SWAP_SCENARIOS = [
  'chain=1&from=ETH&to=USDC',
  'chain=42161&from=ETH&to=USDC',
  'chain=8453&from=ETH&to=USDC',
];

const APY_SCENARIOS = [
  'protocol=aave&asset=USDC&chain=1',
  'protocol=compound&asset=USDC&chain=1',
  'protocol=morpho&asset=USDC&chain=1',
  'protocol=aave&asset=USDC&chain=42161',
];

export default function () {
  const bridgeQ = BRIDGE_SCENARIOS[Math.floor(Math.random() * BRIDGE_SCENARIOS.length)];
  const swapQ   = SWAP_SCENARIOS  [Math.floor(Math.random() * SWAP_SCENARIOS.length)];
  const apyQ    = APY_SCENARIOS   [Math.floor(Math.random() * APY_SCENARIOS.length)];

  group('bridge quote', () => {
    const res = http.get(`${BASE_URL}/quotes/bridge?${bridgeQ}`);
    bridgeLat.add(res.timings.duration);
    const ok = check(res, { 'bridge 200': (r) => r.status === 200 });
    errRate.add(!ok);
  });

  group('swap quote', () => {
    const res = http.get(`${BASE_URL}/quotes/swap?${swapQ}`);
    swapLat.add(res.timings.duration);
    const ok = check(res, { 'swap 200': (r) => r.status === 200 });
    errRate.add(!ok);
  });

  group('apy quote', () => {
    const res = http.get(`${BASE_URL}/quotes/apy?${apyQ}`);
    apyLat.add(res.timings.duration);
    const ok = check(res, {
      'apy 200': (r) => r.status === 200,
      'apy has data': (r) => {
        try { const b = JSON.parse(r.body); return b && typeof b === 'object'; }
        catch { return false; }
      },
    });
    errRate.add(!ok);
  });

  sleep(0.05 + Math.random() * 0.15);
}

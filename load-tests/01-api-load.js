/**
 * Load test: Backend API — 1,000 concurrent users, p95 < 200ms
 *
 * Simulates a realistic mix of the most-called endpoints:
 *   40% GET /health                  (heartbeat / monitoring)
 *   30% POST /strategy/optimize      (core user action)
 *   20% GET /quotes/apy              (quote polling)
 *   10% GET /strategies              (marketplace browse)
 *
 * Run:
 *   BASE_URL=http://localhost:4000 k6 run load-tests/01-api-load.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ─── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

// ─── Custom metrics ────────────────────────────────────────────────────────────

const errorRate   = new Rate('error_rate');
const optimizeLat = new Trend('optimize_latency', true);
const quoteLat    = new Trend('quote_latency',    true);
const healthLat   = new Trend('health_latency',   true);
const mktLat      = new Trend('marketplace_latency', true);
const reqTotal    = new Counter('requests_total');

// ─── Thresholds ────────────────────────────────────────────────────────────────

export const options = {
  stages: [
    { duration: '30s', target: 100  },   // ramp to 100
    { duration: '60s', target: 500  },   // ramp to 500
    { duration: '60s', target: 1000 },   // ramp to 1,000
    { duration: '60s', target: 1000 },   // hold at 1,000
    { duration: '30s', target: 0    },   // ramp down
  ],
  thresholds: {
    // SLA: p95 < 200ms across all requests
    http_req_duration: ['p(95)<200'],
    // Each endpoint individually
    optimize_latency:    ['p(95)<200'],
    quote_latency:       ['p(95)<200'],
    health_latency:      ['p(95)<50' ],  // health is lightweight
    marketplace_latency: ['p(95)<200'],
    error_rate:          ['rate<0.01'],  // <1% error rate
  },
};

// ─── Shared payload ────────────────────────────────────────────────────────────

const OPTIMIZE_PAYLOAD = JSON.stringify({
  sourceAsset:  'USDC',
  sourceAmount: '1000',
  sourceChain:  1,
  destChain:    42161,
  riskTolerance: 3,
  timeHorizon:  30,
});

const HEADERS = { 'Content-Type': 'application/json' };

// ─── Virtual user ──────────────────────────────────────────────────────────────

export default function () {
  const roll = Math.random();
  reqTotal.add(1);

  if (roll < 0.40) {
    // 40%: GET /health
    const res = http.get(`${BASE_URL}/health`);
    healthLat.add(res.timings.duration);
    check(res, { 'health 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

  } else if (roll < 0.70) {
    // 30%: POST /strategy/optimize
    const res = http.post(`${BASE_URL}/strategy/optimize`, OPTIMIZE_PAYLOAD, { headers: HEADERS });
    optimizeLat.add(res.timings.duration);
    check(res, { 'optimize 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

  } else if (roll < 0.90) {
    // 20%: GET /quotes/apy
    const res = http.get(`${BASE_URL}/quotes/apy?protocol=aave&asset=USDC&chain=1`);
    quoteLat.add(res.timings.duration);
    check(res, { 'apy 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

  } else {
    // 10%: GET /strategies
    const res = http.get(`${BASE_URL}/strategies?sort=yield&limit=20`);
    mktLat.add(res.timings.duration);
    check(res, { 'strategies 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
  }

  sleep(0.1 + Math.random() * 0.4); // 100–500ms think time
}

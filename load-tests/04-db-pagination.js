/**
 * Load test: Database pagination — 1M+ executions, p95 < 100ms
 *
 * Tests paginated execution history queries against a pre-seeded database.
 * Before running this test, seed the database with 1M+ rows:
 *
 *   psql $DATABASE_URL -c "
 *     INSERT INTO executions (id, user_id, strategy_id, status, started_at, completed_at)
 *     SELECT gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'completed',
 *            now() - (random() * interval '365 days'),
 *            now() - (random() * interval '364 days')
 *     FROM generate_series(1, 1000000);
 *   "
 *
 * Queries tested (via REST API, which hits Postgres):
 *   GET /user/executions?page=N&limit=20    — paginated history (cursor-based)
 *   GET /strategies?sort=yield&limit=20     — marketplace browse (paginated)
 *
 * Both use LIMIT/OFFSET or keyset pagination depending on implementation.
 * The SLA target is p95 < 100ms for any page.
 *
 * Run (after seeding):
 *   BASE_URL=http://localhost:4000 k6 run load-tests/04-db-pagination.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

const execHistoryLat = new Trend('exec_history_latency', true);
const mktBrowseLat   = new Trend('mkt_browse_latency',   true);
const errRate        = new Rate('pagination_error_rate');

export const options = {
  // 50 concurrent users — we're testing DB query latency, not connection load
  stages: [
    { duration: '10s', target: 10 },
    { duration: '60s', target: 50 },
    { duration: '60s', target: 50 },
    { duration: '10s', target: 0  },
  ],
  thresholds: {
    exec_history_latency: ['p(95)<100'],
    mkt_browse_latency:   ['p(95)<100'],
    pagination_error_rate: ['rate<0.01'],
  },
};

// Simulate random deep pages — worst case for OFFSET-based pagination
function randomPage() {
  return Math.floor(Math.random() * 10000) + 1;
}

// Auth header (test-mode JWT — backend should accept in non-production)
const TEST_JWT = __ENV.TEST_JWT || '';
const HEADERS  = TEST_JWT ? { Authorization: `Bearer ${TEST_JWT}` } : {};

export default function () {
  const page = randomPage();

  // Execution history (authenticated)
  {
    const res = http.get(
      `${BASE_URL}/user/executions?page=${page}&limit=20`,
      { headers: HEADERS },
    );
    execHistoryLat.add(res.timings.duration);
    const ok = check(res, {
      'exec history 200 or 401': (r) => r.status === 200 || r.status === 401,
      'exec history fast': (r) => r.timings.duration < 100,
    });
    errRate.add(!ok);
  }

  // Marketplace browse (public, no auth)
  {
    const sorts = ['yield', 'risk', 'votes', 'popular', 'newest'];
    const sort  = sorts[Math.floor(Math.random() * sorts.length)];
    const res   = http.get(`${BASE_URL}/strategies?sort=${sort}&page=${page}&limit=20`);
    mktBrowseLat.add(res.timings.duration);
    const ok = check(res, {
      'marketplace 200': (r) => r.status === 200,
      'marketplace fast': (r) => r.timings.duration < 100,
    });
    errRate.add(!ok);
  }

  sleep(0.5 + Math.random() * 0.5);
}

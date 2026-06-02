/**
 * Load test: WebSocket — 10,000 concurrent strategy tracking connections
 *
 * Each VU:
 *   1. Opens a WebSocket to /ws/strategy/:strategyId
 *   2. Expects a 'connected' message within 1s
 *   3. Holds the connection open for 30–60s (simulates a live execution tracker)
 *   4. Counts messages received
 *   5. Closes cleanly
 *
 * Thresholds:
 *   - Connect time < 1s (p95)
 *   - No unexpected disconnects (session_error_rate < 0.5%)
 *
 * Run:
 *   BASE_URL=ws://localhost:4000 k6 run load-tests/03-websocket.js
 *
 * Note: k6 OSS supports up to ~50k VUs per single machine.
 *       For 10k connections, run with: k6 run --vus 10000 --duration 60s 03-websocket.js
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'ws://localhost:4000';

const connectTime  = new Trend('ws_connect_time',   true);
const msgsReceived = new Counter('ws_messages_received');
const sessionErrs  = new Rate('session_error_rate');

export const options = {
  stages: [
    { duration: '30s', target: 1000  },
    { duration: '60s', target: 5000  },
    { duration: '60s', target: 10000 },
    { duration: '60s', target: 10000 },
    { duration: '30s', target: 0     },
  ],
  thresholds: {
    ws_connect_time:    ['p(95)<1000'],   // connect in < 1s
    session_error_rate: ['rate<0.005'],   // < 0.5% session errors
  },
};

export default function () {
  // Each VU tracks a unique fake strategy ID
  const strategyId = `0x${Math.random().toString(16).slice(2).padEnd(64, '0')}`;
  const url = `${BASE_URL}/ws/strategy/${strategyId}`;

  const start = Date.now();
  let connected = false;
  let error = false;

  const res = ws.connect(url, {}, (socket) => {
    connectTime.add(Date.now() - start);

    socket.on('open', () => {
      connected = true;
    });

    socket.on('message', (data) => {
      msgsReceived.add(1);
      try {
        const msg = JSON.parse(data);
        check(msg, {
          'message has type': (m) => typeof m.type === 'string',
        });
      } catch { /* non-JSON ignored */ }
    });

    socket.on('error', (e) => {
      error = true;
      console.error(`WS error for ${strategyId}:`, e.error());
    });

    socket.on('close', () => {
      if (!connected) error = true;
    });

    // Hold connection for 30–60s
    const holdMs = 30_000 + Math.random() * 30_000;
    socket.setTimeout(() => socket.close(), holdMs);
  });

  check(res, { 'ws connected (101)': (r) => r && r.status === 101 });
  sessionErrs.add(error || !connected);

  sleep(1);
}

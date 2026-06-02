# Meridian Load Tests

Performance and load tests using [k6](https://k6.io/).

## Prerequisites

```bash
brew install k6        # macOS
# or: https://k6.io/docs/get-started/installation/
```

## Running tests

```bash
# Set target URL (defaults to http://localhost:4000)
export BASE_URL=http://localhost:4000

# Individual tests
k6 run load-tests/01-api-load.js
k6 run load-tests/02-quote-engine.js
k6 run load-tests/03-websocket.js
k6 run load-tests/04-db-pagination.js

# All tests sequentially
for f in load-tests/0*.js; do k6 run "$f"; done
```

## SLA thresholds

| Test | Target | SLA |
|------|--------|-----|
| API load | 1,000 concurrent users | p95 < 200ms |
| Quote engine | 100 concurrent requests | p95 < 500ms |
| WebSocket | 10,000 concurrent connections | connect < 1s, no drops |
| DB pagination | 1M+ rows | p95 < 100ms |

## Output

k6 outputs a summary to stdout. For CI, use `--out json=results.json` and parse with:
```bash
k6 run --out json=results.json load-tests/01-api-load.js
```

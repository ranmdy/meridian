# Meridian — Redis Key Schema

All keys use a colon-delimited namespace: `meridian:<namespace>:<identifier>`.

TTLs are enforced with `EXPIRE` on write. Redis is treated as ephemeral — nothing stored here is the source of truth; PostgreSQL is.

---

## Quote Cache

### Bridge Quotes

```
KEY:   meridian:quote:bridge:<protocol>:<fromChain>:<toChain>:<asset>
TYPE:  string (JSON)
TTL:   60s
SET:   On every 15s poll refresh
GET:   GET /quotes/bridge, POST /strategy/optimize

VALUE:
{
  "protocol": "stargate",
  "fromChain": 1,
  "toChain": 42161,
  "fromAsset": "USDC",
  "amountIn": "4200000000",
  "amountOut": "4197340000",
  "feeUsd": 1.20,
  "estimatedSeconds": 180,
  "timestamp": 1700000000,
  "isStale": false
}
```

### Swap/APY Quotes

```
KEY:   meridian:quote:apy:<protocol>:<chain>:<asset>
TYPE:  string (JSON)
TTL:   60s
SET:   On every 15s poll refresh
GET:   GET /quotes/apy, POST /strategy/optimize

VALUE:
{
  "protocol": "aave_v3",
  "chain": 1,
  "asset": "ETH",
  "supplyApyBps": 210,
  "borrowApyBps": 350,
  "tvlUsd": 8000000000,
  "timestamp": 1700000000,
  "isStale": false
}
```

### Quote Refresh Lock

```
KEY:   meridian:quote:refresh_lock
TYPE:  string ("1")
TTL:   14s  (prevents parallel refresh races)
SET:   SETNX at start of each 15s poll cycle
DEL:   After poll cycle completes
```

---

## Auth Sessions

### JWT Nonces (replay protection)

```
KEY:   meridian:auth:nonce:<address>
TYPE:  string (nonce value, e.g. "abc123")
TTL:   5 min (must sign within this window)
SET:   GET /auth/nonce (not yet implemented — pre-auth step)
DEL:   After successful /auth/wallet (consumed)
```

### Active JWT Blocklist (logout / revoke)

```
KEY:   meridian:auth:revoked:<jti>
TYPE:  string ("1")
TTL:   Token remaining lifetime
SET:   On logout or admin revoke
GET:   Checked on every authenticated request
```

---

## Rate Limiting

Managed by `@fastify/rate-limit` with Redis backend.

```
KEY:   meridian:rl:<tier>:<identifier>
       identifier = wallet address (authed) or IP (anonymous)
TYPE:  string (request count, managed by rate-limit plugin)
TTL:   60s (rolling window)
```

| Tier      | Limit      | Key identifier |
|-----------|------------|----------------|
| Anonymous | 20/min     | IP address     |
| Free      | 100/min    | wallet address |
| Pro       | 500/min    | wallet address |
| Business  | 5,000/min  | wallet address |

---

## Relayer Job Queue (BullMQ)

BullMQ manages its own key namespace internally. Meridian does not write these directly.

```
KEY pattern: bull:meridian-relayer:<queue-internals>
MANAGED BY:  BullMQ — do not read/write manually
```

### Relayer execution state (fast-path status)

Written by RelayerManager on every step completion so WebSocket can serve status without hitting PostgreSQL:

```
KEY:   meridian:exec:<executionId>:status
TYPE:  string (JSON)
TTL:   24h
SET:   After each step completes/fails; after strategy completes/fails
GET:   WebSocket status handler, GET /strategy/:id/status

VALUE:
{
  "executionId": "exec_abc123",
  "status": "in_progress",
  "currentStep": 3,
  "totalSteps": 6,
  "steps": [
    { "index": 0, "status": "done", "txHash": "0x123...", "chain": 1, "completedAt": 1700000010 },
    { "index": 1, "status": "done", "txHash": "0x456...", "chain": 1, "completedAt": 1700000025 },
    { "index": 2, "status": "in_progress", "txHash": "0x789...", "chain": 1 },
    { "index": 3, "status": "pending" },
    { "index": 4, "status": "pending" },
    { "index": 5, "status": "pending" }
  ],
  "updatedAt": 1700000090
}
```

### WebSocket subscriber set

Tracks which WebSocket connections are subscribed to a given execution (for fan-out):

```
KEY:   meridian:exec:<executionId>:ws_clients
TYPE:  set (socket IDs)
TTL:   24h (auto-expire after strategy finishes)
SET:   SADD on WS connect
DEL:   SREM on WS disconnect
GET:   On each status broadcast — fan-out to all members
```

---

## Strategy Graph Cache

```
KEY:   meridian:graph:snapshot
TYPE:  string (JSON — serialised ProtocolGraph edge list)
TTL:   5 min
SET:   After each QuoteEngine refresh cycle that updates edge weights
GET:   On StrategyEngine.optimize() — avoids rebuilding graph from DB
```

---

## API Usage Counters (approximate, non-critical)

```
KEY:   meridian:usage:<userId>:<YYYY-MM>
TYPE:  hash  { endpoint -> count }
TTL:   35 days
INCR:  HINCRBY on every API call
GET:   Admin dashboard (future)
```

---

## Eviction Policy

Redis should be configured with `maxmemory-policy allkeys-lru`. All data here is regenerable; losing a key results in a cache miss, not data loss.

```
maxmemory-policy allkeys-lru
maxmemory 512mb   # ElastiCache node size dependent
```

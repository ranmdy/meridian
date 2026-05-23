# Meridian API Contract

Base URL: `http://localhost:3001` (dev) | `https://api.meridian.fi` (prod)

All requests/responses are `application/json`. Auth endpoints require `Authorization: Bearer <jwt>`.

---

## REST Endpoints

### Health

#### `GET /health`
```json
// Response 200
{
  "status": "ok",
  "version": "0.0.1",
  "graph": { "nodes": 12, "edges": 18 }
}
```

---

### Strategy

#### `POST /strategy/optimize`
Find top routes for a given request. No auth required.

**Request**
```json
{
  "sourceAsset": "ETH",
  "sourceChain": 1,
  "sourceAmountUsd": 8250,
  "destinationChain": 42161,
  "riskTolerance": 3,
  "timeHorizonDays": 30
}
```

**Response 200**
```json
{
  "routes": [
    {
      "steps": [
        {
          "stepType": "LEND",
          "protocol": "aave_v3",
          "protocolAddress": "0x87870B...",
          "fromAsset": "ETH",
          "toAsset": "aETH",
          "fromChain": 1,
          "toChain": 1,
          "estimatedOutput": 8250,
          "gasEstimateUsd": 0.80,
          "bridgeFeeUsd": 0,
          "slippageBps": 0,
          "apyBps": 210
        }
      ],
      "totalScore": 14.2,
      "estimatedApyBps": 680,
      "totalGasUsd": 4.20,
      "totalBridgeFeeUsd": 1.80,
      "totalProtocolFeeUsd": 6.60,
      "estimatedTimeSeconds": 240,
      "hopCount": 6,
      "bridgeCount": 2,
      "riskScore": 42
    }
  ],
  "simulatedAt": 1700000000,
  "quoteExpiresAt": 1700000060
}
```

**Response 400** — Invalid input
```json
{ "error": "Invalid request", "details": { "fieldErrors": { "sourceChain": ["Required"] } } }
```

**Response 422** — No routes found
```json
{ "error": "No routes found", "message": "No viable routes exist for this pair." }
```

---

#### `POST /strategy/execute`
Submit a strategy for execution. Requires auth.

**Request**
```json
{
  "strategyId": "optional-marketplace-id",
  "sourceAsset": "0xA0b86991...",
  "sourceChain": 1,
  "sourceAmount": "4200000000",
  "destinationWallet": "0xABC...DEF",
  "destinationSignature": "0x...",
  "steps": [...],
  "deadline": 1700003600
}
```

**Response 200**
```json
{
  "executionId": "exec_abc123",
  "strategyId": "0xCF2024...",
  "txHash": "0x123...abc",
  "chain": 1,
  "status": "pending",
  "createdAt": 1700000000
}
```

---

#### `GET /strategy/:executionId/status`
Poll execution status. No auth required.

**Response 200**
```json
{
  "executionId": "exec_abc123",
  "strategyId": "0xCF2024...",
  "status": "in_progress",
  "currentStep": 3,
  "totalSteps": 6,
  "steps": [
    { "index": 0, "status": "done", "txHash": "0x123...", "chain": 1, "completedAt": 1700000010 },
    { "index": 1, "status": "done", "txHash": "0x456...", "chain": 1, "completedAt": 1700000025 },
    { "index": 2, "status": "in_progress", "txHash": "0x789...", "chain": 1, "estimatedCompletionAt": 1700000180 },
    { "index": 3, "status": "pending" },
    { "index": 4, "status": "pending" },
    { "index": 5, "status": "pending" }
  ],
  "elapsedSeconds": 84
}
```

---

#### `GET /strategy/:executionId/report`
Download tax/audit report. Requires auth (must be owner).

Query params: `format=csv|pdf|json`

**Response 200** — `Content-Type: text/csv` (or `application/pdf`, `application/json`)

---

### Quotes

#### `GET /quotes/bridge`
Query params: `protocol`, `fromChain`, `toChain`, `asset`

**Response 200**
```json
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

#### `GET /quotes/apy`
Query params: `protocol`, `chain`, `asset`

**Response 200**
```json
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

---

### Auth

#### `POST /auth/wallet`
Sign-in with wallet signature.

**Request**
```json
{
  "address": "0xABC...DEF",
  "message": "Sign in to Meridian\nNonce: abc123\nTimestamp: 1700000000",
  "signature": "0x..."
}
```

**Response 200**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "expiresAt": 1700604800,
  "user": { "id": "usr_abc", "address": "0xABC...DEF", "tier": "free" }
}
```

---

### Marketplace

#### `GET /marketplace`
Query params: `sort=yield|risk|popular`, `chain=1`, `page=1`, `limit=20`

**Response 200**
```json
{
  "strategies": [
    {
      "id": "strat_abc",
      "name": "ETH Yield Maximizer → Base",
      "creator": "0xABC...",
      "estimatedApyBps": 680,
      "riskScore": 42,
      "executionCount": 142,
      "chains": [1, 42161, 8453],
      "protocols": ["aave_v3", "stargate", "gmx"],
      "creatorFeeBps": 2
    }
  ],
  "total": 47,
  "page": 1
}
```

#### `POST /marketplace/publish`
Requires auth.

**Request**
```json
{
  "name": "My Strategy",
  "description": "...",
  "steps": [...],
  "ipfsHash": "QmXyz..."
}
```

**Response 201**
```json
{ "strategyId": "strat_xyz", "onChainId": "0xCF2024..." }
```

---

## WebSocket Events

**Endpoint:** `GET /ws/strategy/:executionId`

Upgrade to WebSocket. Client receives JSON messages:

### Server → Client

```jsonc
// Connection confirmed
{ "type": "connected", "strategyId": "exec_abc123" }

// Step status update (sent after each step completes or fails)
{
  "type": "status_update",
  "data": {
    "strategyId": "exec_abc123",
    "stepIndex": 2,
    "status": "done",          // "pending" | "in_progress" | "done" | "failed"
    "txHash": "0x789...",
    "chain": 1,
    "completedAt": 1700000025
  }
}

// Strategy complete
{
  "type": "strategy_complete",
  "data": {
    "strategyId": "exec_abc123",
    "destination": "0xABC...DEF",
    "finalAsset": "USDC",
    "finalAmount": "308200000",
    "completedAt": 1700000300
  }
}

// Strategy failed
{
  "type": "strategy_failed",
  "data": {
    "strategyId": "exec_abc123",
    "failedStep": 3,
    "reason": "Bridge timeout after 5 retries",
    "emergencyExitTxHash": "0xabc..."
  }
}
```

### Client → Server

```jsonc
// Client can request current state on reconnect
{ "type": "get_status" }
```

---

## Error Format (all endpoints)

```json
{
  "error": "Human-readable error message",
  "code": "OPTIONAL_ERROR_CODE",
  "details": {}
}
```

## Rate Limits

| Tier | Limit |
|---|---|
| Anonymous | 20 req/min |
| Free (authed) | 100 req/min |
| Pro | 500 req/min |
| Business | 5,000 req/min |

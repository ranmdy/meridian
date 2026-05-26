# Meridian Subgraph

Indexes all `MeridianRouter` events across 8 chains for on-chain analytics, historical execution tracking, and Datadog TVL metrics.

## Entities

| Entity | Description |
|--------|-------------|
| `Strategy` | One per strategy execution — tracks full lifecycle (active→completed/failed/exited) |
| `ExecutionStep` | One per `StepExecuted` event — swap/lend/bridge/stake details |
| `User` | Per-wallet aggregate: total strategies, completions, failures |
| `ProtocolStats` | Per-protocol aggregate: volume, step counts by type |
| `AssetStats` | Per-asset aggregate: volume, strategy counts |
| `DailySnapshot` | UTC-day aggregate: volume, strategy counts, unique users |
| `GlobalStats` | Protocol-wide totals (singleton `id = "global"`) |

## Events Indexed

| Event | Handler |
|-------|---------|
| `StrategyStarted` | Creates `Strategy`, `User`, `AssetStats`, `DailySnapshot` |
| `StepExecuted` | Creates `ExecutionStep`, updates `ProtocolStats` |
| `StrategyCompleted` | Marks strategy completed, updates user + global stats |
| `StrategyFailed` | Marks strategy failed with step index + reason |
| `EmergencyExitTriggered` | Marks strategy exited with amount returned |

## Chains

Covers all 8 MeridianRouter deployments: Ethereum, Arbitrum, Base, Optimism, Polygon, BNB, Avalanche, Scroll.

## Setup

```bash
cd subgraph
npm install
npm run codegen   # generates AssemblyScript types from schema + ABI
npm run build     # compiles WASM mapping
npm test          # Matchstick unit tests
```

## Deploy

**Before deploying:**
1. Replace `address: "0x000..."` in `subgraph.yaml` for each chain with the actual deployed router address
2. Set `startBlock` to the router deploy block number (avoids scanning from genesis)
3. Create subgraph slugs in The Graph Studio: `meridian-mainnet`, `meridian-arbitrum`, `meridian-base`, etc.

```bash
# Authenticate
graph auth --studio <DEPLOY_KEY>

# Deploy per network
npm run deploy:mainnet
npm run deploy:arbitrum
npm run deploy:base

# Testnet (Sepolia)
npm run deploy:test
```

## Example Queries

```graphql
# Global protocol stats
{
  globalStats(id: "global") {
    totalStrategies
    completedStrategies
    failedStrategies
    totalVolume
    uniqueUsers
    totalSteps
  }
}

# Recent strategies for a user
{
  strategies(
    where: { user: "0x1234..." }
    orderBy: startedAt
    orderDirection: desc
    first: 20
  ) {
    id
    status
    sourceAmount
    finalAmount
    startedAt
    completedAt
    stepCount
  }
}

# Daily volume (last 30 days)
{
  dailySnapshots(
    orderBy: timestamp
    orderDirection: desc
    first: 30
  ) {
    id
    totalVolume
    strategiesStarted
    strategiesCompleted
    strategiesFailed
    uniqueUsers
  }
}

# Top protocols by volume
{
  protocolStatses(
    orderBy: totalVolume
    orderDirection: desc
    first: 10
  ) {
    id
    totalVolume
    stepCount
    swapCount
    bridgeCount
    lendCount
  }
}

# Strategy execution history with steps
{
  strategy(id: "0xaabbcc...") {
    status
    sourceAsset
    sourceAmount
    finalAmount
    failReason
    steps(orderBy: stepIndex) {
      stepIndex
      stepType
      protocol
      amountOut
      txHash
    }
  }
}
```

## Integration with Datadog

The backend `metrics` service can poll the subgraph's `/graphql` endpoint every 5 minutes and push `GlobalStats` + `DailySnapshot` to Datadog as gauges:

- `meridian.strategies.total`
- `meridian.strategies.active`
- `meridian.volume.total`
- `meridian.users.unique`

Set `SUBGRAPH_URL` in the backend `.env` to the deployed subgraph endpoint.

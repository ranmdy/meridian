# Meridian

**Non-custodial cross-chain DeFi strategy router.**

Meridian lets users deposit any asset on any supported EVM chain, define a multi-step yield strategy (swap, lend, bridge, stake), and execute it atomically via relayers — all fully on-chain, fully auditable, zero custody.

This is not a mixer. Every hop emits an event. Every transaction is indexable. Destination wallets are verified via ECDSA signature before execution begins. The complexity exists to maximize yield across fragmented DeFi liquidity — not to obscure fund flows.

---

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────────┐
│   Frontend   │────▶│   Backend API    │────▶│   MeridianRouter.sol │
│  Next.js 14  │◀───│  Fastify + WS    │◀───│   per-chain deploy   │
│  Wagmi/Viem  │     │  BullMQ relayer  │     │   protocol adapters  │
└─────────────┘     └─────────────────┘     └──────────────────────┘
                           │                          │
                    ┌──────┴──────┐             ┌─────┴──────┐
                    │  PostgreSQL │             │  Subgraph  │
                    │  Redis 7    │             │  (indexer) │
                    └─────────────┘             └────────────┘
```

**Flow:**
1. User connects wallet, selects asset + amount
2. User signs destination wallet verification (EIP-712)
3. Backend strategy engine computes optimal path (modified Dijkstra over protocol graph)
4. User signs a single approval tx
5. Relayer executes steps sequentially — swap, lend, bridge, stake, settle
6. WebSocket pushes live status updates with tx hashes
7. Funds land at destination. Full audit trail on-chain.

---

## Monorepo Structure

```
contracts/        Solidity 0.8.24 — Foundry. Core router, adapters, registry, vault, NFTs
backend/          Fastify 5 + TypeScript. Strategy engine, quote engine, relayer, 23 services
frontend/         Next.js 14 (App Router). Wagmi v2, Tailwind, shadcn, Zustand
sdk/              TypeScript SDK (tsup, dual ESM+CJS). Programmatic access via Viem
subgraph/         The Graph schema. Indexes all router events across chains
scripts/          E2E scripts (same-chain + bridge relay)
load-tests/       k6 — API load, quote engine, WebSocket, DB pagination
docs/             Architecture + API documentation
audit-package/    Pre-audit materials (overview, architecture, threat model)
```

---

## Smart Contracts

Core contracts live in `contracts/src/`. Built with Foundry, secured with OpenZeppelin.

| Contract | What it does |
|---|---|
| `MeridianRouter.sol` | Execution engine. Tracks strategy state machine, executes steps via adapters, enforces destination verification, distributes fees. One deployment per chain. |
| `MeridianStrategyRegistry.sol` | On-chain strategy storage. Marketplace strategies are registered here. |
| `MeridianVault.sol` | Optional yield-compounding vault for idle capital. |
| `MeridianStrategyNFT.sol` | Mints NFTs for top-performing strategies. Holders earn creator fees perpetually. |
| `adapters/AaveV3LendAdapter.sol` | Aave v3 supply/withdraw via `IProtocolAdapter` interface |
| `adapters/UniswapV3SwapAdapter.sol` | Uniswap v3 exact-input swaps with slippage protection |
| `adapters/AcrossBridgeAdapter.sol` | Across Protocol bridge integration |

**Step types:** `SWAP` | `LEND` | `BRIDGE` | `STAKE` | `SETTLE`

**Security properties:**
- Non-custodial — no admin withdrawal functions exist
- Destination verification — ECDSA-signed proof that user controls both source and destination wallets
- Slippage protection — `minOutput` enforced on every swap
- Reentrancy guards on all external calls
- Emergency exit returns funds to **source** wallet only (not destination)
- Strategy deadline enforcement — expired strategies cannot be executed
- Allowlisted protocols only — no arbitrary external calls

### Testnet Deployments

**Sepolia (11155111)**
| Contract | Address |
|---|---|
| MeridianRouter | `0x2871506ADE1cA3cB4F6E86CEA4e3f1CDA820A94c` |
| StrategyRegistry | `0x2453b3533fC6660988E011cCfD02F5795b9558ED` |
| Vault | `0x91886fed2398383C62Bebe3360a3c2C4407aD461` |
| AaveV3LendAdapter | `0xB6E8f0a7B0957C7A22F59094724D94F65816D9fD` |
| UniswapV3SwapAdapter | `0x587D5E40EaC0aE7564011219f4776DD56fbC3408` |
| AcrossBridgeAdapter | `0x4bE8E4f041a82c0Fd388bA63574c0bD2c9198a1c` |

**Base Sepolia (84532)**
| Contract | Address |
|---|---|
| MeridianRouter | `0x4DCAD84159755062c9384c9Cb7d515adCF0Bc314` |
| StrategyRegistry | `0x7F485cF5AFD8CEa4aC9f896A8206B12697CdE7D3` |
| Vault | `0x0a2214F676ab38283ce180D1bd4FB114f26d6445` |
| UniswapV3SwapAdapter | `0xf09d720978cd11e9eb45787d87274a7c049b9ed7` |
| AcrossBridgeAdapter | `0xe9e8dd4312fea03c09e12e633cd5ac45b2507702` |

Mainnet deployments pending security audit.

---

## Backend

Fastify 5 server with 23 services, PostgreSQL 16, Redis 7, BullMQ job queue.

**Core services:**
- **Strategy Engine** — Graph-based pathfinder. Modified Dijkstra over protocol nodes. Scores routes by `yield - gas - bridgeFee - slippage`. Returns top 3 candidates.
- **Quote Engine** — Polls live quotes every 15s from bridges (Stargate, Across, Wormhole), DEX aggregators (1inch, Paraswap, 0x), lending rates (Aave, Compound). 60s quote validity window.
- **Relayer** — Cross-chain step sequencer. BullMQ workers monitor bridge confirmations, retry failed steps, post status to WebSocket. This is the coordination layer.
- **Simulation** — Tenderly fork simulation before execution. Catches reverts before they cost gas.
- **Exploit Feed** — Monitors protocol exploits in real-time. Flags risky routes before user signs.

**Key API routes:**

```
POST   /strategy           Create strategy
GET    /strategy/:id       Get strategy details
POST   /executions         Execute strategy
GET    /executions/:id     Execution status
WS     /ws/strategy/:id    Live execution tracking
GET    /export/:id         CSV/PDF tax report
GET    /marketplace        Browse community strategies
GET    /health             Health check
```

---

## Frontend

Next.js 14 with App Router. Wallet connection via Wagmi v2 + Viem. State management with Zustand. UI built with Tailwind + shadcn.

**Pages:** Dashboard, Strategy Composer (drag-drop builder), Marketplace, Live Execution Tracker, Portfolio (cross-chain view), Billing, Settings.

**28 Playwright E2E tests** covering wallet connect, destination verification, strategy simulation, execution flow, WebSocket tracking, emergency exit, and CSV export.

---

## Supported Chains & Protocols

**Chains (8):** Ethereum, Base, Arbitrum, BNB Chain, Polygon, Optimism, Avalanche, Scroll

**DEXs:** Uniswap v3, Curve, Camelot, PancakeSwap, Aerodrome
**Lending:** Aave v3, Compound v3, Morpho
**Bridges:** Stargate, Across, Wormhole, Hop
**Yield:** GMX GLP, Pendle, Convex, Kamino

---

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)
- Docker + Docker Compose (for Postgres + Redis)

### Setup

```bash
# Clone and install
git clone <repo-url> && cd meridian
pnpm install

# Environment
cp .env.example .env
# Fill in: RPC URLs (Alchemy/QuickNode), JWT_SECRET, POSTGRES_PASSWORD

# Start infrastructure
docker compose up -d

# Start dev servers (backend + frontend in parallel)
pnpm dev
```

Backend runs on `http://localhost:4000`, frontend on `http://localhost:3000`.

### Smart Contracts

```bash
cd contracts

# Build
forge build

# Test (50 unit + 6 fork tests)
forge test -vv

# Coverage
forge coverage

# Deploy to Sepolia
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast --verify
```

### Running Tests

```bash
# All tests (contracts + backend + frontend)
pnpm test

# Contracts only
pnpm contracts:test

# E2E (Playwright)
cd frontend && pnpm test:e2e

# Load tests (k6)
k6 run load-tests/01-api-load.js
```

---

## Security

Static analysis with **Slither** and symbolic execution with **Mythril** — both clean. Pre-audit package prepared in `audit-package/` with full threat model covering 12 attack vectors.

**Key invariants:**
- Funds never held by Meridian contracts — pass-through execution only
- No admin can redirect or withdraw user funds
- Destination wallet must be cryptographically verified before any execution
- Emergency exit sends funds back to the original depositor, never to destination
- All protocol calls go through allowlisted adapters — no arbitrary `call()` targets

Formal audit pending. **Do not use on mainnet with real funds until audit is complete.**

---

## Fee Structure

| Fee | Rate | Description |
|---|---|---|
| Execution fee | 0.08% (8 bps) | Applied to routed value |
| Marketplace (creator) | 0.02% (2 bps) | Paid to strategy creator |
| Marketplace (protocol) | 0.03% (3 bps) | Paid to Meridian |

---

## SDK

TypeScript SDK for programmatic integration. Peer dependency on Viem.

```bash
pnpm add @meridian/sdk viem
```

```typescript
import { MeridianClient } from '@meridian/sdk';
import { createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';

const client = new MeridianClient({
  apiUrl: 'https://api.meridian.finance',
  walletClient: createWalletClient({ chain: sepolia, transport: http() }),
});

const strategy = await client.createStrategy({
  steps: [
    { type: 'SWAP', protocol: 'uniswap-v3', fromToken: 'USDC', toToken: 'WETH' },
    { type: 'LEND', protocol: 'aave-v3', token: 'WETH' },
  ],
  destination: '0x...',
});

await client.execute(strategy.id);
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, commit conventions, and code standards.

---

## License

Proprietary. All rights reserved.

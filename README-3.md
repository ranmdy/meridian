# Meridian — Cross-Chain DeFi Strategy Router

> Deposit any asset. Define a destination. Meridian autonomously routes your funds through the best yield-generating DeFi strategies across multiple chains — fully transparent, fully auditable.

---

## Deployed Contracts

### Sepolia Testnet (chain 11155111)

| Contract | Address | Explorer |
|----------|---------|---------|
| MeridianRouter | `0x9D77c4Af9e76C419672cd25d0C73DDD75d0235D3` | [Etherscan](https://sepolia.etherscan.io/address/0x9D77c4Af9e76C419672cd25d0C73DDD75d0235D3) |
| MeridianStrategyRegistry | `0xe14c81d2E11Fd5278A040D1B58406Ea83cb7F514` | [Etherscan](https://sepolia.etherscan.io/address/0xe14c81d2E11Fd5278A040D1B58406Ea83cb7F514) |
| MeridianVault (USDC) | `0xC8a0Fb6d6d4D513ddA0fEBf3E4b69bde132c8B9C` | [Etherscan](https://sepolia.etherscan.io/address/0xC8a0Fb6d6d4D513ddA0fEBf3E4b69bde132c8B9C) |

### Base Sepolia Testnet (chain 84532)

| Contract | Address | Explorer |
|----------|---------|---------|
| MeridianRouter | `0x4a822882689941B2478Fd548AE3a1559Ab000b06` | [Basescan](https://sepolia.basescan.org/address/0x4a822882689941B2478Fd548AE3a1559Ab000b06) |
| MeridianStrategyRegistry | `0x9D77c4Af9e76C419672cd25d0C73DDD75d0235D3` | [Basescan](https://sepolia.basescan.org/address/0x9D77c4Af9e76C419672cd25d0C73DDD75d0235D3) |
| MeridianVault (USDC) | `0x7CCC7B386573c4b988446482cb9aB3609c14f8Aa` | [Basescan](https://sepolia.basescan.org/address/0x7CCC7B386573c4b988446482cb9aB3609c14f8Aa) |

> Mainnet deployment pending security audit.

---

## Table of Contents

1. [Overview](#overview)
2. [Core Value Proposition](#core-value-proposition)
3. [How It Works — User Flow](#how-it-works--user-flow)
4. [Architecture](#architecture)
5. [Smart Contract Design](#smart-contract-design)
6. [Strategy Engine](#strategy-engine)
7. [Supported Chains & Protocols](#supported-chains--protocols)
8. [Security & Compliance](#security--compliance)
9. [Tax & Audit Trail](#tax--audit-trail)
10. [Monetization](#monetization)
11. [Tech Stack](#tech-stack)
12. [Roadmap](#roadmap)
13. [Team Roles Needed](#team-roles-needed)

---

## Overview

Meridian is a non-custodial, fully on-chain DeFi strategy router. Users deposit an asset on any supported chain and provide a verified destination wallet. Meridian's strategy engine automatically routes the funds through a sequence of lending, swapping, bridging, and yield-farming steps — earning yield along the way — before settling at the destination.

Every hop is visible on-chain. Every transaction is exportable for tax purposes. The complexity is a byproduct of maximizing yield across the DeFi ecosystem — not a tool for obscuring funds.

---

## Core Value Proposition

| Problem | Meridian Solution |
|---|---|
| DeFi yield strategies require manual execution across 5–10 protocols | One click executes the full strategy automatically |
| Moving assets cross-chain is fragmented and expensive | Smart routing finds the cheapest, fastest bridge path |
| Complex strategies are hard to replicate | Strategy Marketplace lets users copy top-performing routes |
| Multi-chain portfolios are hard to track | Built-in audit trail and tax report export |
| DAOs struggle to manage treasury across chains | Programmable strategy execution via API |

---

## How It Works — User Flow

### Step 1: Connect Source Wallet
User connects their wallet (MetaMask, Rabby, WalletConnect, Phantom). The UI detects all assets across all supported chains automatically.

```
User wallet detected:
  - 2.5 ETH on Ethereum
  - 500 USDC on Arbitrum
  - 0.05 BTC (wrapped) on BNB Chain
```

### Step 2: Select Source Asset
User selects which asset and amount to deploy into a strategy.

```
Selected: 2.5 ETH on Ethereum
```

### Step 3: Connect & Verify Destination Wallet
This is a critical compliance step. The destination wallet must be verified by signing a message — proving the user controls both the source and destination wallets.

```
Destination: 0xABC...DEF (Base)
Verification: Sign message from destination wallet ✅
Status: Ownership verified
```

> **Why verification?** This ensures the protocol is used for self-custody strategy execution — not for sending funds to unrelated third-party addresses. This is the key design decision that separates Meridian from a mixer.

### Step 4: Choose or Build a Strategy
Users can:
- Pick from the **Strategy Marketplace** (community-built, audited routes)
- Build a **Custom Strategy** using the drag-and-drop Strategy Composer
- Let the **Auto-Optimizer** select the best yield route automatically

**Example Strategy: "ETH Yield Maximizer → Base"**
```
Step 1: Deposit ETH → Aave v3 (Ethereum)        [earn 2.1% APY]
Step 2: Borrow USDC against aETH collateral      [60% LTV, safe]
Step 3: Bridge USDC → Arbitrum via Stargate      [~$1.20 fee]
Step 4: Deposit USDC → GMX GLP pool (Arbitrum)  [earn 8.4% APY]
Step 5: Claim yield weekly → bridge to Base      [automated]
Step 6: Settle final position → destination      [0xABC...DEF]
```

**Estimated APY: 6.8% net** (after fees and gas)
**Estimated Gas: $4.20 total**
**Estimated Time: ~4 minutes**

### Step 5: Review & Simulate
Before execution, the protocol runs a full simulation:

```
Strategy Simulation
─────────────────────────────────────────
Input:           2.5 ETH (~$8,250)
Route steps:     6 hops across 3 chains
Bridges used:    Stargate (ETH→ARB), Across (ARB→Base)
DEXes used:      Uniswap v3, Curve
Lending:         Aave v3
Yield protocols: GMX GLP
─────────────────────────────────────────
Estimated APY:   6.8%
Total gas:       $4.20
Bridge fees:     $1.80
Protocol fees:   0.08% ($6.60)
─────────────────────────────────────────
Slippage risk:   Low
Liquidation risk: Low (60% LTV)
Smart contract risk: Medium (3 protocols)
─────────────────────────────────────────
⚠️  You are interacting with 3rd party DeFi protocols.
    Meridian is non-custodial. Funds are not insured.
```

### Step 6: Sign & Execute
User signs a single transaction (or EIP-712 meta-transaction). Meridian's router contracts handle all subsequent steps automatically using relayers for cross-chain hops.

### Step 7: Live Tracking Dashboard
```
Meridian Execution Tracker
─────────────────────────────────────────
[✅] Step 1/6 — Deposited 2.5 ETH to Aave v3
               TX: 0x123...abc (Ethereum) ↗
[✅] Step 2/6 — Borrowed 4,200 USDC
               TX: 0x456...def (Ethereum) ↗
[🔄] Step 3/6 — Bridging USDC to Arbitrum via Stargate
               ETA: ~2 minutes
[ ]  Step 4/6 — Pending
[ ]  Step 5/6 — Pending
[ ]  Step 6/6 — Pending
─────────────────────────────────────────
Total elapsed: 1m 24s
```

### Step 8: Settlement & Report
When complete, the user receives:
- Final asset at destination wallet
- Full transaction receipt with all hop TXs
- Downloadable CSV for tax reporting
- Strategy performance summary

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│   Wallet Connect │ Strategy Composer │ Live Tracker          │
└────────────────────────┬────────────────────────────────────┘
                         │ REST / WebSocket
┌────────────────────────▼────────────────────────────────────┐
│                     Backend API (Node.js)                    │
│                                                              │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Strategy Engine │  │ Quote Engine │  │  Relayer Mgr   │  │
│  │  (pathfinding)  │  │ (pricing)    │  │  (cross-chain) │  │
│  └────────┬────────┘  └──────┬───────┘  └───────┬────────┘  │
│           └──────────────────┼──────────────────┘           │
│                              │                               │
│  ┌───────────────────────────▼──────────────────────────┐   │
│  │              Adapter Layer (Protocol SDKs)            │   │
│  │  Stargate │ Wormhole │ Across │ Aave │ Uniswap │ GMX  │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    On-Chain Layer                            │
│                                                              │
│   Meridian Router Contract (deployed per chain)            │
│   ├── receiveAndExecute()                                   │
│   ├── bridgeAndContinue()                                   │
│   └── settleToDestination()                                 │
│                                                              │
│   Meridian Vault (optional yield compounding)              │
│   Meridian Strategy Registry (on-chain strategy storage)   │
└─────────────────────────────────────────────────────────────┘
```

### Key Backend Services

**Strategy Engine**
- Graph-based pathfinder (modified Dijkstra) over a node graph of protocols
- Each node = a protocol action (swap, lend, bridge, stake)
- Edge weights = cost (gas + fees + slippage) and yield
- Finds optimal route given user's risk tolerance and time horizon

**Quote Engine**
- Polls live quotes from bridge APIs (Stargate, Across, Wormhole SDK)
- Polls live swap quotes from DEX aggregators (1inch, Paraswap, 0x)
- Polls live APY from lending protocols (Aave subgraph, Compound API)
- Refreshes every 15 seconds; quotes valid for 60 seconds

**Relayer Manager**
- Manages cross-chain step sequencing
- Monitors bridge confirmations via event listeners
- Retries failed steps with fallback routes
- Posts status updates via WebSocket to frontend

---

## Smart Contract Design

### Router Contract (per chain)

```solidity
// Simplified interface
interface IMeridianRouter {

    struct Strategy {
        address sourceAsset;
        uint256 sourceAmount;
        Step[] steps;
        address destinationWallet;
        bytes destinationSignature; // proof of ownership
        uint256 deadline;
    }

    struct Step {
        StepType stepType;     // SWAP | LEND | BRIDGE | STAKE | SETTLE
        address protocol;
        bytes params;
        uint256 minOutput;
    }

    // Main entry point
    function executeStrategy(Strategy calldata strategy) external payable;

    // Called by relayer after bridge confirmation
    function continueStrategy(bytes32 strategyId, uint256 stepIndex) external;

    // Emergency exit — returns funds to source wallet
    function emergencyExit(bytes32 strategyId) external;

    // Events (full audit trail)
    event StrategyStarted(bytes32 indexed strategyId, address indexed user, uint256 amount);
    event StepExecuted(bytes32 indexed strategyId, uint256 stepIndex, StepType stepType);
    event StrategyCompleted(bytes32 indexed strategyId, address destination, uint256 finalAmount);
    event StrategyFailed(bytes32 indexed strategyId, uint256 failedStep, string reason);
}
```

### Destination Wallet Verification

```solidity
function verifyDestination(
    address destination,
    bytes calldata signature
) internal pure returns (bool) {
    bytes32 message = keccak256(abi.encodePacked(
        "Meridian destination verification\n",
        "I confirm this wallet is mine: ",
        destination
    ));
    address recovered = ECDSA.recover(
        MessageHashUtils.toEthSignedMessageHash(message),
        signature
    );
    return recovered == destination;
}
```

### Security Properties
- Non-custodial: funds flow through contracts but are never held by Meridian
- No admin withdrawal functions
- Emergency exit always routes back to **source** wallet only
- Strategy deadline enforced — expired strategies auto-revert
- Reentrancy guards on all external calls
- Slippage protection on every swap step

---

## Strategy Engine

### Strategy Types

**Type 1: Yield Optimizer**
Route funds through highest-yielding protocols along the path to destination.
```
ETH (Ethereum) → [lend on Aave] → [bridge yield to Arbitrum] → [stake on Pendle] → destination (Base)
```

**Type 2: Chain Migration**
Move an asset from one chain to another in the most cost-efficient way, earning yield during transit.
```
USDC (Polygon) → [bridge via Stargate] → [swap to ETH on Uniswap] → destination (Ethereum)
```

**Type 3: Portfolio Rebalancing**
Sell one asset, deploy into target asset across multiple chains.
```
BNB (BNB Chain) → [swap to USDC] → [bridge to Ethereum] → [swap to stETH] → [deposit Lido] → destination
```

**Type 4: Treasury Management (DAO/Business)**
Programmatic multi-step treasury operations via API.
```
DAO treasury ETH → split across Aave (30%) + GMX (40%) + Morpho (30%) on 3 chains → yield auto-compounded
```

### Pathfinding Algorithm

```
Input: sourceAsset, sourceChain, destinationChain, riskTolerance, timeHorizon

1. Build protocol graph:
   - Nodes: (asset, chain, protocol_state)
   - Edges: protocol actions with cost + yield metadata

2. Score each edge:
   score = (projected_yield * timeHorizon) - (gas_cost + bridge_fee + slippage)

3. Apply constraints:
   - Max hops: 8
   - Max bridge count: 3
   - Min liquidity per hop: $50k TVL
   - Risk filter: exclude protocols with active exploits

4. Run modified Dijkstra for max score path

5. Return top 3 routes with tradeoff summary
```

---

## Supported Chains & Protocols

### Chains (MVP)
- Ethereum Mainnet
- Base
- Arbitrum One
- BNB Chain
- Polygon

### Chains (Phase 2)
- Optimism
- Avalanche
- Solana
- Scroll
- zkSync Era

### Bridges
| Bridge | Supported Assets | Speed | Notes |
|---|---|---|---|
| Stargate | USDC, USDT, ETH | 2–5 min | Best for stablecoins |
| Across | ETH, USDC, WBTC | 1–3 min | Fast, intent-based |
| Wormhole | 20+ assets | 5–15 min | Widest asset support |
| Hop Protocol | ETH, stablecoins | 3–10 min | L2 specialist |

### DEXes
| DEX | Chain | Notes |
|---|---|---|
| Uniswap v3 | ETH, ARB, Base, Polygon | Best liquidity |
| Curve | ETH, ARB | Stablecoin swaps |
| Camelot | Arbitrum | ARB ecosystem |
| PancakeSwap | BNB Chain | BNB ecosystem |
| Aerodrome | Base | Base native |

### Lending
| Protocol | Chain | Notes |
|---|---|---|
| Aave v3 | ETH, ARB, Polygon, Base | Largest lending protocol |
| Compound v3 | ETH, ARB, Base | USDC-focused |
| Morpho | ETH, Base | Optimized rates |

### Yield
| Protocol | Chain | Notes |
|---|---|---|
| GMX | ARB, Avalanche | Perp LP yield |
| Pendle | ETH, ARB | Yield tokenization |
| Convex | ETH | Curve boosting |
| Kamino | Solana | Phase 2 |

---

## Security & Compliance

### Non-Custodial Design
Meridian never holds user funds. The router contracts are purely execution agents — funds flow through them atomically. At no point does Meridian have withdrawal authority.

### Destination Wallet Verification (Anti-Mixer Safeguard)
Every strategy requires the user to prove ownership of the destination wallet by signing a verification message. This is enforced at the smart contract level — strategies without a valid destination signature are rejected on-chain.

This design decision means:
- Meridian cannot be used to send funds to an unrelated third-party address
- It is a self-custody tool only — source and destination must be the same user
- This fundamentally distinguishes Meridian from a mixer or tumbler

### Full On-Chain Transparency
Every hop emits events. Every transaction is visible on the relevant chain explorer. Meridian provides a unified view but adds no opacity — the full execution path is always independently verifiable.

### Static Analysis (Slither) — Completed June 1, 2026
Ran Slither against `MeridianRouter.sol` (101 detectors, 19 contracts analyzed).

| Finding | Severity | Status |
|---------|----------|--------|
| CEI violation — fee transfer before state write | High | **Fixed** — state written before `_transferFee` |
| `reentrancy-eth` / `reentrancy-benign` in `executeStrategy` | Medium | **Suppressed** — `nonReentrant` + `approvedProtocols` allowlist; mid-loop state updates are intentional (per-step progress tracking for `emergencyExit`) |
| `arbitrary-send-eth` in `_transferFee` | Low | **Suppressed** — treasury is owner-controlled; intentional fee routing |
| `calls-loop` in adapter stubs | Low | **Suppressed** — inherent to multi-step execution; all calls gated by `approvedProtocols` |
| `unused-return` in `_verifyDestination` | Low | **Suppressed** — third `ECDSA.tryRecover` return value intentionally discarded |
| OZ library findings (pragma, assembly, too-many-digits) | Informational | Out of scope |

Result: 86 → 73 findings (13 suppressed). All 50 unit tests + 6 fork tests + 28 E2E tests + 17 protocol-verification tests pass.

### Mythril Symbolic Execution — Completed June 1, 2026
Ran Mythril v0.24.8 (`myth analyze`) with 120-second execution timeout against `MeridianRouter.sol`.

**Result: "The analysis was completed successfully. No issues were detected."**

Zero findings — no integer overflows, no exploitable reentrancy paths, no dangerous delegatecall, no unchecked ETH sends.

### Smart Contract Audits
Before mainnet launch, all router contracts must pass audits from at minimum two firms. Candidates: Trail of Bits, Spearbit, Sherlock, Code4rena contest.

**Audit package prepared** (`audit-package/`):
- `AUDIT-OVERVIEW.md` — contracts in scope, security properties, data structures, events, known suppressions, test coverage
- `ARCHITECTURE.md` — system flow, component map, trust model, state machine, fee flow
- `THREAT-MODEL.md` — 12 attack vectors with mitigations, out-of-scope risks

### Bug Bounty
Post-launch bug bounty program via Immunefi. Minimum $500k pool for critical vulnerabilities.

### Risk Disclosures
Meridian surfaces the following risks to users before every execution:
- Smart contract risk per protocol in the route
- Bridge risk (historical exploits flagged)
- Liquidation risk (for strategies involving lending)
- Slippage risk per swap step
- Overall composite risk score

---

## Tax & Audit Trail

Every strategy execution generates a complete, downloadable transaction record:

```
Meridian Execution Report
Strategy ID: 0xCF-2024-00847
Date: 2024-11-14 09:23:41 UTC
─────────────────────────────────────────────────────────
Step | Action        | Asset  | Amount   | Chain    | TX Hash
──────────────────────────────────────────────────────────
1    | Deposit       | ETH    | 2.5      | Ethereum | 0x123...
2    | Borrow        | USDC   | 4,200    | Ethereum | 0x456...
3    | Bridge        | USDC   | 4,200    | →Arbitrum| 0x789...
4    | Swap          | USDC   | 4,200→   | Arbitrum | 0xabc...
     |               | GLP    | 4,177    |          |
5    | Bridge yield  | USDC   | 310      | →Base    | 0xdef...
6    | Settle        | USDC   | 308.2    | Base     | 0xghi...
─────────────────────────────────────────────────────────
Net yield earned:    $308.20 USDC
Protocol fees paid:  $6.60
Gas paid:            $4.20
Bridge fees paid:    $1.80
─────────────────────────────────────────────────────────
Export: [CSV] [PDF] [JSON]
Compatible with: Koinly, CoinTracker, TaxBit, Coinpanda
```

---

## Monetization

### Revenue Streams

**1. Execution Fee (Primary)**
0.08% of total value routed. Taken at settlement step.
- $10M/month volume = $8,000/month
- $100M/month volume = $80,000/month
- $1B/month volume = $800,000/month

**2. Strategy Marketplace**
Strategy creators earn 0.02% of volume routed through their strategy. Meridian takes 0.03% from marketplace strategies (split with creator). Fee routing is fully on-chain: `MeridianRouter._transferFee()` splits the 5 bps fee and emits `FeeDistributed(strategyId, treasury, treasuryFee, creator, creatorFee)` per execution.

**3. Pro Subscription ($29/month)**
- Unlimited saved strategies
- Priority execution queue
- Advanced analytics and yield forecasting
- API access (up to 1,000 calls/month)
- Tax report generation

**4. Business/DAO API ($299–$2,999/month)**
- Programmatic strategy execution
- Webhook notifications
- Custom strategy composition
- Dedicated relayer priority
- SLA guarantees

**5. Strategy NFTs**
Top strategies minted as NFTs. NFT holder earns creator fee perpetually. Tradeable on secondary markets.

---

## Tech Stack

### Frontend
- Next.js 14 (App Router)
- TypeScript
- TailwindCSS
- Wagmi v2 + Viem (EVM wallet connection)
- Solana Wallet Adapter (Phase 2)
- Recharts (analytics)
- Zustand (state management)

### Backend
- Node.js + TypeScript
- Fastify (API framework)
- PostgreSQL (strategy storage, user data)
- Redis (quote caching, session management)
- Bull (job queue for relayer tasks)
- WebSocket (live execution tracking)

### Blockchain
- Solidity 0.8.x (router contracts)
- Hardhat + Foundry (testing)
- OpenZeppelin (security primitives)
- Ethers.js / Viem (contract interaction)

### Indexing & Data
- The Graph (on-chain event indexing)
- DeFiLlama API (TVL, APY data)
- Chainlink (price feeds)
- Pyth Network (high-frequency price data)

### Infrastructure
- Docker + docker-compose (staging stack: Postgres 16, Redis 7, Fastify backend)
- Vercel (frontend — `frontend/vercel.json` with CSP headers + API proxy rewrite)
- AWS (production backend hosting)
- Alchemy / QuickNode (RPC providers)
- Tenderly (contract simulation + monitoring)
- Datadog (observability)

### Testing
- Foundry (Solidity unit + fork tests — 50 unit, 6 fork)
- Playwright (E2E browser tests — 28 tests)
- Vitest (backend unit + integration tests)
- k6 (load + performance tests — `load-tests/`)

### Protocol SDKs Integrated
- Stargate SDK
- Wormhole Connect SDK
- Across Protocol SDK
- Aave v3 SDK
- Uniswap v3 SDK
- 1inch Fusion SDK

---

## Roadmap

### Phase 0 — Foundation (Month 1–2)
- [ ] Core architecture design finalized
- [ ] Smart contract router (Ethereum + Base)
- [ ] Strategy Engine v1 (manual route building)
- [ ] Basic frontend: deposit, route display, execute
- [ ] Integration: Aave, Uniswap, Stargate
- [ ] Testnet deployment

### Phase 1 — MVP (Month 3–4)
- [ ] Destination wallet verification flow
- [ ] Live quote engine
- [ ] Relayer network v1
- [ ] Live execution tracker
- [ ] 5 chains supported
- [ ] 10+ protocols integrated
- [ ] Audit (one firm)
- [ ] Mainnet soft launch (whitelist)

### Phase 2 — Growth (Month 5–7)
- [ ] Strategy Marketplace
- [ ] Auto-Optimizer (AI-assisted routing)
- [ ] Strategy Composer UI (drag & drop)
- [ ] Tax report export (CSV/PDF)
- [ ] Pro subscription tier
- [ ] Bug bounty launch
- [ ] Full public mainnet launch

### Phase 3 — Scale (Month 8–12)
- [ ] DAO/Business API
- [ ] Solana integration
- [ ] Strategy NFTs
- [ ] Mobile app
- [ ] Governance token (optional)
- [ ] L2 native deployments (zkSync, Scroll)

---

## Team Roles Needed

| Role | Responsibility |
|---|---|
| Solidity Engineer (x2) | Router contracts, protocol integrations, audits |
| Backend Engineer (x2) | Strategy engine, quote engine, relayer network |
| Frontend Engineer (x2) | UI, wallet integration, live tracker |
| DeFi Researcher (x1) | Protocol analysis, yield modeling, risk scoring |
| Smart Contract Auditor | Security review (can be contracted) |
| Product Designer (x1) | UX, Strategy Composer UI |
| DevOps Engineer (x1) | Infrastructure, RPC management, monitoring |

---

## License

MIT License — open source router contracts.
Strategy Marketplace and Pro features are proprietary.

---

## Disclaimer

Meridian is a non-custodial DeFi tool. It interacts with third-party protocols that carry smart contract, liquidity, and bridge risks. Meridian does not guarantee yields or the security of underlying protocols. Users are responsible for understanding the risks before executing strategies. This is not financial advice.

---

*Meridian — Every asset has a destination. We find the best path there.*
# Meridian — Build Progress Tracker

> Every asset has a destination. We find the best path there.
> Track every step, every check, every integration from zero to mainnet.

**Legend:** `[ ]` Not started · `[~]` In progress · `[x]` Done · `[!]` Blocked

---

## Table of Contents

1. [Phase 0 — Foundation](#phase-0--foundation-month-12)
2. [Phase 1 — MVP](#phase-1--mvp-month-34)
3. [Phase 2 — Growth](#phase-2--growth-month-57)
4. [Phase 3 — Scale](#phase-3--scale-month-812)
5. [Smart Contracts — Detailed](#smart-contracts--detailed)
6. [Backend Services — Detailed](#backend-services--detailed)
7. [Frontend — Detailed](#frontend--detailed)
8. [Protocol Integrations](#protocol-integrations)
9. [Security & Audits](#security--audits)
10. [Infrastructure & DevOps](#infrastructure--devops)
11. [Testing Checklist](#testing-checklist)
12. [Monetization Setup](#monetization-setup)
13. [Tax & Compliance](#tax--compliance)
14. [Team & Hiring](#team--hiring)

---

## Phase 0 — Foundation (Month 1–2)

### 0.1 Architecture & Design

- [x] Finalize system architecture diagram (Frontend → Backend → On-Chain)
- [x] Define API contract between Frontend ↔ Backend (REST + WebSocket spec)
- [x] Define on-chain interface: `IMeridianRouter` — all functions, events, structs
- [x] Define database schema: strategies, users, executions, quotes
- [x] Define Redis key schema: quote cache, session tokens, relayer jobs
- [x] Choose monorepo structure (`/contracts`, `/backend`, `/frontend`, `/sdk`)
- [x] Set up monorepo tooling (pnpm workspaces or turborepo)
- [x] Initialize Git repos, branch strategy (main / dev / feature/*)
- [x] Set up CI/CD pipeline (GitHub Actions) — lint, test, deploy gates
- [x] Write CONTRIBUTING.md and code style guides (ESLint, Prettier, Solhint)
- [x] Document all environment variables needed across all services

### 0.2 Smart Contracts — MVP Scope

- [x] Initialize Hardhat + Foundry dual setup in `/contracts`
- [x] Write `IMeridianRouter` interface in Solidity 0.8.x
- [x] Implement `MeridianRouter.sol` — Ethereum deployment
  - [x] `executeStrategy(Strategy calldata)` entry point
  - [x] `continueStrategy(bytes32 strategyId, uint256 stepIndex)` — relayer callback
  - [x] `emergencyExit(bytes32 strategyId)` — always returns to source wallet
  - [x] `verifyDestination(address, bytes calldata)` — ECDSA signature check
  - [x] Reentrancy guard on all external calls (OpenZeppelin `ReentrancyGuard`)
  - [x] Strategy deadline enforcement (auto-revert if expired)
  - [x] Slippage protection: `minOutput` enforced per swap step
  - [x] No admin withdrawal functions (verify in code review)
  - [x] Events: `StrategyStarted`, `StepExecuted`, `StrategyCompleted`, `StrategyFailed`
- [ ] Deploy `MeridianRouter.sol` to Ethereum testnet (Sepolia)
- [ ] Deploy `MeridianRouter.sol` to Base testnet (Base Sepolia)
- [x] Write `MeridianStrategyRegistry.sol` (on-chain strategy storage)
  - [x] `registerStrategy(bytes calldata strategyData)` — returns strategyId
  - [x] `getStrategy(bytes32 strategyId)` — read-only
  - [x] `deprecateStrategy(bytes32 strategyId)` — creator-only
- [x] Write `MeridianVault.sol` (optional yield compounding)
  - [x] ERC-4626 compliant vault interface
  - [x] Deposit / withdraw functions
  - [x] Yield compounding logic
  - [x] Access control: only Router can call `compound()`

### 0.3 Strategy Engine v1

- [x] Set up Node.js + TypeScript backend project with Fastify
- [x] Design protocol graph data structure: nodes = (asset, chain, protocol), edges = actions
- [x] Implement `buildGraph()` — constructs the full protocol graph from config
- [x] Implement edge weight scoring:
  - `score = (projected_yield × timeHorizon) − (gas_cost + bridge_fee + slippage)`
- [x] Implement `runDijkstra(source, destination, constraints)` — modified for max score
- [x] Apply constraints in pathfinder:
  - [x] Max hops: 8
  - [x] Max bridge count: 3
  - [x] Min liquidity per hop: $50k TVL
  - [x] Risk filter: exclude protocols with active exploits flag
- [x] Return top 3 routes with tradeoff summary
- [x] Unit tests for all pathfinding logic

### 0.4 Basic Frontend

- [x] Initialize Next.js 14 (App Router) + TypeScript project
- [x] Set up TailwindCSS
- [x] Set up Wagmi v2 + Viem for EVM wallet connection
- [x] Implement wallet connect modal (MetaMask, Rabby, WalletConnect, Coinbase Wallet)
- [x] Implement asset detection: read balances across all supported chains
- [x] Implement basic deposit form: select asset, enter amount
- [x] Implement route display: show selected strategy steps
- [x] Implement execute button: send `executeStrategy` transaction
- [x] Implement basic transaction status page (polling TX hash)

### 0.5 Initial Protocol Integrations (Phase 0 set)

- [x] **Aave v3** — lending deposit/borrow via Aave v3 SDK (Ethereum)
- [x] **Uniswap v3** — swap via Uniswap v3 SDK (Ethereum, Arbitrum, Base, Polygon)
- [x] **Stargate** — bridge USDC/USDT/ETH via Stargate SDK

### 0.6 Testnet Deployment

- [ ] Deploy all contracts to Sepolia (Ethereum testnet)
- [ ] Deploy all contracts to Base Sepolia
- [ ] Deploy backend API to staging environment
- [ ] Deploy frontend to Vercel (staging URL)
- [ ] End-to-end test: full strategy execution on testnet
- [ ] Verify all events emitted correctly on-chain
- [ ] Verify emergency exit works correctly on testnet

---

## Phase 1 — MVP (Month 3–4)

### 1.1 Destination Wallet Verification Flow

- [ ] Implement `verifyDestination()` in smart contract (ECDSA + EIP-191)
- [ ] Implement verification message standard:
  `"Meridian destination verification\nI confirm this wallet is mine: {address}"`
- [ ] Implement frontend flow: prompt user to sign with destination wallet
- [ ] Implement backend validation: verify signature before submitting strategy
- [ ] Enforce on-chain: reject `executeStrategy` calls without valid signature
- [ ] Test: attempt to use unowned destination address → must revert on-chain
- [ ] Test: valid signature → strategy proceeds normally
- [ ] Test: signature replay protection (include chain ID + nonce if needed)

### 1.2 Live Quote Engine

- [ ] Set up Redis for quote caching (TTL: 60 seconds)
- [ ] Poll bridge quotes every 15 seconds:
  - [ ] Stargate SDK — bridge quotes (USDC, USDT, ETH)
  - [ ] Across Protocol SDK — bridge quotes (ETH, USDC, WBTC)
  - [ ] Wormhole SDK — bridge quotes (20+ assets)
- [ ] Poll swap quotes every 15 seconds:
  - [ ] 1inch Fusion SDK
  - [ ] Paraswap API
  - [ ] 0x Protocol API
- [ ] Poll lending APY every 15 seconds:
  - [ ] Aave subgraph (The Graph) — live APY per asset per chain
  - [ ] Compound v3 API — live APY
  - [ ] Morpho API — live APY
- [ ] Quote invalidation: mark quote stale after 60 seconds, refresh on next poll
- [ ] API endpoint: `GET /quotes?from=ETH&to=USDC&chain=1&amount=2.5`
- [ ] Error handling: fallback to last known quote if API is down (with staleness flag)
- [ ] Unit tests: quote cache set/get/expire logic
- [ ] Integration tests: live API calls return valid structure

### 1.3 Relayer Network v1

- [ ] Set up Bull job queue (Redis-backed) for relayer tasks
- [ ] Implement `RelayerManager` service:
  - [ ] Job: `monitorBridgeConfirmation(strategyId, bridgeTxHash, chain)`
  - [ ] Job: `callContinueStrategy(strategyId, stepIndex)` after confirmation
  - [ ] Retry logic: exponential backoff, max 5 retries
  - [ ] Fallback route: if bridge fails, attempt alternate bridge
  - [ ] Job: `notifyFrontend(strategyId, status)` via WebSocket
- [ ] Set up event listeners per chain (via Alchemy/QuickNode WebSocket):
  - [ ] Listen for `StrategyStarted` events
  - [ ] Listen for `StepExecuted` events
  - [ ] Listen for bridge destination events (Stargate, Across, Wormhole)
  - [ ] Listen for `StrategyCompleted` events
  - [ ] Listen for `StrategyFailed` events
- [ ] Relayer wallet management:
  - [ ] Fund relayer wallets on each supported chain
  - [ ] Monitor relayer wallet balances (alert if low)
  - [ ] Secure key management (AWS KMS or HashiCorp Vault)

### 1.4 Live Execution Tracker

- [ ] WebSocket server: broadcast status updates per `strategyId`
- [ ] Frontend: subscribe to WebSocket on strategy submission
- [ ] Frontend: render live tracker UI:
  - [ ] Step list with status icons (✅ done, 🔄 in progress, ⬜ pending)
  - [ ] Per-step TX hash with block explorer link
  - [ ] ETA countdown for bridge steps
  - [ ] Total elapsed time
  - [ ] Total remaining steps
- [ ] Handle disconnect/reconnect: resume tracking from last known state
- [ ] Handle strategy failure: show failed step, reason, and emergency exit button

### 1.5 Multi-Chain Support (5 Chains)

- [ ] **Ethereum Mainnet** — Router deployed, all Phase 0 integrations live
- [ ] **Base** — Router deployed, Uniswap v3 + Aave v3 + Stargate integrated
- [ ] **Arbitrum One** — Router deployed, GMX + Uniswap v3 + Aave v3 integrated
- [ ] **BNB Chain** — Router deployed, PancakeSwap integrated
- [ ] **Polygon** — Router deployed, Uniswap v3 + Aave v3 integrated
- [ ] Multi-chain RPC management: Alchemy + QuickNode fallback per chain
- [ ] Gas estimation: accurate per-chain gas price polling

### 1.6 10+ Protocol Integrations

- [ ] Stargate (bridge) ✓ Phase 0
- [ ] Across Protocol (bridge)
- [ ] Wormhole (bridge)
- [ ] Hop Protocol (bridge)
- [ ] Uniswap v3 (DEX) ✓ Phase 0
- [ ] Curve (DEX — stablecoin swaps)
- [ ] Aave v3 (lending) ✓ Phase 0
- [ ] Compound v3 (lending)
- [ ] Morpho (lending)
- [ ] GMX (yield — perp LP)

### 1.7 Simulation Engine

- [ ] Implement pre-execution simulation (Tenderly API):
  - [ ] Simulate every step of the strategy before signing
  - [ ] Return: estimated APY, total gas, bridge fees, protocol fees
  - [ ] Return: risk scores (slippage, liquidation, smart contract)
  - [ ] Flag active exploit alerts on any protocol in route
- [ ] Frontend: render full simulation results before user signs
- [ ] Frontend: render risk disclosure modal with composite risk score
- [ ] Frontend: show "⚠️ You are interacting with 3rd party DeFi protocols" warning

### 1.8 Security Audit (Firm 1)

- [ ] Select audit firm (Trail of Bits / Spearbit / Sherlock)
- [ ] Prepare audit package: all contracts + natspec docs + architecture overview
- [ ] Submit contracts for audit
- [ ] Receive audit report
- [ ] Fix all Critical and High severity findings
- [ ] Fix all Medium severity findings (or formally accept with rationale)
- [ ] Re-audit any modified contracts (fixes review)
- [ ] Publish audit report publicly

### 1.9 Mainnet Soft Launch (Whitelist)

- [ ] Deploy all contracts to Ethereum mainnet
- [ ] Deploy all contracts to Base mainnet
- [ ] Deploy all contracts to Arbitrum mainnet
- [ ] Deploy all contracts to BNB Chain mainnet
- [ ] Deploy all contracts to Polygon mainnet
- [ ] Set up multisig for any admin/upgrade functions
- [ ] Set TVL cap for whitelist phase (e.g. $500k total)
- [ ] Whitelist 50–200 beta users
- [ ] Monitor: Datadog dashboards live for all services
- [ ] Monitor: Tenderly alerts for any unexpected contract behavior
- [ ] On-call rotation established for first 30 days post-launch

---

## Phase 2 — Growth (Month 5–7)

### 2.1 Strategy Marketplace

- [ ] Design Strategy Marketplace schema (creator, strategy, performance, votes)
- [ ] API: `POST /strategies` — publish strategy (with on-chain registry call)
- [ ] API: `GET /strategies?sort=yield&filter=risk` — browse marketplace
- [ ] API: `GET /strategies/:id/performance` — historical performance
- [ ] Frontend: Marketplace browse page with filters (chain, protocol, yield, risk)
- [ ] Frontend: Strategy detail page (steps, APY history, creator info, fee)
- [ ] Frontend: "Copy Strategy" button — one-click replication
- [ ] Creator fee routing: 0.02% to creator, 0.03% to Meridian treasury
- [ ] Strategy versioning: deprecation flow when a strategy becomes suboptimal
- [ ] Curation: flag strategies that use deprecated/exploited protocols
- [ ] Strategy NFT hooks (Phase 3 prerequisite): store creator address on-chain

### 2.2 Auto-Optimizer

- [ ] Implement AI-assisted routing layer on top of Strategy Engine
- [ ] Input: user asset, destination chain, risk tolerance (1–5), time horizon
- [ ] Auto-select best route from top 3 Dijkstra results using APY + risk model
- [ ] Integrate live DeFiLlama APY data for yield benchmarking
- [ ] Integrate Chainlink + Pyth price feeds for slippage estimation
- [ ] API: `POST /optimize` — returns best strategy without user needing to choose
- [ ] Frontend: "Auto Mode" toggle on strategy selection screen
- [ ] Re-optimization check: if quote expires mid-execution, re-run optimizer

### 2.3 Strategy Composer UI

- [ ] Design drag-and-drop node-based UI (similar to React Flow)
- [ ] Node types: Swap, Lend, Bridge, Stake, Settle
- [ ] Connector: validate compatible asset types between connected nodes
- [ ] Live preview: show estimated APY + gas as user builds
- [ ] Export: serialize composed strategy to `Strategy` struct format
- [ ] Save: store custom strategy to user's account + optionally publish to Marketplace
- [ ] Template library: pre-built templates users can customize

### 2.4 Tax Report Export

- [ ] For each strategy execution, record:
  - [ ] Step number, action type, asset in, amount in, asset out, amount out
  - [ ] Chain, TX hash, timestamp, gas paid, protocol fee paid
- [ ] Generate CSV export: per-hop format compatible with Koinly, CoinTracker, TaxBit, Coinpanda
- [ ] Generate PDF export: formatted execution report
- [ ] Generate JSON export: raw data for custom tax tooling
- [ ] API: `GET /executions/:id/report?format=csv|pdf|json`
- [ ] Frontend: download buttons on completed execution page
- [ ] Test: import CSV into Koinly and verify correct cost basis calculation

### 2.5 Pro Subscription Tier

- [ ] Set up Stripe (or crypto payment via Request Finance / Coinbase Commerce)
- [ ] Pro plan: $29/month
  - [ ] Unlimited saved strategies
  - [ ] Priority execution queue (dedicated relayer)
  - [ ] Advanced analytics: yield forecasting, historical performance
  - [ ] API access: 1,000 calls/month (rate-limited by API key)
  - [ ] Tax report generation (CSV + PDF)
- [ ] Auth system: JWT sessions, user accounts (email or wallet-based)
- [ ] Subscription management: upgrade, downgrade, cancel, billing history
- [ ] Rate limiting middleware: enforce API call limits per tier

### 2.6 Bug Bounty Launch

- [ ] Register on Immunefi
- [ ] Fund bug bounty pool: minimum $500k for critical vulnerabilities
- [ ] Define scope: all deployed router contracts, backend API, frontend
- [ ] Define severity tiers and rewards:
  - Critical: up to $500k
  - High: $50k–$100k
  - Medium: $10k–$50k
  - Low: $1k–$10k
- [ ] Publish bug bounty page with all contract addresses and audit reports
- [ ] Set up triage process: security team reviews reports within 48h

### 2.7 Second Security Audit

- [ ] Select second audit firm (different from Firm 1)
- [ ] Include any new contracts added since Phase 1 (Vault, Registry, updated Router)
- [ ] Fix all findings
- [ ] Publish second audit report

### 2.8 Full Public Mainnet Launch

- [ ] Remove TVL cap
- [ ] Remove whitelist
- [ ] Submit to DeFiLlama for TVL tracking
- [ ] Submit to DefiPulse / DappRadar
- [ ] Marketing: Twitter/X announcement, blog post, Discord launch
- [ ] PR outreach: The Block, DeFi Planet, Bankless
- [ ] Analytics: Dune dashboard for on-chain volume, TVL, unique users

---

## Phase 3 — Scale (Month 8–12)

### 3.1 DAO/Business API

- [ ] Business API: $299–$2,999/month tiers
- [ ] Programmatic strategy execution via REST API + API keys
- [ ] Webhook notifications: POST to user endpoint on `StrategyStarted`, `StepExecuted`, `StrategyCompleted`, `StrategyFailed`
- [ ] Custom strategy composition via API (no UI required)
- [ ] Dedicated relayer priority: separate relayer pool for API clients
- [ ] SLA guarantees: 99.9% uptime, <2s quote response
- [ ] Usage dashboard: calls used, volume routed, fees paid

### 3.2 Solana Integration

- [ ] Integrate Solana Wallet Adapter in frontend
- [ ] Integrate Wormhole for Solana ↔ EVM bridging
- [ ] Integrate Kamino (Solana yield protocol)
- [ ] Deploy Solana program (Rust/Anchor) for Solana-side execution
- [ ] Test cross-chain flow: Solana → EVM and EVM → Solana

### 3.3 Strategy NFTs

- [ ] Design Strategy NFT ERC-721 contract
- [ ] Mint NFT when creator publishes to Marketplace
- [ ] NFT metadata: strategy name, performance stats, creator address
- [ ] On-chain royalty: ERC-2981 — NFT holder receives creator fee (0.02%)
- [ ] Secondary market: list on OpenSea / Blur
- [ ] Transfer: when NFT is sold, creator fee route updates to new holder

### 3.4 Mobile App

- [ ] Decide: React Native or native iOS/Android
- [ ] Core features: portfolio view, strategy execution, live tracker
- [ ] WalletConnect v2 for mobile wallet connections
- [ ] Push notifications: execution status updates
- [ ] App Store + Google Play submission

### 3.5 L2 Native Deployments

- [ ] **Optimism** — Router deployed + integrated
- [ ] **Avalanche** — Router deployed + GMX (AVAX) integrated
- [ ] **Scroll** — Router deployed
- [ ] **zkSync Era** — Router deployed (ensure Solidity 0.8.x EVM compatibility)
- [ ] Per-chain: verify all integrations work with chain-specific quirks (gas tokens, bridge finality times)

### 3.6 Governance Token (Optional)

- [ ] Design tokenomics: supply, distribution, vesting
- [ ] Use cases: fee sharing, strategy curation voting, protocol upgrades
- [ ] ERC-20 token contract (if proceeding)
- [ ] Governance contract (OpenZeppelin Governor or custom)
- [ ] Legal review: token classification in relevant jurisdictions

---

## Smart Contracts — Detailed

### MeridianRouter.sol

- [ ] **Structs**
  - [ ] `Strategy`: sourceAsset, sourceAmount, steps[], destinationWallet, destinationSignature, deadline
  - [ ] `Step`: stepType (SWAP|LEND|BRIDGE|STAKE|SETTLE), protocol, params, minOutput
- [ ] **Functions**
  - [ ] `executeStrategy(Strategy calldata)` — main entry point, `payable`
  - [ ] `continueStrategy(bytes32 strategyId, uint256 stepIndex)` — relayer only
  - [ ] `emergencyExit(bytes32 strategyId)` — callable by original depositor only
  - [ ] `verifyDestination(address, bytes calldata)` — internal, pure
- [ ] **Events**
  - [ ] `StrategyStarted(bytes32 indexed strategyId, address indexed user, uint256 amount)`
  - [ ] `StepExecuted(bytes32 indexed strategyId, uint256 stepIndex, StepType stepType)`
  - [ ] `StrategyCompleted(bytes32 indexed strategyId, address destination, uint256 finalAmount)`
  - [ ] `StrategyFailed(bytes32 indexed strategyId, uint256 failedStep, string reason)`
- [ ] **Security checks**
  - [ ] `nonReentrant` on `executeStrategy`, `continueStrategy`, `emergencyExit`
  - [ ] `deadline` check: `require(block.timestamp <= strategy.deadline)`
  - [ ] `minOutput` check per swap step: revert if slippage exceeded
  - [ ] No `selfdestruct`, no `delegatecall` to untrusted contracts
  - [ ] `onlyRelayer` modifier on `continueStrategy`
  - [ ] Zero-address checks on `destinationWallet`
  - [ ] Signature replay protection: include `strategyId` + `block.chainid` in signed message
- [ ] **Deployment**
  - [ ] Ethereum Sepolia (testnet)
  - [ ] Base Sepolia (testnet)
  - [ ] Ethereum Mainnet
  - [ ] Base Mainnet
  - [ ] Arbitrum Mainnet
  - [ ] BNB Chain Mainnet
  - [ ] Polygon Mainnet

### MeridianStrategyRegistry.sol

- [ ] `registerStrategy(bytes calldata)` → returns `bytes32 strategyId`
- [ ] `getStrategy(bytes32)` → returns strategy data
- [ ] `deprecateStrategy(bytes32)` → creator only, emits `StrategyDeprecated`
- [ ] Store: creator address, creation timestamp, version, IPFS hash of full strategy data
- [ ] Access control: only Router can mark strategy as "executed" (usage counter)

### MeridianVault.sol

- [ ] ERC-4626 compliant (standard vault interface)
- [ ] `deposit(uint256 assets, address receiver)` → mints vault shares
- [ ] `withdraw(uint256 assets, address receiver, address owner)` → burns shares
- [ ] `compound()` → callable only by Router — re-invests yield
- [ ] No admin withdrawal function
- [ ] Supported underlying assets: ETH, USDC, USDT (phase 1)

### Contract Security Properties (verify all before mainnet)

- [ ] No admin can withdraw user funds
- [ ] Emergency exit always routes to **source** wallet, never anywhere else
- [ ] All external calls protected by reentrancy guards
- [ ] Strategy deadline auto-reverts expired strategies
- [ ] Slippage `minOutput` enforced per swap
- [ ] Destination signature is verified on-chain (not just off-chain)
- [ ] No hidden fees beyond declared 0.08%
- [ ] Contracts verified on Etherscan / block explorers per chain

---

## Backend Services — Detailed

### Strategy Engine

- [ ] **Graph construction**
  - [ ] Node: `(asset, chain, protocol_state)` — e.g., `(ETH, Ethereum, Aave_deposit)`
  - [ ] Edge: protocol action with metadata — `{type, cost_gas, cost_fee, yield_apy, risk_score}`
  - [ ] Graph updated in real-time as quotes refresh
- [ ] **Dijkstra implementation**
  - [ ] Priority queue: max-score path (not min-cost)
  - [ ] Score function: `(projected_yield × timeHorizon) − (gas + bridge_fee + slippage)`
  - [ ] Constraint enforcement: max hops 8, max bridges 3, min TVL $50k
  - [ ] Risk filter: skip edges touching flagged protocols (exploit feed)
  - [ ] Return top 3 paths with score breakdown
- [ ] **Exploit feed**
  - [ ] Subscribe to DeFi threat intelligence (DefiLlama hacks, Rekt.news RSS)
  - [ ] Auto-flag protocols with active exploits
  - [ ] Manual override: admin can flag/unflag protocols
- [ ] **API endpoints**
  - [ ] `POST /strategy/optimize` — input: asset, amount, source chain, destination chain, risk, timeHorizon
  - [ ] `GET /strategy/:id` — get strategy details
  - [ ] `POST /strategy/simulate` — Tenderly simulation of strategy

### Quote Engine

- [ ] **Bridge quote aggregation** (poll every 15s, cache 60s TTL)
  - [ ] Stargate: `GET /quote?srcChain=1&dstChain=42161&srcToken=USDC&amount=4200`
  - [ ] Across: SDK `getSuggestedFees()`
  - [ ] Wormhole: SDK `getTransferDetails()`
  - [ ] Hop Protocol: API `/quote`
- [ ] **Swap quote aggregation** (poll every 15s)
  - [ ] 1inch Fusion: `/v5.2/1/quote`
  - [ ] Paraswap: `/prices`
  - [ ] 0x: `/swap/v1/quote`
  - [ ] Best-of: return lowest-fee quote across all sources
- [ ] **APY data** (poll every 15s)
  - [ ] Aave subgraph: `reservesData { liquidityRate }` → convert to APY
  - [ ] Compound v3 API: `getAPYs()`
  - [ ] Morpho: on-chain `supplyAPY()`
  - [ ] GMX: GLP APR endpoint
  - [ ] Pendle: PT/YT APY endpoints
  - [ ] DeFiLlama `GET /yields/pools` — backup source for all APYs
- [ ] **Staleness handling**
  - [ ] Return `{quote, timestamp, isStale: bool}` in all quote responses
  - [ ] Frontend: warn user if executing with stale quote (>60s)
- [ ] **API endpoints**
  - [ ] `GET /quotes/bridge?from=1&to=42161&asset=USDC&amount=4200`
  - [ ] `GET /quotes/swap?chain=1&from=ETH&to=USDC&amount=2.5`
  - [ ] `GET /quotes/apy?protocol=aave&asset=USDC&chain=1`

### Relayer Manager

- [ ] **Job types** (Bull queue)
  - [ ] `MonitorBridge` — poll for bridge confirmation on destination chain
  - [ ] `ContinueStrategy` — call `continueStrategy()` on Router after bridge confirms
  - [ ] `RetryStep` — retry failed step with exponential backoff (max 5 retries)
  - [ ] `FallbackRoute` — if primary bridge fails, find and use alternate bridge
  - [ ] `NotifyFrontend` — push WebSocket update to user
  - [ ] `EmergencyExit` — trigger emergency exit if unrecoverable failure
- [ ] **Chain listeners** (per chain, WebSocket)
  - [ ] Ethereum: Alchemy WebSocket
  - [ ] Base: Alchemy WebSocket
  - [ ] Arbitrum: Alchemy WebSocket
  - [ ] BNB Chain: QuickNode WebSocket
  - [ ] Polygon: Alchemy WebSocket
- [ ] **Relayer wallets**
  - [ ] Separate funded wallet per chain
  - [ ] Balance monitoring: alert if balance < 0.05 ETH equivalent
  - [ ] Key storage: AWS KMS (never plaintext in environment)
  - [ ] Nonce management: prevent nonce collision on concurrent transactions
- [ ] **Failure handling**
  - [ ] All failures emit `StrategyFailed` event on-chain
  - [ ] All failures trigger `EmergencyExit` if funds are stuck
  - [ ] All failures notify user via WebSocket + email (if registered)

### Backend API (Fastify)

- [ ] **Auth**
  - [ ] Wallet-based auth: sign message → JWT issued
  - [ ] Email/password auth (optional for Pro tier)
  - [ ] JWT refresh tokens
  - [ ] Rate limiting: per IP, per API key
- [ ] **Endpoints — Core**
  - [ ] `POST /auth/wallet` — wallet sign-in
  - [ ] `POST /strategy/execute` — submit strategy for execution
  - [ ] `GET /strategy/:id/status` — current execution status
  - [ ] `GET /strategy/:id/report` — tax/audit report
  - [ ] `GET /user/executions` — all past executions for user
  - [ ] `GET /user/portfolio` — asset balances across chains
- [ ] **Endpoints — Marketplace**
  - [ ] `POST /marketplace/publish` — publish strategy
  - [ ] `GET /marketplace` — browse strategies (paginated, filterable)
  - [ ] `GET /marketplace/:id` — strategy detail + performance
  - [ ] `POST /marketplace/:id/copy` — copy strategy to user account
- [ ] **Endpoints — Subscriptions**
  - [ ] `POST /subscription/upgrade` — upgrade to Pro/Business
  - [ ] `GET /subscription/status` — current tier, usage
  - [ ] `POST /subscription/cancel`
- [ ] **Database (PostgreSQL)**
  - [ ] Table: `users` — id, wallet_address, email, tier, created_at
  - [ ] Table: `strategies` — id, creator_id, name, steps_json, chain_ids, published
  - [ ] Table: `executions` — id, user_id, strategy_id, status, started_at, completed_at
  - [ ] Table: `execution_steps` — id, execution_id, step_index, type, tx_hash, chain, amount_in, amount_out, fee, timestamp
  - [ ] Table: `quotes_cache` — (managed via Redis, Postgres as audit log)
  - [ ] Table: `subscriptions` — user_id, tier, stripe_customer_id, active_until
  - [ ] Migrations: all schema changes via versioned migration files

---

## Frontend — Detailed

### Wallet & Connection

- [ ] MetaMask integration (Wagmi)
- [ ] Rabby Wallet integration
- [ ] WalletConnect v2 integration
- [ ] Coinbase Wallet integration
- [ ] Phantom (Solana — Phase 2)
- [ ] Multi-chain asset detection: read ERC-20 balances across all supported chains
- [ ] Display: wallet address truncated, balance summary, network indicator
- [ ] Disconnect flow: clear session, return to landing page

### Strategy Selection Flow

- [ ] **Step 1 — Source Wallet**: auto-detect assets on connect
- [ ] **Step 2 — Select Asset**: dropdown with detected assets + amounts
- [ ] **Step 3 — Destination Wallet Verification**:
  - [ ] Input field for destination wallet address
  - [ ] "Sign Verification" button: prompts destination wallet to sign
  - [ ] Status indicator: ✅ Verified / ❌ Not verified
  - [ ] Cannot proceed without verified destination
- [ ] **Step 4 — Strategy Selection**:
  - [ ] Tab: Browse Marketplace
  - [ ] Tab: Build Custom (Strategy Composer)
  - [ ] Tab: Auto-Optimizer (one-click best route)
- [ ] **Step 5 — Simulation Review**:
  - [ ] Show full strategy steps with estimated outputs
  - [ ] Show: Estimated APY, Total gas, Bridge fees, Protocol fees
  - [ ] Show: Slippage risk, Liquidation risk, Smart contract risk, Composite risk score
  - [ ] Show: Estimated time to completion
  - [ ] Risk disclosure modal before proceeding
- [ ] **Step 6 — Sign & Execute**:
  - [ ] EIP-712 typed data signature (meta-transaction if supported)
  - [ ] Fallback: standard transaction
  - [ ] Spinner during TX submission
  - [ ] Redirect to live tracker on success
- [ ] **Step 7 — Live Tracker**:
  - [ ] WebSocket-powered real-time status
  - [ ] Step list with ✅/🔄/⬜ status
  - [ ] Per-step TX hash → block explorer link
  - [ ] ETA for bridge steps
  - [ ] Emergency Exit button (if strategy is stuck)
- [ ] **Step 8 — Settlement & Report**:
  - [ ] Confirmation: "X USDC received at 0xABC...DEF"
  - [ ] Download buttons: [CSV] [PDF] [JSON]
  - [ ] Share: Twitter card with strategy performance
  - [ ] CTA: "Run another strategy"

### Strategy Composer UI

- [ ] React Flow (or custom canvas) for drag-and-drop node editor
- [ ] Node palette: Swap, Lend, Bridge, Stake, Settle
- [ ] Connection validation: asset type compatibility between nodes
- [ ] Live APY preview as nodes are connected
- [ ] Save/load strategy from user account
- [ ] Publish to Marketplace flow

### Analytics & Portfolio

- [ ] Portfolio overview: assets across all chains (Recharts pie chart)
- [ ] Execution history: past strategies, performance, P&L
- [ ] Yield earned over time: area chart
- [ ] Fees paid breakdown

### State Management (Zustand)

- [ ] Stores: `walletStore`, `strategyStore`, `executionStore`, `quoteStore`, `userStore`
- [ ] Persistence: strategy drafts persisted to localStorage

---

## Protocol Integrations

### Bridges

| Bridge | SDK/API | Assets | Chains | Status |
|---|---|---|---|---|
| Stargate | Stargate SDK | USDC, USDT, ETH | ETH, ARB, BASE, BNB, POLY | `[ ]` |
| Across | Across SDK | ETH, USDC, WBTC | ETH, ARB, BASE, POLY | `[ ]` |
| Wormhole | Wormhole Connect SDK | 20+ | All chains | `[ ]` |
| Hop Protocol | Hop SDK / API | ETH, stablecoins | ETH, ARB, BASE, POLY, OPT | `[ ]` |

**Per bridge, verify:**
- [ ] Quote API returns accurate fee estimates
- [ ] Transaction status polling works (detect confirmation on destination chain)
- [ ] Failure handling: what happens if bridge TX gets stuck
- [ ] Asset limits: min/max transfer amounts
- [ ] Actual on-chain integration test (testnet)

### DEXes

| DEX | Chain(s) | SDK/API | Status |
|---|---|---|---|
| Uniswap v3 | ETH, ARB, BASE, POLY | Uniswap v3 SDK | `[ ]` |
| Curve | ETH, ARB | Curve API / vyper | `[ ]` |
| Camelot | Arbitrum | Camelot SDK | `[ ]` |
| PancakeSwap | BNB Chain | PancakeSwap SDK | `[ ]` |
| Aerodrome | Base | Aerodrome SDK | `[ ]` |

**Per DEX, verify:**
- [ ] Swap quote accurate (compare to UI)
- [ ] `minOutput` slippage protection enforced in contract call
- [ ] Liquidity check: minimum $50k TVL on pool before routing through
- [ ] Actual testnet swap test

### Lending Protocols

| Protocol | Chain(s) | SDK/API | Status |
|---|---|---|---|
| Aave v3 | ETH, ARB, BASE, POLY | Aave v3 SDK | `[ ]` |
| Compound v3 | ETH, ARB, BASE | Compound API | `[ ]` |
| Morpho | ETH, BASE | Morpho SDK | `[ ]` |

**Per protocol, verify:**
- [ ] Deposit and receive receipt token (aToken, cToken)
- [ ] Borrow against collateral at correct LTV
- [ ] Liquidation risk correct at 60% LTV (as shown in example strategy)
- [ ] APY data matches on-chain rate
- [ ] Testnet integration test

### Yield Protocols

| Protocol | Chain(s) | SDK/API | Status |
|---|---|---|---|
| GMX | ARB, Avalanche | GMX SDK | `[ ]` |
| Pendle | ETH, ARB | Pendle SDK | `[ ]` |
| Convex | ETH | Convex API | `[ ]` |
| Kamino | Solana | Kamino SDK (Phase 2) | `[ ]` |

**Per protocol, verify:**
- [ ] Deposit and stake correctly
- [ ] Yield accrual correct and measurable
- [ ] Withdrawal path exists (can unwind position)
- [ ] Testnet integration test

### Quote Aggregators

- [ ] 1inch Fusion SDK — `[ ]`
- [ ] Paraswap API — `[ ]`
- [ ] 0x Protocol API — `[ ]`
- [ ] For each: verify quote accuracy, rate limits, error handling

### Price Feeds & Data

- [ ] Chainlink price feeds (on-chain, per chain) — `[ ]`
- [ ] Pyth Network (high-frequency, on-chain) — `[ ]`
- [ ] The Graph (on-chain event indexing) — `[ ]`
  - [ ] Deploy subgraph for `MeridianRouter` events
  - [ ] Index: all `StrategyStarted`, `StepExecuted`, `StrategyCompleted`, `StrategyFailed`
- [ ] DeFiLlama API (TVL, APY data) — `[ ]`

---

## Security & Audits

### Pre-Audit Checklist

- [ ] All contracts use Solidity 0.8.x (built-in overflow protection)
- [ ] All contracts use OpenZeppelin primitives (ReentrancyGuard, ECDSA, Ownable2Step)
- [ ] No `tx.origin` for authentication
- [ ] No unchecked math outside explicit `unchecked {}` blocks with clear rationale
- [ ] All return values from external calls are checked
- [ ] No centralized admin functions that can move user funds
- [ ] `emergencyExit` only routes to source wallet — verified in tests
- [ ] All events emitted for all state changes (full audit trail)
- [ ] NatSpec documentation on all public functions
- [ ] Static analysis: run Slither and fix all warnings
- [ ] Static analysis: run Mythril and fix all findings

### Audit Process

- [ ] **Audit Firm 1** (Phase 1)
  - [ ] Firm selected: _______________
  - [ ] Audit package submitted
  - [ ] Audit report received
  - [ ] All Critical/High findings fixed
  - [ ] All Medium findings addressed
  - [ ] Audit report published
- [ ] **Audit Firm 2** (Phase 2)
  - [ ] Firm selected: _______________
  - [ ] All new contracts included
  - [ ] Report received and all findings fixed
  - [ ] Report published

### Destination Verification Security

- [ ] Verified: signature includes `block.chainid` (cross-chain replay protection)
- [ ] Verified: signature includes `strategyId` (strategy-level replay protection)
- [ ] Verified: `verifyDestination()` is called on every `executeStrategy()` — cannot be bypassed
- [ ] Verified: `emergencyExit` still works even when destination verification fails
- [ ] Tested: sending to unowned address → contract reverts

### Bug Bounty

- [ ] Immunefi registration complete
- [ ] $500k critical pool funded
- [ ] Scope documented (all contract addresses, backend API, frontend)
- [ ] Severity tiers and payout amounts published
- [ ] Triage SLA: 48h first response, 7 days resolution
- [ ] Historical bug reports reviewed and resolved (post-launch)

### Ongoing Security

- [ ] Tenderly monitoring: alerts on unexpected contract calls
- [ ] DeFi exploit monitoring: auto-flag protocols in quote engine if exploited
- [ ] Relayer wallet monitoring: alert on unusual transaction patterns
- [ ] Datadog anomaly detection: alert on spike in failed executions
- [ ] Monthly internal security review

---

## Infrastructure & DevOps

### RPC & Node Providers

- [ ] Alchemy account set up — API keys per chain
- [ ] QuickNode account set up — backup RPC per chain
- [ ] Per-chain WebSocket endpoints configured for relayer event listeners
- [ ] RPC failover: auto-switch to QuickNode if Alchemy is down
- [ ] Rate limit monitoring: alert if approaching Alchemy request limits

### Hosting

- [ ] Frontend: Vercel (auto-deploy from `main` branch)
- [ ] Backend API: AWS EC2 / ECS (containerized, auto-scaling)
- [ ] PostgreSQL: AWS RDS (Multi-AZ for production)
- [ ] Redis: AWS ElastiCache
- [ ] Bull job queue: worker processes on AWS ECS
- [ ] Staging environment: mirrors production, uses testnet chains

### Contract Deployment & Management

- [ ] Deployment scripts: Hardhat deploy scripts for each chain
- [ ] Deployment manifest: track all contract addresses per chain per network
- [ ] Verify on Etherscan (and equivalents per chain) after every deployment
- [ ] Multisig: Gnosis Safe for any admin/upgrade operations
- [ ] Upgrades: document upgrade strategy (proxy pattern or full redeployment)

### Observability (Datadog)

- [ ] Backend API: request latency, error rate, throughput
- [ ] Quote Engine: quote fetch latency per protocol, stale quote rate
- [ ] Relayer: job queue depth, job success/failure rate, retry rate
- [ ] WebSocket: active connections, message delivery latency
- [ ] On-chain: strategy execution volume (via The Graph), failure rate
- [ ] Alerts: PagerDuty / Opsgenie on-call rotation

### CI/CD (GitHub Actions)

- [ ] PR checks: lint (ESLint, Solhint), type-check (tsc), unit tests
- [ ] Main branch: automated deploy to staging
- [ ] Release tags: automated deploy to production (manual approval gate)
- [ ] Contract deploy: separate workflow, requires multisig sign-off

### Environment Variables (document all)

- [ ] `DATABASE_URL` — PostgreSQL connection string
- [ ] `REDIS_URL` — Redis connection string
- [ ] `ALCHEMY_API_KEY` — per chain
- [ ] `QUICKNODE_API_KEY` — per chain
- [ ] `RELAYER_PRIVATE_KEY_*` — per chain (stored in AWS KMS)
- [ ] `JWT_SECRET` — auth token signing
- [ ] `STRIPE_SECRET_KEY` — subscription payments
- [ ] `TENDERLY_ACCESS_KEY` — simulation + monitoring
- [ ] `THEGRAPH_API_KEY` — subgraph queries
- [ ] `ONEINCH_API_KEY`, `PARASWAP_API_KEY`, `ZRX_API_KEY` — swap quotes
- [ ] `DEFI_LLAMA_API_KEY` — APY/TVL data

---

## Testing Checklist

### Smart Contract Tests (Foundry + Hardhat)

- [ ] `executeStrategy()` — happy path with all step types
- [ ] `executeStrategy()` — reverts if deadline expired
- [ ] `executeStrategy()` — reverts if destination signature invalid
- [ ] `executeStrategy()` — reverts if `minOutput` slippage exceeded on any swap step
- [ ] `continueStrategy()` — only callable by authorized relayer
- [ ] `continueStrategy()` — correct step index sequencing
- [ ] `emergencyExit()` — only callable by original depositor
- [ ] `emergencyExit()` — always returns to source wallet (never destination)
- [ ] `emergencyExit()` — works even mid-execution (funds mid-flight recovered)
- [ ] Reentrancy: attempt reentrancy attack on `executeStrategy()` → must fail
- [ ] Signature replay: attempt same destination signature on different strategy → must fail
- [ ] Signature replay: attempt same signature on different chain → must fail
- [ ] Fuzz: `executeStrategy()` with random amounts, deadline offsets, slippage values
- [ ] Fuzz: `verifyDestination()` with random signature bytes → non-owned addresses must fail
- [ ] Fork tests: run strategy against mainnet fork (Ethereum, Arbitrum)

### Backend Unit Tests

- [ ] Strategy Engine: Dijkstra returns correct max-score path (hand-verified examples)
- [ ] Strategy Engine: max hops constraint enforced (>8 hops → filtered out)
- [ ] Strategy Engine: max bridge constraint (>3 bridges → filtered out)
- [ ] Strategy Engine: exploit-flagged protocol → excluded from all routes
- [ ] Quote Engine: stale quote flag set correctly after 60s
- [ ] Quote Engine: cache miss → fetches live, cache hit → returns cached
- [ ] Relayer Manager: job retry logic — fails after 5 retries
- [ ] Relayer Manager: nonce management — no duplicate nonces on concurrent jobs
- [ ] Auth: JWT issued on valid wallet signature
- [ ] Auth: expired JWT rejected

### Backend Integration Tests

- [ ] Full strategy simulation: `POST /strategy/simulate` returns valid APY + fees
- [ ] Quote pipeline: bridge quote + swap quote + APY all return within 15s
- [ ] WebSocket: strategy status updates received in correct order
- [ ] Tax report: CSV export contains all required fields in correct format
- [ ] Koinly import: verify CSV imports cleanly

### Frontend Tests

- [ ] E2E (Playwright): wallet connect flow
- [ ] E2E: destination wallet verification (sign + verify)
- [ ] E2E: strategy simulation display
- [ ] E2E: execute strategy on testnet (full flow)
- [ ] E2E: live tracker receives WebSocket updates
- [ ] E2E: emergency exit button works
- [ ] E2E: CSV download contains correct data
- [ ] Unit: quote display components (stale vs. fresh)
- [ ] Unit: risk score color-coding

### Load & Performance Tests

- [ ] Backend API: 1,000 concurrent users → <200ms p95 response
- [ ] Quote Engine: 100 concurrent quote requests → returns within 500ms
- [ ] WebSocket: 10,000 concurrent strategy tracking connections
- [ ] Database: 1M+ executions in history → pagination still fast (<100ms)

---

## Monetization Setup

### Execution Fee (0.08%)

- [ ] Fee taken at `settleToDestination()` step in Router contract
- [ ] Fee recipient: Meridian treasury multisig address
- [ ] Fee calculation: `fee = totalValue × 0.0008`
- [ ] Fee visible to user in simulation step
- [ ] Fee included in tax report as "Protocol Fee Paid"
- [ ] Revenue tracking dashboard (internal)

### Strategy Marketplace Fees

- [ ] Creator fee: 0.02% — sent to creator address on-chain
- [ ] Meridian share: 0.03% — sent to treasury
- [ ] Total marketplace fee: 0.05% (instead of standard 0.08%)
- [ ] Fee routing implemented in contract: `split(fee, creator, treasury)`

### Pro Subscription ($29/month)

- [ ] Stripe integration complete
- [ ] Webhook: handle `invoice.paid`, `customer.subscription.deleted`
- [ ] Feature gates: check subscription tier on API endpoints
- [ ] Priority execution queue: Pro users' jobs jump ahead in Bull queue

### Business API ($299–$2,999/month)

- [ ] API key issuance: generate and store hashed API keys
- [ ] Usage tracking: count API calls per key per billing period
- [ ] Overage handling: soft limit (warning email) vs. hard limit (429 response)
- [ ] Stripe metered billing or fixed tier billing

### Strategy NFTs (Phase 3)

- [ ] ERC-721 contract deployed
- [ ] ERC-2981 royalty standard: on every secondary sale, creator earns royalty
- [ ] Fee routing: NFT holder address = creator fee recipient (updated on transfer)

---

## Tax & Compliance

### Transaction Records

- [ ] Every strategy execution persisted to `execution_steps` table with:
  - step_index, action_type, asset_in, amount_in, asset_out, amount_out
  - chain, tx_hash, block_number, timestamp_utc
  - gas_paid_eth, gas_paid_usd, protocol_fee, bridge_fee
- [ ] Record immutable after execution completes
- [ ] User can access all records via API at any time (no deletion)

### Export Formats

- [ ] CSV: columns per step matching Koinly/CoinTracker import format
- [ ] PDF: formatted execution report (logo, strategy ID, date, step table, totals)
- [ ] JSON: raw structured data for custom tooling
- [ ] Test imports into: Koinly, CoinTracker, TaxBit, Coinpanda — verify correct cost basis

### Anti-Mixer / Compliance Design

- [ ] Destination wallet verification enforced on-chain — cannot be bypassed
- [ ] All hops visible on public block explorers
- [ ] No privacy features (no zero-knowledge proofs, no mixing)
- [ ] User Terms of Service: explicitly states self-custody only use case
- [ ] Legal review: confirm design does not constitute money transmission in target jurisdictions
- [ ] Geofencing: block sanctioned jurisdictions (OFAC list) at frontend level

---

## Team & Hiring

| Role | Count | Status |
|---|---|---|
| Solidity Engineer | 2 | `[ ]` |
| Backend Engineer | 2 | `[ ]` |
| Frontend Engineer | 2 | `[ ]` |
| DeFi Researcher | 1 | `[ ]` |
| Smart Contract Auditor | 1 (contract) | `[ ]` |
| Product Designer | 1 | `[ ]` |
| DevOps Engineer | 1 | `[ ]` |

**Hiring checklist per role:**
- [ ] Job description written and posted (LinkedIn, Twitter, crypto job boards)
- [ ] Technical take-home / test defined
- [ ] Interview panel defined
- [ ] Compensation benchmarked (DeFi market rates)
- [ ] Equity/token allocation determined
- [ ] Contractor vs. full-time classification confirmed with legal

---

## Launch Readiness Checklist (Pre-Mainnet)

- [ ] All Phase 1 features complete and tested
- [ ] At least 1 completed smart contract audit
- [ ] All Critical and High audit findings fixed
- [ ] Emergency exit tested on mainnet fork
- [ ] Relayer wallets funded on all chains
- [ ] Monitoring (Datadog) fully live with all critical alerts configured
- [ ] Multisig configured for treasury and any admin functions
- [ ] Bug bounty pool funded ($500k minimum)
- [ ] Legal review of Terms of Service and compliance posture
- [ ] Incident response plan documented (what to do if exploit occurs)
- [ ] PR communication plan for launch
- [ ] Rollback plan: know how to pause the protocol if critical bug found post-launch

---

*Last updated: Phase 0 complete — 2026-05-23*
*Build until every box is checked.*

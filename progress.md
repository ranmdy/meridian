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

- [x] Deploy all contracts to Anvil local node (chain 31337) — Router, Registry, Vault
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

- [x] Implement `verifyDestination()` in smart contract (ECDSA + EIP-191)
- [x] Implement verification message standard:
  `"Meridian destination verification\nI confirm this wallet is mine: {address}"`
- [x] Implement frontend flow: prompt user to sign with destination wallet
- [x] Implement backend validation: verify signature before submitting strategy (viem verifyMessage)
- [x] Enforce on-chain: reject `executeStrategy` calls without valid signature
- [x] Test: attempt to use unowned destination address → must revert on-chain
- [x] Test: valid signature → strategy proceeds normally
- [x] Test: signature replay protection (include chain ID + nonce if needed)

### 1.2 Live Quote Engine

- [x] Set up Redis for quote caching (TTL: 60 seconds)
- [x] Poll bridge quotes every 15 seconds:
  - [x] Li.Fi aggregator API — Stargate, Across, Hop, Wormhole via single endpoint (no key)
  - [ ] Stargate SDK — direct SDK integration (future: more granular quotes)
  - [ ] Across Protocol SDK — direct SDK integration
  - [ ] Wormhole SDK — direct SDK integration
- [x] Poll swap quotes every 15 seconds:
  - [x] 1inch v6 price API — ETH/USDC across Ethereum, Arbitrum, Base (no key)
  - [ ] Paraswap API
  - [ ] 0x Protocol API
- [x] Poll lending APY every 15 seconds:
  - [x] DeFiLlama yields API — Aave v3, Compound v3, Morpho across all chains (no key)
  - [ ] Aave subgraph (The Graph) — direct subgraph (for granular per-asset borrow rates)
  - [ ] Compound v3 API — direct integration
  - [ ] Morpho API — direct integration
- [x] Quote invalidation: mark quote stale after 60 seconds, refresh on next poll
- [x] API endpoint: `GET /quotes/bridge` and `GET /quotes/apy` (live endpoints)
- [x] Error handling: fallback to last known quote if API is down (with staleness flag)
- [x] Unit tests: quote cache set/get/expire logic
- [ ] Integration tests: live API calls return valid structure

### 1.3 Relayer Network v1

- [x] Set up Bull job queue (Redis-backed) for relayer tasks — BullMQ integrated
- [x] Implement `RelayerManager` service:
  - [x] Job: `monitorBridgeConfirmation(strategyId, bridgeTxHash, chain)` — real tx receipt check via viem
  - [x] Job: `callContinueStrategy(strategyId, stepIndex)` — signs + broadcasts via relayer wallet
  - [x] Retry logic: exponential backoff, max 5 retries
  - [x] Fallback route: cycles through stargate→across→hop→wormhole on repeated failure
  - [x] Job: `notifyFrontend(strategyId, status)` via WebSocket
- [x] Set up event listeners per chain (via viem watchContractEvent — WebSocket or HTTP polling):
  - [x] Listen for `StrategyStarted` events
  - [x] Listen for `StepExecuted` events → triggers `continueStrategy` automatically
  - [x] Listen for `StrategyCompleted` events
  - [x] Listen for `StrategyFailed` events → triggers fallback bridge retry
  - [x] Listen for bridge destination events (Stargate OFTReceived, Across FilledV3Relay — `BridgeListenerService`, 9 chains)
- [x] Relayer wallet management:
  - [x] Fund relayer wallets on each supported chain (Anvil test keys configured)
  - [x] Monitor relayer wallet balances (warn at < 0.05 ETH, check every 5 min)
  - [x] Secure key management (AWS KMS or HashiCorp Vault) — `kms-signer` service: resolves per-chain account from `RELAYER_PK_*`, `AWS_KMS_KEY_ID_*`, or global fallback; full KMS secp256k1 signing path built
- [x] Requires: `RELAYER_PRIVATE_KEY` + `ROUTER_ADDRESS_{ETH,BASE,ARB,BSC,POLY,OPT,AVAX,SCROLL,ZKSYNC}` in env — `.env.example` updated for all 9 chains

### 1.4 Live Execution Tracker

- [x] WebSocket server: broadcast status updates per `strategyId`
- [x] Frontend: subscribe to WebSocket on strategy submission
- [x] Frontend: render live tracker UI:
  - [x] Step list with status icons (✅ done, 🔄 in progress, ⬜ pending)
  - [x] Per-step TX hash with block explorer link
  - [x] ETA countdown for bridge steps
  - [x] Total elapsed time
  - [x] Total remaining steps
- [x] Handle disconnect/reconnect: resume tracking from last known state
- [x] Handle strategy failure: show failed step, reason, and emergency exit button

### 1.5 Multi-Chain Support (5 Chains)

- [ ] **Ethereum Mainnet** — Router deployed, all Phase 0 integrations live
- [ ] **Base** — Router deployed, Uniswap v3 + Aave v3 + Stargate integrated
- [ ] **Arbitrum One** — Router deployed, GMX + Uniswap v3 + Aave v3 integrated
- [ ] **BNB Chain** — Router deployed, PancakeSwap integrated
- [ ] **Polygon** — Router deployed, Uniswap v3 + Aave v3 integrated
- [ ] Multi-chain RPC management: Alchemy + QuickNode fallback per chain
- [x] Gas estimation: accurate per-chain gas price polling — viem `getGasPrice()` per chain, `GET /quotes/gas` endpoint live

### 1.6 10+ Protocol Integrations

- [x] Stargate (bridge) — live quotes via Li.Fi aggregator
- [x] Across Protocol (bridge) — live quotes via Li.Fi aggregator
- [x] Hop Protocol (bridge) — live quotes via Li.Fi aggregator
- [x] Wormhole (bridge) — live quotes via Li.Fi aggregator
- [x] Uniswap v3 (DEX) — live swap quotes via 1inch v6 API
- [ ] Curve (DEX — stablecoin swaps)
- [x] Aave v3 (lending) — live APY via DeFiLlama (ETH, Base, Arbitrum)
- [x] Compound v3 (lending) — live APY via DeFiLlama
- [x] Morpho (lending) — live APY via DeFiLlama
- [ ] GMX (yield — perp LP) — needs direct GMX API integration

### 1.7 Simulation Engine

- [x] Implement pre-execution simulation (Tenderly API):
  - [x] Simulate every step of the strategy before signing — `POST /strategy/simulate` endpoint live
  - [x] Return: estimated APY, total gas, bridge fees, protocol fees
  - [x] Return: risk scores (slippage, liquidation, smart contract) — composite 0–100 score
  - [x] Flag active exploit alerts on any protocol in route — `EXPLOIT_FLAGGED_PROTOCOLS` set
  - [x] Graceful fallback: returns optimistic estimates when Tenderly not configured
- [x] Frontend: render full simulation results before user signs — SimulationPanel auto-runs on route select
- [x] Frontend: render risk disclosure modal with composite risk score — RiskModal gates execute for score ≥ 40
- [x] Frontend: show "⚠️ You are interacting with 3rd party DeFi protocols" warning

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

- [x] Design Strategy Marketplace schema (MarketplaceStrategy type — creator, route, votes, execution count, APY)
- [x] API: `POST /strategies` — publish strategy (requires auth, stores with creator wallet)
- [x] API: `GET /strategies?sort=yield|risk|votes|popular|newest` — browse with filters
- [x] API: `GET /strategies/:id` — single strategy detail
- [x] API: `POST /strategies/:id/vote` — upvote
- [x] API: `DELETE /strategies/:id` — deprecate (creator-only, auth required)
- [x] Frontend: `/marketplace` browse page with sort filter
- [x] Frontend: "Copy Strategy" button — pre-populates form + loads route into state → redirects to /
- [x] Strategy versioning: deprecation flow (deprecated strategies excluded from browse)
- [x] 15 marketplace unit tests passing
- [x] Seeded 2 sample strategies so marketplace is non-empty on first run
- [ ] API: `GET /strategies/:id/performance` — historical performance (needs DB)
- [ ] Creator fee routing: 0.02% to creator (requires Router contract update)
- [ ] Curation: flag strategies using exploited protocols (Phase 2 hardening)
- [ ] Strategy NFT hooks (Phase 3 prerequisite)

### 2.2 Auto-Optimizer

- [x] Implement routing layer on top of Strategy Engine — risk-tolerance-weighted scoring
- [x] Input: user asset, destination chain, risk tolerance (1–5), time horizon
- [x] Auto-select best route from top 3 Dijkstra results using APY + risk model
- [x] API: `POST /strategy/auto-optimize` — returns single best route + plain-language explanation + alternatives
- [x] Frontend: "Auto Mode" toggle on strategy selection screen (toggle switch in StrategyForm)
- [x] Frontend: explanation banner + collapsible alternatives panel in RouteList
- [x] Integrate Chainlink + Pyth price feeds for slippage estimation — `PriceFeedService` (Pyth Hermes + DeFiLlama fallback, `GET /prices`)
- [ ] Re-optimization check: if quote expires mid-execution, re-run optimizer

### 2.3 Strategy Composer UI

- [x] Design drag-and-drop node-based UI (@xyflow/react v12)
- [x] Node types: Wallet, Lend, Bridge, Swap, Stake — custom `ProtocolNode` component
- [x] Node palette: search + kind filter, 25 protocol items, draggable sidebar
- [x] Canvas: animated edges, MiniMap, Controls, empty state hint
- [x] Toolbar: node/edge count, validation hints, Run Strategy button
- [x] Run Strategy: translates graph → strategy request → API → redirects to home with routes populated
- [ ] Connector validation: asset type compatibility (Phase 2 hardening)
- [x] Live APY preview as nodes are connected — `useLiveApy` polls `GET /strategy/apy`, updates Composer nodes in real time
- [ ] Save/load strategy from user account (needs DB)
- [ ] Template library (Phase 2 hardening)

### 2.4 Tax Report Export

- [x] For each strategy execution, record:
  - [x] Step number, action type, asset in, amount in, asset out, amount out
  - [x] Chain, TX hash, timestamp, gas paid, protocol fee paid
- [x] Generate CSV export: per-hop format compatible with Koinly, CoinTracker, TaxBit, Coinpanda
- [x] Generate PDF export: plain-text report (Phase 2 hardening: replace with pdfkit)
- [x] Generate JSON export: raw data for custom tax tooling
- [x] API: `GET /executions/:id/report?format=csv|json|text` — dev mode returns sample report
- [x] API: `POST /executions/:id/report/register` — relayer registers completed executions
- [x] Frontend: download buttons on completed execution page (ExportButtons component)
- [ ] Test: import CSV into Koinly and verify correct cost basis calculation

### 2.5 Pro Subscription Tier

- [ ] Set up Stripe (or crypto payment via Request Finance / Coinbase Commerce)
- [ ] Pro plan: $29/month
  - [ ] Unlimited saved strategies
  - [ ] Priority execution queue (dedicated relayer)
  - [ ] Advanced analytics: yield forecasting, historical performance
  - [ ] API access: 1,000 calls/month (rate-limited by API key)
  - [ ] Tax report generation (CSV + PDF)
- [x] Auth system: JWT sessions, wallet-based SIWE (Sign-In With Ethereum)
  - [x] `GET /auth/nonce` — single-use nonce, expires in 5 minutes
  - [x] `POST /auth/verify` — ECDSA sig check via viem, issues HS256 JWT + HttpOnly cookie
  - [x] `GET /auth/me` — authenticated user endpoint with `requireAuth` middleware
  - [x] `POST /auth/logout` — clears cookie
  - [x] Frontend: `useAuthStore` (Zustand + persist) — token + wallet + expiresAt
  - [x] Frontend: `useSignIn` hook — full sign-in/sign-out flow
  - [x] Frontend: `SignInButton` component in Navbar — shows wallet address when authed
  - [x] 13 auth unit tests passing
- [ ] Subscription management: upgrade, downgrade, cancel, billing history
- [x] Rate limiting middleware: tiered sliding-window enforcer on `/strategy/optimize`, `/strategy/simulate`, `/strategy/auto-optimize`
  - [x] 20/min anonymous, 60/min free, 300/min pro, 1000/hr API key
  - [x] `X-RateLimit-{Tier,Limit,Remaining,Reset}` response headers
  - [x] 16 rate-limit unit tests passing

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

### 3.0 TypeScript SDK (`@meridian/sdk`)

- [x] `sdk/src/types.ts` — shared types: `OptimizeRequest`, `OptimizeResponse`, `Execution`, `ApyQuote`, `BridgeQuote`, `GasQuote`, `TokenPrice`, `MeridianConfig`
- [x] `sdk/src/client.ts` — `MeridianClient` with timeout, auth header injection, structured `MeridianApiError`
- [x] `sdk/src/meridian.ts` — `Meridian` class: `optimize()`, `autoOptimize()`, `getExecution()`, `getAllApyQuotes()`, `getPrice()`, `getAllPrices()`, `health()`
- [x] `sdk/src/index.ts` — public API surface (re-exports types + classes)
- [x] `sdk/package.json` — ESM + CJS dual-build via tsup, peer dep on viem
- [x] `sdk/test/meridian.test.ts` — 11 unit tests with fetch mocking (no real HTTP)
- [ ] `npm publish @meridian/sdk` — pending public npm registry account
- [ ] Add SDK to CI pipeline (`pnpm --filter @meridian/sdk test`)

### 3.1 DAO/Business API

- [ ] Business API: $299–$2,999/month tiers
- [ ] Programmatic strategy execution via REST API + API keys
- [x] Webhook notifications: POST to user endpoint on `StrategyStarted`, `StrategyCompleted`
  - [x] `GET /webhooks` — list registered webhooks (auth required)
  - [x] `POST /webhooks` — register new webhook with URL, secret, event filter list
  - [x] `DELETE /webhooks/:id` — deregister
  - [x] `GET /webhooks/events` — list available event types
  - [x] HMAC-SHA256 signature on every delivery (header: `X-Meridian-Signature`)
  - [x] At-least-once delivery: 3 attempts with exponential backoff (2s, 4s)
  - [x] 10-second per-attempt timeout
  - [x] Wired into relayer: `StrategyStarted` and `StrategyCompleted` emit automatically
- [ ] Custom strategy composition via API (no UI required)
- [ ] Dedicated relayer priority: separate relayer pool for API clients
- [ ] SLA guarantees: 99.9% uptime, <2s quote response
- [ ] Usage dashboard: calls used, volume routed, fees paid

### 3.2 Solana Integration

- [x] Integrate Solana Wallet Adapter in frontend
  - [x] `SolanaProvider.tsx` — ConnectionProvider + WalletProvider (Phantom, Solflare)
  - [x] `SolanaConnectButton.tsx` — connect/disconnect UI, truncated address display
  - [x] `useSolanaPortfolio.ts` — reads SOL native + USDC SPL balances via @solana/web3.js
- [x] Integrate Wormhole for Solana → EVM bridging
  - [x] `USDC_101_wallet → USDC_1_wallet` bridge edge in strategy graph (via Wormhole Core Bridge)
  - [x] Li.Fi quote engine now includes chain ID 101 (SOL) in chain name map
- [x] Integrate Kamino (Solana USDC lending, 6.50% APY seed)
  - [x] `USDC_101_kamino_deposit` node in graph
  - [x] `kamino` added to `PROTOCOL_NODE_MAP` for APY refresh
- [ ] Deploy Solana program (Rust/Anchor) for Solana-side execution
- [ ] Test cross-chain flow: Solana → EVM and EVM → Solana (needs funded devnet wallets)

### 3.3 Strategy NFTs

- [x] `MeridianStrategyNFT.sol` — ERC-721 + ERC-2981 (OpenZeppelin 5.6)
  - [x] `mint(bytes32 strategyId, address creator, string uri)` — minter-only
  - [x] Per-token royalty 2 bps (0.02%) via ERC-2981
  - [x] Royalty recipient updates to new owner on transfer (secondary sales)
  - [x] Soulbound toggle: owner/creator can lock a token non-transferable
  - [x] One NFT per strategy ID (AlreadyMinted guard)
  - [x] `setMinter()` admin function for key rotation
  - [x] 23 Foundry tests — all pass
- [x] `DeployNFT.s.sol` — Foundry deploy script
- [x] `backend/src/services/nft/index.ts` — `mintStrategyNFT()` service
  - [x] Uses viem to simulate + submit tx via MINTER_PRIVATE_KEY wallet
  - [x] `buildMetadataUri()` — Pinata IPFS upload (`PINATA_JWT` env var), base64 fallback in dev
  - [x] Gracefully skips if env vars not set
- [x] Wired into marketplace `POST /strategies`: fire-and-forget mint on publish
- [ ] Secondary market listing (OpenSea/Blur — needs mainnet deployment)
- [x] IPFS/Arweave metadata upload — Pinata via `buildMetadataUri()`, `ipfs://` URI returned to NFT contract

### 3.4 Mobile App

- [ ] Decide: React Native or native iOS/Android
- [ ] Core features: portfolio view, strategy execution, live tracker
- [ ] WalletConnect v2 for mobile wallet connections
- [ ] Push notifications: execution status updates
- [ ] App Store + Google Play submission

### 3.5 L2 Native Deployments

- [~] **Base** — `DeployBase.s.sol` (supports mainnet 8453 + Base Sepolia 84532); CI testnet-deploy workflow wired; awaiting funded wallet
- [~] **Optimism** — `DeployOptimism.s.sol`, graph nodes + bridge edges (Aave v3, Compound v3, Morpho, Across, Stargate), relayer config (`ROUTER_ADDRESS_OPT`, `RELAYER_PK_OPT`) — awaiting funded wallet
- [~] **Avalanche** — `DeployAvalanche.s.sol`, graph nodes + bridge edges (Aave v3, GMX, Stargate), portfolio USDC balance read, relayer config (`ROUTER_ADDRESS_AVAX`, `RELAYER_PK_AVAX`) — awaiting funded wallet
- [~] **Scroll** — `DeployScroll.s.sol`, graph nodes (Aave v3 + Layerbank), bridge edges, frontend USDC address, relayer config (`ROUTER_ADDRESS_SCROLL`, `RELAYER_PK_SCROLL`) — awaiting funded wallet
- [~] **zkSync Era** — `DeployZkSync.s.sol`, graph nodes (ZeroLend), bridge edges, frontend USDC address, relayer config (`ROUTER_ADDRESS_ZKSYNC`, `RELAYER_PK_ZKSYNC`) — awaiting funded wallet
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

- [x] **Structs**
  - [x] `Strategy`: sourceAsset, sourceAmount, steps[], destinationWallet, destinationSignature, deadline
  - [x] `Step`: stepType (SWAP|LEND|BRIDGE|STAKE|SETTLE), protocol, params, minOutput
- [x] **Functions**
  - [x] `executeStrategy(Strategy calldata)` — main entry point, `payable`
  - [x] `continueStrategy(bytes32 strategyId, uint256 stepIndex)` — relayer only
  - [x] `emergencyExit(bytes32 strategyId)` — callable by original depositor only
  - [x] `verifyDestination(address, bytes calldata)` — internal, pure
- [x] **Events**
  - [x] `StrategyStarted(bytes32 indexed strategyId, address indexed user, uint256 amount)`
  - [x] `StepExecuted(bytes32 indexed strategyId, uint256 stepIndex, StepType stepType)`
  - [x] `StrategyCompleted(bytes32 indexed strategyId, address destination, uint256 finalAmount)`
  - [x] `StrategyFailed(bytes32 indexed strategyId, uint256 failedStep, string reason)`
- [x] **Security checks**
  - [x] `nonReentrant` on `executeStrategy`, `continueStrategy`, `emergencyExit`
  - [x] `deadline` check: `require(block.timestamp <= strategy.deadline)`
  - [x] `minOutput` check per swap step: revert if slippage exceeded
  - [x] No `selfdestruct`, no `delegatecall` to untrusted contracts
  - [x] `onlyRelayer` modifier on `continueStrategy`
  - [x] Zero-address checks on `destinationWallet`
  - [x] Signature replay protection: include `strategyId` + `block.chainid` in signed message
- [~] **Deployment**
  - [x] Anvil local node (chain 31337)
  - [ ] Ethereum Sepolia (testnet)
  - [ ] Base Sepolia (testnet)
  - [ ] Ethereum Mainnet
  - [ ] Base Mainnet
  - [ ] Arbitrum Mainnet
  - [ ] BNB Chain Mainnet
  - [ ] Polygon Mainnet

### MeridianStrategyRegistry.sol

- [x] `registerStrategy(bytes calldata)` → returns `bytes32 strategyId`
- [x] `getStrategy(bytes32)` → returns strategy data
- [x] `deprecateStrategy(bytes32)` → creator only, emits `StrategyDeprecated`
- [x] Store: creator address, creation timestamp, version, IPFS hash of full strategy data
- [x] Access control: only Router can mark strategy as "executed" (usage counter)

### MeridianVault.sol

- [x] ERC-4626 compliant (standard vault interface)
- [x] `deposit(uint256 assets, address receiver)` → mints vault shares
- [x] `withdraw(uint256 assets, address receiver, address owner)` → burns shares
- [x] `compound()` → callable only by Router — re-invests yield
- [x] No admin withdrawal function
- [x] Supported underlying assets: ETH, USDC, USDT (phase 1)

### Contract Security Properties (verify all before mainnet)

- [x] No admin can withdraw user funds
- [x] Emergency exit always routes to **source** wallet, never anywhere else
- [x] All external calls protected by reentrancy guards
- [x] Strategy deadline auto-reverts expired strategies
- [x] Slippage `minOutput` enforced per swap
- [x] Destination signature is verified on-chain (not just off-chain)
- [x] No hidden fees beyond declared 0.08%
- [ ] Contracts verified on Etherscan / block explorers per chain

---

## Backend Services — Detailed

### Strategy Engine

- [x] **Graph construction**
  - [x] Node: `(asset, chain, protocol_state)` — e.g., `(ETH, Ethereum, Aave_deposit)`
  - [x] Edge: protocol action with metadata — `{type, cost_gas, cost_fee, yield_apy, risk_score}`
  - [ ] Graph updated in real-time as quotes refresh (currently seeded static graph)
- [x] **Dijkstra implementation**
  - [x] Priority queue: max-score path (not min-cost)
  - [x] Score function: `(projected_yield × timeHorizon) − (gas + bridge_fee + slippage)`
  - [x] Constraint enforcement: max hops 8, max bridges 3, min TVL $50k
  - [x] Risk filter: skip edges touching flagged protocols (exploit feed)
  - [x] Return top 3 paths with score breakdown
- [x] **Exploit feed**
  - [x] Subscribe to DeFi threat intelligence (DeFiLlama hacks, Rekt.news RSS)
  - [x] Auto-flag protocols with active exploits (30-day window, 5-min refresh)
  - [x] Manual override: admin can flag/unflag protocols (`POST /exploits/flag`, `DELETE /exploits/:protocol`)
  - [x] Strategy engine syncs flags before each optimize call — flagged protocols excluded from routing
  - [x] `GET /exploits` + `GET /exploits/:protocol` public check endpoints
- [~] **API endpoints**
  - [x] `POST /strategy/optimize` — input: asset, amount, source chain, destination chain, risk, timeHorizon
  - [ ] `GET /strategy/:id` — get strategy details
  - [ ] `POST /strategy/simulate` — Tenderly simulation of strategy

### Quote Engine

- [~] **Bridge quote aggregation** (poll every 15s, cache 60s TTL)
  - [ ] Stargate: `GET /quote?srcChain=1&dstChain=42161&srcToken=USDC&amount=4200`
  - [ ] Across: SDK `getSuggestedFees()`
  - [ ] Wormhole: SDK `getTransferDetails()`
  - [ ] Hop Protocol: API `/quote`
- [~] **Swap quote aggregation** (poll every 15s)
  - [ ] 1inch Fusion: `/v5.2/1/quote`
  - [ ] Paraswap: `/prices`
  - [ ] 0x: `/swap/v1/quote`
  - [ ] Best-of: return lowest-fee quote across all sources
- [~] **APY data** (poll every 15s)
  - [ ] Aave subgraph: `reservesData { liquidityRate }` → convert to APY
  - [ ] Compound v3 API: `getAPYs()`
  - [ ] Morpho: on-chain `supplyAPY()`
  - [ ] GMX: GLP APR endpoint
  - [ ] Pendle: PT/YT APY endpoints
  - [ ] DeFiLlama `GET /yields/pools` — backup source for all APYs
- [x] **Staleness handling**
  - [x] Return `{quote, timestamp, isStale: bool}` in all quote responses
  - [ ] Frontend: warn user if executing with stale quote (>60s)
- [~] **API endpoints**
  - [x] `GET /quotes/bridge?from=1&to=42161&asset=USDC&amount=4200`
  - [ ] `GET /quotes/swap?chain=1&from=ETH&to=USDC&amount=2.5`
  - [x] `GET /quotes/apy?protocol=aave&asset=USDC&chain=1`

### Relayer Manager

- [~] **Job types** (Bull queue)
  - [~] `MonitorBridge` — poll for bridge confirmation on destination chain
  - [~] `ContinueStrategy` — call `continueStrategy()` on Router after bridge confirms
  - [x] `RetryStep` — retry failed step with exponential backoff (max 5 retries)
  - [ ] `FallbackRoute` — if primary bridge fails, find and use alternate bridge
  - [~] `NotifyFrontend` — push WebSocket update to user
  - [ ] `EmergencyExit` — trigger emergency exit if unrecoverable failure
- [ ] **Chain listeners** (per chain, WebSocket)
  - [ ] Ethereum: Alchemy WebSocket
  - [ ] Base: Alchemy WebSocket
  - [ ] Arbitrum: Alchemy WebSocket
  - [ ] BNB Chain: QuickNode WebSocket
  - [ ] Polygon: Alchemy WebSocket
- [~] **Relayer wallets**
  - [x] Separate funded wallet per chain (Anvil keys configured)
  - [x] Balance monitoring: alert if balance < 0.05 ETH equivalent — via `monitoring.alert()` → Slack
  - [x] Key storage: AWS KMS — `kms-signer` service resolves per-chain accounts via KMS ECC_SECG_P256K1 with plaintext fallback for dev
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
- [~] **Endpoints — Core**
  - [ ] `POST /auth/wallet` — wallet sign-in
  - [ ] `POST /strategy/execute` — submit strategy for execution
  - [x] `GET /strategy/:id/status` — current execution status
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
- [x] **Database (PostgreSQL)**
  - [x] Table: `users` — id, wallet_address, email, tier, created_at
  - [x] Table: `strategies` — id, creator_id, name, steps_json, chain_ids, published
  - [x] Table: `executions` — id, user_id, strategy_id, status, started_at, completed_at
  - [x] Table: `execution_steps` — id, execution_id, step_index, type, tx_hash, chain, amount_in, amount_out, fee, timestamp
  - [x] Table: `quotes_cache` — (managed via Redis, Postgres as audit log)
  - [x] Table: `subscriptions` — user_id, tier, stripe_customer_id, active_until
  - [x] Migrations: all schema changes via versioned migration files

---

## Frontend — Detailed

### Wallet & Connection

- [x] MetaMask integration (Wagmi)
- [x] Rabby Wallet integration
- [x] WalletConnect v2 integration
- [x] Coinbase Wallet integration
- [ ] Phantom (Solana — Phase 2)
- [x] Multi-chain asset detection: read ERC-20 balances across all supported chains
- [x] Display: wallet address truncated, balance summary, network indicator
- [x] Disconnect flow: clear session, return to landing page

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
- [x] **Step 7 — Live Tracker**:
  - [x] WebSocket-powered real-time status
  - [x] Step list with ✅/🔄/⬜ status
  - [x] Per-step TX hash → block explorer link
  - [x] ETA for bridge steps
  - [x] Emergency Exit button (if strategy is stuck)
- [ ] **Step 8 — Settlement & Report**:
  - [ ] Confirmation: "X USDC received at 0xABC...DEF"
  - [ ] Download buttons: [CSV] [PDF] [JSON]
  - [ ] Share: Twitter card with strategy performance
  - [ ] CTA: "Run another strategy"

### Strategy Composer UI

- [x] @xyflow/react v12 canvas at `/composer`
- [x] Custom `ProtocolNode` — kind badge, chain, asset, APY, directional handles
- [x] `NodePalette` — search, kind chips, 25 draggable items grouped by category
- [x] `ComposerToolbar` — validation hints, Clear + Run Strategy
- [x] Drag-to-place from palette, connect with animated edges
- [x] Run Strategy → populates strategy store → redirects to `/`
- [x] Navbar link added
- [ ] Connection validation: asset compatibility (Phase 2 hardening)
- [x] Live APY preview as you build — `useLiveApy` + Composer `useEffect` enrichment

### Analytics & Portfolio

- [x] Portfolio overview: `usePortfolio` hook — reads ETH, USDC, USDT, WBTC balances via viem across 5 chains
- [x] `/portfolio` page: total value, allocation bar, per-chain asset breakdown
- [ ] Execution history: past strategies, performance, P&L (needs DB)
- [ ] Yield earned over time: area chart (needs execution history)
- [ ] Fees paid breakdown (needs execution history)

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

- [x] Chainlink price feeds — `PriceFeedService` with Pyth Hermes REST (primary) + DeFiLlama (fallback)
- [x] Pyth Network (high-frequency) — integrated in `PriceFeedService`, `GET /prices` endpoint
- [ ] The Graph (on-chain event indexing) — `[ ]`
  - [ ] Deploy subgraph for `MeridianRouter` events
  - [ ] Index: all `StrategyStarted`, `StepExecuted`, `StrategyCompleted`, `StrategyFailed`
- [ ] DeFiLlama API (TVL, APY data) — `[ ]`

---

## Security & Audits

### Pre-Audit Checklist

- [x] All contracts use Solidity 0.8.x (built-in overflow protection)
- [x] All contracts use OpenZeppelin primitives (ReentrancyGuard, ECDSA, Ownable2Step)
- [x] No `tx.origin` for authentication
- [ ] No unchecked math outside explicit `unchecked {}` blocks with clear rationale
- [ ] All return values from external calls are checked
- [x] No centralized admin functions that can move user funds
- [x] `emergencyExit` only routes to source wallet — verified in tests
- [x] All events emitted for all state changes (full audit trail)
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

- [x] Verified: signature includes `block.chainid` (cross-chain replay protection)
- [x] Verified: signature includes `strategyId` (strategy-level replay protection)
- [x] Verified: `verifyDestination()` is called on every `executeStrategy()` — cannot be bypassed
- [x] Verified: `emergencyExit` still works even when destination verification fails
- [x] Tested: sending to unowned address → contract reverts

### Bug Bounty

- [ ] Immunefi registration complete
- [ ] $500k critical pool funded
- [ ] Scope documented (all contract addresses, backend API, frontend)
- [ ] Severity tiers and payout amounts published
- [ ] Triage SLA: 48h first response, 7 days resolution
- [ ] Historical bug reports reviewed and resolved (post-launch)

### Ongoing Security

- [ ] Tenderly monitoring: alerts on unexpected contract calls
- [x] DeFi exploit monitoring: auto-flag protocols in quote engine if exploited — exploit-feed service
- [x] Relayer wallet monitoring: alert on unusual transaction patterns — `monitoring` service: Sentry + Slack
- [x] Error tracking: `monitoring.captureError()` wired into relayer failures (StrategyFailed, retries exhausted, job dead) — SENTRY_DSN + SLACK_WEBHOOK_URL env vars
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

- [x] PR checks: lint (ESLint, Solhint), type-check (tsc), unit tests
- [ ] Main branch: automated deploy to staging
- [ ] Release tags: automated deploy to production (manual approval gate)
- [ ] Contract deploy: separate workflow, requires multisig sign-off

### Environment Variables (document all)

- [x] `DATABASE_URL` — PostgreSQL connection string
- [x] `REDIS_URL` — Redis connection string
- [x] `ALCHEMY_API_KEY` — per chain (Sepolia RPC keys configured)
- [ ] `QUICKNODE_API_KEY` — per chain
- [x] `RELAYER_PRIVATE_KEY_*` — per chain (Anvil test keys; prod: AWS KMS)
- [x] `JWT_SECRET` — auth token signing
- [x] `STRIPE_SECRET_KEY` — subscription payments (template)
- [ ] `TENDERLY_ACCESS_KEY` — simulation + monitoring
- [ ] `THEGRAPH_API_KEY` — subgraph queries
- [x] `ONEINCH_API_KEY`, `PARASWAP_API_KEY`, `ZRX_API_KEY` — swap quotes (templates)
- [x] `DEFI_LLAMA_API_KEY` — APY/TVL data (template)

---

## Testing Checklist

### Smart Contract Tests (Foundry + Hardhat)

- [x] `executeStrategy()` — happy path with all step types
- [x] `executeStrategy()` — reverts if deadline expired
- [x] `executeStrategy()` — reverts if destination signature invalid
- [x] `executeStrategy()` — reverts if `minOutput` slippage exceeded on any swap step
- [x] `continueStrategy()` — only callable by authorized relayer
- [x] `continueStrategy()` — correct step index sequencing
- [x] `emergencyExit()` — only callable by original depositor
- [x] `emergencyExit()` — always returns to source wallet (never destination)
- [x] `emergencyExit()` — works even mid-execution (funds mid-flight recovered)
- [x] Reentrancy: attempt reentrancy attack on `executeStrategy()` → must fail
- [x] Signature replay: attempt same destination signature on different strategy → must fail
- [x] Signature replay: attempt same signature on different chain → must fail
- [x] Fuzz: `executeStrategy()` with random amounts, deadline offsets, slippage values
- [x] Fuzz: `verifyDestination()` with random signature bytes → non-owned addresses must fail
- [ ] Fork tests: run strategy against mainnet fork (Ethereum, Arbitrum)

### Backend Unit Tests

- [x] Strategy Engine: Dijkstra returns correct max-score path (hand-verified examples)
- [x] Strategy Engine: max hops constraint enforced (>8 hops → filtered out)
- [x] Strategy Engine: max bridge constraint (>3 bridges → filtered out)
- [x] Strategy Engine: exploit-flagged protocol → excluded from all routes
- [x] Quote Engine: stale quote flag set correctly after 60s
- [x] Quote Engine: cache miss → fetches live, cache hit → returns cached
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

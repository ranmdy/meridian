# Meridian — System Architecture

## High-Level Flow

```
User
 │
 ├─ 1. SIGN destination wallet (EIP-191, off-chain)
 ├─ 2. APPROVE source token (ERC-20, on-chain)
 └─ 3. CALL executeStrategy(strategy) ──────────────────────────────────┐
                                                                         │
                                                                    MeridianRouter.sol
                                                                         │
                              ┌──────────────────────────────────────────┤
                              │ Per executeStrategy():                    │
                              │  a. Validate: deadline, sig, replay       │
                              │  b. Pull source token (safeTransferFrom)  │
                              │  c. Deduct fee (→ treasury / creator)     │
                              │  d. Write StrategyState (CEI)             │
                              │  e. Execute sync steps (SWAP/LEND/STAKE)  │
                              │  f. On BRIDGE: emit StrategyStarted, halt │
                              │     (waiting for relayer callback)         │
                              └──────────────────────────────────────────┘
                                                   │
                                    Bridge (Stargate/Across/Wormhole)
                                                   │ (cross-chain)
                                                   ▼
                                            Relayer (off-chain)
                                                   │
                                                   │ 4. CALL continueStrategy(strategyId, stepIndex, steps, bridgedAmount)
                                                   │
                                              MeridianRouter.sol (destination chain)
                                                   │
                                         Execute remaining steps
                                                   │
                                         On SETTLE: transfer to destinationWallet
                                                   │
                                         emit StrategyCompleted
                                                   │
                                                   ▼
                                          destinationWallet ← funds
```

## Component Map

```
/contracts/
  src/
    IMeridianRouter.sol        — Interface: structs, events, function sigs
    MeridianRouter.sol         — Core router (this is what auditors focus on)
    MeridianStrategyNFT.sol    — ERC-721 strategy NFTs (secondary scope)
    MeridianStrategyRegistry.sol — On-chain strategy storage (out of scope)
    MeridianVault.sol          — ERC-4626 yield vault (out of scope)
  test/
    MeridianRouter.t.sol       — 27 unit tests + 2 fuzz
    MeridianRouterFork.t.sol   — 6 fork tests (ETH mainnet + Arbitrum)
    MeridianStrategyNFT.t.sol  — 23 NFT unit tests
  script/
    Deploy.s.sol               — Local/testnet deploy
    DeployBase.s.sol           — Base deploy
    TestnetVerify.s.sol        — Sepolia E2E verification
  deployments.json             — All contract addresses per chain

/backend/
  src/
    services/
      relayer/          — Off-chain relayer: monitors bridge, calls continueStrategy
      strategy-engine/  — Dijkstra pathfinder, protocol graph
      quote-engine/     — Live quotes from DeFiLlama, 1inch, Li.Fi
      bridge-listener/  — viem watchContractEvent for Across/Stargate fills
    api/routes/         — Fastify REST endpoints
    db/                 — PostgreSQL pool + migrations

/frontend/
  src/app/
    (home)/             — Strategy selection + simulation
    execution/[id]/     — Live tracker (WebSocket)
    portfolio/          — Balance overview
    composer/           — Drag-and-drop strategy builder
    marketplace/        — Browse published strategies
    dashboard/          — Execution history
```

## Trust Model

| Actor | Trust Level | Can Do | Cannot Do |
|-------|-------------|--------|-----------|
| **User** | Self-sovereign | Call executeStrategy, emergencyExit | Call continueStrategy |
| **Relayer** | Semi-trusted EOA | Call continueStrategy with original steps + correct stepIndex | Change steps, change destination, steal funds |
| **Owner** | Trusted admin | Update relayer/treasury, add/remove protocols | Withdraw user funds |
| **Destination wallet** | User-controlled | Sign verification message | — |
| **Protocol** | Allowlisted | Receive funds + return transformed funds | Receive funds if not in approvedProtocols |

## State Machine (per strategy)

```
INITIAL ─── executeStrategy() ───► ACTIVE (currentStep = 0)
                                        │
                                   _executeStepsFrom()
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
             step succeeds       BRIDGE step reached    step fails
                    │                   │                   │
              advance step          WAITING              _failStrategy()
                    │                   │                   │
                    │          continueStrategy()       return funds
                    │                   │               to state.user
                    │                   │                   │
             last step done       resume steps           FAILED
                    │
             SETTLE step
                    │
             transfer to destination
                    │
                COMPLETED

emergencyExit() can be called by state.user at any time in ACTIVE or WAITING state.
```

## Fee Flow

```
sourceAmount = 1,000 USDC

Direct strategy (creator == address(0)):
  fee = 1000 × 8 / 10000 = 0.8 USDC → treasury
  workingAmount = 999.2 USDC

Marketplace strategy (creator != address(0)):
  fee = 1000 × 5 / 10000 = 0.5 USDC total
    → 0.2 USDC (2 bps) to creator
    → 0.3 USDC (3 bps) to treasury
  workingAmount = 999.5 USDC

Events:
  FeeDistributed(strategyId, treasury=0x..., treasuryFee, creator=0x..., creatorFee)
```

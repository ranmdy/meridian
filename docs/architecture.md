# Meridian — System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          User Browser / Mobile                           │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │                    Frontend  (Next.js 14)                        │  │
│   │                                                                  │  │
│   │  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐  │  │
│   │  │  Wallet      │  │ Strategy Composer │  │  Live Tracker      │  │  │
│   │  │  Connect     │  │ / Marketplace    │  │  (WebSocket)       │  │  │
│   │  │  (Wagmi v2)  │  │                  │  │                    │  │  │
│   │  └──────┬───────┘  └────────┬─────────┘  └────────┬───────────┘  │  │
│   │         └──────────────────┼──────────────────────┘              │  │
│   └─────────────────────────── │ REST / WebSocket ───────────────────┘  │
└────────────────────────────────│────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────────┐
                    │     Backend API (Fastify)    │
                    │         Node.js + TS         │
                    │                              │
                    │  ┌──────────────────────┐   │
                    │  │   Strategy Engine    │   │
                    │  │  (Dijkstra / graph)  │   │
                    │  └──────────┬───────────┘   │
                    │             │               │
                    │  ┌──────────▼───────────┐   │
                    │  │    Quote Engine      │   │
                    │  │  (15s poll, 60s TTL) │   │
                    │  └──────────┬───────────┘   │
                    │             │               │
                    │  ┌──────────▼───────────┐   │
                    │  │   Relayer Manager    │   │
                    │  │  (BullMQ + Redis)    │   │
                    │  └──────────┬───────────┘   │
                    │             │               │
                    │  ┌──────────▼───────────┐   │
                    │  │   Adapter Layer      │   │
                    │  │  (Protocol SDKs)     │   │
                    │  └──────────────────────┘   │
                    │                              │
                    │  PostgreSQL   Redis           │
                    └──────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
   ┌──────▼──────┐       ┌───────▼──────┐      ┌───────▼──────┐
   │  Ethereum   │       │     Base     │      │   Arbitrum   │
   │  Mainnet    │       │   Mainnet    │      │   Mainnet    │
   │             │       │              │      │              │
   │ ┌─────────┐ │       │ ┌──────────┐ │      │ ┌──────────┐ │
   │ │Meridian │ │       │ │ Meridian │ │      │ │ Meridian │ │
   │ │ Router  │ │       │ │  Router  │ │      │ │  Router  │ │
   │ └────┬────┘ │       │ └────┬─────┘ │      │ └────┬─────┘ │
   │      │      │       │      │       │      │      │       │
   │ ┌────▼────┐ │       │      │       │      │      │       │
   │ │Strategy │ │       │      │       │      │      │       │
   │ │Registry │ │       │      │       │      │      │       │
   │ └─────────┘ │       │      │       │      │      │       │
   │             │       │      │       │      │      │       │
   │ ┌─────────┐ │       │      │       │      │      │       │
   │ │Meridian │ │       │      │       │      │      │       │
   │ │  Vault  │ │       │      │       │      │      │       │
   │ └─────────┘ │       │      │       │      │      │       │
   └─────────────┘       └──────────────┘      └──────────────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                    ┌────────────▼────────────────┐
                    │     Cross-Chain Bridges      │
                    │  Stargate │ Across │ Wormhole│
                    └─────────────────────────────┘
```

## Data Flow — Strategy Execution

```
1. User connects wallet  →  Frontend detects assets on all chains
2. User sets destination →  Frontend prompts destination wallet to sign message
3. User selects strategy →  POST /strategy/optimize  →  Strategy Engine
                                                      →  Quote Engine (live quotes)
                                                      →  Returns top 3 routes
4. User reviews + signs  →  POST /strategy/execute   →  Backend builds Strategy struct
                         →  Frontend submits tx to MeridianRouter.executeStrategy()
5. Router executes:
   a. Verifies destination signature on-chain
   b. Collects sourceAsset from user
   c. Deducts 0.08% fee → treasury
   d. Executes synchronous steps (SWAP, LEND, STAKE)
   e. Pauses at BRIDGE step → emits event
6. Relayer listens for bridge event → monitors destination chain
7. Relayer calls continueStrategy() after confirmation
8. Router resumes → executes remaining steps → settles to destination
9. Frontend WebSocket receives status updates at each step
10. User receives: final asset + downloadable tax report
```

## Component Responsibilities

| Component | Responsibility | Technology |
|---|---|---|
| Frontend | UX, wallet connection, strategy UI, live tracker | Next.js 14, Wagmi v2, Zustand |
| Strategy Engine | Graph-based pathfinding, route scoring, top-3 routes | Node.js, custom Dijkstra |
| Quote Engine | Live bridge/swap/APY data, 60s cache | Fastify, Redis, protocol SDKs |
| Relayer Manager | Cross-chain step sequencing, retry logic | BullMQ, Redis, Alchemy WS |
| MeridianRouter | On-chain execution, fee collection, signature verification | Solidity 0.8.24, OZ |
| MeridianStrategyRegistry | On-chain strategy metadata storage | Solidity 0.8.24 |
| MeridianVault | Optional yield compounding (ERC-4626) | Solidity 0.8.24 |
| PostgreSQL | Persistent data: users, executions, strategies | AWS RDS |
| Redis | Quote cache, job queue, sessions | AWS ElastiCache |

## Security Boundaries

```
User ──signs──► Frontend (never sees private key)
                    │
                    ▼
              Backend API (validates inputs, builds calldata)
                    │
                    ▼
              MeridianRouter (verifies signature ON-CHAIN)
                    │
              ┌─────┴───────┐
              │  No admin   │  ← No Meridian-controlled withdrawal
              │  withdrawal │
              └─────────────┘
                    │
              emergencyExit() ──always──► source wallet only
```

# Meridian Smart Contract Audit Package

**Version:** 1.0.0
**Date:** June 2, 2026
**Solidity Version:** 0.8.24
**Compiler:** `solc 0.8.24`
**Framework:** Foundry (forge + cast)
**Dependencies:** OpenZeppelin Contracts 5.x

---

## Contracts In Scope

| Contract | File | Lines | Purpose |
|----------|------|-------|---------|
| `MeridianRouter` | `src/MeridianRouter.sol` | ~680 | Primary router — all funds flow through this |
| `IMeridianRouter` | `src/IMeridianRouter.sol` | ~152 | Interface + events + structs |
| `MeridianStrategyNFT` | `src/MeridianStrategyNFT.sol` | ~150 | ERC-721 strategy NFTs with ERC-2981 royalties |

**Out of scope (Phase 2 review):**
`MeridianStrategyRegistry.sol`, `MeridianVault.sol` — these are supporting contracts; funds never flow through them directly.

---

## Inheritance Graph

```
MeridianRouter
  ├── IMeridianRouter (interface)
  ├── ReentrancyGuard (OZ 5.x)
  └── Ownable2Step (OZ 5.x)
       └── Ownable

MeridianStrategyNFT
  ├── ERC721 (OZ 5.x)
  ├── ERC2981 (OZ 5.x)
  └── Ownable (OZ 5.x)
```

---

## Core Security Properties

### 1. Non-Custodial
The router never holds user funds beyond the duration of a single transaction path. During cross-chain bridge steps, funds are locked in the per-strategy `StrategyState.currentAmount` field — the contract tracks the exact amount and asset for each in-flight strategy.

### 2. No Admin Drain
The owner can:
- Update `relayer` address
- Update `treasury` address
- Add/remove protocols from `approvedProtocols`

The owner **cannot**:
- Withdraw any user funds
- Call `emergencyExit` on behalf of a user
- Change a strategy mid-flight

### 3. Emergency Exit — Always Returns to Source
`emergencyExit(strategyId)` can only be called by `state.user` (the original depositor). It returns `state.currentAmount` of `state.currentAsset` to `state.user` — never to `destinationWallet`. The return path uses direct transfer rather than calling any external protocol.

### 4. Destination Wallet Verification
Every strategy requires an EIP-191 signature from `destinationWallet` proving ownership. The signed message is:
```
"\x19Ethereum Signed Message:\n" + keccak256(
    "Meridian destination verification\n"
    "I confirm this wallet is mine: " + destinationWallet +
    "\nAuthorized for user: " + msg.sender +
    "\nDeadline: " + deadline
)
```
This signature is bound to:
- The specific `destinationWallet` address
- The initiating `msg.sender` (cannot be replayed by another user)
- The `deadline` (auto-expires)

### 5. Steps Hash Verification
At `executeStrategy`, the entire `Step[]` array is hashed: `stepsHash = keccak256(abi.encode(steps))`. When the relayer calls `continueStrategy`, it must supply the same steps array — verified against the stored hash. The relayer cannot substitute different steps.

### 6. Reentrancy Protection
All three state-mutating external entry points (`executeStrategy`, `continueStrategy`, `emergencyExit`) are protected by `nonReentrant`. State is written before any external call (CEI pattern).

### 7. Protocol Allowlist
No call to an external protocol is made unless `approvedProtocols[protocol]` is `true`. This prevents a user from routing funds through an arbitrary malicious contract.

### 8. Slippage Protection
Every SWAP step carries a `minOutput` field. The contract checks `amountOut >= step.minOutput` and reverts the step (triggering `_failStrategy`) if not met.

### 9. Fee Routing
- **Direct strategy** (`creator == address(0)`): 8 bps → treasury
- **Marketplace strategy** (`creator != address(0)`): 2 bps → creator, 3 bps → treasury
- Fee calculated on `sourceAmount` before execution begins
- `FeeDistributed` event emitted on every fee transfer for full auditability

---

## Key Data Structures

### `StrategyState` (per-strategy in-flight state)
```solidity
struct StrategyState {
    address user;           // Original depositor (emergencyExit recipient)
    address sourceAsset;    // Original asset (for fee + emergency return)
    uint256 sourceAmount;   // Original amount (post-fee, for return calc)
    address currentAsset;   // Working asset (changes across SWAP/BRIDGE steps)
    uint256 currentAmount;  // Working amount (updated per step)
    uint256 currentStep;    // Next step to execute
    uint256 totalSteps;     // Total steps in strategy
    bool isActive;          // False after completion or failure
    bool isFailed;          // True if any step failed
    address destinationWallet;
    bytes32 stepsHash;      // keccak256(abi.encode(steps)) — relayer integrity check
}
```

### `Step` (from IMeridianRouter)
```solidity
struct Step {
    StepType stepType;     // SWAP | LEND | BRIDGE | STAKE | SETTLE
    address protocol;      // External protocol address (must be in approvedProtocols)
    bytes params;          // ABI-encoded protocol-specific call data
    uint256 minOutput;     // Slippage floor (reverts step if amountOut < minOutput)
    address outputAsset;   // New working asset after this step (address(0) = unchanged)
}
```

### `Strategy` (user input, calldata only)
```solidity
struct Strategy {
    address sourceAsset;           // ERC-20 token or address(0) for ETH
    uint256 sourceAmount;          // Amount deposited
    Step[] steps;                  // Ordered execution plan
    address destinationWallet;     // Where settled funds land
    bytes destinationSignature;    // EIP-191 sig from destinationWallet
    uint256 deadline;              // Unix timestamp — auto-revert if expired
    address creator;               // address(0) = direct; non-zero = marketplace
}
```

---

## Events

| Event | When | Key Fields |
|-------|------|------------|
| `StrategyStarted` | On `executeStrategy` | strategyId, user, amount, sourceAsset, destinationWallet |
| `StepExecuted` | After each step completes | strategyId, stepIndex, stepType, protocol, amountOut |
| `StrategyCompleted` | After SETTLE step | strategyId, destination, asset, finalAmount |
| `StrategyFailed` | On step failure | strategyId, failedStep, reason |
| `EmergencyExitTriggered` | On `emergencyExit` | strategyId, source, amountReturned |
| `FeeDistributed` | After fee transfer | strategyId, treasury, treasuryFee, creator, creatorFee |
| `RelayerUpdated` | On `setRelayer` | oldRelayer, newRelayer |
| `TreasuryUpdated` | On `setTreasury` | oldTreasury, newTreasury |
| `ProtocolApprovalUpdated` | On `setProtocolApproved` | protocol, approved |

---

## Known Non-Issues (Suppressed Slither Findings)

| Finding | Rationale |
|---------|-----------|
| `reentrancy-eth`, `reentrancy-benign` in `executeStrategy` / `continueStrategy` | `nonReentrant` guards all entry points. Multi-step loop is by design — each step writes state before calling external protocol. |
| `arbitrary-send-eth` in `_transferFee` | Treasury is owner-controlled; fee routing to creator is user-specified and validated non-zero. |
| `calls-loop` in `_executeSwap`, `_executeLend`, `_executeStake`, `_failStrategy` | Multi-step execution is the core use case. All protocols are allowlisted. |
| `unused-return` in `_verifyDestination` | Third return value of `ECDSA.tryRecover` (error string) is intentionally discarded. |

Slither result: 86 → 73 findings. All 73 remaining are OZ library noise or informational.
Mythril result: zero findings (120s symbolic execution, June 1 2026).

---

## Test Coverage

| Suite | Count | Notes |
|-------|-------|-------|
| Foundry unit tests | 50 | All pass. Includes fuzz tests (1000 runs each). |
| Foundry fork tests | 6 | Ethereum mainnet + Arbitrum One. ETH + USDC settle, bridge+emergencyExit, replay. |
| Playwright E2E | 28 | Frontend flows: wallet connect → simulate → execute → track → emergency exit → CSV. |
| Backend Vitest | ~110 | Quote engine, relayer, auth, marketplace, rate limits, etc. |

```
forge test --no-match-test "Fork"   # → 50 passed, 0 failed
forge test --match-test "Fork"      # → 6 passed, 0 failed (requires ETH/ARB fork RPC)
```

---

## Running Tests

```bash
cd contracts

# Unit tests (no fork RPC needed)
forge test --no-match-test "Fork" -v

# Fork tests (requires Alchemy/Infura key)
FOUNDRY_ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/KEY forge test --match-path "*/MeridianRouterFork*" -v

# Static analysis
slither src/MeridianRouter.sol --config-file slither.config.json

# Symbolic execution
myth analyze src/MeridianRouter.sol --solc-json mythril-remappings.json --execution-timeout 120
```

---

## Known Limitations / Out-of-Scope

1. **Protocol adapters are stubs**: `_executeSwap`, `_executeLend`, `_executeStake` currently call `protocol.call(params)` with minimal decoding. In production, each adapter will be a dedicated contract. The adapter contracts are NOT in scope for this audit.

2. **Relayer is centralized**: The relayer that calls `continueStrategy` is currently a single EOA. Compromising the relayer cannot steal funds (the relayer cannot change step parameters), but can halt in-flight strategies. A multi-relayer design is planned.

3. **No upgradability**: The router has no proxy, no `delegatecall`, no `selfdestruct`. A compromised contract would require redeployment.

4. **Bridge-step funds**: Between a BRIDGE step and the `continueStrategy` call, funds are held by the bridge protocol (Stargate / Across), not by MeridianRouter. Bridge protocol risk is out of scope.

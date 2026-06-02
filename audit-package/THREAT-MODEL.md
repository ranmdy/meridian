# Meridian Threat Model

## Attack Vectors Considered

### 1. Reentrancy
**Threat:** Malicious protocol re-enters `executeStrategy` or `emergencyExit` while holding funds.

**Mitigations:**
- `nonReentrant` modifier on all three entry points
- CEI: state written to `_strategies[strategyId]` before any external call
- `isActive` flag set to `false` before final fund transfer in `_settleStrategy`

**Verdict:** Mitigated.

---

### 2. Destination Wallet Theft (Sending to Attacker's Wallet)
**Threat:** Attacker submits strategy with `destinationWallet = attackerAddress`.

**Mitigations:**
- `destinationSignature` must be an EIP-191 signature from `destinationWallet` itself
- Signature message binds `msg.sender` → attacker cannot use a signature they don't have
- On-chain enforcement: `_verifyDestination` reverts if signature doesn't match

**Verdict:** Mitigated.

---

### 3. Signature Replay (Cross-User)
**Threat:** Alice's destination signature is reused by Bob to fund his own strategy.

**Mitigations:**
- Signed message includes `msg.sender` (the initiating user)
- Bob calling `executeStrategy` with Alice's sig: `msg.sender = Bob`, sig was signed for Alice → mismatch → revert

**Verdict:** Mitigated.

---

### 4. Signature Replay (Cross-Chain)
**Threat:** Signature valid on Ethereum is replayed on Arbitrum.

**Mitigations:**
- Signed message includes `block.chainid` — automatically different per chain

**Verdict:** Mitigated.

---

### 5. Steps Substitution by Relayer
**Threat:** Relayer calls `continueStrategy` with different steps than the user originally submitted (e.g., redirect funds to attacker protocol).

**Mitigations:**
- At `executeStrategy`: `stepsHash = keccak256(abi.encode(strategy.steps))` stored on-chain
- At `continueStrategy`: `if (keccak256(abi.encode(steps)) != state.stepsHash) revert StepsHashMismatch()`

**Verdict:** Mitigated.

---

### 6. Strategy ID Collision
**Threat:** Two different strategies produce the same `strategyId`, overwriting the first.

**Mitigations:**
- `strategyId = keccak256(abi.encode(msg.sender, sourceAsset, sourceAmount, destinationWallet, deadline, block.chainid, userNonces[msg.sender]++))`
- Nonce incremented per submission — identical parameters generate different IDs
- `if (_strategies[strategyId].user != address(0)) revert StrategyUsed()`

**Verdict:** Mitigated.

---

### 7. Emergency Exit to Destination
**Threat:** User calls `emergencyExit` expecting funds back, but receives them at `destinationWallet` (which they may not control yet).

**Mitigations:**
- `emergencyExit` explicitly transfers to `state.user` (the depositor), never `state.destinationWallet`
- Code: `_transfer(state.currentAsset, state.user, state.currentAmount)`

**Verdict:** Mitigated (by design).

---

### 8. Admin Drain
**Threat:** Contract owner calls a withdrawal function and drains user funds.

**Mitigations:**
- No admin withdrawal functions exist in the contract
- Owner functions: `setRelayer`, `setTreasury`, `setProtocolApproved` — none touch user funds
- Verified via code review and Slither

**Verdict:** Mitigated (by omission).

---

### 9. Malicious Protocol via Allowlist
**Threat:** Attacker convinces owner to add a malicious protocol to `approvedProtocols`, then submits a strategy that calls it.

**Mitigations:**
- `Ownable2Step` requires a two-step accept — reduces admin key compromise risk
- Protocol approval change emits `ProtocolApprovalUpdated` event — visible on-chain
- Users can inspect `approvedProtocols` before submitting strategies

**Residual risk:** If owner key is compromised, malicious protocol could be added. Mitigate in production with multisig.

---

### 10. Slippage Manipulation
**Threat:** MEV bot sandwiches the swap step, causing `amountOut < minOutput`.

**Mitigations:**
- Contract checks `amountOut >= step.minOutput` after each SWAP step
- If violated, `_failStrategy` is called — funds returned to depositor

**Residual risk:** User-set `minOutput` must be reasonable. Front-end simulation suggests appropriate values.

---

### 11. Deadline Manipulation (Block Timestamp)
**Threat:** Miner manipulates `block.timestamp` to extend a strategy's validity.

**Mitigations:**
- `block.timestamp` manipulation is bounded to ~900 seconds per EIP-1559 rules
- Strategy deadlines are set by users typically hours/days in the future
- Even worst-case manipulation (<15 minutes) doesn't extend a meaningful deadline window

**Verdict:** Acceptable risk.

---

### 12. Cross-Contract Reentrancy via Approved Protocol
**Threat:** Approved protocol re-enters via a different entry point (`emergencyExit`) while `executeStrategy` is active.

**Mitigations:**
- `nonReentrant` is OpenZeppelin's standard guard using a status slot
- All three entry points share the same `_status` slot — mutual exclusion

**Verdict:** Mitigated.

---

## What This Contract Does NOT Protect Against

1. **Bridge protocol failure**: If Stargate/Across is exploited during a bridge step, funds in transit may be lost. This is bridge protocol risk, not MeridianRouter risk.

2. **Relayer downtime**: A stuck relayer means in-flight strategies cannot proceed. Users can use `emergencyExit` to recover funds.

3. **Protocol APY manipulation**: If a lending protocol has artificially inflated APY at submission time, the actual yield may be lower. This is a UX risk, not a security vulnerability.

4. **Frontend compromise**: If the frontend is hacked to submit different strategy parameters, the on-chain checks (sig verification, steps hash) still protect user funds.

5. **ERC-20 token risks**: Fee-on-transfer or rebasing tokens may cause accounting mismatches. The contract assumes standard ERC-20 behavior.

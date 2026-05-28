# Meridian Incident Response Plan

> Last updated: 2026-06-01

---

## 1. Severity Levels

| Level | Description | Example | Response Time |
|-------|-------------|---------|---------------|
| **P0 — Critical** | Funds at risk, active exploit, protocol paused | Router contract exploited, bridge funds stuck, admin key compromise | Immediate — 24/7 on-call |
| **P1 — High** | Service degraded, funds not at risk | Relayer down > 5 min, bridge finality failure, DB unreachable | < 15 minutes |
| **P2 — Medium** | Partial degradation, user impact limited | Quote engine returning stale data, UI error, one chain's RPC down | < 1 hour |
| **P3 — Low** | Minor issue, no user impact | Monitoring alert noise, non-critical test failure | Next business day |

---

## 2. Detection

### Automated Alerts (Datadog / Sentry / Slack)

- **Relayer failure rate > 50%** — anomaly detector fires → `#meridian-alerts` Slack channel
- **Relayer balance < 0.05 ETH** per chain — monitoring.alert() fires
- **API error rate > 5%** — Datadog alert → PagerDuty (P1+)
- **Smart contract unexpected call** — Tenderly monitor (configure on deployment)
- **Strategy stuck > 60 min** — relayer job timeout → emergency exit triggered
- **Email on every strategy failure** — NOTIFY_EMAIL via Resend/SendGrid

### Manual Detection Channels

- User reports via Discord / Twitter → DM to `@meridianops`
- On-chain monitoring: `StrategyFailed` events on Etherscan
- Rekt.news / DeFiLlama Hacks feed — auto-flagged by exploit-feed service

---

## 3. Response Procedures

### P0 — Active Exploit (Funds at Risk)

1. **Page on-call engineer immediately** (PagerDuty escalation chain)
2. **Do NOT announce publicly** until funds are secured or exploit window is closed
3. **Pause the protocol** (if pause function exists — review contract for `pause()` capability)
4. **Contact affected users** via email/Discord DM within 1 hour
5. **Engage whitehat** — contact security@meridian.finance with full exploit details
6. **Contact bridge/protocol partners** if their contracts are involved
7. **Document** every action with timestamp in incident Slack channel `#incident-YYYY-MM-DD`
8. **Post-mortem** within 72 hours — root cause, timeline, fix, preventive measures

### P0 — Key Compromise

1. Immediately rotate compromised key (relayer PK, admin key, JWT secret)
2. Revoke and reissue all derived secrets (API keys, session tokens)
3. If relayer key: drain relayer wallets to cold storage manually
4. If treasury key: engage multisig co-signers immediately
5. Audit last 24 hours of transactions from the compromised key

### P1 — Relayer Down

1. Check Datadog → relayer job queue depth + failure rate
2. Restart relayer process on ECS (or EC2 `sudo systemctl restart meridian-relayer`)
3. Verify relayer wallets are funded on each chain
4. Check RPC endpoints — switch to fallback (QuickNode) if Alchemy is down
5. If BullMQ queue is corrupted: `redis-cli FLUSHDB` on relayer queue DB (data loss — use only as last resort)
6. For each stuck strategy: check `executionRegistry` state; trigger emergency exit manually if bridge is unresponsive

### P1 — Bridge Finality Failure

1. Identify which bridge (Stargate / Across / Hop / Wormhole) is affected
2. Check bridge status pages and Discord channels
3. If stuck > 2 hours: trigger emergency exit for affected strategies
4. Temporarily disable the affected bridge in the strategy engine's routing config (`BLOCKED_PROTOCOLS` env var)
5. Notify affected users via email (monitoring.notifyFailure)

### P2 — Stale Quote Data

1. Restart quote engine polling: `pnpm restart quote-engine` (or restart the backend)
2. Check if 1inch / Paraswap / DeFiLlama APIs are down (third-party status pages)
3. Frontend will display "Quote expired" badge — users cannot execute until quotes refresh
4. If prolonged outage (> 30 min): post status update on Discord

---

## 4. Communication Templates

### User-Facing Status Update (Twitter/Discord)

```
⚠️ Meridian Status Update [HH:MM UTC]

We are currently investigating an issue with [component].
Affected: [what users see]
Status: [investigating / identified / fixing / resolved]
Funds are safe / [status].

Next update in 30 minutes. @meridianops
```

### Post-Incident (within 72 hours)

```
📋 Incident Post-Mortem — [Date]

**What happened:** [1-2 sentence summary]
**Impact:** [users affected, duration, any fund loss]
**Root cause:** [technical explanation]
**Timeline:**
  HH:MM — [event]
  HH:MM — [event]
**Fix:** [what was done]
**Prevention:** [what changes were made to prevent recurrence]

We apologize for the inconvenience. Our full report is at: [link]
```

---

## 5. Rollback Procedures

### Backend API Rollback

```bash
# ECS: force new deployment of previous task definition
aws ecs update-service \
  --cluster meridian-prod \
  --service meridian-backend \
  --task-definition meridian-backend:PREVIOUS_VERSION \
  --force-new-deployment
```

### Frontend Rollback

```bash
# Vercel: redeploy a previous deployment
vercel rollback [deployment-url]
```

### Contract Rollback

> Contracts are NOT upgradeable (by design — no proxy pattern). Rollback means:
> 1. Deploy a new version of the contract with the fix
> 2. Update `ROUTER_ADDRESS_*` env vars on all backend services
> 3. Announce the new contract address via all channels
> 4. Old strategies will continue on the old contract (they have a deadline)

---

## 6. On-Call Rotation

| Week | Primary | Secondary | Escalation |
|------|---------|-----------|------------|
| _TBD after hiring_ | | | founders |

**PagerDuty policy:** P0/P1 pages repeat every 5 minutes until acknowledged. Escalation to secondary after 10 minutes. Escalation to founders after 20 minutes.

---

## 7. Post-Incident Requirements

- [ ] Incident timeline documented in `#incident-*` Slack channel
- [ ] Root cause identified
- [ ] Fix deployed and verified
- [ ] Post-mortem written and reviewed
- [ ] Action items created with owners and due dates
- [ ] Bug bounty disclosure coordinated (if external reporter found it)
- [ ] Public post-mortem published (for P0/P1)
- [ ] Protocol resumed (if paused)

---

## 8. Key Contacts

| Role | Contact |
|------|---------|
| Security reports | security@meridian.finance |
| Compliance / OFAC | compliance@meridian.finance |
| Legal | legal@meridian.finance |
| User support | support@meridian.finance |
| Bridge partners | [Stargate Discord](https://discord.gg/stargate) / [Across Discord](https://discord.gg/across) |
| Bug bounty | Immunefi platform (once registered) |

---

*This document is a living plan. Update after every incident.*

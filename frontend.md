# Meridian Frontend Migration Plan
## Old Design → Claude Design Export

---

## 1. What the Current Frontend Does

### Pages & Routes

| Route | What It Does |
|-------|-------------|
| `/` | Hero + StrategyForm + SavedStrategies + TemplateLibrary + RouteList (two-column layout) |
| `/dashboard` | Full 1800-line trading dashboard — active routes, PnL chart, portfolio sidebar, chat support, risk panel |
| `/composer` | Drag-and-drop ReactFlow node builder for custom strategy composition |
| `/marketplace` | Browse/vote/copy community strategies with sort + category filters |
| `/portfolio` | EVM + Solana asset balances, allocation bar, execution history, analytics charts |
| `/billing` | Subscription management |
| `/settings` | API key management (create, revoke, usage stats) |
| `/execution/[id]` | Real-time execution tracker — WebSocket + HTTP polling fallback, settlement screen, export |
| `/blocked` | OFAC geo-block compliance page |

---

### Functionality Inventory (what must survive the migration)

#### A. Strategy Form
- Source asset selector (ETH / USDC / USDT / WBTC)
- Source chain selector (9 EVM chains)
- Amount input (USD)
- Destination chain selector (excludes source)
- Destination wallet input + signature verification
- Risk tolerance slider (1–5 with labels)
- Time horizon (days)
- Auto Mode toggle (auto-select best route vs. manual multi-route)
- Auto-detected assets banner (from connected wallet)
- "Find Best Routes" → calls `/strategy/optimize` or `/strategy/auto-optimize`
- Save strategy to localStorage
- Load / delete saved strategies

#### B. Route Display
- List of ranked routes with APY, fees, time, risk score
- Risk score color coding (green / yellow / red)
- Step-by-step path display (swap → bridge → lend → settle with protocol labels)
- Route selection (click to select)
- Auto-mode explanation + collapsible alternatives
- Quote expiry countdown
- Simulation results panel (gas, APY, step-by-step pass/fail)

#### C. Execution Flow
- Risk modal for scores ≥ 40
- ERC-20 allowance check → approval → execution (on-chain via MeridianRouter contract)
- Stage-labelled execute button (checking allowance → approving → waiting → confirmed)
- Register execution with backend after on-chain submission
- Real-time step tracker (WebSocket → HTTP polling fallback)
- Settlement screen on completion (tx hash links, export, share on X)
- Execution history (last 20, persisted to localStorage + backend DB)

#### D. Portfolio
- EVM balances: 4 tokens × 9 chains using Viem public clients
- Solana balance: SOL + USDC SPL
- USD valuation via live price feed (`/prices` polled every 60s)
- Grouped by chain with allocation bar
- Analytics charts: cumulative yield area chart, fees breakdown stacked bar

#### E. Wallet & Auth
- EVM wallet: Injected (MetaMask), WalletConnect, Coinbase Wallet via Wagmi
- Solana wallet: Phantom, Solflare via `@solana/wallet-adapter`
- Sign-in: nonce → wallet signature → JWT session (stored in Zustand + localStorage)

#### F. Marketplace
- Browse strategies (sort by votes / yield / risk / popular / newest)
- Vote on strategies
- Copy strategy → pre-fills form → redirects to home

#### G. Composer
- ReactFlow drag-and-drop node builder
- Protocol palette with search + kind filters
- Live APY on nodes (polled every 30s from `/strategy/apy`)
- Compose → submit to `/strategy/compose` → get route quote

#### H. Templates
- Fetch from backend `/templates` with category + sort filters
- "Use" button pre-fills form and scrolls up

#### I. Settings & Billing
- API key create / revoke / list with usage stats
- Subscription management

#### J. State (Zustand stores — must be preserved)
- **strategy store**: form inputs, routes, saved strategies, auto mode, quote expiry
- **execution store**: active execution ID, status, history (last 20)
- **auth store**: JWT token, wallet, expiry

---

## 2. The New Claude Design (Target)

### What `design-export.tsx` Has
- Dark theme (gray-950) — matches existing
- Hero section: "Every asset has a destination. We find the best path there."
- Sticky Navbar with logo, Marketplace + Portfolio links, Connect Wallet button
- StrategyForm panel: asset, chain, amount, destination chain, wallet verification, risk slider, time horizon, "Find Best Routes" button
- RouteCard: rank, APY, emoji step icons (↔ swap, 🌉 bridge, 🏦 lend, ✓ settle), fees, time, risk (color-coded)
- RouteList: "N Routes Found" header, list of RouteCards, "Execute Selected Route" button, disclaimer
- Two-column grid layout (form left, routes right)
- Color palette: meridian (indigo), green (verified/low risk), yellow (warning), red (high risk)
- Clean card-based UI with glass panels

### What the Design Does NOT Have Yet (needs wiring)
- Live data (all mock)
- Wallet connection logic
- Execution flow
- Simulation panel
- Risk modal
- Auto mode toggle
- Saved strategies / template library
- Nav links to other pages

---

## 3. Migration Strategy

The goal is: **replace the visual layer with the Claude design while keeping all existing logic/hooks/stores intact.**

We are NOT rewriting logic. We are reskinning components to match the design export's visual style.

### Approach
- Keep all hooks, stores, lib files, and API calls exactly as-is
- Replace the JSX/styling in each component to match the design export
- The design export becomes the style reference, not a replacement codebase

---

## 4. Step-by-Step Migration Plan

### Phase 1 — Foundation
**Step 1.1** — Extract the design system from `design-export.tsx`
- Identify all color classes, spacing, border radius, shadow patterns
- Verify `tailwind.config` has `meridian` color defined
- Confirm all utility classes are available or add missing ones

**Step 1.2** — Restyle `Navbar.tsx`
- Match design export: logo "◆" in meridian box, subtitle, nav links, Connect Wallet button
- Keep all existing links (Composer, Marketplace, Portfolio, Billing, API Keys)
- Keep SignInButton, SolanaConnectButton, ConnectButton — just reskin them

**Step 1.3** — Restyle root `page.tsx` layout
- Match design export: hero section, two-column grid (form left, routes right)
- Keep all imported components — just update the layout wrapper

---

### Phase 2 — Core Components (Home Page)
**Step 2.1** — Restyle `StrategyForm.tsx`
- Match design export form panel (glass card, field labels, input styles)
- Keep ALL existing state management, handlers, and logic unchanged
- Fields to restyle: asset select, chain select, amount input, destination chain, wallet input + verify button, risk slider, time horizon, Find Routes button
- Keep auto mode toggle, detected assets banner, error messages

**Step 2.2** — Restyle `RouteCard.tsx`
- Match design export card (selected: indigo border + shadow, unselected: gray-800)
- Keep existing click handler and route selection logic
- Apply emoji step icons (↔ 🌉 🏦 📈 ✓) matching design
- Keep fees / time / risk grid with color coding

**Step 2.3** — Restyle `RouteList.tsx`
- Match design export: "N Routes Found" header, cards, Execute button, disclaimer
- Keep ALL execution logic, stage labels, error handling, quote expiry
- Keep simulation panel and risk modal trigger

**Step 2.4** — Restyle `RiskModal.tsx`
- Match design language (dark modal, risk bar, disclosure points)

**Step 2.5** — Restyle `SimulationPanel.tsx`
- Match design language (subtle card, grid metrics, step list)

---

### Phase 3 — Supporting Home Components
**Step 3.1** — Restyle `SavedStrategies.tsx`
- Match design language (collapsible card, badges, load/delete buttons)

**Step 3.2** — Restyle `TemplateLibrary.tsx`
- Match design language (filter chips, template cards, "Use" button)

---

### Phase 4 — Other Pages
**Step 4.1** — Restyle `ExecutionPoller` + `StepTracker` + `SettlementScreen`
- Match design language for execution detail page
- Keep all WebSocket/polling logic, explorer links, export buttons

**Step 4.2** — Restyle `PortfolioView` + `PortfolioCharts` + `AnalyticsSection`
- Match design language for portfolio page

**Step 4.3** — Restyle `MarketplaceBrowser`

**Step 4.4** — Restyle `StrategyComposer` + `NodePalette`

**Step 4.5** — Restyle `ApiKeysPanel` + `BillingPanel`

---

### Phase 5 — Cleanup
**Step 5.1** — Delete or archive `design-export.tsx` (no longer needed as reference)
**Step 5.2** — Run full ESLint + TypeScript check
**Step 5.3** — Smoke test all routes locally
**Step 5.4** — Commit and push — CI must go green

---

## 5. Prerequisites Before Starting

### Must Confirm / Fix First

- [ ] **Tailwind `meridian` color** — Verify `tailwind.config.js` has `meridian` defined as an indigo-based scale. The design uses `meridian-400`, `meridian-500`, `meridian-600`. If missing, add it before touching any component.

- [ ] **`design-export.tsx` route** — Decide: archive the file or move to `/design-preview` for reference during migration. Should not stay as an orphan in `app/`.

- [ ] **`globals.css` baseline** — Confirm base styles (dark scrollbar, font stack, ring/focus colors) match what the design expects.

- [ ] **All CI checks green** — They are. Good. Do not start migration on a broken main.

- [ ] **Local dev running** — Anvil, backend, and frontend all up (`localhost:3000`). Verify you can see the current home page before making changes.

- [ ] **Component-by-component commits** — Agree to commit after each step (one component = one commit). If a step breaks CI, fix before moving on.

- [ ] **No logic changes** — Agree that during this migration, no hooks, stores, API calls, or business logic will change. Visual only. This prevents bugs sneaking in under the cover of a "reskin".

- [ ] **Dashboard decision** — The `/dashboard` page is a completely separate 1800-line file not based on the design export. Decide: migrate it in Phase 4, or leave it as-is for now and focus on the home page first.

- [ ] **Block explorer + contract addresses** — Not a migration blocker, but note that `ROUTER_ADDRESS_*` env vars are currently set to Anvil defaults. Real execution will need these updated before going to testnet.

---

## 6. Order of Work Summary

```
Phase 1  →  Tailwind config + Navbar + root layout
Phase 2  →  StrategyForm + RouteCard + RouteList + RiskModal + SimulationPanel   ← most visible, do first
Phase 3  →  SavedStrategies + TemplateLibrary
Phase 4  →  Execution pages + Portfolio + Marketplace + Composer + Settings
Phase 5  →  Cleanup + CI green + push
```

**Start with Phase 2** — that is the Claude design export. Once the home page matches the design, the rest is applying the same language to the other pages.

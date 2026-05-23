# Contributing to Meridian

## Getting Started

1. Fork the repo and clone your fork.
2. Install prerequisites: Node.js 20+, pnpm 9+, Foundry (nightly).
3. Install dependencies:

```bash
pnpm install --ignore-scripts
cd contracts && forge install
```

4. Copy environment files:

```bash
cp contracts/.env.example contracts/.env
cp backend/.env.example backend/.env
```

5. Start local services (requires Docker):

```bash
docker compose up -d   # postgres + redis
cd backend && pnpm migrate
```

## Project Structure

```
contracts/   Solidity contracts (Foundry + Hardhat)
backend/     Fastify API server (Node.js + TypeScript)
frontend/    Next.js 14 app
sdk/         TypeScript SDK (future)
docs/        Architecture, API contract, Redis schema
```

## Workflow

- Branch from `develop` (not `main`).
- Branch naming: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`.
- Open a PR against `develop`. `main` is release-only.
- All CI checks must pass before merge.
- Squash-merge preferred for feature branches.

## Code Standards

### TypeScript (backend + frontend)

- Strict mode enabled (`"strict": true` in tsconfig).
- No `any` without a comment explaining why.
- Run `pnpm lint` and `pnpm tsc --noEmit` before pushing.

### Solidity (contracts)

- Solc 0.8.24, optimizer 200 runs.
- Follow NatSpec on all public/external functions.
- Run `solhint 'src/**/*.sol'` before pushing.
- Every new function needs at least one test.

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(router): add emergencyExit timeout
fix(pathfinder): handle zero-liquidity edges
test(relayer): add retry exhaustion case
chore(deps): bump wagmi to 2.14
```

## Testing

```bash
# Contracts
cd contracts && forge test -vvv

# Backend
cd backend && pnpm test

# Frontend
cd frontend && pnpm test   # (vitest, once set up)
```

All tests must pass. Do not disable tests to make CI green.

## Security

- Never commit private keys, mnemonics, or API keys — even test ones.
- `.env` files are gitignored. Use `.env.example` for templates.
- For security vulnerabilities: email security@meridian.fi (do not open a public issue).

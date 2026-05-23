-- Meridian — Initial Database Schema
-- Migration: 001_initial_schema
-- Run with: psql $DATABASE_URL -f migrations/001_initial_schema.sql

BEGIN;

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
    id              TEXT PRIMARY KEY DEFAULT 'usr_' || gen_random_uuid()::text,
    wallet_address  TEXT NOT NULL UNIQUE,
    ens_name        TEXT,
    email           TEXT UNIQUE,
    tier            TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'business')),
    api_key         TEXT UNIQUE,                 -- hashed, for Business tier
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ
);

CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_api_key ON users(api_key) WHERE api_key IS NOT NULL;

-- ─── Auth Sessions ────────────────────────────────────────────────────────────

CREATE TABLE auth_nonces (
    address     TEXT PRIMARY KEY,
    nonce       TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL
);

-- ─── Subscriptions ────────────────────────────────────────────────────────────

CREATE TABLE subscriptions (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier                TEXT NOT NULL CHECK (tier IN ('pro', 'business')),
    stripe_customer_id  TEXT,
    stripe_sub_id       TEXT,
    active_until        TIMESTAMPTZ NOT NULL,
    cancelled_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);

-- ─── Strategies (Marketplace) ─────────────────────────────────────────────────

CREATE TABLE strategies (
    id              TEXT PRIMARY KEY DEFAULT 'strat_' || gen_random_uuid()::text,
    creator_id      TEXT NOT NULL REFERENCES users(id),
    name            TEXT NOT NULL,
    description     TEXT,
    steps_json      JSONB NOT NULL,              -- serialised Step[] array
    chain_ids       INTEGER[] NOT NULL,          -- chains involved
    protocols       TEXT[] NOT NULL,             -- protocol names
    ipfs_hash       TEXT,                        -- full strategy on IPFS
    on_chain_id     TEXT,                        -- bytes32 from StrategyRegistry
    estimated_apy_bps INTEGER,
    risk_score      INTEGER,
    published       BOOLEAN NOT NULL DEFAULT FALSE,
    deprecated      BOOLEAN NOT NULL DEFAULT FALSE,
    execution_count INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_strategies_creator ON strategies(creator_id);
CREATE INDEX idx_strategies_published ON strategies(published, deprecated);
CREATE INDEX idx_strategies_apy ON strategies(estimated_apy_bps DESC) WHERE published = TRUE;

-- ─── Executions ───────────────────────────────────────────────────────────────

CREATE TYPE execution_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'failed',
    'emergency_exited'
);

CREATE TABLE executions (
    id                  TEXT PRIMARY KEY DEFAULT 'exec_' || gen_random_uuid()::text,
    user_id             TEXT NOT NULL REFERENCES users(id),
    strategy_id         TEXT REFERENCES strategies(id),  -- null for custom strategies
    on_chain_strategy_id TEXT,                            -- bytes32 from Router event
    status              execution_status NOT NULL DEFAULT 'pending',
    source_asset        TEXT NOT NULL,                   -- token address or symbol
    source_chain        INTEGER NOT NULL,
    source_amount       NUMERIC NOT NULL,                -- in token units (wei-level)
    source_amount_usd   NUMERIC,
    destination_wallet  TEXT NOT NULL,
    destination_chain   INTEGER NOT NULL,
    current_step        INTEGER NOT NULL DEFAULT 0,
    total_steps         INTEGER NOT NULL,
    submit_tx_hash      TEXT,                            -- executeStrategy() tx
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    failed_at           TIMESTAMPTZ,
    failure_reason      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_executions_user ON executions(user_id, created_at DESC);
CREATE INDEX idx_executions_status ON executions(status) WHERE status IN ('pending', 'in_progress');
CREATE INDEX idx_executions_on_chain_id ON executions(on_chain_strategy_id) WHERE on_chain_strategy_id IS NOT NULL;

-- ─── Execution Steps ──────────────────────────────────────────────────────────

CREATE TYPE step_status AS ENUM ('pending', 'in_progress', 'done', 'failed');

CREATE TABLE execution_steps (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    execution_id    TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
    step_index      INTEGER NOT NULL,
    step_type       TEXT NOT NULL CHECK (step_type IN ('SWAP','LEND','BRIDGE','STAKE','SETTLE')),
    protocol        TEXT NOT NULL,
    protocol_addr   TEXT,
    from_asset      TEXT,
    to_asset        TEXT,
    from_chain      INTEGER,
    to_chain        INTEGER,
    amount_in       NUMERIC,
    amount_out      NUMERIC,
    amount_in_usd   NUMERIC,
    amount_out_usd  NUMERIC,
    gas_paid_eth    NUMERIC,
    gas_paid_usd    NUMERIC,
    protocol_fee_usd NUMERIC,
    bridge_fee_usd  NUMERIC,
    tx_hash         TEXT,
    block_number    BIGINT,
    chain_id        INTEGER,
    status          step_status NOT NULL DEFAULT 'pending',
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,

    UNIQUE(execution_id, step_index)
);

CREATE INDEX idx_steps_execution ON execution_steps(execution_id, step_index);
CREATE INDEX idx_steps_tx ON execution_steps(tx_hash) WHERE tx_hash IS NOT NULL;

-- ─── API Usage Tracking ───────────────────────────────────────────────────────

CREATE TABLE api_usage (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id     TEXT NOT NULL REFERENCES users(id),
    endpoint    TEXT NOT NULL,
    method      TEXT NOT NULL,
    status_code INTEGER,
    response_ms INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_usage_user_month ON api_usage(user_id, created_at);

-- ─── Updated-at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER strategies_updated_at
    BEFORE UPDATE ON strategies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

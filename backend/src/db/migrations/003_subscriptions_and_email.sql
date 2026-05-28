-- Migration 003: fix subscriptions table and add user email endpoint support
--
-- Changes:
--   1. subscriptions.tier: widen constraint to include 'api' (was only 'pro', 'business')
--   2. subscriptions: add status, cancel_at_period_end columns to match in-memory model
--   3. users: ensure email column accepts null (already nullable in 001, but document intent)

BEGIN;

-- 1. Drop and recreate the tier constraint with 'api' included
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IN ('pro', 'business', 'api'));

-- 2. Add subscription lifecycle columns that the in-memory stripe service tracks
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS current_period_end  TIMESTAMPTZ;

-- 3. Rename active_until → current_period_end alias (keep active_until for backwards compat)
--    active_until already exists — no rename needed; current_period_end is a second column
--    that the billing service will use going forward.

COMMIT;

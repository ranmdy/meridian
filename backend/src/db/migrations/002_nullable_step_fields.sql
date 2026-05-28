-- Migration 002: relax NOT NULL on step_type and protocol in execution_steps
-- These fields are not known at step-creation time (only stepCount is sent by the
-- frontend); they get filled in as the relayer processes each step.

BEGIN;

ALTER TABLE execution_steps
  ALTER COLUMN step_type DROP NOT NULL,
  ALTER COLUMN protocol  DROP NOT NULL;

COMMIT;

/**
 * Execution Store — PostgreSQL persistence for executions and execution_steps.
 *
 * All functions are fire-and-forget safe: they log errors but never throw, so
 * the in-memory ExecutionRegistry always stays authoritative for live queries.
 *
 * Schema: see migrations/001_initial_schema.sql + 002_nullable_step_fields.sql
 */
import type { OverallStatus, StepStatus } from '../services/execution-registry/index.js';
import { getPool } from './index.js';

// ─── User ──────────────────────────────────────────────────────────────────────

/**
 * Find or create a user row by wallet address. Returns the user's primary key.
 */
async function findOrCreateUser(walletAddress: string): Promise<string | null> {
  const pool = getPool();
  if (!pool) return null;

  const wallet = walletAddress.toLowerCase();

  await pool.query(
    `INSERT INTO users (wallet_address) VALUES ($1) ON CONFLICT (wallet_address) DO NOTHING`,
    [wallet],
  );

  const res = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE wallet_address = $1`,
    [wallet],
  );

  return res.rows[0]?.id ?? null;
}

// ─── User profile ──────────────────────────────────────────────────────────────

/**
 * Fetch the email stored for a wallet address.
 * Returns null if not found or DB not configured.
 */
export async function getUserEmail(walletAddress: string): Promise<string | null> {
  const pool = getPool();
  if (!pool) return null;

  try {
    const res = await pool.query<{ email: string | null }>(
      `SELECT email FROM users WHERE wallet_address = $1`,
      [walletAddress.toLowerCase()],
    );
    return res.rows[0]?.email ?? null;
  } catch (err) {
    console.error('[ExecutionStore] getUserEmail error:', (err as Error).message);
    return null;
  }
}

/**
 * Update (or clear) the email stored for a wallet address.
 * Creates the user row if it doesn't exist yet.
 */
export async function updateUserEmail(
  walletAddress: string,
  email: string | null,
): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  try {
    // Ensure the user row exists first
    await pool.query(
      `INSERT INTO users (wallet_address) VALUES ($1) ON CONFLICT (wallet_address) DO NOTHING`,
      [walletAddress.toLowerCase()],
    );
    await pool.query(
      `UPDATE users SET email = $2 WHERE wallet_address = $1`,
      [walletAddress.toLowerCase(), email ?? null],
    );
    return true;
  } catch (err) {
    console.error('[ExecutionStore] updateUserEmail error:', (err as Error).message);
    return false;
  }
}

// ─── Executions ────────────────────────────────────────────────────────────────

/**
 * Insert a new execution row.
 * The `id` column uses the strategyId prefixed with "exec_".
 */
export async function insertExecution(opts: {
  strategyId: string;
  walletAddress: string;
  sourceAsset: string;
  sourceChain: number;
  destinationChain: number;
  sourceAmountUsd: number;
  totalSteps: number;
  submitTxHash?: string;
  startedAt: number; // Unix seconds
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  try {
    const userId = await findOrCreateUser(opts.walletAddress);
    if (!userId) return;

    await pool.query(
      `INSERT INTO executions (
         id, user_id, source_asset, source_chain, source_amount_usd,
         destination_wallet, destination_chain, total_steps, submit_tx_hash,
         started_at, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10),'pending')
       ON CONFLICT (id) DO NOTHING`,
      [
        `exec_${opts.strategyId}`,
        userId,
        opts.sourceAsset,
        opts.sourceChain,
        opts.sourceAmountUsd,
        opts.walletAddress.toLowerCase(),
        opts.destinationChain,
        opts.totalSteps,
        opts.submitTxHash ?? null,
        opts.startedAt,
      ],
    );
  } catch (err) {
    console.error('[ExecutionStore] insertExecution error:', (err as Error).message);
  }
}

/**
 * Insert placeholder rows for all steps (pending, no amounts yet).
 */
export async function insertExecutionSteps(
  strategyId: string,
  totalSteps: number,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  const execId = `exec_${strategyId}`;

  try {
    const values = Array.from({ length: totalSteps }, (_, i) => i);
    for (const idx of values) {
      await pool.query(
        `INSERT INTO execution_steps (execution_id, step_index, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (execution_id, step_index) DO NOTHING`,
        [execId, idx],
      );
    }
  } catch (err) {
    console.error('[ExecutionStore] insertExecutionSteps error:', (err as Error).message);
  }
}

/**
 * Update overall execution status.
 */
export async function updateExecutionStatus(
  strategyId: string,
  status: OverallStatus,
  opts?: {
    completedAt?: number;
    failedAt?: number;
    failureReason?: string;
    currentStep?: number;
  },
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  try {
    await pool.query(
      `UPDATE executions SET
         status       = $2::execution_status,
         current_step = COALESCE($3, current_step),
         completed_at = CASE WHEN $4::bigint IS NOT NULL THEN to_timestamp($4::bigint) ELSE completed_at END,
         failed_at    = CASE WHEN $5::bigint IS NOT NULL THEN to_timestamp($5::bigint) ELSE failed_at END,
         failure_reason = COALESCE($6, failure_reason)
       WHERE id = $1`,
      [
        `exec_${strategyId}`,
        status,
        opts?.currentStep ?? null,
        opts?.completedAt ?? null,
        opts?.failedAt ?? null,
        opts?.failureReason ?? null,
      ],
    );
  } catch (err) {
    console.error('[ExecutionStore] updateExecutionStatus error:', (err as Error).message);
  }
}

// ─── Read paths ────────────────────────────────────────────────────────────────

/**
 * Fetch all executions for a wallet from the DB, newest first.
 * Returns null if DB is not configured (caller falls back to in-memory).
 */
export async function listExecutionsByWallet(
  walletAddress: string,
  limit = 50,
): Promise<null | Array<{
  strategyId: string;
  sourceAsset: string;
  sourceChain: number;
  destinationChain: number;
  sourceAmountUsd: number;
  status: string;
  currentStep: number;
  totalSteps: number;
  startedAt: number;
  completedAt?: number;
  errorMessage?: string;
}>> {
  const pool = getPool();
  if (!pool) return null;

  try {
    const res = await pool.query<{
      id: string;
      source_asset: string;
      source_chain: number;
      destination_chain: number;
      source_amount_usd: string;
      status: string;
      current_step: number;
      total_steps: number;
      started_at: Date | null;
      completed_at: Date | null;
      failure_reason: string | null;
    }>(
      `SELECT id, source_asset, source_chain, destination_chain, source_amount_usd,
              status, current_step, total_steps, started_at, completed_at, failure_reason
       FROM executions
       WHERE destination_wallet = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [walletAddress.toLowerCase(), limit],
    );

    return res.rows.map((r) => ({
      // strip "exec_" prefix to get the strategyId
      strategyId: r.id.startsWith('exec_') ? r.id.slice(5) : r.id,
      sourceAsset: r.source_asset,
      sourceChain: r.source_chain,
      destinationChain: r.destination_chain,
      sourceAmountUsd: parseFloat(r.source_amount_usd),
      status: r.status,
      currentStep: r.current_step,
      totalSteps: r.total_steps,
      startedAt: r.started_at ? Math.floor(r.started_at.getTime() / 1000) : 0,
      completedAt: r.completed_at ? Math.floor(r.completed_at.getTime() / 1000) : undefined,
      errorMessage: r.failure_reason ?? undefined,
    }));
  } catch (err) {
    console.error('[ExecutionStore] listExecutionsByWallet error:', (err as Error).message);
    return null;
  }
}

/**
 * Update a single execution step (status, txHash, completedAt).
 */
export async function updateExecutionStep(
  strategyId: string,
  stepIndex: number,
  status: StepStatus,
  opts?: {
    txHash?: string;
    chainId?: number;
    completedAt?: number;
    blockNumber?: number;
    gasPaidEth?: number;
    gasPaidUsd?: number;
    protocolFeeUsd?: number;
    bridgeFeeUsd?: number;
    amountIn?: string;
    amountOut?: string;
  },
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  try {
    await pool.query(
      `UPDATE execution_steps SET
         status       = $3::step_status,
         tx_hash      = COALESCE($4, tx_hash),
         chain_id     = COALESCE($5, chain_id),
         completed_at = CASE WHEN $6::bigint IS NOT NULL THEN to_timestamp($6::bigint) ELSE completed_at END,
         started_at   = CASE WHEN $3 = 'in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
         block_number = COALESCE($7, block_number),
         gas_paid_eth = COALESCE($8, gas_paid_eth),
         gas_paid_usd = COALESCE($9, gas_paid_usd),
         protocol_fee_usd = COALESCE($10, protocol_fee_usd),
         bridge_fee_usd   = COALESCE($11, bridge_fee_usd),
         amount_in    = COALESCE($12, amount_in),
         amount_out   = COALESCE($13, amount_out)
       WHERE execution_id = $1 AND step_index = $2`,
      [
        `exec_${strategyId}`,
        stepIndex,
        status,
        opts?.txHash ?? null,
        opts?.chainId ?? null,
        opts?.completedAt ?? null,
        opts?.blockNumber ?? null,
        opts?.gasPaidEth ?? null,
        opts?.gasPaidUsd ?? null,
        opts?.protocolFeeUsd ?? null,
        opts?.bridgeFeeUsd ?? null,
        opts?.amountIn ?? null,
        opts?.amountOut ?? null,
      ],
    );
  } catch (err) {
    console.error('[ExecutionStore] updateExecutionStep error:', (err as Error).message);
  }
}

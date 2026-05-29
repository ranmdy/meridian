/**
 * Database migration runner.
 *
 * Tracks applied migrations in a `schema_migrations` table.
 * Each .sql file in the migrations/ directory is applied exactly once,
 * in filename order, atomically (migration SQL + tracking INSERT in one txn).
 *
 * Usage (CLI):
 *   npx tsx src/db/migrate.ts
 *   pnpm migrate
 *
 * Programmatic:
 *   import { runMigrations } from './db/migrate.js';
 *   await runMigrations();
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const CREATE_TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name        TEXT        PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Strip the outermost BEGIN / COMMIT so we can wrap in our own transaction. */
function stripTransaction(sql: string): string {
  return sql
    .replace(/^\s*BEGIN\s*;/im, '')
    .replace(/\bCOMMIT\s*;?\s*$/im, '')
    .trim();
}

function pad(s: string, width: number): string {
  return s.padEnd(width, ' ');
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runMigrations(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('[migrate] DATABASE_URL not set — skipping');
    return;
  }

  const client = new pg.Client({ connectionString: dbUrl });

  try {
    await client.connect();
    console.log('[migrate] connected');

    // Ensure tracking table exists
    await client.query(CREATE_TRACKING_TABLE);

    // Fetch already-applied migrations
    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY name',
    );
    const applied = new Set(rows.map(r => r.name));

    // Discover migration files
    let files: string[];
    try {
      files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();
    } catch {
      console.warn(`[migrate] migrations directory not found: ${MIGRATIONS_DIR}`);
      return;
    }

    if (files.length === 0) {
      console.log('[migrate] no migration files found');
      return;
    }

    let pending = 0;
    let applied_count = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate]   ${pad('skip', 6)} ${file}`);
        continue;
      }
      pending++;
    }

    if (pending === 0) {
      console.log(`[migrate] up to date (${files.length} migration(s) already applied)`);
      return;
    }

    console.log(`[migrate] ${pending} pending migration(s):`);

    for (const file of files) {
      if (applied.has(file)) continue;

      const filePath = path.join(MIGRATIONS_DIR, file);
      const raw  = fs.readFileSync(filePath, 'utf8');
      const body = stripTransaction(raw);

      process.stdout.write(`[migrate]   apply  ${file} ... `);

      await client.query('BEGIN');
      try {
        await client.query(body);
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        applied_count++;
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw new Error(
          `Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    console.log(`[migrate] done — applied ${applied_count} migration(s)`);
  } finally {
    await client.end();
  }
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (process.argv[1] === __filename) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[migrate] FATAL:', err.message);
      process.exit(1);
    });
}

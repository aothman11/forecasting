/**
 * Neon Postgres database helpers.
 *
 * Uses @neondatabase/serverless — reads DATABASE_URL from environment.
 *
 * REQUIRED SCHEMA (run once in Neon SQL Editor):
 *
 *   -- Named saved plans (per-user snapshots)
 *   CREATE TABLE IF NOT EXISTS saved_plans (
 *     id           TEXT PRIMARY KEY,
 *     name         TEXT NOT NULL,
 *     description  TEXT NOT NULL DEFAULT '',
 *     saved_by_id  TEXT NOT NULL,
 *     saved_by     TEXT NOT NULL,
 *     saved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     version      INTEGER NOT NULL DEFAULT 1,
 *     state        JSONB NOT NULL,
 *     deleted_at   TIMESTAMPTZ
 *   );
 *
 *   -- Shared active plan (one row, synced across all PCs in real-time)
 *   CREATE TABLE IF NOT EXISTS active_plan (
 *     id         INTEGER PRIMARY KEY DEFAULT 1,
 *     data       JSONB NOT NULL,
 *     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 *   );
 *   INSERT INTO active_plan (id, data) VALUES (1, '{}') ON CONFLICT DO NOTHING;
 */
import { neon } from "@neondatabase/serverless";
import type { SavedPlanState } from "./types";

export function getClient() {
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("POSTGRES_URL is not set");
  return neon(url);
}

/**
 * Tagged-template SQL helper that mimics @vercel/postgres's `sql` interface.
 * Returns { rows: T[] }.
 */
export async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<{ rows: T[] }> {
  const db = getClient();
  const rows = (await db(strings, ...values)) as T[];
  return { rows };
}

/**
 * Initialise the database tables if they don't exist yet.
 * Runs at most once per serverless cold start — the promise is cached at
 * module level so concurrent requests don't each pay the DDL round trips.
 */
let _dbInitPromise: Promise<void> | null = null;

export function getDb(): Promise<void> {
  if (_dbInitPromise) return _dbInitPromise;
  _dbInitPromise = (async () => {
    const db = getClient();
    await db`
      CREATE TABLE IF NOT EXISTS saved_plans (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        description  TEXT NOT NULL DEFAULT '',
        saved_by_id  TEXT NOT NULL,
        saved_by     TEXT NOT NULL,
        saved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        version      INTEGER NOT NULL DEFAULT 1,
        state        JSONB NOT NULL,
        deleted_at   TIMESTAMPTZ
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS active_plan (
        id         INTEGER PRIMARY KEY DEFAULT 1,
        data       JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await db`
      INSERT INTO active_plan (id, data)
      VALUES (1, '{}')
      ON CONFLICT DO NOTHING
    `;
  })();
  return _dbInitPromise;
}

// ── Active-plan helpers (shared real-time sync) ───────────────────────────────

/** Fetch the current shared active plan. Returns null on any error. */
export async function getPlan(): Promise<SavedPlanState | null> {
  try {
    const db = getClient();
    const rows = await db`SELECT data FROM active_plan WHERE id = 1 LIMIT 1`;
    const row = rows[0] as { data: SavedPlanState } | undefined;
    return row?.data ?? null;
  } catch {
    return null;
  }
}

/** Upsert the shared active plan. */
export async function savePlan(state: SavedPlanState): Promise<void> {
  const db = getClient();
  await db`
    INSERT INTO active_plan (id, data, updated_at)
    VALUES (1, ${JSON.stringify(state)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE
      SET data       = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
  `;
}

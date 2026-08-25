/**
 * Vercel Postgres database helpers.
 *
 * REQUIRED SCHEMA (run once in Vercel Postgres → Query tab):
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
import { sql as vercelSql } from "@vercel/postgres";
import type { SavedPlanState } from "./types";

/** Re-export `sql` so existing route handlers can import it from here. */
export { vercelSql as sql };

/**
 * Initialise the database tables if they don't exist yet.
 * Call this at the top of every route handler before running queries.
 */
export async function getDb(): Promise<void> {
  await vercelSql`
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
  await vercelSql`
    CREATE TABLE IF NOT EXISTS active_plan (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await vercelSql`
    INSERT INTO active_plan (id, data)
    VALUES (1, '{}')
    ON CONFLICT DO NOTHING
  `;
}

// ── Active-plan helpers (shared real-time sync) ───────────────────────────────

/** Fetch the current shared active plan. Returns null on any error. */
export async function getPlan(): Promise<SavedPlanState | null> {
  try {
    const result = await vercelSql<{ data: SavedPlanState }>`
      SELECT data FROM active_plan WHERE id = 1 LIMIT 1
    `;
    return result.rows[0]?.data ?? null;
  } catch {
    return null;
  }
}

/** Upsert the shared active plan. */
export async function savePlan(state: SavedPlanState): Promise<void> {
  await vercelSql`
    INSERT INTO active_plan (id, data, updated_at)
    VALUES (1, ${JSON.stringify(state)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE
      SET data       = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
  `;
}

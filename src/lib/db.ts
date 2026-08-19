/**
 * Postgres database — server-side plan persistence via Vercel Postgres (Neon).
 * Server-only: never imported by client components.
 *
 * On Vercel, POSTGRES_URL is set automatically when you add a Postgres database
 * to your project (Dashboard → Storage → Postgres).
 * For local dev, add POSTGRES_URL to your .env.local.
 */
import "server-only";
import { sql } from "@vercel/postgres";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = global as any;

/**
 * Ensures the saved_plans table exists. Uses a module-level promise so the
 * CREATE TABLE IF NOT EXISTS only runs once per server instance / cold start.
 */
export async function getDb(): Promise<void> {
  if (!g.__awpSchemaReady) {
    g.__awpSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS saved_plans (
        id          TEXT    PRIMARY KEY,
        name        TEXT    NOT NULL,
        description TEXT    NOT NULL DEFAULT '',
        saved_by_id TEXT    NOT NULL,
        saved_by    TEXT    NOT NULL,
        saved_at    TEXT    NOT NULL,
        version     INTEGER NOT NULL DEFAULT 1,
        state       TEXT    NOT NULL,
        deleted_at  TEXT    DEFAULT NULL
      )
    `.then(() =>
      sql`
        CREATE INDEX IF NOT EXISTS idx_saved_plans_saved_at
          ON saved_plans (saved_at DESC)
          WHERE deleted_at IS NULL
      `
    ).then(() => undefined as void);
  }
  return g.__awpSchemaReady as Promise<void>;
}

export { sql };

/**
 * SQLite database — server-side plan persistence.
 * Server-only: never imported by client components.
 *
 * Uses a global singleton so the connection survives Next.js HMR in dev mode
 * without reopening the file on every hot-module reload.
 */
import "server-only";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR  = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "plans.db");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = global as any;

function openDb(): Database.Database {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");   // concurrent reads while writing
  db.pragma("foreign_keys = ON");

  db.exec(`
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
    );

    CREATE INDEX IF NOT EXISTS idx_saved_plans_saved_at
      ON saved_plans (saved_at DESC)
      WHERE deleted_at IS NULL;
  `);

  return db;
}

export function getDb(): Database.Database {
  if (!g.__awpDb) g.__awpDb = openDb();
  return g.__awpDb as Database.Database;
}

/**
 * /api/plans
 *
 * GET  — list all active saved plans (metadata only, no state blob)
 * POST — save a new full plan snapshot
 *
 * Auth: any active session. Reads identity from the encrypted session cookie.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

// ── helpers ────────────────────────────────────────────────────────────────

function shortId(): string {
  // 21-char alphanumeric — no external dependency
  return crypto.randomUUID().replace(/-/g, "").slice(0, 21);
}

// ── GET /api/plans ─────────────────────────────────────────────────────────

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();

  const rows = db
    .prepare(
      `SELECT id, name, description, saved_by_id, saved_by, saved_at, version
       FROM saved_plans
       WHERE deleted_at IS NULL
       ORDER BY saved_at DESC`
    )
    .all() as {
      id: string; name: string; description: string;
      saved_by_id: string; saved_by: string; saved_at: string; version: number;
    }[];

  const plans = rows.map((r) => ({
    id:          r.id,
    name:        r.name,
    description: r.description,
    savedById:   r.saved_by_id,
    savedBy:     r.saved_by,
    savedAt:     r.saved_at,
    version:     r.version,
  }));

  return NextResponse.json(plans);
}

// ── POST /api/plans ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: string; description?: string; state?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description = "", state } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!state || typeof state !== "object") {
    return NextResponse.json({ error: "state is required and must be an object" }, { status: 400 });
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    console.error("[POST /api/plans] getDb() failed:", err);
    return NextResponse.json({ error: "Database unavailable", detail: String(err) }, { status: 500 });
  }

  const id  = shortId();
  const now = new Date().toISOString();

  let stateJson: string;
  try {
    stateJson = JSON.stringify(state);
  } catch (err) {
    console.error("[POST /api/plans] JSON.stringify(state) failed:", err);
    return NextResponse.json({ error: "State is not serializable", detail: String(err) }, { status: 400 });
  }

  try {
    db.prepare(
      `INSERT INTO saved_plans
         (id, name, description, saved_by_id, saved_by, saved_at, version, state)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      name.trim(),
      String(description).trim(),
      session.userId,
      session.name ?? session.email ?? "unknown",
      now,
      stateJson,
    );
  } catch (err) {
    console.error("[POST /api/plans] INSERT failed:", err);
    return NextResponse.json({ error: "Failed to save plan", detail: String(err) }, { status: 500 });
  }

  return NextResponse.json({ id, savedAt: now }, { status: 201 });
}

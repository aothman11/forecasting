/**
 * /api/plans/[id]
 *
 * GET    — fetch one plan (metadata + full state blob)
 * PATCH  — rename / update description
 * DELETE — soft-delete (own plan or admin)
 *
 * Auth: any active session. Only the plan owner (or admin) may PATCH/DELETE.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/plans/[id] ────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = getDb();

  const row = db
    .prepare(
      `SELECT id, name, description, saved_by_id, saved_by, saved_at, version, state
       FROM saved_plans WHERE id = ? AND deleted_at IS NULL`
    )
    .get(id) as {
      id: string; name: string; description: string;
      saved_by_id: string; saved_by: string; saved_at: string;
      version: number; state: string;
    } | undefined;

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id:          row.id,
    name:        row.name,
    description: row.description,
    savedById:   row.saved_by_id,
    savedBy:     row.saved_by,
    savedAt:     row.saved_at,
    version:     row.version,
    state:       JSON.parse(row.state),
  });
}

// ── PATCH /api/plans/[id] ──────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = getDb();

  const row = db
    .prepare("SELECT saved_by_id FROM saved_plans WHERE id = ? AND deleted_at IS NULL")
    .get(id) as { saved_by_id: string } | undefined;

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.saved_by_id !== session.userId && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { name?: string; description?: string };
  try { body = await req.json(); } catch { body = {}; }

  const sets: string[]    = [];
  const vals: unknown[] = [];
  if (body.name        !== undefined) { sets.push("name = ?");        vals.push(body.name.trim()); }
  if (body.description !== undefined) { sets.push("description = ?"); vals.push(body.description.trim()); }
  if (sets.length === 0) return NextResponse.json({ ok: true });

  vals.push(id);
  // better-sqlite3 run() accepts rest args; cast through unknown[] to satisfy TS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.prepare(`UPDATE saved_plans SET ${sets.join(", ")} WHERE id = ?`).run(...(vals as any[]));

  return NextResponse.json({ ok: true });
}

// ── DELETE /api/plans/[id] ─────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = getDb();

  const row = db
    .prepare("SELECT saved_by_id FROM saved_plans WHERE id = ? AND deleted_at IS NULL")
    .get(id) as { saved_by_id: string } | undefined;

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.saved_by_id !== session.userId && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  db.prepare("UPDATE saved_plans SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), id);

  return NextResponse.json({ ok: true });
}

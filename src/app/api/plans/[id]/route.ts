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
import { getDb, sql } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/plans/[id] ────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  try {
    await getDb();
    const { rows } = await sql`
      SELECT id, name, description, saved_by_id, saved_by, saved_at, version, state
      FROM saved_plans WHERE id = ${id} AND deleted_at IS NULL
    `;

    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = rows[0];

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
  } catch (err) {
    console.error("[GET /api/plans/[id]] failed:", err);
    return NextResponse.json({ error: "Database error", detail: String(err) }, { status: 500 });
  }
}

// ── PATCH /api/plans/[id] ──────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  try {
    await getDb();
    const { rows } = await sql`
      SELECT saved_by_id FROM saved_plans WHERE id = ${id} AND deleted_at IS NULL
    `;

    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (rows[0].saved_by_id !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { name?: string; description?: string };
    try { body = await req.json(); } catch { body = {}; }

    const hasName = body.name !== undefined;
    const hasDesc = body.description !== undefined;
    if (!hasName && !hasDesc) return NextResponse.json({ ok: true });

    if (hasName && hasDesc) {
      await sql`UPDATE saved_plans SET name = ${body.name!.trim()}, description = ${body.description!.trim()} WHERE id = ${id}`;
    } else if (hasName) {
      await sql`UPDATE saved_plans SET name = ${body.name!.trim()} WHERE id = ${id}`;
    } else {
      await sql`UPDATE saved_plans SET description = ${body.description!.trim()} WHERE id = ${id}`;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/plans/[id]] failed:", err);
    return NextResponse.json({ error: "Database error", detail: String(err) }, { status: 500 });
  }
}

// ── DELETE /api/plans/[id] ─────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  try {
    await getDb();
    const { rows } = await sql`
      SELECT saved_by_id FROM saved_plans WHERE id = ${id} AND deleted_at IS NULL
    `;

    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (rows[0].saved_by_id !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await sql`UPDATE saved_plans SET deleted_at = ${new Date().toISOString()} WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/plans/[id]] failed:", err);
    return NextResponse.json({ error: "Database error", detail: String(err) }, { status: 500 });
  }
}

/**
 * GET /api/plans/backup
 *
 * Exports all active saved plans as a JSON file.
 * Admin-only.
 */
import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb, sql } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    await getDb();
    const { rows } = await sql`
      SELECT id, name, description, saved_by_id, saved_by, saved_at, version, state
      FROM saved_plans
      WHERE deleted_at IS NULL
      ORDER BY saved_at DESC
    `;

    const plans = rows.map((r) => ({
      id:          r.id,
      name:        r.name,
      description: r.description,
      savedById:   r.saved_by_id,
      savedBy:     r.saved_by,
      savedAt:     r.saved_at,
      version:     r.version,
      state:       JSON.parse(r.state),
    }));

    const dateStr = new Date().toISOString().slice(0, 10);
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), plans }, null, 2);

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type":        "application/json",
        "Content-Disposition": `attachment; filename="awp-plans-${dateStr}.json"`,
        "Content-Length":      String(Buffer.byteLength(json, "utf8")),
      },
    });
  } catch (err) {
    console.error("[GET /api/plans/backup] failed:", err);
    return NextResponse.json({ error: "Export failed", detail: String(err) }, { status: 500 });
  }
}

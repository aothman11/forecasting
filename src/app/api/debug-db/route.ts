/**
 * GET /api/debug-db — temporary debug endpoint.
 * Remove after confirming the database connection works.
 */
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET() {
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

  if (!url) {
    return NextResponse.json({ error: "No database URL found", vars: Object.keys(process.env).filter(k => k.includes("POSTGRES") || k.includes("DATABASE")) });
  }

  try {
    const sql = neon(url);
    const result = await sql`SELECT id, updated_at, (data IS NOT NULL) as has_data FROM active_plan LIMIT 1`;
    return NextResponse.json({ ok: true, urlPrefix: url.slice(0, 20) + "...", rows: result });
  } catch (err) {
    return NextResponse.json({ error: String(err), urlPrefix: url.slice(0, 20) + "..." });
  }
}

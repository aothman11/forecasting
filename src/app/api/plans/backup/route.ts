/**
 * GET /api/plans/backup
 *
 * Streams a clean, consistent SQLite backup of data/plans.db.
 * Uses SQLite's native backup API (not a raw file copy) so the snapshot is
 * always valid even while the database is being written to.
 *
 * Admin-only.
 */
import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import fs from "fs";
import path from "path";
import os from "os";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // Write a consistent snapshot to a temp file, then stream it back
  const tmpPath = path.join(os.tmpdir(), `awp-plans-backup-${Date.now()}.db`);

  try {
    const db = getDb();
    // better-sqlite3's backup() uses SQLite's Online Backup API — safe while live
    await db.backup(tmpPath);

    const fileBuffer = fs.readFileSync(tmpPath);
    const dateStr = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/octet-stream",
        "Content-Disposition": `attachment; filename="awp-plans-${dateStr}.db"`,
        "Content-Length":      String(fileBuffer.byteLength),
      },
    });
  } finally {
    // Clean up temp file whether or not the stream succeeded
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

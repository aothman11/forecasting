/**
 * /api/active-plan — server-side plan sync (Vercel Postgres).
 *
 * GET  → returns the current shared plan JSON (or null if not yet saved)
 * POST → replaces the shared plan with the posted body
 *
 * Both endpoints require an authenticated session (any role).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getPlan, savePlan } from "@/lib/db";
import type { SavedPlanState } from "@/lib/types";

// ── GET /api/active-plan ──────────────────────────────────────────────────────
export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const plan = await getPlan();
  return NextResponse.json({ plan });
}

// ── POST /api/active-plan ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json() as SavedPlanState;
    await savePlan(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("active-plan POST failed:", err);
    return NextResponse.json(
      { error: "Failed to save plan. Check that POSTGRES_URL is set and the active_plan table exists." },
      { status: 500 },
    );
  }
}

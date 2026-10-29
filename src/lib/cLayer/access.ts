import "server-only";
import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/session";
import { canCLayer, type CLayerAction } from "@/lib/role-permissions";

export type AccessResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

/** Server-side gate for every /api/c-layer route. 401 without a session, 403 without the role. */
export async function requireCLayer(action: CLayerAction): Promise<AccessResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!canCLayer(session.role, action)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session };
}

export function badRequest(errors: string[]): NextResponse {
  return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
}

export async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
}

/** Maps Postgres constraint errors to client responses; anything else is logged and returned as 500. */
export function dbErrorResponse(err: unknown, context: string): NextResponse {
  const { code, constraint } = (err as { code?: string; constraint?: string } | null) ?? {};
  if (code === "23505" && constraint === "layer_placements_flock_no_key") {
    return NextResponse.json({ error: "This flock number is already used by another flock." }, { status: 409 });
  }
  if (code === "23505") {
    return NextResponse.json({ error: "A record with this name or code already exists." }, { status: 409 });
  }
  // 23001 = ON DELETE RESTRICT violation, 23503 = other foreign-key violations
  if (code === "23001" || code === "23503") {
    return NextResponse.json(
      { error: "This record is used by another record (e.g. a placement). Deactivate it instead of deleting." },
      { status: 409 },
    );
  }
  if (code === "23514") {
    return NextResponse.json({ error: "A value is outside its allowed range." }, { status: 400 });
  }
  console.error(`[c-layer] ${context} failed:`, err);
  return NextResponse.json({ error: "Database error" }, { status: 500 });
}

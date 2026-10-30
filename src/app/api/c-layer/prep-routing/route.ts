import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import { ensureCLayerSchema, listPrepOperations, replacePrepRouting } from "@/lib/cLayer/db";
import { validatePrepRouting } from "@/lib/cLayer/validate";

export async function GET() {
  const access = await requireCLayer("read_data");
  if (!access.ok) return access.response;
  try {
    await ensureCLayerSchema();
    return NextResponse.json({ operations: await listPrepOperations() });
  } catch (err) {
    return dbErrorResponse(err, "GET prep-routing");
  }
}

/**
 * Replaces the "Cage House Prepared" routing of the groups in the body.
 * Body: { routing: { LR01?: [{ opCode, text, day }], LL01?: [...] } }; groups left out are kept.
 */
export async function PUT(req: Request) {
  const access = await requireCLayer("write_master");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const v = validatePrepRouting((parsed.body as { routing?: unknown } | null)?.routing);
  if (!v.ok) return badRequest(v.errors);
  try {
    await ensureCLayerSchema();
    await replacePrepRouting(v.value);
    return NextResponse.json({ operations: await listPrepOperations() });
  } catch (err) {
    return dbErrorResponse(err, "PUT prep-routing");
  }
}

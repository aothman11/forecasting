import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import { createPlacement, ensureCLayerSchema, listPlacements, placementReferenceErrors } from "@/lib/cLayer/db";
import { validatePlacementInput } from "@/lib/cLayer/validate";

export async function GET() {
  const access = await requireCLayer("read_data");
  if (!access.ok) return access.response;
  try {
    await ensureCLayerSchema();
    return NextResponse.json({ placements: await listPlacements() });
  } catch (err) {
    return dbErrorResponse(err, "GET placements");
  }
}

export async function POST(req: Request) {
  const access = await requireCLayer("write_placements");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const v = validatePlacementInput(parsed.body);
  if (!v.ok) return badRequest(v.errors);
  try {
    await ensureCLayerSchema();
    const refErrors = await placementReferenceErrors(v.value);
    if (refErrors.length) return badRequest(refErrors);
    const placement = await createPlacement(v.value, access.session.name);
    return NextResponse.json({ placement }, { status: 201 });
  } catch (err) {
    return dbErrorResponse(err, "POST placement");
  }
}

import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import {
  deletePlacement,
  ensureCLayerSchema,
  getPlacement,
  placementReferenceErrors,
  updatePlacement,
} from "@/lib/cLayer/db";
import { validatePlacementInput } from "@/lib/cLayer/validate";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Placement not found" }, { status: 404 });

export async function PATCH(req: Request, ctx: Ctx) {
  const access = await requireCLayer("write_placements");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  if (typeof parsed.body !== "object" || parsed.body === null || Array.isArray(parsed.body)) {
    return badRequest(["Body must be an object."]);
  }
  const { id } = await ctx.params;
  try {
    await ensureCLayerSchema();
    const existing = await getPlacement(id);
    if (!existing) return notFound();
    const v = validatePlacementInput({
      placementWeekStart: existing.placementWeekStart,
      chicks: existing.chicks,
      breedId: existing.breedId,
      farmId: existing.farmId,
      endOfLayWeek: existing.endOfLayWeek,
      notes: existing.notes,
      ...parsed.body,
    });
    if (!v.ok) return badRequest(v.errors);
    const refErrors = await placementReferenceErrors(v.value, existing);
    if (refErrors.length) return badRequest(refErrors);
    const placement = await updatePlacement(id, v.value, access.session.name);
    return placement ? NextResponse.json({ placement }) : notFound();
  } catch (err) {
    return dbErrorResponse(err, "PATCH placement");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const access = await requireCLayer("write_placements");
  if (!access.ok) return access.response;
  const { id } = await ctx.params;
  try {
    await ensureCLayerSchema();
    return (await deletePlacement(id)) ? NextResponse.json({ ok: true }) : notFound();
  } catch (err) {
    return dbErrorResponse(err, "DELETE placement");
  }
}

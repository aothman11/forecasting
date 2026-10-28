import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import { deleteFarm, ensureCLayerSchema, getFarm, updateFarm } from "@/lib/cLayer/db";
import { validateFarmInput } from "@/lib/cLayer/validate";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Farm not found" }, { status: 404 });

export async function PATCH(req: Request, ctx: Ctx) {
  const access = await requireCLayer("write_master");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  if (typeof parsed.body !== "object" || parsed.body === null || Array.isArray(parsed.body)) {
    return badRequest(["Body must be an object."]);
  }
  const { id } = await ctx.params;
  try {
    await ensureCLayerSchema();
    const existing = await getFarm(id);
    if (!existing) return notFound();
    const v = validateFarmInput({
      code: existing.code,
      name: existing.name,
      active: existing.active,
      ...parsed.body,
    });
    if (!v.ok) return badRequest(v.errors);
    const farm = await updateFarm(id, v.value);
    return farm ? NextResponse.json({ farm }) : notFound();
  } catch (err) {
    return dbErrorResponse(err, "PATCH farm");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const access = await requireCLayer("write_master");
  if (!access.ok) return access.response;
  const { id } = await ctx.params;
  try {
    await ensureCLayerSchema();
    return (await deleteFarm(id)) ? NextResponse.json({ ok: true }) : notFound();
  } catch (err) {
    return dbErrorResponse(err, "DELETE farm");
  }
}

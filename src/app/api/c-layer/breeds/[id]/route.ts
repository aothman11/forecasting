import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import { deleteBreed, ensureCLayerSchema, getBreed, updateBreed } from "@/lib/cLayer/db";
import { validateBreedInput } from "@/lib/cLayer/validate";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Breed not found" }, { status: 404 });

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
    const existing = await getBreed(id);
    if (!existing) return notFound();
    const v = validateBreedInput({
      name: existing.name,
      eggMaterialNo: existing.eggMaterialNo,
      docMaterialNo: existing.docMaterialNo,
      pullet14MaterialNo: existing.pullet14MaterialNo,
      layingPullet19MaterialNo: existing.layingPullet19MaterialNo,
      active: existing.active,
      ...parsed.body,
    });
    if (!v.ok) return badRequest(v.errors);
    const breed = await updateBreed(id, v.value);
    return breed ? NextResponse.json({ breed }) : notFound();
  } catch (err) {
    return dbErrorResponse(err, "PATCH breed");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const access = await requireCLayer("write_master");
  if (!access.ok) return access.response;
  const { id } = await ctx.params;
  try {
    await ensureCLayerSchema();
    return (await deleteBreed(id)) ? NextResponse.json({ ok: true }) : notFound();
  } catch (err) {
    return dbErrorResponse(err, "DELETE breed");
  }
}

import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import { ensureCLayerSchema, getBreed, getStandards, replaceStandards } from "@/lib/cLayer/db";
import { validateStandardRows } from "@/lib/cLayer/validate";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Breed not found" }, { status: 404 });

export async function GET(_req: Request, ctx: Ctx) {
  const access = await requireCLayer("read_data");
  if (!access.ok) return access.response;
  const { id } = await ctx.params;
  try {
    await ensureCLayerSchema();
    if (!(await getBreed(id))) return notFound();
    return NextResponse.json({ rows: await getStandards(id) });
  } catch (err) {
    return dbErrorResponse(err, "GET standards");
  }
}

/** Replaces the breed's whole weekly standard table. Body: { rows: LayerBreedStandardRow[] }. */
export async function PUT(req: Request, ctx: Ctx) {
  const access = await requireCLayer("write_master");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const v = validateStandardRows((parsed.body as { rows?: unknown } | null)?.rows);
  if (!v.ok) return badRequest(v.errors);
  const { id } = await ctx.params;
  try {
    await ensureCLayerSchema();
    if (!(await getBreed(id))) return notFound();
    await replaceStandards(id, v.value);
    return NextResponse.json({ rows: await getStandards(id) });
  } catch (err) {
    return dbErrorResponse(err, "PUT standards");
  }
}

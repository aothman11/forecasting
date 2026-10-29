import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import { ensureCLayerSchema, listSkus, updateSkus } from "@/lib/cLayer/db";
import { validateSkuSet, validateSkuUpdates } from "@/lib/cLayer/validate";

export async function GET() {
  const access = await requireCLayer("read_data");
  if (!access.ok) return access.response;
  try {
    await ensureCLayerSchema();
    return NextResponse.json({ skus: await listSkus() });
  } catch (err) {
    return dbErrorResponse(err, "GET skus");
  }
}

/**
 * Edits pack sizes and pack mix of the seeded SKUs. Body: { skus: LayerSkuUpdate[] }.
 * SKUs cannot be added or removed in v1; the resulting set must keep each grade's mix at 100% or empty.
 */
export async function PUT(req: Request) {
  const access = await requireCLayer("write_master");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const v = validateSkuUpdates((parsed.body as { skus?: unknown } | null)?.skus);
  if (!v.ok) return badRequest(v.errors);
  try {
    await ensureCLayerSchema();
    const current = await listSkus();
    const byNo = new Map(current.map((s) => [s.materialNo, s]));
    const unknown = v.value.filter((u) => !byNo.has(u.materialNo)).map((u) => u.materialNo);
    if (unknown.length) return badRequest([`Unknown SKU(s): ${unknown.join(", ")}.`]);
    const merged = current.map((s) => ({ ...s, ...v.value.find((u) => u.materialNo === s.materialNo) }));
    const setErrors = validateSkuSet(merged);
    if (setErrors.length) return badRequest(setErrors);
    await updateSkus(v.value);
    return NextResponse.json({ skus: await listSkus() });
  } catch (err) {
    return dbErrorResponse(err, "PUT skus");
  }
}

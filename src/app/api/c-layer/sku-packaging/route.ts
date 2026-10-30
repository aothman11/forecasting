import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import { ensureCLayerSchema, listSkuPackaging, listSkus, replaceSkuPackaging } from "@/lib/cLayer/db";
import { validateSkuPackaging } from "@/lib/cLayer/validate";

export async function GET() {
  const access = await requireCLayer("read_data");
  if (!access.ok) return access.response;
  try {
    await ensureCLayerSchema();
    return NextResponse.json({ packaging: await listSkuPackaging() });
  } catch (err) {
    return dbErrorResponse(err, "GET sku-packaging");
  }
}

/**
 * Replaces the packaging of the SKUs in the body. Body: { skus: string[], rows: LayerSkuPackagingInput[] };
 * every row must belong to one of the listed SKUs, and an SKU listed without rows ends up with none.
 */
export async function PUT(req: Request) {
  const access = await requireCLayer("write_master");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const body = (parsed.body ?? {}) as { skus?: unknown; rows?: unknown };
  const v = validateSkuPackaging(body.rows);
  if (!v.ok) return badRequest(v.errors);
  if (!Array.isArray(body.skus) || !body.skus.every((s) => typeof s === "string")) return badRequest(["skus must be a list of SKU material numbers."]);
  const listed = new Set(body.skus as string[]);
  const stray = v.value.filter((r) => !listed.has(r.skuMaterialNo)).map((r) => r.skuMaterialNo);
  if (stray.length) return badRequest([`Row(s) for SKU(s) not listed: ${[...new Set(stray)].join(", ")}.`]);
  try {
    await ensureCLayerSchema();
    const known = new Set((await listSkus()).map((s) => s.materialNo));
    const unknown = [...listed].filter((s) => !known.has(s));
    if (unknown.length) return badRequest([`Unknown SKU(s): ${unknown.join(", ")}.`]);
    await replaceSkuPackaging(v.value, [...listed]);
    return NextResponse.json({ packaging: await listSkuPackaging() });
  } catch (err) {
    return dbErrorResponse(err, "PUT sku-packaging");
  }
}

import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import { ensureCLayerSchema, listPackagingPolicies, replacePackagingPolicies } from "@/lib/cLayer/db";
import { validatePackagingPolicies } from "@/lib/cLayer/validate";

export async function GET() {
  const access = await requireCLayer("read_data");
  if (!access.ok) return access.response;
  try {
    await ensureCLayerSchema();
    return NextResponse.json({ policies: await listPackagingPolicies() });
  } catch (err) {
    return dbErrorResponse(err, "GET packaging-policy");
  }
}

/** Replaces all packaging order policies. Body: { policies: LayerPackagingPolicy[] }. */
export async function PUT(req: Request) {
  const access = await requireCLayer("write_master");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const v = validatePackagingPolicies((parsed.body as { policies?: unknown } | null)?.policies);
  if (!v.ok) return badRequest(v.errors);
  try {
    await ensureCLayerSchema();
    await replacePackagingPolicies(v.value);
    return NextResponse.json({ policies: await listPackagingPolicies() });
  } catch (err) {
    return dbErrorResponse(err, "PUT packaging-policy");
  }
}

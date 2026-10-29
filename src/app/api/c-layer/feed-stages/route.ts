import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import { ensureCLayerSchema, listFeedStages, replaceFeedStages } from "@/lib/cLayer/db";
import { validateFeedStages } from "@/lib/cLayer/validate";

export async function GET() {
  const access = await requireCLayer("read_data");
  if (!access.ok) return access.response;
  try {
    await ensureCLayerSchema();
    return NextResponse.json({ feedStages: await listFeedStages() });
  } catch (err) {
    return dbErrorResponse(err, "GET feed stages");
  }
}

/** Replaces the whole feed stage table. Body: { stages: LayerFeedStageInput[] }. */
export async function PUT(req: Request) {
  const access = await requireCLayer("write_master");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const v = validateFeedStages((parsed.body as { stages?: unknown } | null)?.stages);
  if (!v.ok) return badRequest(v.errors);
  try {
    await ensureCLayerSchema();
    await replaceFeedStages(v.value);
    return NextResponse.json({ feedStages: await listFeedStages() });
  } catch (err) {
    return dbErrorResponse(err, "PUT feed stages");
  }
}

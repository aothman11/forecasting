import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import { ensureCLayerSchema, getSettings, updateSettings } from "@/lib/cLayer/db";
import { validateSettingsInput } from "@/lib/cLayer/validate";

export async function GET() {
  const access = await requireCLayer("read_data");
  if (!access.ok) return access.response;
  try {
    await ensureCLayerSchema();
    return NextResponse.json({ settings: await getSettings() });
  } catch (err) {
    return dbErrorResponse(err, "GET settings");
  }
}

export async function PUT(req: Request) {
  const access = await requireCLayer("write_master");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const v = validateSettingsInput(parsed.body);
  if (!v.ok) return badRequest(v.errors);
  try {
    await ensureCLayerSchema();
    return NextResponse.json({ settings: await updateSettings(v.value, access.session.name) });
  } catch (err) {
    return dbErrorResponse(err, "PUT settings");
  }
}

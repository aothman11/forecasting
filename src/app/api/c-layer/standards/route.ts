import { NextResponse } from "next/server";
import { dbErrorResponse, requireCLayer } from "@/lib/cLayer/access";
import { ensureCLayerSchema, getAllStandards } from "@/lib/cLayer/db";

/** All breeds' weekly standards, keyed by breed id. */
export async function GET() {
  const access = await requireCLayer("read_data");
  if (!access.ok) return access.response;
  try {
    await ensureCLayerSchema();
    return NextResponse.json({ standards: await getAllStandards() });
  } catch (err) {
    return dbErrorResponse(err, "GET standards");
  }
}

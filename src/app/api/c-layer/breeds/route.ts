import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import { createBreed, ensureCLayerSchema, listBreeds } from "@/lib/cLayer/db";
import { validateBreedInput } from "@/lib/cLayer/validate";

export async function GET() {
  const access = await requireCLayer("read_data");
  if (!access.ok) return access.response;
  try {
    await ensureCLayerSchema();
    return NextResponse.json({ breeds: await listBreeds() });
  } catch (err) {
    return dbErrorResponse(err, "GET breeds");
  }
}

export async function POST(req: Request) {
  const access = await requireCLayer("write_master");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const v = validateBreedInput(parsed.body);
  if (!v.ok) return badRequest(v.errors);
  try {
    await ensureCLayerSchema();
    return NextResponse.json({ breed: await createBreed(v.value) }, { status: 201 });
  } catch (err) {
    return dbErrorResponse(err, "POST breed");
  }
}

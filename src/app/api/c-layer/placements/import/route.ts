import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import {
  ensureCLayerSchema,
  getAllStandards,
  importPlacements,
  listBreeds,
  listFarms,
  listPlacements,
} from "@/lib/cLayer/db";
import { validatePlacementInput } from "@/lib/cLayer/validate";
import type { LayerPlacementInput } from "@/lib/cLayer/types";

const MAX_ROWS = 2000;

/**
 * Bulk upsert from Excel. Body: { rows: (LayerPlacementInput & { id?: string })[] }.
 * Every row is validated first; nothing is written unless all rows pass.
 */
export async function POST(req: Request) {
  const access = await requireCLayer("write_placements");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const raw = (parsed.body as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(raw) || raw.length === 0) return badRequest(["The file contains no placement rows."]);
  if (raw.length > MAX_ROWS) return badRequest([`At most ${MAX_ROWS} rows can be imported at once.`]);

  try {
    await ensureCLayerSchema();
    const [breeds, farms, existing, standards] = await Promise.all([
      listBreeds(),
      listFarms(),
      listPlacements(),
      getAllStandards(),
    ]);
    const breedById = new Map(breeds.map((b) => [b.id, b]));
    const farmById = new Map(farms.map((f) => [f.id, f]));
    const existingById = new Map(existing.map((p) => [p.id, p]));

    const errors: string[] = [];
    const rows: { id: string | null; input: LayerPlacementInput }[] = [];

    raw.forEach((r, i) => {
      const label = `Row ${i + 1}`;
      const id = typeof (r as { id?: unknown })?.id === "string" && (r as { id: string }).id ? (r as { id: string }).id : null;
      const prev = id ? existingById.get(id) : undefined;
      if (id && !prev) {
        errors.push(`${label}: ID ${id} does not match an existing placement. Clear the ID to create a new one.`);
        return;
      }
      const v = validatePlacementInput(r);
      if (!v.ok) {
        v.errors.forEach((e) => errors.push(`${label}: ${e}`));
        return;
      }
      const breed = breedById.get(v.value.breedId);
      const farm = farmById.get(v.value.farmId);
      if (!breed) errors.push(`${label}: unknown breed.`);
      else if (!breed.active && prev?.breedId !== breed.id) errors.push(`${label}: breed "${breed.name}" is inactive.`);
      if (!farm) errors.push(`${label}: unknown farm.`);
      else if (!farm.active && prev?.farmId !== farm.id) errors.push(`${label}: farm "${farm.code}" is inactive.`);
      const maxAge = standards[v.value.breedId]?.length ?? 0;
      if (breed && v.value.endOfLayWeek !== null && maxAge > 0 && v.value.endOfLayWeek > maxAge) {
        errors.push(`${label}: end of lay ${v.value.endOfLayWeek} is beyond the breed standard (week ${maxAge}).`);
      }
      rows.push({ id, input: v.value });
    });

    if (errors.length) return badRequest(errors);
    const result = await importPlacements(rows, access.session.name);
    return NextResponse.json(result);
  } catch (err) {
    return dbErrorResponse(err, "POST placements import");
  }
}

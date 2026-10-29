import { NextResponse } from "next/server";
import { badRequest, dbErrorResponse, readJson, requireCLayer } from "@/lib/cLayer/access";
import {
  ensureCLayerSchema,
  importPlacements,
  listPlacements,
  loadPlacementRefContext,
  placementReferenceErrors,
} from "@/lib/cLayer/db";
import { assignFlockNumbers } from "@/lib/cLayer/calc";
import { validatePlacementInput } from "@/lib/cLayer/validate";
import type { LayerPlacementInput } from "@/lib/cLayer/types";

const MAX_ROWS = 2000;

/**
 * Bulk upsert from Excel, matched by flock number. Body: { rows: LayerPlacementInput[] }.
 * A known flock number updates that flock, a new number creates it, a blank number creates a flock
 * with the next running number. Nothing is written unless every row passes.
 */
export async function POST(req: Request) {
  const access = await requireCLayer("write_placements");
  if (!access.ok) return access.response;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const raw = (parsed.body as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(raw) || raw.length === 0) return badRequest(["The file contains no flock rows."]);
  if (raw.length > MAX_ROWS) return badRequest([`At most ${MAX_ROWS} rows can be imported at once.`]);

  try {
    await ensureCLayerSchema();
    const [ctx, existing] = await Promise.all([loadPlacementRefContext(), listPlacements()]);
    const existingById = new Map(existing.map((p) => [p.id, p]));

    const errors: string[] = [];
    const valid: { row: number; input: LayerPlacementInput }[] = [];
    raw.forEach((r, i) => {
      const v = validatePlacementInput(r);
      if (!v.ok) v.errors.forEach((e) => errors.push(`Row ${i + 1}: ${e}`));
      else valid.push({ row: i + 1, input: v.value });
    });
    if (errors.length) return badRequest(errors);

    const { numbers, duplicates } = assignFlockNumbers(
      valid.map((v) => v.input.flockNo),
      [...ctx.flockOwner.keys()],
    );
    if (duplicates.length) return badRequest([`Flock no. used more than once in the file: ${duplicates.join(", ")}.`]);

    const rows = valid.map(({ row, input }, i) => {
      const flockNo = numbers[i];
      const id = ctx.flockOwner.get(flockNo) ?? null;
      const resolved = { ...input, flockNo };
      const previous = id ? existingById.get(id) : undefined;
      placementReferenceErrors(ctx, resolved, previous).forEach((e) => errors.push(`Row ${row} (flock ${flockNo}): ${e}`));
      return { id, input: resolved };
    });
    if (errors.length) return badRequest(errors);

    return NextResponse.json(await importPlacements(rows, access.session.name));
  } catch (err) {
    return dbErrorResponse(err, "POST placements import");
  }
}

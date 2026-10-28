import { NextResponse } from "next/server";
import { dbErrorResponse, requireCLayer } from "@/lib/cLayer/access";
import { ensureCLayerSchema, getAllStandards, getSettings, listBreeds, listFarms, listPlacements } from "@/lib/cLayer/db";
import { eggCells, projectAll } from "@/lib/cLayer/calc";

/**
 * Computed egg output only — week × farm × breed totals plus the names needed for filters.
 * Roles that may see egg output but not raw placements (Sales Planner) read this endpoint.
 */
export async function GET() {
  const access = await requireCLayer("view_egg_output");
  if (!access.ok) return access.response;
  try {
    await ensureCLayerSchema();
    const [placements, standards, settings, breeds, farms] = await Promise.all([
      listPlacements(),
      getAllStandards(),
      getSettings(),
      listBreeds(),
      listFarms(),
    ]);
    const projections = projectAll(placements, standards);
    const unprojected = projections.filter((p) => p.weeks.length === 0).length;
    return NextResponse.json({
      cells: eggCells(projections),
      farms: farms.map(({ id, code, name }) => ({ id, code, name })),
      breeds: breeds.map(({ id, name }) => ({ id, name })),
      packing: { eggsPerTray: settings.eggsPerTray, traysPerCase: settings.traysPerCase },
      warnings: unprojected
        ? [`${unprojected} placement(s) are excluded because their breed has no weekly standard.`]
        : [],
    });
  } catch (err) {
    return dbErrorResponse(err, "GET egg output");
  }
}

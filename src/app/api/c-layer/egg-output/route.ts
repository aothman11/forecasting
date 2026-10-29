import { NextResponse } from "next/server";
import { dbErrorResponse, requireCLayer } from "@/lib/cLayer/access";
import {
  ensureCLayerSchema,
  getAllStandards,
  getSettings,
  listBreeds,
  listFarms,
  listPlacements,
  listSkus,
} from "@/lib/cLayer/db";
import { eggCells, projectAll } from "@/lib/cLayer/calc";

/**
 * Computed egg output only: week × farm × breed egg totals, plus the grading settings and SKU pack
 * data needed to derive 90001 / 90002 and packed SKUs. Roles that may see egg output but not raw
 * flocks (Sales Planner) read this endpoint — it never returns placements or breed standards.
 */
export async function GET() {
  const access = await requireCLayer("view_egg_output");
  if (!access.ok) return access.response;
  try {
    await ensureCLayerSchema();
    const [placements, standards, settings, breeds, farms, skus] = await Promise.all([
      listPlacements(),
      getAllStandards(),
      getSettings(),
      listBreeds(),
      listFarms(),
      listSkus(),
    ]);
    const projections = projectAll(placements, standards, {
      defaultTransferAge: settings.defaultTransferAge,
      defaultDepletionAge: settings.defaultDepletionAge,
    });
    const materialByBreed = Object.fromEntries(breeds.map((b) => [b.id, b.eggMaterialNo]));
    const unprojected = projections.filter((p) => p.weeks.length === 0).length;
    return NextResponse.json({
      cells: eggCells(projections, materialByBreed),
      farms: farms.map(({ id, code, name, plant }) => ({ id, code, name, plant })),
      breeds: breeds.map(({ id, name, eggMaterialNo }) => ({ id, name, eggMaterialNo })),
      grading: { rejectPct: settings.rejectPct, gradeTablePct: settings.gradeTablePct, gradeCPct: settings.gradeCPct },
      skus: skus.map(({ materialNo, description, grade, piecesPerPack, packMixPct }) => ({
        materialNo,
        description,
        grade,
        piecesPerPack,
        packMixPct,
      })),
      warnings: unprojected
        ? [`${unprojected} flock(s) are excluded because their breed has no weekly standard.`]
        : [],
    });
  } catch (err) {
    return dbErrorResponse(err, "GET egg output");
  }
}

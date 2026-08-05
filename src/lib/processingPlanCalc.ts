import type { BomRecord, GradePool } from "./bomTypes";
import type { SalesPlanCartonRow, ProcessingPlanCell, SkuContribution } from "./processingPlanTypes";

/** Carcass KG consumed per carton of this SKU. */
function carcassKgPerCarton(rec: BomRecord, gradeYields: Record<string, number>): number {
  const y = gradeYields[rec.gradePool] ?? 1;
  return y > 0 ? (rec.packageWeightKg * rec.unitsPerCarton) / y : 0;
}

export interface ExplodeResult {
  /** Aggregated cells: one per (plant × week × gradePool) */
  cells: ProcessingPlanCell[];
  /** Rows whose skuCode had no matching BomRecord */
  unmatched: SalesPlanCartonRow[];
}

/**
 * Explode a flat sales plan (cartons per SKU per plant per week) into
 * carcass-KG requirements grouped by plant × week × gradePool.
 */
export function explodeSalesPlan(
  rows: SalesPlanCartonRow[],
  bomRecords: BomRecord[],
  gradeYields: Record<string, number>
): ExplodeResult {
  const bomMap = new Map(bomRecords.map((r) => [r.skuCode, r]));
  const unmatched: SalesPlanCartonRow[] = [];

  // key: `${plant}::${week}::${gradePool}`
  const cellMap = new Map<
    string,
    { week: number; plant: string; gradePool: GradePool; carcassKg: number; cartons: number; skus: SkuContribution[] }
  >();

  for (const row of rows) {
    const bom = bomMap.get(row.skuCode);
    if (!bom) {
      unmatched.push(row);
      continue;
    }

    const kgPerCar = carcassKgPerCarton(bom, gradeYields);
    const totalKg = kgPerCar * row.cartons;

    const key = `${row.plant}::${row.week}::${bom.gradePool}`;
    const existing = cellMap.get(key);
    const contrib: SkuContribution = {
      skuCode: row.skuCode,
      skuDescription: row.skuDescription,
      cartons: row.cartons,
      carcassKg: totalKg,
    };

    if (existing) {
      existing.carcassKg += totalKg;
      existing.cartons += row.cartons;
      // merge contributions — same SKU may appear across alts; aggregate
      const existingSkuIdx = existing.skus.findIndex((s) => s.skuCode === row.skuCode);
      if (existingSkuIdx >= 0) {
        existing.skus[existingSkuIdx].cartons += row.cartons;
        existing.skus[existingSkuIdx].carcassKg += totalKg;
      } else {
        existing.skus.push(contrib);
      }
    } else {
      cellMap.set(key, {
        week: row.week,
        plant: row.plant,
        gradePool: bom.gradePool,
        carcassKg: totalKg,
        cartons: row.cartons,
        skus: [contrib],
      });
    }
  }

  const cells: ProcessingPlanCell[] = Array.from(cellMap.values())
    .map((c) => ({
      week: c.week,
      plant: c.plant,
      gradePool: c.gradePool,
      requiredCarcassKg: c.carcassKg,
      cartons: c.cartons,
      skuBreakdown: c.skus.sort((a, b) => b.carcassKg - a.carcassKg),
    }))
    .sort((a, b) => a.week - b.week || a.plant.localeCompare(b.plant));

  return { cells, unmatched };
}

/** Unique sorted weeks present in a cell array. */
export function weeksInPlan(cells: ProcessingPlanCell[]): number[] {
  return [...new Set(cells.map((c) => c.week))].sort((a, b) => a - b);
}

/** Unique sorted plants present in a cell array. */
export function plantsInPlan(cells: ProcessingPlanCell[]): string[] {
  return [...new Set(cells.map((c) => c.plant))].sort();
}

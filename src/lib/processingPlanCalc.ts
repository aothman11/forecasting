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

/**
 * Returns the Monday (Date) of a given ISO week within a year.
 * Jan 4 is always in ISO week 1 — anchor back to Monday of that week,
 * then step forward by (isoWeek − 1) full weeks.
 */
function isoWeekMonday(isoWeek: number, year: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7; // 1 = Mon … 7 = Sun
  const d = new Date(jan4);
  d.setDate(jan4.getDate() - dow + 1 + (isoWeek - 1) * 7);
  return d;
}

/**
 * Converts an ISO week-of-year number to the app's standard label format:
 * "2026.Aug.W1", "2026.Sep.W3", etc.
 *
 * Mirrors the counting logic of weekLabel() in demandPlan.ts: the ordinal
 * week-within-month is the number of ISO weeks (1 … isoWeek) whose Monday
 * falls in the same year-month as this week's Monday — so W1, W2, W3 …
 * are always consecutive and never repeat within a month.
 */
export function isoWeekLabel(isoWeek: number, year: number): string {
  const target = isoWeekMonday(isoWeek, year);
  const targetKey = `${target.getFullYear()}-${target.getMonth()}`;

  // Count ordinal position of this ISO week within its calendar month
  let wom = 0;
  for (let w = 1; w <= isoWeek; w++) {
    const d = isoWeekMonday(w, year);
    if (`${d.getFullYear()}-${d.getMonth()}` === targetKey) wom++;
  }

  const mmm = target.toLocaleDateString("en-US", { month: "short" });
  return `${target.getFullYear()}.${mmm}.W${wom}`;
}

/** Unique sorted plants present in a cell array. */
export function plantsInPlan(cells: ProcessingPlanCell[]): string[] {
  return [...new Set(cells.map((c) => c.plant))].sort();
}

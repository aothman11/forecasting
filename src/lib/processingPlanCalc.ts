import type { BomRecord, GradePool } from "./bomTypes";
import type { SalesPlanCartonRow, ProcessingPlanCell, SkuContribution } from "./processingPlanTypes";
import { getDemandQtyAllChannels } from "./demandPlan";
import { wcYieldFromCarcass, fppYieldFromCarcass, cutsYieldFromCarcass } from "./supplyRequirements";
import { DEFAULT_FPP_MEAT_CONTENT } from "./defaults";
import type { DemandProduct, DemandPlanQty, Parameters } from "./types";

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

/**
 * Build a Map<isoWeek → column label> using the plan's *own* start dates rather
 * than the Monday of each ISO week.
 *
 * Why: a plan starting Aug 1 falls in ISO week 31 (Monday July 27 – Sunday Aug 2).
 * Using the ISO Monday (July 27) would label the first column "Jul.W4" even though
 * all plan data is for the week beginning Aug 1. Using the plan week's start date
 * instead (Aug 1) gives "Aug.W1", which matches user expectations.
 *
 * The ordinal W1/W2/W3… counts plan-week start dates that fall in the same calendar
 * month (year+month), in plan order, so they are always consecutive.
 *
 * Also fixes cross-year plans: a week starting Jan 2027 is correctly labeled
 * "2027.Jan.W1" even though planYear is 2026.
 *
 * @param planWeekToIsoWeek  Map<planWeek (1-based), isoWeek>
 * @param planStartDate      ISO date string, e.g. "2026-08-01"
 */
export function buildPlanWeekLabels(
  planWeekToIsoWeek: Map<number, number>,
  planStartDate: string,
): Map<number, string> {
  // isoWeek → plan-week start date
  const startDateByIsoWeek = new Map<number, Date>();
  for (const [planWeek, isoWeek] of planWeekToIsoWeek) {
    const base = new Date(planStartDate);
    base.setDate(base.getDate() + (planWeek - 1) * 7);
    startDateByIsoWeek.set(isoWeek, base);
  }

  // Process in plan order (ascending isoWeek start date)
  const sorted = [...startDateByIsoWeek.entries()].sort((a, b) => a[1].getTime() - b[1].getTime());

  const monthCount = new Map<string, number>(); // "YYYY-M" → ordinal so far
  const labels = new Map<number, string>();

  for (const [isoWeek, d] of sorted) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const wom = (monthCount.get(key) ?? 0) + 1;
    monthCount.set(key, wom);
    const mmm = d.toLocaleDateString("en-US", { month: "short" });
    labels.set(isoWeek, `${d.getFullYear()}.${mmm}.W${wom}`);
  }

  return labels;
}

// ─── Forecast fallback ────────────────────────────────────────────────────────

/** Pipeline plant keys → plant identifiers used in displays and data keys. */
const PLANT_KEYS_ORDERED = ["plant1", "plant2", "plant3"] as const;
const PLANT_CODES_ORDERED = ["P1", "P2", "P3"] as const;

/**
 * Map a DemandProduct to the SAP grade pool that best represents it.
 * 930 = A-Grade Fresh WC · 931 = A-Grade Frozen WC · 932 = B-Grade / Cuts · 933 = B-Grade Cuts (FPP)
 * Returns null for eggs (demand-only, no carcass requirement).
 */
function productToGradePool(p: DemandProduct): GradePool | null {
  if (p.category === "eggs") return null;
  if (p.category === "wholeChicken") {
    if (p.grade === "B") return "932";
    return p.freshFrozen === "frozen" ? "931" : "930";
  }
  if (p.category === "cuts") return "932";
  if (p.category === "fpp")  return "933";
  return null;
}

/**
 * Build ProcessingPlanCell[] from the Demand Plan (demandQty) when no SAP
 * sales-plan file has been imported yet.
 *
 * Algorithm:
 *   1. For each plan week × product, sum demand across all channels.
 *   2. Reverse-BOM: demand tons → required carcass kg using the same yield
 *      helpers that power SupplyPlan.tsx (wcYield / cutsYield / fppYield).
 *   3. Distribute carcass kg across plants using params.plantShares.
 *   4. Group into cells keyed by (plant × ISO week × gradePool) — same shape
 *      as explodeSalesPlan() so the rendering table is identical.
 *
 * @param planWeekToIsoWeek  Map<planWeek, isoWeek> built from result.plants.
 */
export function forecastToProcessingCells(
  demandProducts: DemandProduct[],
  demandQty: DemandPlanQty,
  params: Parameters,
  horizonWeeks: number[],
  planWeekToIsoWeek: Map<number, number>,
): ProcessingPlanCell[] {
  const wcYield    = wcYieldFromCarcass(params);
  const fppYield   = fppYieldFromCarcass(params);
  const cutsYield  = cutsYieldFromCarcass(params);

  type Accum = {
    week: number; plant: string; gradePool: GradePool;
    carcassKg: number; demandTons: number;
    skus: Map<string, SkuContribution>;
  };
  const cellMap = new Map<string, Accum>();

  for (const planWeek of horizonWeeks) {
    const isoWeek = planWeekToIsoWeek.get(planWeek);
    if (isoWeek === undefined) continue;

    for (const product of demandProducts) {
      const demandTons = getDemandQtyAllChannels(demandQty, product.id, planWeek);
      if (demandTons <= 0) continue;

      const gradePool = productToGradePool(product);
      if (!gradePool) continue;

      const demandKg = demandTons * 1000;
      let totalCarcassKg = 0;

      if (product.category === "wholeChicken") {
        totalCarcassKg = wcYield > 0 ? demandKg / wcYield : 0;
      } else if (product.category === "cuts") {
        totalCarcassKg = cutsYield > 0 ? demandKg / cutsYield : 0;
      } else if (product.category === "fpp") {
        const meatContent = product.yieldPct ?? DEFAULT_FPP_MEAT_CONTENT;
        totalCarcassKg = fppYield > 0 ? (demandKg * meatContent) / fppYield : 0;
      }
      if (totalCarcassKg <= 0) continue;

      // Distribute across plants by plantShares
      PLANT_KEYS_ORDERED.forEach((pk, idx) => {
        const share = params.plantShares[pk];
        if (share <= 0) return;
        const plantCode = PLANT_CODES_ORDERED[idx];
        const plantCarcassKg  = totalCarcassKg * share;
        const plantDemandTons = demandTons      * share;

        const key = `${plantCode}::${isoWeek}::${gradePool}`;
        let cell = cellMap.get(key);
        if (!cell) {
          cell = { week: isoWeek, plant: plantCode, gradePool, carcassKg: 0, demandTons: 0, skus: new Map() };
          cellMap.set(key, cell);
        }
        cell.carcassKg  += plantCarcassKg;
        cell.demandTons += plantDemandTons;

        const existing = cell.skus.get(product.id);
        if (existing) {
          existing.cartons   += Math.round(plantDemandTons * 100) / 100;
          existing.carcassKg += plantCarcassKg;
        } else {
          cell.skus.set(product.id, {
            skuCode: product.id,
            skuDescription: product.name,
            cartons: Math.round(plantDemandTons * 100) / 100, // stored as tons
            carcassKg: plantCarcassKg,
          });
        }
      });
    }
  }

  return Array.from(cellMap.values())
    .map((c): ProcessingPlanCell => ({
      week: c.week,
      plant: c.plant,
      gradePool: c.gradePool,
      requiredCarcassKg: c.carcassKg,
      cartons: Math.round(c.demandTons * 100) / 100, // tons
      isForecast: true,
      skuBreakdown: [...c.skus.values()].sort((a, b) => b.carcassKg - a.carcassKg),
    }))
    .sort((a, b) => a.week - b.week || a.plant.localeCompare(b.plant));
}

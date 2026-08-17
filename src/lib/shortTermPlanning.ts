/**
 * Broiler Short-Term Planning — pure calculation functions.
 * No UI, no store imports — fully unit-testable.
 *
 * Data sources:
 *   salesPlanCartonRows  — SalesPlanCartonRow[] from the Zustand store
 *   bomRecords           — BomRecord[] for carton → finished-product-kg conversion
 *   params               — Parameters for operational constants
 *
 * Grade rules (confirmed):
 *   Grade A: row.grading = "AG" / "A" / "GRADE A"
 *   Grade B: row.grading = "BG" / "B" / "GRADE B"
 *   Grade C: grading empty + Whole Chicken → goes to WC Frozen only
 *   Non-WC (Portions, FPP, Giblets…): counted under "Cuts" product type, no grade bucket
 *
 * Product-type rules:
 *   Fresh : division Fresh/Chiller/Chilled + WC category
 *   Frozen: division Frozen + WC category  (includes Grade C WC Frozen)
 *   Cuts  : everything else — Portions, FPP, Giblets, etc.
 */

import type { BomRecord } from "./bomTypes";
import type { SalesPlanCartonRow } from "./processingPlanTypes";
import type { Parameters } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type STPGrade = "A" | "B" | "C";
export type STPProductType = "fresh" | "frozen" | "cuts";

export interface STPGradeSplit {
  A_kg: number;
  B_kg: number;
  C_kg: number;
  /** Total = A + B + C only (Cuts rows with no grade are excluded from total). */
  total_kg: number;
  A_pct: number;
  B_pct: number;
  C_pct: number;
}

export interface STPProductSplit {
  fresh_kg: number;
  frozen_kg: number;
  cuts_kg: number;
  total_kg: number;
  fresh_pct: number;
  frozen_pct: number;
  cuts_pct: number;
}

export interface STPProductionRequirements {
  totalFinishedKg: number;
  /** totalFinishedKg ÷ dressingYield */
  requiredCarcassKg: number;
  /** requiredCarcassKg ÷ params.avgCarcassWeightKg */
  requiredLiveBirds: number;
  /** requiredLiveBirds ÷ (1 − mortalityRate) */
  requiredPlacements: number;
  /** avgCarcassWeightKg / avgLiveWeightKg — informational */
  dressingYield: number;
  gradeA_kg: number;
  gradeB_kg: number;
  gradeC_kg: number;
  fresh_kg: number;
  frozen_kg: number;
  cuts_kg: number;
}

export interface STPWeekOption {
  week: number;
  year?: number;
  label: string;
}

// ─── Classification helpers ───────────────────────────────────────────────────

const GRADE_A_CODES = new Set(["AG", "A", "GRADE A", "A GRADE", "GRADE-A"]);
const GRADE_B_CODES = new Set(["BG", "B", "GRADE B", "B GRADE", "GRADE-B"]);

function isWCRow(row: SalesPlanCartonRow): boolean {
  const cat = (row.materialCategory ?? "").trim().toLowerCase();
  return cat.includes("whole chicken") || cat.includes("whole bird");
}

/**
 * Classify a carton row into Grade A / B / C, or null (= Cuts/FPP/Eggs — no grade bucket).
 *   AG  → A
 *   BG  → B
 *   ""  + WC → C (WC Frozen downgrade)
 *   ""  + non-WC → null (Cuts/FPP — not graded)
 */
export function classifyGrade(row: SalesPlanCartonRow): STPGrade | null {
  const g = (row.grading ?? "").trim().toUpperCase();
  if (GRADE_A_CODES.has(g)) return "A";
  if (GRADE_B_CODES.has(g)) return "B";
  if (!g && isWCRow(row)) return "C";
  return null; // Cuts, FPP, Eggs — excluded from grade split total
}

/**
 * Classify a carton row into product type:
 *   WC + Fresh/Chiller → fresh
 *   WC + Frozen        → frozen  (Grade A Frozen + Grade C Frozen)
 *   anything else      → cuts
 */
export function classifyProductType(row: SalesPlanCartonRow): STPProductType {
  const div = (row.division ?? "").trim().toLowerCase();
  const isWC = isWCRow(row);
  if (isWC && (div === "fresh" || div === "chiller" || div === "chilled")) return "fresh";
  if (isWC && div === "frozen") return "frozen";
  return "cuts";
}

/** Finished-product kg for one carton row. */
export function finishedProductKg(row: SalesPlanCartonRow, bom: BomRecord): number {
  return row.cartons * bom.packageWeightKg * bom.unitsPerCarton;
}

// ─── Week options ─────────────────────────────────────────────────────────────

function monthAbbr(m: number): string {
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1] ?? `M${m}`;
}

function weekLabel(week: number, year?: number): string {
  if (!year) return `Wk ${week}`;
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7;
  const wk1Mon = new Date(jan4.getTime() - (dow - 1) * 86400000);
  const ms = wk1Mon.getTime() + (week - 1) * 7 * 86400000;
  const d = new Date(ms);
  const month = d.getMonth() + 1;
  const dayOfMonth = d.getDate();
  const wkInMonth = Math.ceil((dayOfMonth + ((d.getDay() + 6) % 7)) / 7);
  return `${monthAbbr(month)} W${wkInMonth} ${year}`;
}

export function buildWeekOptions(rows: SalesPlanCartonRow[]): STPWeekOption[] {
  const seen = new Map<number, number | undefined>(); // week → year
  for (const r of rows) {
    if (r.week > 0 && !seen.has(r.week)) seen.set(r.week, r.year);
  }
  return Array.from(seen.entries())
    .sort(([a, ya], [b, yb]) => {
      if (ya !== undefined && yb !== undefined && ya !== yb) return ya - yb;
      return a - b;
    })
    .map(([week, year]) => ({ week, year, label: weekLabel(week, year) }));
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export type WeekItem = { row: SalesPlanCartonRow; bom: BomRecord; kg: number };

/** Filter rows to a single ISO week, joining with BOM (drops SKUs with no BOM record). */
export function filterWeekRows(
  rows: SalesPlanCartonRow[],
  week: number,
  bomMap: Map<string, BomRecord>
): WeekItem[] {
  return rows
    .filter((r) => r.week === week)
    .flatMap((row) => {
      const bom = bomMap.get(row.skuCode);
      if (!bom) return [];
      return [{ row, bom, kg: finishedProductKg(row, bom) }];
    });
}

export function deriveGradeSplit(weekItems: WeekItem[]): STPGradeSplit {
  let A_kg = 0, B_kg = 0, C_kg = 0;
  for (const { row, kg } of weekItems) {
    const grade = classifyGrade(row);
    if (grade === "A") A_kg += kg;
    else if (grade === "B") B_kg += kg;
    else if (grade === "C") C_kg += kg;
    // null (Cuts/FPP) — not counted in grade split total
  }
  const total_kg = A_kg + B_kg + C_kg;
  return {
    A_kg, B_kg, C_kg, total_kg,
    A_pct: total_kg > 0 ? (A_kg / total_kg) * 100 : 0,
    B_pct: total_kg > 0 ? (B_kg / total_kg) * 100 : 0,
    C_pct: total_kg > 0 ? (C_kg / total_kg) * 100 : 0,
  };
}

export function deriveProductSplit(weekItems: WeekItem[]): STPProductSplit {
  let fresh_kg = 0, frozen_kg = 0, cuts_kg = 0;
  for (const { row, kg } of weekItems) {
    const t = classifyProductType(row);
    if (t === "fresh") fresh_kg += kg;
    else if (t === "frozen") frozen_kg += kg;
    else cuts_kg += kg;
  }
  const total_kg = fresh_kg + frozen_kg + cuts_kg;
  return {
    fresh_kg, frozen_kg, cuts_kg, total_kg,
    fresh_pct: total_kg > 0 ? (fresh_kg / total_kg) * 100 : 0,
    frozen_pct: total_kg > 0 ? (frozen_kg / total_kg) * 100 : 0,
    cuts_pct: total_kg > 0 ? (cuts_kg / total_kg) * 100 : 0,
  };
}

export function deriveProductionRequirements(
  gradeSplit: STPGradeSplit,
  productSplit: STPProductSplit,
  params: Pick<Parameters, "avgCarcassWeightKg" | "avgLiveWeightKg" | "mortalityRate">
): STPProductionRequirements {
  const dressingYield = params.avgCarcassWeightKg / params.avgLiveWeightKg;
  const totalFinishedKg = productSplit.total_kg; // all product types
  const requiredCarcassKg = dressingYield > 0 ? totalFinishedKg / dressingYield : 0;
  const requiredLiveBirds = params.avgCarcassWeightKg > 0
    ? Math.round(requiredCarcassKg / params.avgCarcassWeightKg)
    : 0;
  const requiredPlacements = (1 - params.mortalityRate) > 0
    ? Math.round(requiredLiveBirds / (1 - params.mortalityRate))
    : 0;

  return {
    totalFinishedKg,
    requiredCarcassKg,
    requiredLiveBirds,
    requiredPlacements,
    dressingYield,
    gradeA_kg: gradeSplit.A_kg,
    gradeB_kg: gradeSplit.B_kg,
    gradeC_kg: gradeSplit.C_kg,
    fresh_kg: productSplit.fresh_kg,
    frozen_kg: productSplit.frozen_kg,
    cuts_kg: productSplit.cuts_kg,
  };
}

/**
 * Recalculate requirements from scenario percentages.
 * Scenario pcts replace Sales Plan splits while keeping the same total kg.
 */
export function applyScenarioOverride(
  totalKg: number,
  gradeScenario: { A: number; B: number; C: number },   // pct, sums to 100
  ffcScenario: { fresh: number; frozen: number; cuts: number }, // pct, sums to 100
  params: Pick<Parameters, "avgCarcassWeightKg" | "avgLiveWeightKg" | "mortalityRate">
): STPProductionRequirements {
  const gradeSplit: STPGradeSplit = {
    A_kg: (gradeScenario.A / 100) * totalKg,
    B_kg: (gradeScenario.B / 100) * totalKg,
    C_kg: (gradeScenario.C / 100) * totalKg,
    total_kg: totalKg,
    A_pct: gradeScenario.A,
    B_pct: gradeScenario.B,
    C_pct: gradeScenario.C,
  };
  const productSplit: STPProductSplit = {
    fresh_kg:  (ffcScenario.fresh  / 100) * totalKg,
    frozen_kg: (ffcScenario.frozen / 100) * totalKg,
    cuts_kg:   (ffcScenario.cuts   / 100) * totalKg,
    total_kg: totalKg,
    fresh_pct: ffcScenario.fresh,
    frozen_pct: ffcScenario.frozen,
    cuts_pct: ffcScenario.cuts,
  };
  return deriveProductionRequirements(gradeSplit, productSplit, params);
}

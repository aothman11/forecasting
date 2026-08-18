/**
 * Breeding Cycle Planning Module — shared types.
 *
 * Chain:  3300 GP Rearing → 3200 GP Laying → 3100 GP Hatchery
 *       → 1230 PS Rearing → 1220 PS Laying → 1210 AWP Hatchery → 1200 Broiler Farms
 */

export type BreedingCycleView = "overview" | "demand-chain" | "ps-supply" | "schedule" | "scenarios";

// ─── Saved scenario ───────────────────────────────────────────────────────────

/**
 * A named snapshot of BioChainAssumptions overrides for scenario comparison.
 * Applied on top of the current live bioChainAssumptions when replayed.
 */
export interface BreedingScenario {
  id: string;
  name: string;
  createdAt: string;            // ISO yyyy-mm-dd
  psRearingWeeks: number;
  psRearingMortality: number;   // 0..1
  gpRearingWeeks: number;
  gpRearingMortality: number;   // 0..1
  hatchabilityPs: number;       // 0..1
  hatchabilityGp: number;       // 0..1
}

// ─── Tier keys ────────────────────────────────────────────────────────────────

export type TierKey =
  | "gpRearing"    // Plant 3300
  | "gpLaying"     // Plant 3200
  | "gpHatchery"   // Plant 3100
  | "psRearing"    // Plant 1230
  | "psLaying"     // Plant 1220
  | "awpHatchery"  // Plant 1210
  | "broilerFarms";// Plant 1200

export const TIER_META: Record<TierKey, { label: string; plant: string; color: string }> = {
  gpRearing:    { label: "GP Rearing",    plant: "3300", color: "#92400e" },
  gpLaying:     { label: "GP Laying",     plant: "3200", color: "#92400e" },
  gpHatchery:   { label: "GP Hatchery",   plant: "3100", color: "#92400e" },
  psRearing:    { label: "PS Rearing",    plant: "1230", color: "#1d4ed8" },
  psLaying:     { label: "PS Laying",     plant: "1220", color: "#1d4ed8" },
  awpHatchery:  { label: "AWP Hatchery",  plant: "1210", color: "#047836" },
  broilerFarms: { label: "Broiler Farms", plant: "1200", color: "#047836" },
};

// ─── PS cohort ────────────────────────────────────────────────────────────────

export interface PsCohort {
  id: string;
  breed: "cobb" | "ross";
  docArrivalWeek: number;   // plan-relative (1-based; may be ≤ 0 for pre-plan cohorts)
  docFemaleCount: number;   // females at arrival
  layStartWeek: number;     // plan-relative
  layEndWeek: number;       // plan-relative (exclusive)
  sourceName: string;       // e.g. "GP Flock A" or "Ross-PO-001"
}

// ─── Procurement actions ──────────────────────────────────────────────────────

export type ProcActionType =
  | "ross-po"
  | "gp-order"
  | "gp-to-laying"
  | "ps-to-laying"
  | "gp-depop"
  | "ps-depop";

export interface ProcurementAction {
  id: string;
  type: ProcActionType;
  breed: "cobb-gp" | "cobb-ps" | "ross-308";
  plant: string;           // e.g. "3300 → 3200" or "Supplier → 3300"
  actionDate: string;      // ISO yyyy-mm-dd
  actionWeek: number;      // plan-relative (may be ≤ 0 or > horizon)
  qty: number;
  notes: string;
  urgency: "ok" | "due-soon" | "overdue";
}

// ─── Engine output ────────────────────────────────────────────────────────────

export interface BreedingCycleResult {
  /** GP settable eggs per plan week (forward supply from registered GP flocks). */
  gpEggsSupply: Map<number, number>;
  /** Cobb PS DOC arriving per plan week (derived from GP hatchery production). */
  cobbPsDOCByWeek: Map<number, number>;
  /** PS cohorts (Cobb from GP eggs + Ross from orders). */
  psCohorts: PsCohort[];
  /** PS eggs per plan week, split by breed. */
  psEggsByWeek: Map<number, { cobb: number; ross: number; total: number }>;
  /** Broiler DOC supply per plan week (from PS eggs). */
  broilerDOCSupply: Map<number, { cobb: number; ross: number; total: number }>;
  /** Broiler DOC demand (= weekly DOC placements from catching plan). */
  broilerDOCDemand: Map<number, number>;
  /** All procurement and operational actions, sorted by date. */
  procurementActions: ProcurementAction[];
  planStartDate: string;
  horizonWeeks: number;
}

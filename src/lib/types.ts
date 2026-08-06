// Domain types for the AWP Production Forecast pipeline.
// PlacementPlan -> LiveBirdForecast -> CarcassYield -> ProductFamilyAllocation -> CutPlan -> PlantDistribution

/** Step 1 manual input — one row per calendar day. Friday rows are forced to 0 when fridayOff is on. */
export interface PlacementDayRow {
  dayIndex: number; // 0-based offset from planStartDate
  date: string; // ISO date (yyyy-mm-dd)
  farmsPlacing: number; // houses placing that day
  chicksPerHouse: number;
}

/** Weekly aggregate of the daily placement input, used by every downstream step. */
export interface PlacementRow {
  week: number;
  weekStarting: string; // ISO date (yyyy-mm-dd)
  farmsPlacing: number;
  totalChicksPlaced: number;
}

export interface PlantShares {
  plant1: number;
  plant2: number;
  plant3: number;
}

export interface PlantCapacities {
  plant1: number;
  plant2: number;
  plant3: number;
}

export interface GradeSplit {
  A: number;
  B: number;
  C: number;
}

export interface FamilyAllocationRow {
  wcFresh: number;
  wcFrozen: number;
  /** Share of the grade's carcass routed to the cutting line (portioning). FPP is produced downstream FROM cuts. */
  cuts: number;
}

export interface FamilyAllocation {
  A: FamilyAllocationRow;
  B: FamilyAllocationRow;
  C: FamilyAllocationRow;
}

export interface CutYields {
  breastBoneIn: number;
  breastBoneless: number;
  wholeLeg: number;
  drumstick: number;
  thighBoneIn: number;
  wings: number;
  backNeck: number;
  giblets: number;
  trimMince: number;
}

export type CutKey = keyof CutYields;

export type PlantKey = "plant1" | "plant2" | "plant3";

/** Fixed carcass weight classes (grams) used by the size-distribution breakdown. */
export interface CarcassSizeDistribution {
  size500: number;
  size600: number;
  size700: number;
  size800: number;
  size900: number;
  size1000: number;
  size1100: number;
  size1200: number;
  size1300: number;
  size1400: number;
  size1500: number;
}

export type SizeKey = keyof CarcassSizeDistribution;

export interface Parameters {
  houseCount: number; // Quick Fill rate: houses placed per eligible day
  housesPerFarm: number; // informational only — used to derive an approximate farm count
  chicksPerHouse: number;
  cycleLengthDays: number;
  downtimeDays: number;
  mortalityRate: number;
  avgLiveWeightKg: number;
  avgCarcassWeightKg: number;
  harvestMortalityRate: number;
  doaRate: number;
  culledRate: number;
  pluckingRejectRate: number;
  carcassSizeDistribution: CarcassSizeDistribution;
  hatcheryCapacity: number;
  hatchabilityRate: number;
  plantShares: PlantShares;
  plantCapacities: PlantCapacities;
  gradeSplit: GradeSplit;
  familyAllocation: FamilyAllocation;
  cutYields: CutYields;
  /** Share of each cut's output routed into FPP production (Cuts → FPP). 0..1 per cut. */
  fppFromCuts: CutYields;
  /** Frozen WC stock on hand at the start of week 1 (kg). */
  openingFrozenStockKg: number;
  /**
   * Yield of each SAP grade-sorting pool as a fraction of total carcass weight.
   * Must sum to 1.0.  Source: SAP BOM 930 / 931 / 932 / 933.
   *   930 = A-Grade Fresh (65 %), 931 = A-Grade Frozen (15 %),
   *   932 = B-Grade (10 %),        933 = B-Grade Cuts (10 %)
   */
  gradeYields: { "930": number; "931": number; "932": number; "933": number };
  legSplitMode: boolean;
  planningHorizonWeeks: number;
  workingDaysPerWeek: number;
  fridayOff: boolean;
  planStartDate: string; // ISO date for Week 1 start
}

export interface LiveBirdWeek {
  week: number;
  harvestDateStart: string;
  harvestDateEnd: string;
  placementWeekRef: number | null;
  harvestableBirds: number;
  totalLiveWeightKg: number;
  totalPlantCapacity: number;
  utilizationPct: number;
  exceedsCapacity: boolean;
  // Processing chain (Step A-F): harvestable -> dispatched -> electronic count -> slaughtered -> carcass weight.
  harvestMortalityBirds: number;
  dispatchedBirds: number;
  doaBirds: number;
  culledBirds: number;
  electronicBirdCount: number;
  pluckingRejectBirds: number;
  slaughteredBirds: number;
  slaughteredCarcassWeightKg: number;
}

export interface CarcassYieldWeek {
  week: number;
  carcassCountPc: number;
  carcassWeightKg: number;
  gradeAKg: number;
  gradeBKg: number;
  gradeCKg: number;
}

export interface ProductFamilyWeek {
  week: number;
  wcFreshKg: number;
  wcFrozenKg: number;
  /** Carcass kg allocated to the cutting line (portioning input). */
  cutsKg: number;
  totalKg: number;
}

export type CutPlanWeek = {
  week: number;
  cuts: Record<CutKey, number>;
  totalKg: number;
  /** Cut kg routed into FPP production this week (Σ cuts × fppFromCuts share). */
  fppInputKg: number;
  /** Cut kg remaining for sale as cuts after FPP draw. */
  netCutsKg: number;
};

// ---------- Demand Plan (Module 1): product x channel x week ----------

export type ProductCategory = "wholeChicken" | "cuts" | "fpp" | "eggs";

export type ChannelKey = "DIST" | "EXPO" | "FOOD" | "MODT" | "SIST" | "TRAD" | "WHOL" | "ECOM";

export type DemandUnit = "ton" | "tray" | "carton";

/** A single sellable line item in the demand catalog. Fully user-extensible — not a fixed enum. */
export interface DemandProduct {
  id: string;
  category: ProductCategory;
  name: string;
  grade?: "A" | "B"; // wholeChicken only
  weightBucketG?: number; // wholeChicken only, editable in 50g steps
  freshFrozen?: "fresh" | "frozen"; // wholeChicken only
  yieldPct?: number; // fpp only: % yield from FPP input tons (simple BOM, editable)
  unit: DemandUnit;
  /** Selling price in SAR per unit (per ton for weight products, per tray for eggs). Used for revenue by channel. */
  pricePerUnit?: number;
}

/** Sparse quantity map keyed by `${productId}::${channel}::${week}`. */
export type DemandPlanQty = Record<string, number>;

/** Module 2: one row per harvest week — demand requirements vs planned supply. */
export interface SupplyRequirementsWeek {
  week: number;
  // aggregated demand (tons; eggs in trays)
  wcDemandTons: number;
  fppDemandTons: number;
  cutsDemandTons: number;
  eggsDemandTrays: number;
  // required supply (reverse BOM)
  requiredCarcassKg: number;
  requiredHarvestableBirds: number;
  requiredChicksPlaced: number;
  placementWeek: number; // week - harvestOffset; may be ≤ 0 for early weeks
  bindingCategory: ProductCategory | null;
  // planned supply (from forward pipeline)
  plannedCarcassKg: number;
  plannedHarvestableBirds: number;
  plannedWcKg: number;
  plannedFppKg: number;
  plannedCutsKg: number;
  // gaps (planned − required; positive = surplus)
  carcassGapKg: number;
  harvestableGapBirds: number;
}

/** Weekly frozen WC stock rollforward: opening + frozen production − frozen demand = closing. */
export interface FrozenStockWeek {
  week: number;
  openingKg: number;
  producedFrozenKg: number;
  frozenDemandKg: number;
  closingKg: number;
}

export interface CarcassSizeWeek {
  week: number;
  sizes: Record<SizeKey, { birds: number; kg: number }>;
}

export interface PlantWeek {
  week: number;      // plan-relative (1..N from planStartDate)
  isoWeek: number;   // ISO week-of-year — matches SAP file week numbers directly
  plant: PlantKey;
  birds: number;
  liveWeightKg: number;
  carcassKg: number;
  gradeAKg: number;
  gradeBKg: number;
  gradeCKg: number;
  wcFreshKg: number;
  wcFrozenKg: number;
  cutsKg: number;
  dailyBirds: number;
  plantCapacity: number;
  capacityBreach: boolean;
}

export interface PipelineResult {
  placementDays: PlacementDayRow[];
  placement: PlacementRow[];
  liveBird: LiveBirdWeek[];
  carcass: CarcassYieldWeek[];
  carcassSizes: CarcassSizeWeek[];
  family: ProductFamilyWeek[];
  cuts: CutPlanWeek[];
  plants: PlantWeek[];
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  savedAt: string;
  params: Parameters;
  placementDays: PlacementDayRow[];
}

// ─── Farm Master (Step 7) ────────────────────────────────────────────────────

export type FarmStatus = "Active" | "Inactive" | "Under Maintenance";
export type BirdType = "Cobb" | "Ross" | "GP";

/** One row in the Farm Master — mirrors the Farm_Master sheet in the Excel. */
export interface Farm {
  code: string;                  // = VERID in SAP (e.g. "B001")
  sequencePosition: number;      // gapped rotation order (10, 20, 30 …)
  type: string;                  // A / B / C / D
  houses: number;                // number of houses on this farm
  fullCapacity: number;          // maximum chick capacity (all houses)
  placementPlanCapacity: number; // planning ceiling used for Over-Ceiling check
  cycleLengthDays: number;       // grow-out cycle length in days
  cleaningDays: number;          // cleaning / rest days between cycles
  status: FarmStatus;
  skipThisCycle: boolean;
}

/** One placement event — mirrors a data row in Monthly_Plan. */
export interface PlacementEntry {
  id: string;
  farmCode: string;
  date: string;        // ISO yyyy-mm-dd
  birdType: BirdType;
  qtyPlaced: number;
}

/** Header-level settings for the active planning month. */
export interface MonthlyPlanConfig {
  planningMonth: string;     // ISO first day of month (e.g. "2026-07-01")
  plant: string;             // e.g. "1200"
  cobbMatNo: string;         // SAP material no. for Cobb
  rossMatNo: string;         // SAP material no. for Ross
  gpMatNo: string;           // SAP material no. for GP
  submissionStatus: "Not Submitted" | "Submitted";
  submittedOn: string | null;
}

export interface ValidationIssue {
  level: "warning" | "error";
  step: string;
  message: string;
}

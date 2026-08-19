// Domain types for the AWP COP (Central Operational Planning) pipeline.
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
  /** harvestableBirds spread across workingDaysPerWeek — the value compared to daily plant capacity. */
  dailyBirds: number;
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
  /**
   * FPP only — BOM meat-content ratio: raw meat kg per kg of finished product (0..1).
   * Example: burger SAP BOM → 225 kg meat / 256 kg finished = 0.879.
   * Used to convert finished-product demand back to raw-meat requirement.
   * Defaults to DEFAULT_FPP_MEAT_CONTENT (0.879) when not set.
   */
  yieldPct?: number;
  unit: DemandUnit;
  /** Selling price in SAR per unit (per ton for weight products, per tray for eggs). Used for revenue by channel. */
  pricePerUnit?: number;
}

/** Sparse quantity map keyed by `${productId}::${channel}::${week}`. */
export type DemandPlanQty = Record<string, number>;

/** A snapshot of the demand plan saved to the archive. */
export interface ArchivedPlan {
  id: string;
  label: string;
  savedAt: string; // ISO date string
  demandQty: DemandPlanQty;
  /** Sum of all qty values across all cells — used for quick display. */
  totalQty: number;
}

// ─── Server-persisted full plan ───────────────────────────────────────────────

/**
 * The full working state captured when a plan is saved to the SQLite database.
 * All optional fields use `?` so that plans saved before a field was introduced
 * still load without crashing — callers should fall back to safe defaults.
 */
export interface SavedPlanState {
  // Core pipeline
  params:                  Parameters;
  placementDays:           PlacementDayRow[];
  harvestDeferrals:        Record<number, number>;

  // Demand plan
  demandProducts:          DemandProduct[];
  demandQty:               DemandPlanQty;
  salesPlanProductMap:     Record<string, string>;
  salesPlanChannelMap:     Record<string, ChannelKey>;
  salesPlanCartonRows:     import("./processingPlanTypes").SalesPlanCartonRow[];
  salesPlanCartonConfirmed: boolean;

  // Farm & placement
  farms:                   import("./types").Farm[];
  placementEntries:        PlacementEntry[];

  // Processing plan
  monthlyPlanConfig:       MonthlyPlanConfig;
  dailyPlannedQtyOverrides: Record<string, number>;
  broilerCapacity:         Record<string, number>;

  // Products & routing
  bomRecords:              import("./bomTypes").BomRecord[];
  cutProductMapping:       Record<string, CutKey | "ignore">;

  // Biological chain
  bioChainAssumptions:     import("./biologicalChain/types").BioChainAssumptions;
  bioChainGpFlocks:        import("./biologicalChain/types").BioChainGpFlock[];
  bioChainCellOverrides:   Record<string, number>;

  // Breeding pyramid (legacy module)
  breedingParams:          BreedingParams;
  gpFlocks:                GpFlock[];
  rossPsOrders:            RossPsOrder[];
  bpOverrides:             Record<string, number>;
}

/** Metadata row returned by GET /api/plans (no state blob). */
export interface SavedPlanMeta {
  id:          string;
  name:        string;
  description: string;
  savedById:   string;
  savedBy:     string;
  savedAt:     string;  // ISO 8601
  version:     number;
}

/** Full plan row returned by GET /api/plans/[id]. */
export interface SavedPlanFull extends SavedPlanMeta {
  state: SavedPlanState;
}

/** Module 2: one row per harvest week — demand requirements vs planned supply. */
export interface SupplyRequirementsWeek {
  week: number;
  // aggregated demand (tons; eggs in trays)
  wcDemandTons: number;
  fppDemandTons: number;
  cutsDemandTons: number;
  eggsDemandTrays: number;
  // required supply (reverse BOM)
  /** Total FPP finished-product demand converted to raw-meat equivalent (kg). */
  fppRawMeatKg: number;
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
  // Additional state required for a self-consistent snapshot.
  // Optional so old persisted snapshots (saved before this field was added) remain valid.
  demandQty?: DemandPlanQty;
  farms?: Farm[];
  placementEntries?: PlacementEntry[];
  harvestDeferrals?: Record<number, number>;
  bomRecords?: import("./bomTypes").BomRecord[];
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
  /**
   * F-18: Opening-flock seed — the most recent placement date before this plan
   * was created. Used by computeSequenceQueue when no PlacementEntry covers this
   * farm yet, so the rotation queue shows realistic availability dates at plan
   * start instead of treating every farm as "never placed / available now".
   * Optional: null (or absent) means the farm has no known prior placement.
   */
  lastPlacementDate?: string | null; // ISO yyyy-mm-dd
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

// ─── Breeding Pyramid ─────────────────────────────────────────────────────────

/** One Grandparent (GP) flock — Cobb-500 only for AWP. */
export interface GpFlock {
  id: string;
  name: string;              // e.g. "GP-2026-A"
  placementDate: string;     // ISO yyyy-mm-dd
  femaleCount: number;       // females at placement
  layStartWeekAge: number;   // age in weeks when laying begins (default 25)
}

/** One external Ross-308 PS purchase order. */
export interface RossPsOrder {
  id: string;
  name: string;              // e.g. "Ross-PO-001"
  arrivalDate: string;       // ISO yyyy-mm-dd — PS females arrive at PS farm
  femaleCount: number;       // PS females in this shipment
}

/** Biological + planning parameters for the breeding pyramid. */
export interface BreedingParams {
  planStartDate: string;       // ISO yyyy-mm-dd — week 1 of the breeding grid
  planHorizonWeeks: number;    // 52

  // ── Incubation (shared GP→PS and PS→Broiler) ──
  incubationWeeks: number;     // 3

  // ── GP Grandparent parameters ─────────────────
  gpLayingWeeks: number;       // 40
  gpLayMortWeekly: number;     // 0.003  (0.3% weekly mortality during laying)
  gpHDP: number;               // 65     (hen-day production %)
  gpSettableRatio: number;     // 0.85
  gpHatchRate: number;         // 0.78
  gpMaleByproductPct: number;  // 0.50   (50% of hatchlings are male PS byproduct)

  // ── Cobb PS Parent Stock parameters ───────────
  cobbLayStartWeekAge: number; // 25     (PS female age in weeks when laying starts)
  cobbLayingWeeks: number;     // 38
  cobbLayMortWeekly: number;   // 0.003
  cobbHDP: number;             // 62
  cobbSettableRatio: number;   // 0.87
  cobbHatchRate: number;       // 0.80
  cobbMaleByproductPct: number;// 0.50

  // ── Ross PS Parent Stock parameters ───────────
  rossLayStartWeekAge: number; // 25
  rossLayingWeeks: number;     // 38
  rossLayMortWeekly: number;   // 0.003
  rossHDP: number;             // 60
  rossSettableRatio: number;   // 0.85
  rossHatchRate: number;       // 0.78
  rossMaleByproductPct: number;// 0.50

  // ── Ross PO lead time ─────────────────────────
  rossPOLeadWeeks: number;     // 52

  // ── Breeding Cycle placeholder params (flagged in 0B analysis — AWP to verify) ──
  /** Weeks from DOC placement at Plant 3300 to first GP egg (= lay-start age). */
  gpRearingWeeks: number;           // 25
  /** Total mortality during GP rearing period. Fraction (not %). */
  gpRearingMortality: number;       // 0.04
  /** Weeks from PO issue to GP DOC arrival at Plant 3300. */
  gpProcurementLeadWeeks: number;   // 52
  /** Weeks from PS DOC arrival at Plant 1230 to first PS egg. */
  psRearingWeeks: number;           // 25
  /** Total mortality during PS rearing period. Fraction (not %). */
  psRearingMortality: number;       // 0.04
  /** Fraction of hatched DOC rejected as poor quality at Plant 1210 (AWP hatchery). */
  hatcheryCullPct: number;          // 0.02
}

/** One row of the computed breeding pyramid schedule (one plan week). */
export interface BreedingWeekRow {
  week: number;            // 1-based
  weekStart: string;       // ISO yyyy-mm-dd (Monday of that week)

  // GP Supply
  gpSettableEggs: number;  // settable eggs from all GP flocks this week

  // PS supply from GP (Cobb chain)
  cobbPsDOC: number;       // Cobb PS female DOC arriving this week (from GP eggs wk-3)
  cobbPsEggs: number;      // Cobb PS settable eggs this week (from all PS cohorts)

  // PS supply (Ross chain)
  rossPsEggs: number;      // Ross PS settable eggs this week (from all Ross PS cohorts)

  // Broiler DOC
  broilerFromCobb: number; // Broiler female DOC from Cobb PS (cobbPsEggs wk-3 × hatch × (1-male%))
  broilerFromRoss: number; // Broiler female DOC from Ross PS
  totalBroilerDOC: number; // combined

  // Ross PO dates (for any Ross orders whose PO date falls in this week)
  rossPoOrders: { name: string; femaleCount: number; poDate: string; arrivalDate: string }[];
}

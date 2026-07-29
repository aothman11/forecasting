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
  fpp: number;
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
  houseCount: number;
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
  fppKg: number;
  totalKg: number;
}

export type CutPlanWeek = {
  week: number;
  cuts: Record<CutKey, number>;
  totalKg: number;
};

export interface CarcassSizeWeek {
  week: number;
  sizes: Record<SizeKey, { birds: number; kg: number }>;
}

export interface PlantWeek {
  week: number;
  plant: PlantKey;
  birds: number;
  liveWeightKg: number;
  carcassKg: number;
  gradeAKg: number;
  gradeBKg: number;
  gradeCKg: number;
  wcFreshKg: number;
  wcFrozenKg: number;
  fppKg: number;
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

export interface ValidationIssue {
  level: "warning" | "error";
  step: string;
  message: string;
}

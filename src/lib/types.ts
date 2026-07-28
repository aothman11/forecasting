// Domain types for the AWP Broiler Forecasting & Processing Plan pipeline.
// PlacementPlan -> LiveBirdForecast -> CarcassYield -> ProductFamilyAllocation -> CutPlan -> PlantDistribution

export interface PlacementRow {
  week: number;
  weekStarting: string; // ISO date (yyyy-mm-dd)
  farmsPlacing: number;
  chicksPerFarm: number;
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

export interface Parameters {
  totalFarms: number;
  cycleLengthDays: number;
  downtimeDays: number;
  mortalityRate: number;
  avgLiveWeightKg: number;
  dressingPct: number;
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
  planStartDate: string; // ISO date for Week 1 start
}

export interface LiveBirdWeek {
  week: number;
  harvestDateStart: string;
  harvestDateEnd: string;
  placementWeekRef: number | null;
  harvestableBirds: number;
  totalLiveWeightKg: number;
  totalLiveWeightTons: number;
  totalPlantCapacity: number;
  utilizationPct: number;
  exceedsCapacity: boolean;
}

export interface CarcassYieldWeek {
  week: number;
  carcassWeightTons: number;
  gradeATons: number;
  gradeBTons: number;
  gradeCTons: number;
}

export interface ProductFamilyWeek {
  week: number;
  wcFreshTons: number;
  wcFrozenTons: number;
  fppTons: number;
  totalTons: number;
}

export type CutPlanWeek = {
  week: number;
  cuts: Record<CutKey, number>;
  totalTons: number;
};

export interface PlantWeek {
  week: number;
  plant: PlantKey;
  birds: number;
  liveWeightTons: number;
  carcassTons: number;
  gradeATons: number;
  gradeBTons: number;
  gradeCTons: number;
  wcFreshTons: number;
  wcFrozenTons: number;
  fppTons: number;
  dailyBirds: number;
  plantCapacity: number;
  capacityBreach: boolean;
}

export interface PipelineResult {
  placement: PlacementRow[];
  liveBird: LiveBirdWeek[];
  carcass: CarcassYieldWeek[];
  family: ProductFamilyWeek[];
  cuts: CutPlanWeek[];
  plants: PlantWeek[];
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  savedAt: string;
  params: Parameters;
  placement: PlacementRow[];
}

export interface ValidationIssue {
  level: "warning" | "error";
  step: string;
  message: string;
}

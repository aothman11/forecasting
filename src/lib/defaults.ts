import type { CutYields, Parameters } from "./types";

export const DEFAULT_PARAMETERS: Parameters = {
  totalFarms: 93,
  cycleLengthDays: 25.5,
  downtimeDays: 14,
  mortalityRate: 0.05,
  avgLiveWeightKg: 1.75,
  dressingPct: 0.72,
  hatcheryCapacity: 1_235_000,
  hatchabilityRate: 0.87,
  plantShares: {
    plant1: 0.15,
    plant2: 0.25,
    plant3: 0.6,
  },
  plantCapacities: {
    plant1: 80_000,
    plant2: 120_000,
    plant3: 250_000,
  },
  gradeSplit: {
    A: 0.75,
    B: 0.18,
    C: 0.07,
  },
  familyAllocation: {
    A: { wcFresh: 0.4, wcFrozen: 0.25, fpp: 0.35 },
    B: { wcFresh: 0.1, wcFrozen: 0.3, fpp: 0.6 },
    C: { wcFresh: 0, wcFrozen: 0, fpp: 1 },
  },
  cutYields: {
    breastBoneIn: 0.22,
    breastBoneless: 0.18,
    wholeLeg: 0.28,
    drumstick: 0.12,
    thighBoneIn: 0.1,
    wings: 0.12,
    backNeck: 0.08,
    giblets: 0.05,
    trimMince: 0.05,
  },
  legSplitMode: false,
  planningHorizonWeeks: 16,
  workingDaysPerWeek: 6,
  planStartDate: new Date().toISOString().slice(0, 10),
};

export const DEFAULT_CHICKS_PER_FARM = 30_000;

export const CUT_LABELS: Record<keyof CutYields, string> = {
  breastBoneIn: "Breast (bone-in)",
  breastBoneless: "Breast (boneless)",
  wholeLeg: "Whole Leg",
  drumstick: "Drumstick",
  thighBoneIn: "Thigh (bone-in)",
  wings: "Wings",
  backNeck: "Back & Neck",
  giblets: "Giblets",
  trimMince: "Trim / Mince",
};

export const PLANT_LABELS: Record<"plant1" | "plant2" | "plant3", string> = {
  plant1: "Plant 1",
  plant2: "Plant 2",
  plant3: "Plant 3",
};

export const MIN_HORIZON_WEEKS = 16;
export const MAX_HORIZON_WEEKS = 26;

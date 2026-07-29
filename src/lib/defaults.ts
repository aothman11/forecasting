import type { CutYields, Parameters, SizeKey } from "./types";

export const DEFAULT_PARAMETERS: Parameters = {
  houseCount: 27,
  chicksPerHouse: 28_500,
  cycleLengthDays: 25.5,
  downtimeDays: 14,
  mortalityRate: 0.05,
  avgLiveWeightKg: 1.22,
  avgCarcassWeightKg: 0.83,
  harvestMortalityRate: 0.002,
  doaRate: 0.005,
  culledRate: 0.002,
  pluckingRejectRate: 0.006,
  carcassSizeDistribution: {
    size500: 0.0135,
    size600: 0.05,
    size700: 0.163,
    size800: 0.33,
    size900: 0.305,
    size1000: 0.116,
    size1100: 0.02,
    size1200: 0.002,
    size1300: 0.0002,
    size1400: 0.0002,
    size1500: 0.0001,
  },
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
  fridayOff: true,
  planStartDate: new Date().toISOString().slice(0, 10),
};

export const DEFAULT_CHICKS_PER_HOUSE = 28_500;

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

export const SIZE_KEYS: SizeKey[] = [
  "size500",
  "size600",
  "size700",
  "size800",
  "size900",
  "size1000",
  "size1100",
  "size1200",
  "size1300",
  "size1400",
  "size1500",
];

export const SIZE_KG: Record<SizeKey, number> = {
  size500: 0.5,
  size600: 0.6,
  size700: 0.7,
  size800: 0.8,
  size900: 0.9,
  size1000: 1.0,
  size1100: 1.1,
  size1200: 1.2,
  size1300: 1.3,
  size1400: 1.4,
  size1500: 1.5,
};

export const SIZE_LABELS: Record<SizeKey, string> = {
  size500: "500g",
  size600: "600g",
  size700: "700g",
  size800: "800g",
  size900: "900g",
  size1000: "1000g",
  size1100: "1100g",
  size1200: "1200g",
  size1300: "1300g",
  size1400: "1400g",
  size1500: "1500g",
};

export const MIN_HORIZON_WEEKS = 16;
export const MAX_HORIZON_WEEKS = 26;

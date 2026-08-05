import type { ChannelKey, CutYields, DemandProduct, Parameters, SizeKey } from "./types";

export const DEFAULT_PARAMETERS: Parameters = {
  houseCount: 27,
  housesPerFarm: 16,
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
    A: { wcFresh: 0.4, wcFrozen: 0.25, cuts: 0.35 },
    B: { wcFresh: 0.1, wcFrozen: 0.3, cuts: 0.6 },
    C: { wcFresh: 0, wcFrozen: 0, cuts: 1 },
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
  // Cuts → FPP: share of each cut's output routed into FPP production.
  fppFromCuts: {
    breastBoneIn: 0,
    breastBoneless: 0.3,
    wholeLeg: 0,
    drumstick: 0,
    thighBoneIn: 0,
    wings: 0,
    backNeck: 0,
    giblets: 0,
    trimMince: 1,
  },
  openingFrozenStockKg: 0,
  // Grade-sorting pool yields from SAP BOM 930/931/932/933 (must sum to 1.0)
  gradeYields: { "930": 0.65, "931": 0.15, "932": 0.10, "933": 0.10 },
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

export const MIN_HORIZON_MONTHS = 1;
export const MAX_HORIZON_MONTHS = 12;
export const MIN_HORIZON_WEEKS = MIN_HORIZON_MONTHS * 4;
export const MAX_HORIZON_WEEKS = MAX_HORIZON_MONTHS * 4;

// ---------- Demand Plan (Module 1) ----------

export const CHANNEL_KEYS: ChannelKey[] = ["DIST", "EXPO", "FOOD", "MODT", "SIST", "TRAD", "WHOL", "ECOM"];

export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  DIST: "Distributors",
  EXPO: "Export",
  FOOD: "Food Servers",
  MODT: "Modern Trade",
  SIST: "Sister Companies",
  TRAD: "Traditional Trade",
  WHOL: "Wholesale",
  ECOM: "E-commerce",
};

export const EGG_PIECES_PER_TRAY = 30;
export const EGG_TRAYS_PER_CARTON = 12;

/** Target (not enforced) fresh/frozen split used only by the "Distribute Fresh/Frozen" quick-fill helper. */
export const WHOLE_CHICKEN_FRESH_FROZEN_TARGET = { fresh: 0.7, frozen: 0.3 };

const wholeChickenBuckets = (grade: "A" | "B", weights: number[]): DemandProduct[] =>
  weights.flatMap((g) =>
    (["fresh", "frozen"] as const).map((ff) => ({
      id: `wc-${g}-${grade.toLowerCase()}-${ff}`,
      category: "wholeChicken" as const,
      name: `WC ${g}g ${grade} ${ff === "fresh" ? "Fresh" : "Frozen"}`,
      grade,
      weightBucketG: g,
      freshFrozen: ff,
      unit: "ton" as const,
    }))
  );

const WC_BUCKETS_G = [500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500];

export const DEFAULT_DEMAND_PRODUCTS: DemandProduct[] = [
  ...wholeChickenBuckets("A", WC_BUCKETS_G),
  ...wholeChickenBuckets("B", WC_BUCKETS_G),
  { id: "cut-breast-bone-in", category: "cuts", name: "Breast (bone-in)", unit: "ton" },
  { id: "cut-breast-boneless", category: "cuts", name: "Breast (boneless)", unit: "ton" },
  { id: "cut-whole-leg", category: "cuts", name: "Whole Leg", unit: "ton" },
  { id: "cut-drumstick", category: "cuts", name: "Drumstick", unit: "ton" },
  { id: "cut-thigh-bone-in", category: "cuts", name: "Thigh (bone-in)", unit: "ton" },
  { id: "cut-wings", category: "cuts", name: "Wings", unit: "ton" },
  { id: "cut-back-neck", category: "cuts", name: "Back & Neck", unit: "ton" },
  { id: "cut-giblets", category: "cuts", name: "Giblets", unit: "ton" },
  { id: "cut-trim-mince", category: "cuts", name: "Trim / Mince", unit: "ton" },
  { id: "cut-marinated", category: "cuts", name: "Marinated", unit: "ton" },
  { id: "fpp-nuggets", category: "fpp", name: "Nuggets", yieldPct: 0.2, unit: "ton" },
  { id: "fpp-burgers-patties", category: "fpp", name: "Burgers / Patties", yieldPct: 0.15, unit: "ton" },
  { id: "fpp-strips-tenders", category: "fpp", name: "Strips / Tenders", yieldPct: 0.2, unit: "ton" },
  { id: "fpp-shawarma", category: "fpp", name: "Shawarma", yieldPct: 0.15, unit: "ton" },
  { id: "fpp-marinated-pieces", category: "fpp", name: "Marinated Pieces", yieldPct: 0.15, unit: "ton" },
  { id: "fpp-other", category: "fpp", name: "Other FPP", yieldPct: 0.15, unit: "ton" },
  { id: "egg-large", category: "eggs", name: "Table Eggs Large", unit: "tray" },
  { id: "egg-medium", category: "eggs", name: "Table Eggs Medium", unit: "tray" },
  { id: "egg-small", category: "eggs", name: "Table Eggs Small", unit: "tray" },
];

export const PRODUCT_CATEGORY_LABELS: Record<DemandProduct["category"], string> = {
  wholeChicken: "Whole Chicken",
  cuts: "Cuts",
  fpp: "FPP (Further Processed Products)",
  eggs: "Eggs",
};

// ---------- Farm Master (Step 7) ----------

import type { Farm, MonthlyPlanConfig } from "./types";

export const DEFAULT_FARMS: Farm[] = [
  { code: "B001", sequencePosition: 10, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B002", sequencePosition: 20, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B003", sequencePosition: 30, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B004", sequencePosition: 40, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B005", sequencePosition: 50, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B006", sequencePosition: 60, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B007", sequencePosition: 70, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B009", sequencePosition: 80, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B008", sequencePosition: 90, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B011", sequencePosition: 100, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B010", sequencePosition: 110, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B014", sequencePosition: 120, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B016", sequencePosition: 130, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B018", sequencePosition: 140, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B019", sequencePosition: 150, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B020", sequencePosition: 160, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B021", sequencePosition: 170, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B022", sequencePosition: 180, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B012", sequencePosition: 190, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B023", sequencePosition: 200, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B024", sequencePosition: 210, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B027", sequencePosition: 220, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B028", sequencePosition: 230, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B030", sequencePosition: 240, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B031", sequencePosition: 250, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B032", sequencePosition: 260, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B033", sequencePosition: 270, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Inactive", skipThisCycle: false },
  { code: "B034", sequencePosition: 280, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B035", sequencePosition: 290, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B013", sequencePosition: 300, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B015", sequencePosition: 310, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B017", sequencePosition: 320, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B029", sequencePosition: 330, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B036", sequencePosition: 340, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B037", sequencePosition: 350, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B038", sequencePosition: 360, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B039", sequencePosition: 370, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B040", sequencePosition: 380, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B041", sequencePosition: 390, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B042", sequencePosition: 400, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B043", sequencePosition: 410, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B044", sequencePosition: 420, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B045", sequencePosition: 430, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: true },
  { code: "B046", sequencePosition: 440, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B047", sequencePosition: 450, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B048", sequencePosition: 460, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B049", sequencePosition: 470, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B050", sequencePosition: 480, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B051", sequencePosition: 490, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B052", sequencePosition: 500, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B053", sequencePosition: 510, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B054", sequencePosition: 520, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B055", sequencePosition: 530, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B056", sequencePosition: 540, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B057", sequencePosition: 550, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Under Maintenance", skipThisCycle: false },
  { code: "B058", sequencePosition: 560, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B059", sequencePosition: 570, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B060", sequencePosition: 580, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B061", sequencePosition: 590, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B062", sequencePosition: 600, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B063", sequencePosition: 610, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B064", sequencePosition: 620, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B065", sequencePosition: 630, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B066", sequencePosition: 640, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B067", sequencePosition: 650, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B068", sequencePosition: 660, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B069", sequencePosition: 670, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B070", sequencePosition: 680, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B071", sequencePosition: 690, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B072", sequencePosition: 700, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B073", sequencePosition: 710, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B074", sequencePosition: 720, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B075", sequencePosition: 730, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B076", sequencePosition: 740, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B077", sequencePosition: 750, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B078", sequencePosition: 760, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B079", sequencePosition: 770, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B080", sequencePosition: 780, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B081", sequencePosition: 790, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B082", sequencePosition: 800, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B083", sequencePosition: 810, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B084", sequencePosition: 820, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B085", sequencePosition: 830, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B086", sequencePosition: 840, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B087", sequencePosition: 850, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B088", sequencePosition: 860, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B089", sequencePosition: 870, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B090", sequencePosition: 880, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B091", sequencePosition: 890, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "A092", sequencePosition: 900, type: "A", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "A093", sequencePosition: 910, type: "A", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "A094", sequencePosition: 920, type: "A", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
  { code: "B095", sequencePosition: 930, type: "B", houses: 12, fullCapacity: 408000, placementPlanCapacity: 312000, cycleLengthDays: 43, cleaningDays: 17, status: "Active", skipThisCycle: false },
];

export const DEFAULT_MONTHLY_PLAN_CONFIG: MonthlyPlanConfig = {
  planningMonth: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; })(),
  plant: "1200",
  cobbMatNo: "100800160095",
  rossMatNo: "100800160096",
  gpMatNo: "100800160097",
  submissionStatus: "Not Submitted",
  submittedOn: null,
};

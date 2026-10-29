// C.Layer Plan — commercial table-egg layers. Separate value stream from the broiler chain.
// Planning only: plant codes and material numbers are labels for matching to SAP, never postings.

/** 1260 = Commercial Layer – Rearing, 1250 = Commercial Layer – Laying. */
export type LayerPlant = "1260" | "1250";

export const LAYER_PLANTS: Record<LayerPlant, string> = {
  "1260": "Commercial Layer – Rearing",
  "1250": "Commercial Layer – Laying",
};

/** Graded (unpacked) egg materials in plant 1250. */
export const GRADED_MATERIALS = {
  table: { materialNo: "90001", description: "Unpacked table egg" },
  gradeC: { materialNo: "90002", description: "Unpacked Grade C egg" },
} as const;

export interface LayerBreed {
  id: string;
  name: string;
  /** Plant-1250 egg material for this breed's eggs, e.g. 60001 CL EGG HISEX-WHITE. */
  eggMaterialNo: string;
  /** SAP materials the flock carries before it becomes an egg-producing asset ("" = not entered). */
  docMaterialNo: string;
  pullet14MaterialNo: string;
  layingPullet19MaterialNo: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const BREED_MATERIAL_FIELDS = [
  { key: "docMaterialNo", label: "DOC" },
  { key: "pullet14MaterialNo", label: "Pullet 14WK" },
  { key: "layingPullet19MaterialNo", label: "Laying Pullet 19WK" },
  { key: "eggMaterialNo", label: "Eggs" },
] as const;

/** One row of a breed's weekly standard. ageWeek 1 = placement week. Percentages are 0–100. */
export interface LayerBreedStandardRow {
  ageWeek: number;
  mortalityPct: number;
  henDayPct: number;
  eggWeightG: number | null;
}

export interface LayerFarm {
  id: string;
  code: string;
  name: string;
  /** null only for rows created before plants were introduced. */
  plant: LayerPlant | null;
  houses: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One planned DOC placement: rearing stage in 1260, then laying stage in 1250 from the transfer week. */
export interface LayerPlacement {
  id: string;
  /** AWP running flock number (e.g. 101). null only for rows created before flock numbers existed. */
  flockNo: number | null;
  /** ISO yyyy-mm-dd, always the Monday of the ISO placement week — the anchor. */
  placementWeekStart: string;
  chicks: number;
  breedId: string;
  rearingFarmId: string;
  rearingHouses: number | null;
  layingFarmId: string;
  layingHouses: number | null;
  /** null = use the default transfer age from settings. */
  transferAgeWeek: number | null;
  /** null = use the default depletion age from settings. */
  depletionAgeWeek: number | null;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** Admin settings. Values are null until set — only the transfer default is seeded (17). */
export interface LayerSettings {
  prToPoDays: number | null;
  poToDeliveryDays: number | null;
  defaultTransferAge: number | null;
  defaultDepletionAge: number | null;
  /** Thin shell, broken and dirty eggs removed at collection / grading. */
  rejectPct: number | null;
  /** Split of graded eggs: 90001 table egg vs 90002 Grade C. Both set and summing to 100, or both null. */
  gradeTablePct: number | null;
  gradeCPct: number | null;
  /** Age weeks at which the flock's SAP material changes: DOC → Pullet 14WK → Laying Pullet 19WK → asset (egg material). */
  pulletFromAge: number | null;
  layingPulletFromAge: number | null;
  assetFromAge: number | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export type LayerSettingsInput = Omit<LayerSettings, "updatedBy" | "updatedAt">;

export type LayerPhase = "rearing" | "laying";

/** Feed stage reference row. Weeks use the business-process document's numbering (starts at 0). */
export interface LayerFeedStage {
  id: string;
  name: string;
  phase: LayerPhase;
  fromWeek: number;
  toWeek: number;
  materialNo: string;
  sortOrder: number;
}

export type SkuGrade = "table" | "grade_c";

/** Packed finished good in plant 1250. Table-grade SKUs share 90001 by packMixPct; Grade C SKUs share 90002. */
export interface LayerSku {
  materialNo: string;
  description: string;
  grade: SkuGrade;
  piecesPerPack: number;
  traysPerPack: number;
  eggsPerTray: number;
  packMixPct: number | null;
  sortOrder: number;
}

export type LayerSkuUpdate = Pick<LayerSku, "materialNo" | "piecesPerPack" | "traysPerPack" | "eggsPerTray" | "packMixPct">;

export type LayerFeedStageInput = Omit<LayerFeedStage, "id"> & { id?: string };

export interface LayerPlacementInput {
  /** null = assign the next running number on create / keep the current number on update. */
  flockNo: number | null;
  placementWeekStart: string;
  chicks: number;
  breedId: string;
  rearingFarmId: string;
  rearingHouses: number | null;
  layingFarmId: string;
  layingHouses: number | null;
  transferAgeWeek: number | null;
  depletionAgeWeek: number | null;
  notes: string;
}

export interface LayerBreedInput {
  name: string;
  eggMaterialNo: string;
  docMaterialNo: string;
  pullet14MaterialNo: string;
  layingPullet19MaterialNo: string;
  active: boolean;
}

export interface LayerFarmInput {
  code: string;
  name: string;
  plant: LayerPlant;
  houses: number | null;
  active: boolean;
}

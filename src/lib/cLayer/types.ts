// C.Layer Plan — commercial table-egg layer planning. Separate value stream from the broiler chain.

export interface LayerBreed {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LayerPlacement {
  id: string;
  /** ISO yyyy-mm-dd, always the Monday of the ISO placement week. */
  placementWeekStart: string;
  chicks: number;
  breedId: string;
  farmId: string;
  /** null = use the breed default (last age week in its standard table). */
  endOfLayWeek: number | null;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** Every value is null until an Admin sets it — there are deliberately no defaults. */
export interface LayerSettings {
  prToPoDays: number | null;
  poToDeliveryDays: number | null;
  eggsPerTray: number | null;
  traysPerCase: number | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export type LayerSettingsInput = Pick<LayerSettings, "prToPoDays" | "poToDeliveryDays" | "eggsPerTray" | "traysPerCase">;

export interface LayerPlacementInput {
  placementWeekStart: string;
  chicks: number;
  breedId: string;
  farmId: string;
  endOfLayWeek: number | null;
  notes: string;
}

export interface LayerBreedInput {
  name: string;
  active: boolean;
}

export interface LayerFarmInput {
  code: string;
  name: string;
  active: boolean;
}

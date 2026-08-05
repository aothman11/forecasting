/** Finished-good SKU record. Each row maps one FG material to its carcass source. */
export interface BomRecord {
  /** Stable internal id — never shown to the user. */
  id: string;
  /** SAP material number, e.g. "8140106". */
  skuCode: string;
  /** SAP material description, e.g. "fresh chkn 800g ,10EA/CAR". */
  skuDescription: string;
  /** Net weight per retail piece in kg (e.g. 0.8 for an 800g bird). */
  packageWeightKg: number;
  /** Number of pieces per shipping carton (e.g. 10). */
  unitsPerCarton: number;
  /**
   * SAP semi-finished pool this SKU draws from:
   *   930 = A-Grade Fresh
   *   931 = A-Grade Frozen
   *   932 = B-Grade
   *   933 = B-Grade Cuts
   */
  gradePool: "930" | "931" | "932" | "933";
  /** Which plant produces this SKU. "ALL" means all three plants. */
  plant: "1100" | "1200" | "1300" | "ALL";
}

export type GradePool = BomRecord["gradePool"];

export const GRADE_POOL_LABELS: Record<GradePool, string> = {
  "930": "A-Grade Fresh",
  "931": "A-Grade Frozen",
  "932": "B-Grade",
  "933": "B-Grade Cuts",
};

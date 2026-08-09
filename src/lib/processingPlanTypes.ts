import type { GradePool } from "./bomTypes";

export interface SalesPlanCartonRow {
  week: number;           // ISO week number from SAP (e.g. 32)
  /**
   * Calendar year of this SAP row, extracted from the column header when available
   * (e.g. "Week No. in 2026" → 2026).  When present, enables year-aware horizon
   * filtering so pre-plan weeks (e.g. July 2026 when plan starts Aug 2026) are
   * correctly excluded even for 52-week plans where all ISO week numbers appear.
   */
  year?: number;
  plant: string;          // "P1" | "P2" | "P3"
  skuCode: string;        // SAP material code — must match a BomRecord.skuCode
  skuDescription: string;
  cartons: number;
  /** SAP "Division" column — "Fresh" | "Frozen" | "Eggs" | ... */
  division?: string;
  /** SAP "Material Category" column — "Whole Chicken" | "Portions" | "FPP" | "Giblets" | ... */
  materialCategory?: string;
  /** SAP "Grading" or "WH Grading" column — "AG" | "BG" | "" */
  grading?: string;
}

export interface SkuContribution {
  skuCode: string;
  skuDescription: string;
  cartons: number;
  carcassKg: number;
}

export interface ProcessingPlanCell {
  week: number;
  plant: string;
  gradePool: GradePool;
  requiredCarcassKg: number;
  /**
   * SAP mode  : actual carton count from the sales plan file.
   * Forecast mode: demand in tons (label shown as "Demand (t)" in the UI).
   */
  cartons: number;
  /**
   * true when derived from the Demand Plan (demandQty) rather than an imported
   * SAP carton file. Consumers use this to adapt labels (Cartons → Demand (t)).
   */
  isForecast?: boolean;
  skuBreakdown: SkuContribution[];
}

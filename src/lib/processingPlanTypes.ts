import type { GradePool } from "./bomTypes";

export interface SalesPlanCartonRow {
  week: number;           // ISO week number from SAP (e.g. 32)
  plant: string;          // "1100" | "1200" | "1300"
  skuCode: string;        // SAP material code — must match a BomRecord.skuCode
  skuDescription: string;
  cartons: number;
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

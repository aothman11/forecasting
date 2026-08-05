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
  cartons: number;
  skuBreakdown: SkuContribution[];
}

import * as XLSX from "xlsx";
import type { ChannelKey, DemandProduct } from "./types";

export interface SalesPlanRow {
  weekOfYear: number;
  yearMonth: string;
  salesOffice: string;
  channel: string;
  materialDivision: string;
  division: string;
  materialCategory: string;
  materialReportGroup: string;
  whGrading: string;
  grading: string;
  size: string;
  materialCode: string;
  materialDescription: string;
  weightOfCarton: number;
  grossSalesVolumeCar: number;
  grossSalesVolumeUom: number;
  grossSalesValueSar: number;
  netSalesValueSar: number;
}

const NUMERIC_FIELDS: (keyof SalesPlanRow)[] = [
  "weekOfYear",
  "weightOfCarton",
  "grossSalesVolumeCar",
  "grossSalesVolumeUom",
  "grossSalesValueSar",
  "netSalesValueSar",
];

// Matches the exact header row from the AWP SAP sales plan export (order-insensitive).
// "Week No. in <year>" is matched by pattern since the year changes annually.
const HEADER_MATCHERS: Partial<Record<keyof SalesPlanRow, string[]>> = {
  yearMonth: ["year.month"],
  salesOffice: ["sales office"],
  channel: ["channels", "channel"],
  materialDivision: ["material division"],
  division: ["division"],
  materialCategory: ["material category"],
  materialReportGroup: ["material report group"],
  whGrading: ["wh grading"],
  grading: ["grading"],
  size: ["size"],
  materialCode: ["material code"],
  materialDescription: ["material description"],
  weightOfCarton: ["weight of carton"],
  grossSalesVolumeCar: ["gross sales volume (car)"],
  grossSalesVolumeUom: ["gross sales volume (uom)"],
  grossSalesValueSar: ["gross sales value (sar)"],
  netSalesValueSar: ["net sales value (sar)"],
};

const WEEK_OF_YEAR_PATTERN = /^week no\.?\s*in\s*\d{4}$/i;

const FIELD_KEYS = Object.keys(HEADER_MATCHERS) as (keyof SalesPlanRow)[];

/** Parses the first sheet of an .xlsx/.xls/.csv SAP sales plan export into typed rows. */
export function parseSalesPlan(buffer: ArrayBuffer): SalesPlanRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (rawRows.length === 0) return [];

  const sourceKeys = Object.keys(rawRows[0]);
  const resolvedKey = {} as Record<keyof SalesPlanRow, string | undefined>;
  FIELD_KEYS.forEach((field) => {
    const matchers = HEADER_MATCHERS[field]!;
    resolvedKey[field] = sourceKeys.find((k) => matchers.includes(k.trim().toLowerCase()));
  });
  resolvedKey.weekOfYear = sourceKeys.find((k) => WEEK_OF_YEAR_PATTERN.test(k.trim()));

  return rawRows
    .map((row): SalesPlanRow => {
      const result = {} as SalesPlanRow;
      ([...FIELD_KEYS, "weekOfYear"] as (keyof SalesPlanRow)[]).forEach((field) => {
        const key = resolvedKey[field];
        const raw = key ? row[key] : "";
        if (NUMERIC_FIELDS.includes(field)) {
          (result[field] as number) = Number(raw) || 0;
        } else {
          (result[field] as string) = String(raw ?? "").trim();
        }
      });
      return result;
    })
    .filter((r) => r.materialCode || r.materialDescription);
}

export function distinctValues(rows: SalesPlanRow[], field: keyof SalesPlanRow): string[] {
  const set = new Set<string>();
  rows.forEach((r) => {
    const v = String(r[field] ?? "").trim();
    if (v) set.add(v);
  });
  return Array.from(set).sort();
}

export function distinctWeeksOfYear(rows: SalesPlanRow[]): number[] {
  const set = new Set<number>();
  rows.forEach((r) => {
    if (r.weekOfYear > 0) set.add(r.weekOfYear);
  });
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * SAP-style "week of year" where the week counter resets at the start of every month
 * (days 1-7 of a month = week 1, 8-14 = week 2, ...), rather than a continuous Mon-start ISO week.
 * Used as the best-guess alignment to the file's "Week No. in <year>" column.
 */
export function salesWeekNumber(dateStr: string): number {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  let week = 0;
  for (let m = 0; m < date.getMonth(); m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    week += Math.ceil(daysInMonth / 7);
  }
  week += Math.ceil(date.getDate() / 7);
  return week;
}

/** A distinct (Division, Material Category, Size, Grading) combination the user maps to a catalog product once. */
export interface RowSignatureGroup {
  signature: string;
  division: string;
  materialCategory: string;
  size: string;
  grading: string;
  rowCount: number;
}

export function rowSignature(row: SalesPlanRow): string {
  return [row.division, row.materialCategory, row.size, row.grading].join(" | ");
}

export function distinctRowSignatures(rows: SalesPlanRow[]): RowSignatureGroup[] {
  const map = new Map<string, RowSignatureGroup>();
  rows.forEach((r) => {
    const signature = rowSignature(r);
    const existing = map.get(signature);
    if (existing) {
      existing.rowCount++;
    } else {
      map.set(signature, {
        signature,
        division: r.division,
        materialCategory: r.materialCategory,
        size: r.size,
        grading: r.grading,
        rowCount: 1,
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => b.rowCount - a.rowCount);
}

export interface SalesPlanImportSummary {
  mappedRows: number;
  unmappedRows: number;
}

/**
 * Aggregates rows into demand quantities keyed by `${productId}::${channel}::${weekOfYear}`, converting
 * to the target product's unit (kg -> tons for "ton" products; passed through as-is otherwise). Rows whose
 * row-signature or channel aren't mapped are skipped and counted as unmapped.
 */
export function aggregateSalesPlanByProductChannelWeek(
  rows: SalesPlanRow[],
  productMap: Record<string, string>,
  channelMap: Record<string, ChannelKey>,
  productsById: Map<string, DemandProduct>
): { totals: Map<string, number>; summary: SalesPlanImportSummary } {
  const totals = new Map<string, number>();
  let mappedRows = 0;
  let unmappedRows = 0;

  for (const row of rows) {
    const productId = productMap[rowSignature(row)];
    const channel = channelMap[row.channel];
    const product = productId ? productsById.get(productId) : undefined;

    if (!productId || !channel || !product || row.weekOfYear <= 0) {
      unmappedRows++;
      continue;
    }

    const qty = product.unit === "ton" ? row.grossSalesVolumeUom / 1000 : row.grossSalesVolumeUom;
    const key = `${productId}::${channel}::${row.weekOfYear}`;
    totals.set(key, (totals.get(key) ?? 0) + qty);
    mappedRows++;
  }

  return { totals, summary: { mappedRows, unmappedRows } };
}

export function isSalesPlanFile(file: File): boolean {
  return /\.(xlsx|xls|csv)$/i.test(file.name);
}

import * as XLSX from "xlsx";
import { getISOWeek } from "date-fns";

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

/** ISO-8601 week number (Mon-start) for a plan week's start date — used as the best-guess alignment to the file's week column. */
export function isoWeekNumber(dateStr: string): number {
  return getISOWeek(new Date(dateStr));
}

export type FreshFrozen = "fresh" | "frozen" | "ignore";
export type WholeOrFpp = "whole" | "fpp" | "ignore";

export interface SalesPlanAggregate {
  wcFreshKg: number;
  wcFrozenKg: number;
  fppKg: number;
  mappedRows: number;
  unmappedRows: number;
}

function emptyAggregate(): SalesPlanAggregate {
  return { wcFreshKg: 0, wcFrozenKg: 0, fppKg: 0, mappedRows: 0, unmappedRows: 0 };
}

function addRowToAggregate(
  agg: SalesPlanAggregate,
  row: SalesPlanRow,
  divisionMap: Record<string, FreshFrozen>,
  categoryMap: Record<string, WholeOrFpp>
) {
  const catType = categoryMap[row.materialCategory] ?? "ignore";
  const divType = divisionMap[row.division] ?? "ignore";
  const vol = row.grossSalesVolumeUom;

  if (catType === "fpp") {
    agg.fppKg += vol;
    agg.mappedRows++;
  } else if (catType === "whole" && divType === "fresh") {
    agg.wcFreshKg += vol;
    agg.mappedRows++;
  } else if (catType === "whole" && divType === "frozen") {
    agg.wcFrozenKg += vol;
    agg.mappedRows++;
  } else {
    agg.unmappedRows++;
  }
}

/** Buckets rows into WC Fresh / WC Frozen / FPP kg using the user-assigned Division and Material Category mappings. */
export function aggregateSalesPlanToDemand(
  rows: SalesPlanRow[],
  divisionMap: Record<string, FreshFrozen>,
  categoryMap: Record<string, WholeOrFpp>
): SalesPlanAggregate {
  const agg = emptyAggregate();
  rows.forEach((row) => addRowToAggregate(agg, row, divisionMap, categoryMap));
  return agg;
}

/** Same as aggregateSalesPlanToDemand, but grouped by the file's "Week No. in <year>" column. */
export function aggregateSalesPlanByWeek(
  rows: SalesPlanRow[],
  divisionMap: Record<string, FreshFrozen>,
  categoryMap: Record<string, WholeOrFpp>
): Map<number, SalesPlanAggregate> {
  const byWeek = new Map<number, SalesPlanAggregate>();
  rows.forEach((row) => {
    if (row.weekOfYear <= 0) return;
    let agg = byWeek.get(row.weekOfYear);
    if (!agg) {
      agg = emptyAggregate();
      byWeek.set(row.weekOfYear, agg);
    }
    addRowToAggregate(agg, row, divisionMap, categoryMap);
  });
  return byWeek;
}

export function isSalesPlanFile(file: File): boolean {
  return /\.(xlsx|xls|csv)$/i.test(file.name);
}

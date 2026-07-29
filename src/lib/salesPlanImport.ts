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

const HEADER_MATCHERS: Partial<Record<keyof SalesPlanRow, string[]>> = {
  yearMonth: ["year.month", "year month"],
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
  grossSalesVolumeUom: ["gross sales volume (uom)", "gross sales volume (uom)", "gross sales volume uom"],
  grossSalesValueSar: ["gross sales value (sar)", "gross sales value sar"],
  netSalesValueSar: ["net sales value (sar)", "net sales value sar"],
};

// Flexible: "Week No. in 2026", "Week No in 2026", "Week No. In 2025", "Week# in 2026"
const WEEK_OF_YEAR_PATTERN = /^week[\s#]*no\.?\s*(in|of)?\s*\d{4}$/i;
// Fallback: "Week No. in Month", "Week No in Month", "Week# in Month"
const WEEK_OF_MONTH_PATTERN = /^week[\s#]*no\.?\s*(in|of)?\s*month$/i;

const FIELD_KEYS = Object.keys(HEADER_MATCHERS) as (keyof SalesPlanRow)[];

/** Find the 0-based row index that contains the actual column headers (tolerates title/blank rows above). */
function findHeaderRowIndex(sheet: XLSX.WorkSheet): number {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const cells = (raw[i] as unknown[]).map((c) => String(c ?? "").trim().toLowerCase());
    const joined = cells.join(" ");
    if (
      joined.includes("division") ||
      joined.includes("material category") ||
      joined.includes("week no") ||
      joined.includes("material code")
    ) {
      return i;
    }
  }
  return 0;
}

/** Returns the raw column header names found in the file (for debugging when detection fails). */
export function getSalesPlanHeaders(buffer: ArrayBuffer): string[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const headerRow = findHeaderRowIndex(sheet);
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: headerRow });
  return rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
}

export function parseSalesPlan(buffer: ArrayBuffer): SalesPlanRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const headerRow = findHeaderRowIndex(sheet);
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: headerRow });
  if (rawRows.length === 0) return [];

  const sourceKeys = Object.keys(rawRows[0]);
  const resolvedKey = {} as Record<keyof SalesPlanRow, string | undefined>;
  FIELD_KEYS.forEach((field) => {
    const matchers = HEADER_MATCHERS[field]!;
    resolvedKey[field] = sourceKeys.find((k) => matchers.includes(k.trim().toLowerCase()));
  });
  resolvedKey.weekOfYear = sourceKeys.find((k) => WEEK_OF_YEAR_PATTERN.test(k.trim()));

  // Fallback column keys for deriving weekOfYear when the annual column is absent
  const weekOfMonthKey = sourceKeys.find((k) => WEEK_OF_MONTH_PATTERN.test(k.trim()));
  const yearMonthKey = resolvedKey.yearMonth; // "Year.Month" e.g. "2026.07"

  const parsed = rawRows
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

      // Fallback: compute weekOfYear from Year.Month + Week No. in Month
      if (result.weekOfYear === 0 && weekOfMonthKey && yearMonthKey) {
        const weekInMonth = Number(row[weekOfMonthKey]) || 0;
        const ym = String(row[yearMonthKey] ?? "").trim(); // "2026.07"
        const [yearStr, monthStr] = ym.split(/[.\-\/]/);
        const year = Number(yearStr);
        const month = Number(monthStr); // 1-based
        if (year > 2000 && month >= 1 && month <= 12 && weekInMonth >= 1) {
          let week = 0;
          for (let m = 1; m < month; m++) {
            week += Math.ceil(new Date(year, m, 0).getDate() / 7);
          }
          result.weekOfYear = week + weekInMonth;
        }
      }

      return result;
    })
    .filter((r) => r.materialCode || r.materialDescription);

  return parsed;
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

// ─── Auto-mapping helpers ──────────────────────────────────────────────────────

/** Maps a SAP channel label to a ChannelKey. Returns undefined if not recognized. */
export function normalizeChannelKey(raw: string): ChannelKey | undefined {
  const s = raw.trim().toLowerCase();
  const table: Record<string, ChannelKey> = {
    distributers: "DIST", distributors: "DIST", dist: "DIST",
    export: "EXPO", expo: "EXPO",
    "food service": "FOOD", "food services": "FOOD", "food server": "FOOD", "food servers": "FOOD",
    "modern trade": "MODT", modt: "MODT",
    "sister companies": "SIST", "sister company": "SIST", sist: "SIST",
    "traditional trade": "TRAD", trad: "TRAD",
    wholesale: "WHOL", whol: "WHOL",
    "e-commerce": "ECOM", ecommerce: "ECOM", ecom: "ECOM",
  };
  return table[s];
}

function deriveCategoryFromRow(row: SalesPlanRow): DemandProduct["category"] | undefined {
  const cat = (row.materialCategory || "").toLowerCase();
  const matDiv = (row.materialDivision || "").toLowerCase();
  const div = (row.division || "").toLowerCase();
  if (cat.includes("whole chicken") || cat.includes("whole bird")) return "wholeChicken";
  if (cat.includes("fpp") || cat.includes("further processed")) return "fpp";
  if (cat.includes("portions") || cat.includes("cuts") || cat.includes("cold cured") || cat.includes("marinated")) return "cuts";
  if (cat.includes("egg") || matDiv.includes("egg") || div === "eggs") return "eggs";
  return undefined;
}

function parseFreshFrozen(division: string): "fresh" | "frozen" | undefined {
  const s = division.trim().toLowerCase();
  if (s === "chiller" || s === "fresh" || s === "chilled") return "fresh";
  if (s === "frozen") return "frozen";
  return undefined;
}

function parseGrade(grading: string, whGrading: string): "A" | "B" | undefined {
  for (const raw of [grading, whGrading]) {
    const s = raw.trim().toUpperCase();
    if (["AG", "A", "GRADE A", "A GRADE", "GRADE-A"].includes(s)) return "A";
    if (["BG", "B", "GRADE B", "B GRADE", "GRADE-B"].includes(s)) return "B";
  }
  return undefined;
}

function parseWeightG(size: string): number | undefined {
  if (!size?.trim()) return undefined;
  const s = size.trim().toLowerCase().replace(/gm?$/, "").trim();
  const n = Number(s);
  if (!n || isNaN(n)) return undefined;
  return n < 10 ? Math.round(n * 1000) : n;
}

function descMatchesCut(desc: string, productName: string): boolean {
  const d = desc.toLowerCase();
  const n = productName.toLowerCase();
  if (n.includes("breast") && n.includes("bone-in")) return d.includes("breast") && (d.includes("bone") || d.includes(" bi") || d.includes("b/i"));
  if (n.includes("breast") && n.includes("boneless")) return d.includes("breast") && (d.includes("boneless") || d.includes(" bl") || d.includes("b/l"));
  if (n.includes("whole leg")) return d.includes("whole leg") || d.includes("whole-leg");
  if (n.includes("drumstick")) return d.includes("drum");
  if (n.includes("thigh")) return d.includes("thigh");
  if (n.includes("wings")) return d.includes("wing");
  if (n.includes("back")) return d.includes("back") || d.includes("neck");
  if (n.includes("giblets")) return d.includes("giblet") || d.includes("liver") || d.includes("heart") || d.includes("gizzard");
  if (n.includes("mince") || n.includes("trim")) return d.includes("mince") || d.includes("trim");
  if (n.includes("marinated")) return d.includes("marinat");
  return false;
}

function descMatchesFpp(desc: string, productName: string): boolean {
  const d = desc.toLowerCase();
  const n = productName.toLowerCase();
  if (n.includes("nugget")) return d.includes("nugget");
  if (n.includes("burger") || n.includes("pattie")) return d.includes("burger") || d.includes("pattie") || d.includes("patty");
  if (n.includes("strip") || n.includes("tender")) return d.includes("strip") || d.includes("tender");
  if (n.includes("shawarma")) return d.includes("shawarma");
  if (n.includes("marinated")) return d.includes("marinat");
  return false;
}

/** Auto-maps a row to a DemandProduct using the template column values. Returns undefined if no confident match. */
export function autoMapProduct(row: SalesPlanRow, products: DemandProduct[]): DemandProduct | undefined {
  const cat = deriveCategoryFromRow(row);
  if (!cat) return undefined;

  if (cat === "wholeChicken") {
    const ff = parseFreshFrozen(row.division);
    const grade = parseGrade(row.grading, row.whGrading);
    const weight = parseWeightG(row.size);
    if (!ff || !grade || !weight) return undefined;
    return products.find(
      (p) => p.category === "wholeChicken" && p.freshFrozen === ff && p.grade === grade && p.weightBucketG === weight
    );
  }

  if (cat === "eggs") {
    const d = (row.materialDescription || row.materialCategory).toLowerCase();
    return (
      products.find(
        (p) =>
          p.category === "eggs" &&
          ((d.includes("large") && p.name.toLowerCase().includes("large")) ||
            (d.includes("medium") && p.name.toLowerCase().includes("medium")) ||
            (d.includes("small") && p.name.toLowerCase().includes("small")))
      ) ?? products.find((p) => p.category === "eggs")
    );
  }

  const desc = row.materialDescription || "";
  if (cat === "cuts") {
    return products.filter((p) => p.category === "cuts").find((p) => descMatchesCut(desc, p.name));
  }
  if (cat === "fpp") {
    return products.filter((p) => p.category === "fpp").find((p) => descMatchesFpp(desc, p.name));
  }

  return undefined;
}

// ─── Row signatures ────────────────────────────────────────────────────────────

export interface RowSignatureGroup {
  signature: string;
  division: string;
  materialCategory: string;
  materialDescription: string;
  size: string;
  grading: string;
  rowCount: number;
}

export function rowSignature(row: SalesPlanRow): string {
  const catLower = (row.materialCategory || "").toLowerCase();
  if (catLower.includes("whole chicken") || catLower.includes("whole bird")) {
    // WC is uniquely identified by Division + Category + Size + Grading
    return [row.division, row.materialCategory, row.size, row.grading].join(" | ");
  }
  // Cuts / FPP / Eggs: use Material Description for granular per-product matching
  return [row.division, row.materialCategory, row.materialDescription].join(" | ");
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
        materialDescription: r.materialDescription,
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

/**
 * Creates a new DemandProduct from a representative SalesPlanRow.
 * idSuffix should be unique (e.g. Date.now().toString(36)) to avoid collisions.
 */
export function createProductFromRow(row: SalesPlanRow, idSuffix: string): DemandProduct {
  const cat = deriveCategoryFromRow(row) ?? "cuts";
  const name = (row.materialDescription || row.materialCategory || "Unknown").trim();
  const id = `import-${cat}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${idSuffix}`;

  if (cat === "wholeChicken") {
    return {
      id,
      category: "wholeChicken",
      name,
      grade: parseGrade(row.grading, row.whGrading) ?? "A",
      weightBucketG: parseWeightG(row.size) ?? 900,
      freshFrozen: parseFreshFrozen(row.division) ?? "fresh",
      unit: "ton",
    };
  }
  if (cat === "fpp") {
    return { id, category: "fpp", name, yieldPct: 0.15, unit: "ton" };
  }
  if (cat === "eggs") {
    return { id, category: "eggs", name, unit: "tray" };
  }
  return { id, category: "cuts", name, unit: "ton" };
}

export function isSalesPlanFile(file: File): boolean {
  return /\.(xlsx|xls|csv)$/i.test(file.name);
}

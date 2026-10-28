import * as XLSX from "xlsx";
import { format } from "date-fns";
import { isoWeekLabel, isoWeekToMonday, mondayOf } from "./calc";
import type { LayerBreed, LayerBreedStandardRow, LayerFarm, LayerPlacement, LayerPlacementInput } from "./types";

const PLACEMENT_HEADERS = [
  "ID",
  "Placement Week",
  "Week Start (Mon)",
  "Chicks",
  "Breed",
  "Farm Code",
  "End of Lay Week",
  "Notes",
] as const;

const STANDARD_HEADERS = ["Age Week", "Mortality %", "Hen-Day %", "Egg Weight (g)"] as const;

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9%]/g, "");

function writeBook(sheetName: string, rows: (string | number | null)[][], widths: number[], fileName: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

/** Current placements (or an empty template). Keep the ID column to update rows; clear it to add new ones. */
export function exportPlacements(placements: LayerPlacement[], breeds: LayerBreed[], farms: LayerFarm[]) {
  const breedName = new Map(breeds.map((b) => [b.id, b.name]));
  const farmCode = new Map(farms.map((f) => [f.id, f.code]));
  const rows = placements.map((p) => [
    p.id,
    isoWeekLabel(p.placementWeekStart),
    p.placementWeekStart,
    p.chicks,
    breedName.get(p.breedId) ?? "",
    farmCode.get(p.farmId) ?? "",
    p.endOfLayWeek ?? "",
    p.notes,
  ]);
  writeBook("Placements", [[...PLACEMENT_HEADERS], ...rows], [38, 15, 17, 10, 22, 12, 16, 30], "awp-c-layer-placements.xlsx");
}

export interface PlacementImportRow extends LayerPlacementInput {
  id?: string;
}

function cellDate(v: unknown): string {
  if (v instanceof Date) return format(v, "yyyy-MM-dd");
  return String(v ?? "").trim();
}

/**
 * Reads a placements workbook. The week comes from "Week Start (Mon)" (any day of the week is
 * accepted and moved to its Monday) or, when that is blank, from "Placement Week" (e.g. 2026-W45).
 */
export function parsePlacementsFile(
  buffer: ArrayBuffer,
  breeds: LayerBreed[],
  farms: LayerFarm[],
): { rows: PlacementImportRow[]; errors: string[]; notes: string[] } {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], errors: ["The workbook has no sheets."], notes: [] };
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const breedByName = new Map(breeds.map((b) => [norm(b.name), b]));
  const farmByCode = new Map(farms.map((f) => [norm(f.code), f]));
  const rows: PlacementImportRow[] = [];
  const errors: string[] = [];
  const notes: string[] = [];

  raw.forEach((record, i) => {
    const get = (header: string) => {
      const key = Object.keys(record).find((k) => norm(k) === norm(header));
      return key === undefined ? "" : record[key];
    };
    const label = `Row ${i + 2}`;
    const values = PLACEMENT_HEADERS.map((h) => String(get(h)).trim());
    if (values.every((v) => v === "")) return;

    let weekStart = cellDate(get("Week Start (Mon)"));
    if (!weekStart) weekStart = isoWeekToMonday(String(get("Placement Week"))) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      errors.push(`${label}: give a week start date or a placement week like 2026-W45.`);
      return;
    }
    const monday = mondayOf(weekStart);
    if (monday !== weekStart) notes.push(`${label}: ${weekStart} moved to the Monday of its week, ${monday}.`);

    const breed = breedByName.get(norm(get("Breed")));
    const farm = farmByCode.get(norm(get("Farm Code")));
    if (!breed) errors.push(`${label}: breed "${get("Breed")}" is not in the breed list.`);
    if (!farm) errors.push(`${label}: farm code "${get("Farm Code")}" is not in the farm list.`);

    const chicks = Number(get("Chicks"));
    if (!Number.isInteger(chicks) || chicks <= 0) errors.push(`${label}: chicks must be a whole number greater than 0.`);
    const eolRaw = String(get("End of Lay Week")).trim();
    if (eolRaw !== "" && !(Number.isInteger(Number(eolRaw)) && Number(eolRaw) >= 1)) {
      errors.push(`${label}: end of lay week must be blank (breed default) or a whole number.`);
    }
    if (!breed || !farm || errors.some((e) => e.startsWith(`${label}:`))) return;
    rows.push({
      id: String(get("ID")).trim() || undefined,
      placementWeekStart: monday,
      chicks,
      breedId: breed.id,
      farmId: farm.id,
      endOfLayWeek: eolRaw === "" ? null : Number(eolRaw),
      notes: String(get("Notes")).trim(),
    });
  });

  if (!errors.length && rows.length === 0) errors.push("The file contains no placement rows.");
  return { rows, errors, notes };
}

/** A breed's standard table; with no rows yet it is a blank template with age weeks 1–100. */
export function exportStandards(breedName: string, rows: LayerBreedStandardRow[]) {
  const body = rows.length
    ? rows.map((r) => [r.ageWeek, r.mortalityPct, r.henDayPct, r.eggWeightG])
    : Array.from({ length: 100 }, (_, i) => [i + 1, null, null, null]);
  const safe = breedName.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  writeBook("Weekly Standard", [[...STANDARD_HEADERS], ...body], [10, 13, 12, 15], `awp-c-layer-standard-${safe}.xlsx`);
}

/**
 * Reads a standard table. Percent-formatted cells (Excel shows 0.5%, stores 0.005) are converted
 * to percentage points. Rows with both percentages blank are skipped, so the 100-row template
 * can be filled only as far as the standard goes.
 */
export function parseStandardsFile(buffer: ArrayBuffer): { rows: unknown[]; errors: string[] } {
  const wb = XLSX.read(buffer, { type: "array", cellNF: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet?.["!ref"]) return { rows: [], errors: ["The workbook has no data."] };
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  const col: Record<string, number> = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const h = norm(sheet[XLSX.utils.encode_cell({ r: range.s.r, c })]?.v);
    STANDARD_HEADERS.forEach((name) => {
      if (h === norm(name)) col[name] = c;
    });
  }
  const missing = STANDARD_HEADERS.slice(0, 3).filter((h) => col[h] === undefined);
  if (missing.length) return { rows: [], errors: [`Missing column(s): ${missing.join(", ")}.`] };

  const read = (r: number, name: string, percent: boolean): number | null | string => {
    if (col[name] === undefined) return null;
    const cell = sheet[XLSX.utils.encode_cell({ r, c: col[name] })];
    if (!cell || cell.v === "" || cell.v === undefined || cell.v === null) return null;
    if (typeof cell.v !== "number") {
      const n = Number(String(cell.v).replace("%", "").trim());
      return Number.isFinite(n) ? n : String(cell.v);
    }
    const isPercentFormat = typeof cell.z === "string" && cell.z.includes("%");
    return percent && isPercentFormat ? Math.round(cell.v * 100 * 1e9) / 1e9 : cell.v;
  };

  const rows: unknown[] = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const mortalityPct = read(r, "Mortality %", true);
    const henDayPct = read(r, "Hen-Day %", true);
    if (mortalityPct === null && henDayPct === null) continue;
    rows.push({
      ageWeek: read(r, "Age Week", false),
      mortalityPct,
      henDayPct,
      eggWeightG: read(r, "Egg Weight (g)", false),
    });
  }
  return { rows, errors: rows.length ? [] : ["No filled rows found under the headers."] };
}

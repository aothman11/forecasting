import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ageWeekToCalendarWeek, isoWeekLabel, isoWeekToMonday, mondayOf, type FlockProjection } from "./calc";
import { PREP_MATERIAL, type LayerBreed, type LayerBreedStandardRow, type LayerFarm, type LayerPlacement, type LayerPlacementInput, type LayerPrepOperation } from "./types";

const PLACEMENT_HEADERS = [
  "Flock No",
  "Placement Week",
  "Week Start (Mon)",
  "DOC Chicks",
  "Breed",
  "Rearing Farm (1260)",
  "Rearing Houses",
  "Laying Farm (1250)",
  "Laying Houses",
  "Transfer Age Week",
  "Depletion Age Week",
  "Notes",
] as const;

const STANDARD_HEADERS = ["Age Week", "Mortality %", "Hen-Day %", "Egg Weight (g)", "Feed (g/bird/day)"] as const;

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9%]/g, "");

function writeBook(sheetName: string, rows: (string | number | null)[][], widths: number[], fileName: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

/** Projected weeks written for reference only; the upload ignores these columns. */
const READ_ONLY_HEADERS = ["Transfer Week (projected)", "Depletion Week (projected)"] as const;

/**
 * Current flock plan (or an empty template). On upload, a known Flock No updates that flock, a new
 * number adds it, and a blank number adds a flock with the next running number. The projected
 * transfer / depletion weeks are appended for reference and ignored on upload.
 */
export function exportPlacements(
  placements: LayerPlacement[],
  breeds: LayerBreed[],
  farms: LayerFarm[],
  projections: Map<string, Pick<FlockProjection, "transferWeekStart" | "depletionAge">> = new Map(),
) {
  const breedName = new Map(breeds.map((b) => [b.id, b.name]));
  const farmCode = new Map(farms.map((f) => [f.id, f.code]));
  const rows = placements.map((p) => {
    const proj = projections.get(p.id);
    const depletionWeek = proj?.depletionAge ? isoWeekLabel(ageWeekToCalendarWeek(p.placementWeekStart, proj.depletionAge)) : "";
    return [
    p.flockNo ?? "",
    isoWeekLabel(p.placementWeekStart),
    p.placementWeekStart,
    p.chicks,
    breedName.get(p.breedId) ?? "",
    farmCode.get(p.rearingFarmId) ?? "",
    p.rearingHouses ?? "",
    farmCode.get(p.layingFarmId) ?? "",
    p.layingHouses ?? "",
    p.transferAgeWeek ?? "",
    p.depletionAgeWeek ?? "",
    p.notes,
    proj?.transferWeekStart ? isoWeekLabel(proj.transferWeekStart) : "",
    depletionWeek,
    ];
  });
  writeBook(
    "Flock Plan",
    [[...PLACEMENT_HEADERS, ...READ_ONLY_HEADERS], ...rows],
    [10, 15, 17, 11, 16, 18, 14, 18, 14, 17, 18, 30, 24, 25],
    "awp-c-layer-flock-plan.xlsx",
  );
}

/** Blank → null; otherwise must be a whole number ≥ 1 (range checks happen on the server). */
function optionalWhole(raw: unknown, field: string, label: string, errors: string[]): number | null {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) errors.push(`${label}: ${field} must be blank or a whole number.`);
  return n;
}

export type PlacementImportRow = LayerPlacementInput;

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

    const errorsBefore = errors.length;
    const flockNo = optionalWhole(get("Flock No"), "flock no. (blank = next number)", label, errors);
    const breed = breedByName.get(norm(get("Breed")));
    const rearing = farmByCode.get(norm(get("Rearing Farm (1260)")));
    const laying = farmByCode.get(norm(get("Laying Farm (1250)")));
    if (!breed) errors.push(`${label}: breed "${get("Breed")}" is not in the breed list.`);
    if (!rearing) errors.push(`${label}: rearing farm "${get("Rearing Farm (1260)")}" is not in the farm list.`);
    if (!laying) errors.push(`${label}: laying farm "${get("Laying Farm (1250)")}" is not in the farm list.`);

    const chicks = Number(get("DOC Chicks"));
    if (!Number.isInteger(chicks) || chicks <= 0) errors.push(`${label}: DOC chicks must be a whole number greater than 0.`);
    const rearingHouses = optionalWhole(get("Rearing Houses"), "rearing houses", label, errors);
    const layingHouses = optionalWhole(get("Laying Houses"), "laying houses", label, errors);
    const transferAgeWeek = optionalWhole(get("Transfer Age Week"), "transfer age (blank = default)", label, errors);
    const depletionAgeWeek = optionalWhole(get("Depletion Age Week"), "depletion age (blank = default)", label, errors);
    if (errors.length > errorsBefore || !breed || !rearing || !laying) return;

    rows.push({
      flockNo,
      placementWeekStart: monday,
      chicks,
      breedId: breed.id,
      rearingFarmId: rearing.id,
      rearingHouses,
      layingFarmId: laying.id,
      layingHouses,
      transferAgeWeek,
      depletionAgeWeek,
      notes: String(get("Notes")).trim(),
    });
  });

  if (!errors.length && rows.length === 0) errors.push("The file contains no flock rows.");
  return { rows, errors, notes };
}

/** A breed's standard table; with no rows yet it is a blank template with age weeks 1–100. */
export function exportStandards(breedName: string, rows: LayerBreedStandardRow[]) {
  const body = rows.length
    ? rows.map((r) => [r.ageWeek, r.mortalityPct, r.henDayPct, r.eggWeightG, r.feedGPerDay])
    : Array.from({ length: 100 }, (_, i) => [i + 1, null, null, null, null]);
  const safe = breedName.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  writeBook("Weekly Standard", [[...STANDARD_HEADERS], ...body], [10, 13, 12, 15, 17], `awp-c-layer-standard-${safe}.xlsx`);
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
      feedGPerDay: read(r, "Feed (g/bird/day)", false),
    });
  }
  return { rows, errors: rows.length ? [] : ["No filled rows found under the headers."] };
}

// ── House preparation routing (SAP task-list export layout) ───────────────────

const PREP_HEADERS = ["Material Number", "Group", "Operation short text"] as const;

/** The routing in the SAP export layout: "PRE001-Rodent control" = operation code, then text. */
export function exportPrepRouting(ops: LayerPrepOperation[]) {
  const body = ops.map((o) => [PREP_MATERIAL, o.group, `${o.opCode}-${o.text}`]);
  writeBook("Data", [[...PREP_HEADERS], ...body], [22, 8, 48], "awp-c-layer-cage-house-prepared.xlsx");
}

/**
 * Reads a "Cage House Prepared" routing export. Each operation is one day; the day is the number in
 * the operation code (PRE012 → day 12), so two lines with the same number share a day.
 */
export function parsePrepRoutingFile(buffer: ArrayBuffer): { routing: Record<string, unknown[]>; errors: string[] } {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { routing: {}, errors: ["The workbook has no data."] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const head = (rows[0] ?? []).map(norm);
  const col = PREP_HEADERS.map((h) => head.indexOf(norm(h)));
  const missing = PREP_HEADERS.filter((_, i) => col[i] < 0 && i > 0);
  if (missing.length) return { routing: {}, errors: [`Missing column(s): ${missing.join(", ")}.`] };

  const routing: Record<string, unknown[]> = {};
  const errors: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const material = col[0] >= 0 ? String(r[col[0]] ?? "").trim() : PREP_MATERIAL;
    if (material && material.toLowerCase() !== PREP_MATERIAL.toLowerCase()) return;
    const group = String(r[col[1]] ?? "").trim().toUpperCase();
    const full = String(r[col[2]] ?? "").trim();
    if (!group && !full) return;
    const m = /^([A-Za-z]*0*(\d+)[A-Za-z]*)\s*-\s*(.+)$/.exec(full);
    if (!m) {
      errors.push(`Row ${i + 2}: "${full}" is not "CODE-Text" with a day number in the code (e.g. PRE001-Rodent control).`);
      return;
    }
    (routing[group] ??= []).push({ opCode: m[1], text: m[3].trim(), day: Number(m[2]) });
  });
  if (!errors.length && Object.keys(routing).length === 0) errors.push(`No "${PREP_MATERIAL}" rows found.`);
  return { routing, errors };
}

// ── Feed STOs ─────────────────────────────────────────────────────────────────

export interface FeedStoExportRow {
  supplyPlant: string;
  receivingPlant: string;
  farmCode: string;
  materialNo: string;
  feedStage: string;
  tons: number;
  deliveryWeek: string;
  deliveryDate: string;
  stoDate: string;
  trucks: number | null;
  flocks: string;
}

/** Planned feed STOs, one row per delivery week × farm × feed material (quantity in TO). */
export function exportFeedSto(rows: FeedStoExportRow[]) {
  const head = ["Supplying Plant", "Receiving Plant", "Farm", "Material", "Feed Stage", "Quantity", "Unit", "Delivery Week", "Delivery Date", "STO Create Date", "Trucks", "Flocks"];
  const body = rows.map((r) => [r.supplyPlant, r.receivingPlant, r.farmCode, r.materialNo, r.feedStage, r.tons, "TO", r.deliveryWeek, r.deliveryDate, r.stoDate, r.trucks, r.flocks]);
  writeBook("Feed STO", [head, ...body], [15, 15, 10, 14, 16, 10, 6, 13, 13, 15, 8, 16], "awp-c-layer-feed-sto.xlsx");
}

// ── Packaging ─────────────────────────────────────────────────────────────────

export interface PackagingExportRow {
  supplySource: string;
  materialNo: string;
  component: string;
  qty: number;
  unit: string;
  orderQty: number | null;
  orderUnit: string;
  packingWeek: string;
  packingDate: string;
  orderDate: string;
  skus: string;
}

/** Packaging needed per packing week and material, with the order date from the lead time. */
export function exportPackaging(rows: PackagingExportRow[]) {
  const head = ["Supplied By", "Material", "Component", "BOM Quantity", "BOM Unit", "Order Quantity", "Order Unit", "Packing Week", "Packing Week Start", "Order By", "Used In SKUs"];
  const body = rows.map((r) => [r.supplySource, r.materialNo, r.component, r.qty, r.unit, r.orderQty ?? r.qty, r.orderUnit || r.unit, r.packingWeek, r.packingDate, r.orderDate, r.skus]);
  writeBook("Packaging", [head, ...body], [14, 14, 30, 12, 9, 13, 10, 13, 17, 12, 22], "awp-c-layer-packaging.xlsx");
}

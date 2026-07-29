import * as XLSX from "xlsx";
import { format } from "date-fns";

export interface ParsedPlacementRow {
  date: string;
  farmsPlacing?: number;
  chicksPerHouse?: number;
}

// Matches "House Placing" (current label) and "Farms Placing" (older templates), but never the
// "Chicks per House" column, which also contains the substring "farm".
function isHouseColumnHeader(h: string): boolean {
  return h.includes("house") || (h.includes("farm") && !h.includes("chick"));
}

/** Parses a CSV with headers Placement Date, House Placing, Chicks per House (order-insensitive). */
export function parsePlacementCSV(text: string): ParsedPlacementRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    date: headers.findIndex((h) => h.includes("date")),
    farmsPlacing: headers.findIndex(isHouseColumnHeader),
    chicksPerHouse: headers.findIndex((h) => h.includes("chick")),
  };
  if (idx.date < 0) return [];

  return lines
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const row: ParsedPlacementRow = { date: cells[idx.date] };
      if (idx.farmsPlacing >= 0) row.farmsPlacing = Number(cells[idx.farmsPlacing]);
      if (idx.chicksPerHouse >= 0) row.chicksPerHouse = Number(cells[idx.chicksPerHouse]);
      return row;
    });
}

function normalizeDateCell(value: unknown): string {
  if (value instanceof Date) return format(value, "yyyy-MM-dd");
  return String(value ?? "").trim();
}

/** Parses the first sheet of an .xlsx/.xls workbook with headers Placement Date, House Placing, Chicks per House. */
export function parsePlacementExcel(buffer: ArrayBuffer): ParsedPlacementRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows
    .map((row): ParsedPlacementRow => {
      const keys = Object.keys(row);
      const dateKey = keys.find((k) => k.toLowerCase().includes("date"));
      const farmsKey = keys.find((k) => isHouseColumnHeader(k.toLowerCase()));
      const chicksKey = keys.find((k) => k.toLowerCase().includes("chick"));

      const parsed: ParsedPlacementRow = { date: dateKey ? normalizeDateCell(row[dateKey]) : "" };
      if (farmsKey) parsed.farmsPlacing = Number(row[farmsKey]);
      if (chicksKey) parsed.chicksPerHouse = Number(row[chicksKey]);
      return parsed;
    })
    .filter((r) => r.date);
}

export function isExcelFile(file: File): boolean {
  return /\.(xlsx|xls)$/i.test(file.name);
}

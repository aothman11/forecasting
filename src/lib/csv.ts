import type { PlacementRow } from "./types";

/** Parses a CSV with headers Week,Week Starting,Farms Placing,Chicks per Farm (order-insensitive). */
export function parsePlacementCSV(text: string): Partial<PlacementRow>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    week: headers.findIndex((h) => h.includes("week") && !h.includes("start")),
    weekStarting: headers.findIndex((h) => h.includes("start")),
    farmsPlacing: headers.findIndex((h) => h.includes("farm")),
    chicksPerFarm: headers.findIndex((h) => h.includes("chick")),
  };

  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: Partial<PlacementRow> = {};
    if (idx.week >= 0) row.week = Number(cells[idx.week]);
    if (idx.weekStarting >= 0) row.weekStarting = cells[idx.weekStarting];
    if (idx.farmsPlacing >= 0) row.farmsPlacing = Number(cells[idx.farmsPlacing]);
    if (idx.chicksPerFarm >= 0) row.chicksPerFarm = Number(cells[idx.chicksPerFarm]);
    return row;
  });
}

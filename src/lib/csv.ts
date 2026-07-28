/** Parses a CSV with headers Date,Farms Placing,Chicks per Farm (order-insensitive). */
export function parsePlacementCSV(text: string): { date: string; farmsPlacing?: number; chicksPerFarm?: number }[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    date: headers.findIndex((h) => h.includes("date")),
    farmsPlacing: headers.findIndex((h) => h.includes("farm")),
    chicksPerFarm: headers.findIndex((h) => h.includes("chick")),
  };
  if (idx.date < 0) return [];

  return lines
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const row: { date: string; farmsPlacing?: number; chicksPerFarm?: number } = {
        date: cells[idx.date],
      };
      if (idx.farmsPlacing >= 0) row.farmsPlacing = Number(cells[idx.farmsPlacing]);
      if (idx.chicksPerFarm >= 0) row.chicksPerFarm = Number(cells[idx.chicksPerFarm]);
      return row;
    });
}

export type ParsedPlacementCSVRow = ReturnType<typeof parsePlacementCSV>[number];

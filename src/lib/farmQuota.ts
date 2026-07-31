import type { BirdType, Farm, MonthlyPlanConfig, PlacementEntry } from "./types";

// ─── Derived types ────────────────────────────────────────────────────────────

export interface EntryCheck {
  status: "OK" | "INACTIVE" | "SKIPPED" | "QTY_MISSING" | "OVER_CEILING";
  label: string;
}

export interface MEQ1Row {
  matnr: string;   // SAP material number
  werks: string;   // plant
  datab: string;   // valid from (ISO)
  datbi: string;   // valid to (ISO)
  qupos: string;   // "0010", "0020", … (sequential per bird-type × 10)
  verid: string;   // farm code (SAP vendor ID)
  qumax: number;   // qty to place
  qupri: number;   // priority (same counter, not multiplied)
  quazt: number;   // always 0
  qumin: number;   // always 0
}

export interface SequenceQueueRow {
  farm: Farm;
  lastPlacementDate: string | null;
  dayOfCycle: number | null;       // days elapsed since last placement (null if never placed)
  nextAvailableDate: string | null;
  daysUntilAvailable: number;      // ≤ 0 means already available
  isAvailableNow: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Sum of qtyPlaced for a given farm within the current planning month. */
export function farmMonthlyTotal(
  farmCode: string,
  planningMonth: string,
  entries: PlacementEntry[]
): number {
  const prefix = planningMonth.slice(0, 7); // "YYYY-MM"
  return entries
    .filter((e) => e.farmCode === farmCode && e.date.startsWith(prefix))
    .reduce((sum, e) => sum + (e.qtyPlaced ?? 0), 0);
}

/** Mirrors the Excel Check column formula. */
export function checkEntry(
  entry: PlacementEntry,
  farm: Farm,
  monthlyTotal: number
): EntryCheck {
  if (farm.status !== "Active") {
    return { status: "INACTIVE", label: "INACTIVE – do not place" };
  }
  if (farm.skipThisCycle) {
    return { status: "SKIPPED", label: "SKIPPED – do not place this cycle" };
  }
  if (!entry.qtyPlaced || entry.qtyPlaced <= 0) {
    return { status: "QTY_MISSING", label: "Qty missing" };
  }
  if (monthlyTotal > farm.placementPlanCapacity) {
    return { status: "OVER_CEILING", label: "OVER CEILING – correct before upload" };
  }
  return { status: "OK", label: "OK" };
}

/** True when another entry for the same farm+date+birdType already exists. */
export function isDuplicate(entry: PlacementEntry, allEntries: PlacementEntry[]): boolean {
  return allEntries.some(
    (e) =>
      e.id !== entry.id &&
      e.farmCode === entry.farmCode &&
      e.date === entry.date &&
      e.birdType === entry.birdType
  );
}

// ─── MEQ1 generation ─────────────────────────────────────────────────────────

function matNoForBirdType(birdType: BirdType, config: MonthlyPlanConfig): string {
  if (birdType === "Cobb") return config.cobbMatNo;
  if (birdType === "Ross") return config.rossMatNo;
  return config.gpMatNo;
}

/**
 * Build MEQ1 upload rows from the current planning month's valid entries.
 * QUPOS = sequential counter per bird-type × 10 (0010, 0020, …)
 * QUMAX = qtyPlaced × (1 - mortalityRate) — output birds after grow-out mortality.
 * DATAB = DATBI = the actual placement date of each entry.
 * Only entries that pass the check (Active farm, qty > 0, not over ceiling) are included.
 */
export function computeMEQ1Rows(
  entries: PlacementEntry[],
  farms: Farm[],
  config: MonthlyPlanConfig,
  mortalityRate = 0.05
): MEQ1Row[] {
  const farmMap = new Map(farms.map((f) => [f.code, f]));
  const prefix = config.planningMonth.slice(0, 7);

  const monthEntries = entries.filter((e) => e.date.startsWith(prefix));

  const birdTypes: BirdType[] = ["Cobb", "Ross", "GP"];
  const rows: MEQ1Row[] = [];

  for (const birdType of birdTypes) {
    const matnr = matNoForBirdType(birdType, config);
    const typeEntries = monthEntries.filter((e) => e.birdType === birdType);

    const validEntries = typeEntries.filter((e) => {
      const farm = farmMap.get(e.farmCode);
      if (!farm) return false;
      const total = farmMonthlyTotal(e.farmCode, config.planningMonth, entries);
      const check = checkEntry(e, farm, total);
      return check.status === "OK";
    });

    validEntries.forEach((e, i) => {
      const qupri = i + 1;
      rows.push({
        matnr,
        werks: config.plant,
        datab: e.date,
        datbi: e.date,
        qupos: String(qupri * 10).padStart(4, "0"),
        verid: e.farmCode,
        qumax: Math.round(e.qtyPlaced * (1 - mortalityRate)),
        qupri,
        quazt: 0,
        qumin: 0,
      });
    });
  }

  return rows;
}

// ─── Sequence queue ───────────────────────────────────────────────────────────

/**
 * Returns all farms in sequence order with their next-available-date calculation.
 * Uses the latest PlacementEntry across all months as "last placed".
 */
export function computeSequenceQueue(
  farms: Farm[],
  entries: PlacementEntry[],
  today: string
): SequenceQueueRow[] {
  const lastPlacementMap = new Map<string, string>();
  for (const e of entries) {
    const current = lastPlacementMap.get(e.farmCode);
    if (!current || e.date > current) {
      lastPlacementMap.set(e.farmCode, e.date);
    }
  }

  const todayMs = new Date(today).getTime();

  return farms
    .slice()
    .sort((a, b) => a.sequencePosition - b.sequencePosition)
    .map((farm) => {
      const lastDate = lastPlacementMap.get(farm.code) ?? null;
      let dayOfCycle: number | null = null;
      let nextAvailableDate: string | null = null;
      let daysUntilAvailable = 0;

      if (lastDate) {
        const lastMs = new Date(lastDate).getTime();
        const totalCycleDays = farm.cycleLengthDays + farm.cleaningDays;
        dayOfCycle = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24));
        const nextMs = lastMs + totalCycleDays * 24 * 60 * 60 * 1000;
        nextAvailableDate = new Date(nextMs).toISOString().slice(0, 10);
        daysUntilAvailable = Math.ceil((nextMs - todayMs) / (1000 * 60 * 60 * 24));
      }
      // Never placed → daysUntilAvailable stays 0 → isAvailableNow = true (if active)

      const isAvailableNow =
        farm.status === "Active" &&
        !farm.skipThisCycle &&
        daysUntilAvailable <= 0;

      return {
        farm,
        lastPlacementDate: lastDate,
        dayOfCycle,
        nextAvailableDate,
        daysUntilAvailable,
        isAvailableNow,
      };
    });
}

import type { Farm, FarmDayAllocation, PlacementDayRow } from "./types";

/** Active farms sorted by quota share descending (largest first, for remainder distribution). */
function activeFarms(farms: Farm[]): Farm[] {
  return farms.filter((f) => f.active).sort((a, b) => b.quotaSharePct - a.quotaSharePct);
}

/**
 * Distribute houses across farms for a single day.
 * Uses proportional quota shares, respects per-farm maxHousesPerDay caps,
 * and distributes any integer remainder to farms that still have headroom
 * (largest-share first).
 */
function distributeDay(totalHouses: number, farms: Farm[]): Map<string, number> {
  const result = new Map<string, number>();
  if (totalHouses === 0 || farms.length === 0) {
    farms.forEach((f) => result.set(f.id, 0));
    return result;
  }

  const totalShare = farms.reduce((s, f) => s + f.quotaSharePct, 0);
  if (totalShare === 0) {
    farms.forEach((f) => result.set(f.id, 0));
    return result;
  }

  // Initial floor allocation
  let allocated = 0;
  farms.forEach((f) => {
    const raw = (f.quotaSharePct / totalShare) * totalHouses;
    const floored = Math.floor(raw);
    const capped = f.maxHousesPerDay > 0 ? Math.min(floored, f.maxHousesPerDay) : floored;
    result.set(f.id, capped);
    allocated += capped;
  });

  // Distribute remainder one house at a time to farms that have headroom
  let remainder = totalHouses - allocated;
  for (const f of farms) {
    if (remainder <= 0) break;
    const current = result.get(f.id)!;
    const cap = f.maxHousesPerDay > 0 ? f.maxHousesPerDay : Infinity;
    if (current < cap) {
      result.set(f.id, current + 1);
      remainder--;
    }
  }

  return result;
}

/**
 * Compute the full day × farm allocation grid from the placement calendar.
 * Returns one FarmDayAllocation per active farm per placement day.
 */
export function computeFarmQuota(
  placementDays: PlacementDayRow[],
  farms: Farm[],
  chicksPerHouse: number
): FarmDayAllocation[] {
  const active = activeFarms(farms);
  const allocs: FarmDayAllocation[] = [];

  for (const day of placementDays) {
    const distribution = distributeDay(day.farmsPlacing, active);
    for (const f of active) {
      const houses = distribution.get(f.id) ?? 0;
      allocs.push({
        date: day.date,
        dayIndex: day.dayIndex,
        farmId: f.id,
        housesAllocated: houses,
        chicksAllocated: houses * chicksPerHouse,
      });
    }
  }

  return allocs;
}

/** Weekly rollup per farm: total houses and chicks placed in that week. */
export interface FarmWeekRollup {
  week: number;        // 1-based week number
  weekStart: string;   // ISO date of first day of that week in the plan
  farmId: string;
  farmName: string;
  sapVendorCode: string;
  quotaSharePct: number;
  totalHouses: number;
  totalChicks: number;
}

export function computeFarmWeekRollups(
  allocs: FarmDayAllocation[],
  farms: Farm[],
  chicksPerHouse: number
): FarmWeekRollup[] {
  const farmMap = new Map(farms.map((f) => [f.id, f]));

  // Group by (week, farmId)
  const key = (dayIndex: number, farmId: string) => `${Math.floor(dayIndex / 7) + 1}::${farmId}`;
  const buckets = new Map<string, FarmWeekRollup>();

  for (const a of allocs) {
    const week = Math.floor(a.dayIndex / 7) + 1;
    const k = key(a.dayIndex, a.farmId);
    if (!buckets.has(k)) {
      const farm = farmMap.get(a.farmId);
      if (!farm) continue;
      // weekStart: earliest date in this week bucket
      buckets.set(k, {
        week,
        weekStart: a.date,
        farmId: a.farmId,
        farmName: farm.name,
        sapVendorCode: farm.sapVendorCode,
        quotaSharePct: farm.quotaSharePct,
        totalHouses: 0,
        totalChicks: 0,
      });
    }
    const b = buckets.get(k)!;
    b.totalHouses += a.housesAllocated;
    b.totalChicks += a.chicksAllocated;
    // keep weekStart as the earliest date (days come in order)
    if (a.date < b.weekStart) b.weekStart = a.date;
  }

  return Array.from(buckets.values()).sort((a, b) =>
    a.week !== b.week ? a.week - b.week : a.farmId.localeCompare(b.farmId)
  );
}

/** Validate that active farm quota shares sum to 100 (±0.5 tolerance). */
export function validateFarmQuotas(farms: Farm[]): string | null {
  const active = farms.filter((f) => f.active);
  if (active.length === 0) return "No active farms — add at least one farm.";
  const total = active.reduce((s, f) => s + f.quotaSharePct, 0);
  if (Math.abs(total - 100) > 0.5) {
    return `Active farm quotas sum to ${total.toFixed(1)}% — they must total 100%.`;
  }
  return null;
}

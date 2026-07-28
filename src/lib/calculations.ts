import { addDays, differenceInCalendarDays, format } from "date-fns";
import type {
  CarcassYieldWeek,
  CutKey,
  CutPlanWeek,
  LiveBirdWeek,
  Parameters,
  PipelineResult,
  PlacementDayRow,
  PlacementRow,
  PlantKey,
  PlantWeek,
  ProductFamilyWeek,
} from "./types";
import { DEFAULT_CHICKS_PER_FARM } from "./defaults";

// ---------- shared helpers ----------

export function weekStartDate(planStartDate: string, week: number): string {
  return format(addDays(new Date(planStartDate), (week - 1) * 7), "yyyy-MM-dd");
}

export function dayIndexDate(planStartDate: string, dayIndex: number): string {
  return format(addDays(new Date(planStartDate), dayIndex), "yyyy-MM-dd");
}

export function harvestOffsetWeeks(cycleLengthDays: number): number {
  return Math.ceil(cycleLengthDays / 7);
}

export function fullCycleDays(params: Pick<Parameters, "cycleLengthDays" | "downtimeDays">): number {
  return params.cycleLengthDays + params.downtimeDays;
}

export function totalPlantCapacity(params: Parameters): number {
  return (
    params.plantCapacities.plant1 +
    params.plantCapacities.plant2 +
    params.plantCapacities.plant3
  );
}

/** Ensures a contiguous day-by-day placement array for the horizon, preserving existing edits by day offset. */
export function ensurePlacementDaysHorizon(
  existing: PlacementDayRow[],
  horizonDays: number,
  planStartDate: string,
  defaultChicksPerFarm: number = DEFAULT_CHICKS_PER_FARM
): PlacementDayRow[] {
  const byIndex = new Map(existing.map((r) => [r.dayIndex, r]));
  const rows: PlacementDayRow[] = [];
  for (let d = 0; d < horizonDays; d++) {
    const prior = byIndex.get(d);
    rows.push(
      prior
        ? { ...prior, date: dayIndexDate(planStartDate, d) }
        : {
            dayIndex: d,
            date: dayIndexDate(planStartDate, d),
            farmsPlacing: 0,
            chicksPerFarm: defaultChicksPerFarm,
          }
    );
  }
  return rows;
}

/** Distributes `totalFarms` evenly across a rotation of ~fullCycleDays days, then tiles it across the horizon. */
export function quickFillPlacementDays(
  horizonDays: number,
  totalFarms: number,
  planStartDate: string,
  fullCycleLenDays: number,
  chicksPerFarm: number = DEFAULT_CHICKS_PER_FARM
): PlacementDayRow[] {
  const rotationDays = Math.max(1, Math.round(fullCycleLenDays));
  const base = Math.floor(totalFarms / rotationDays);
  const remainder = totalFarms - base * rotationDays;
  // first `remainder` days of the rotation get one extra farm so the rotation sums to totalFarms exactly
  const pattern = Array.from({ length: rotationDays }, (_, i) => base + (i < remainder ? 1 : 0));

  const rows: PlacementDayRow[] = [];
  for (let d = 0; d < horizonDays; d++) {
    rows.push({
      dayIndex: d,
      date: dayIndexDate(planStartDate, d),
      farmsPlacing: pattern[d % rotationDays],
      chicksPerFarm,
    });
  }
  return rows;
}

/** Rolls the daily placement input up into weekly totals consumed by every downstream step. */
export function aggregateToWeeklyPlacement(
  days: PlacementDayRow[],
  params: Pick<Parameters, "planningHorizonWeeks" | "planStartDate">
): PlacementRow[] {
  const start = new Date(params.planStartDate);
  const weeks: PlacementRow[] = [];
  for (let w = 1; w <= params.planningHorizonWeeks; w++) {
    weeks.push({ week: w, weekStarting: weekStartDate(params.planStartDate, w), farmsPlacing: 0, totalChicksPlaced: 0 });
  }
  for (const day of days) {
    const week = Math.floor(differenceInCalendarDays(new Date(day.date), start) / 7) + 1;
    const target = weeks[week - 1];
    if (!target) continue;
    target.farmsPlacing += day.farmsPlacing;
    target.totalChicksPlaced += day.farmsPlacing * day.chicksPerFarm;
  }
  return weeks;
}

// ---------- Step 2: Live Bird Forecast ----------

export function computeLiveBirdForecast(
  placement: PlacementRow[],
  params: Parameters
): LiveBirdWeek[] {
  const offset = harvestOffsetWeeks(params.cycleLengthDays);
  const capacity = totalPlantCapacity(params);
  const placementByWeek = new Map(placement.map((r) => [r.week, r]));

  return placement.map((row): LiveBirdWeek => {
    const week = row.week;
    const refWeek = week - offset;
    const refRow = placementByWeek.get(refWeek);
    const chicksPlaced = refRow ? refRow.totalChicksPlaced : 0;
    const harvestableBirds = chicksPlaced * (1 - params.mortalityRate);
    const totalLiveWeightKg = harvestableBirds * params.avgLiveWeightKg;
    const totalLiveWeightTons = totalLiveWeightKg / 1000;
    const utilizationPct = capacity > 0 ? (harvestableBirds / capacity) * 100 : 0;

    return {
      week,
      harvestDateStart: weekStartDate(params.planStartDate, week),
      harvestDateEnd: format(
        addDays(new Date(weekStartDate(params.planStartDate, week)), 6),
        "yyyy-MM-dd"
      ),
      placementWeekRef: refRow ? refWeek : null,
      harvestableBirds,
      totalLiveWeightKg,
      totalLiveWeightTons,
      totalPlantCapacity: capacity,
      utilizationPct,
      exceedsCapacity: harvestableBirds > capacity,
    };
  });
}

// ---------- Step 3: Carcass Yield & Grade Split ----------

export function computeCarcassYield(
  liveBird: LiveBirdWeek[],
  params: Parameters
): CarcassYieldWeek[] {
  return liveBird.map((lb): CarcassYieldWeek => {
    const carcassWeightTons = lb.totalLiveWeightTons * params.dressingPct;
    return {
      week: lb.week,
      carcassWeightTons,
      gradeATons: carcassWeightTons * params.gradeSplit.A,
      gradeBTons: carcassWeightTons * params.gradeSplit.B,
      gradeCTons: carcassWeightTons * params.gradeSplit.C,
    };
  });
}

// ---------- Step 4: Product Family Allocation ----------

export function computeProductFamily(
  carcass: CarcassYieldWeek[],
  params: Parameters
): ProductFamilyWeek[] {
  return carcass.map((c): ProductFamilyWeek => {
    const { A, B, C } = params.familyAllocation;
    const wcFreshTons = c.gradeATons * A.wcFresh + c.gradeBTons * B.wcFresh + c.gradeCTons * C.wcFresh;
    const wcFrozenTons = c.gradeATons * A.wcFrozen + c.gradeBTons * B.wcFrozen + c.gradeCTons * C.wcFrozen;
    const fppTons = c.gradeATons * A.fpp + c.gradeBTons * B.fpp + c.gradeCTons * C.fpp;
    return {
      week: c.week,
      wcFreshTons,
      wcFrozenTons,
      fppTons,
      totalTons: wcFreshTons + wcFrozenTons + fppTons,
    };
  });
}

// ---------- Step 5: FPP Cut Plan ----------

export function activeCutKeys(legSplitMode: boolean): CutKey[] {
  const common: CutKey[] = [
    "breastBoneIn",
    "breastBoneless",
    "wings",
    "backNeck",
    "giblets",
    "trimMince",
  ];
  return legSplitMode
    ? [...common.slice(0, 2), "drumstick", "thighBoneIn", ...common.slice(2)]
    : [...common.slice(0, 2), "wholeLeg", ...common.slice(2)];
}

export function cutYieldSum(params: Parameters): number {
  return activeCutKeys(params.legSplitMode).reduce(
    (sum, key) => sum + params.cutYields[key],
    0
  );
}

export function computeCutPlan(
  family: ProductFamilyWeek[],
  params: Parameters
): CutPlanWeek[] {
  const keys = activeCutKeys(params.legSplitMode);
  return family.map((f): CutPlanWeek => {
    const cuts = {} as Record<CutKey, number>;
    for (const key of keys) {
      cuts[key] = f.fppTons * params.cutYields[key];
    }
    const totalTons = keys.reduce((sum, k) => sum + cuts[k], 0);
    return { week: f.week, cuts, totalTons };
  });
}

// ---------- Step 6: Processing Plan by Plant ----------

const PLANT_KEYS: PlantKey[] = ["plant1", "plant2", "plant3"];

export function computePlantDistribution(
  liveBird: LiveBirdWeek[],
  params: Parameters
): PlantWeek[] {
  const result: PlantWeek[] = [];
  for (const plant of PLANT_KEYS) {
    const share = params.plantShares[plant];
    const capacity = params.plantCapacities[plant];
    for (const lb of liveBird) {
      const birds = lb.harvestableBirds * share;
      const liveWeightTons = (birds * params.avgLiveWeightKg) / 1000;
      const carcassTons = liveWeightTons * params.dressingPct;
      const gradeATons = carcassTons * params.gradeSplit.A;
      const gradeBTons = carcassTons * params.gradeSplit.B;
      const gradeCTons = carcassTons * params.gradeSplit.C;
      const { A, B, C } = params.familyAllocation;
      const wcFreshTons = gradeATons * A.wcFresh + gradeBTons * B.wcFresh + gradeCTons * C.wcFresh;
      const wcFrozenTons = gradeATons * A.wcFrozen + gradeBTons * B.wcFrozen + gradeCTons * C.wcFrozen;
      const fppTons = gradeATons * A.fpp + gradeBTons * B.fpp + gradeCTons * C.fpp;
      const dailyBirds = birds / params.workingDaysPerWeek;

      result.push({
        week: lb.week,
        plant,
        birds,
        liveWeightTons,
        carcassTons,
        gradeATons,
        gradeBTons,
        gradeCTons,
        wcFreshTons,
        wcFrozenTons,
        fppTons,
        dailyBirds,
        plantCapacity: capacity,
        capacityBreach: dailyBirds > capacity,
      });
    }
  }
  return result;
}

// ---------- full pipeline ----------

export function runPipeline(placementDays: PlacementDayRow[], params: Parameters): PipelineResult {
  const placement = aggregateToWeeklyPlacement(placementDays, params);
  const liveBird = computeLiveBirdForecast(placement, params);
  const carcass = computeCarcassYield(liveBird, params);
  const family = computeProductFamily(carcass, params);
  const cuts = computeCutPlan(family, params);
  const plants = computePlantDistribution(liveBird, params);
  return { placementDays, placement, liveBird, carcass, family, cuts, plants };
}

// ---------- summary metrics (used by overview cards / PDF export / mobile view) ----------

export interface SummaryMetrics {
  totalChicksPlaced: number;
  totalHarvestableBirds: number;
  totalCarcassTons: number;
  totalWcFreshTons: number;
  totalWcFrozenTons: number;
  totalFppTons: number;
  avgUtilizationPct: number;
  weeksWithCapacityBreach: number;
}

export function computeSummaryMetrics(result: PipelineResult): SummaryMetrics {
  const totalPlacedChicks = result.placement.reduce((s, r) => s + r.totalChicksPlaced, 0);
  const totalHarvestableBirds = result.liveBird.reduce((s, r) => s + r.harvestableBirds, 0);
  const totalCarcassTons = result.carcass.reduce((s, r) => s + r.carcassWeightTons, 0);
  const totalWcFreshTons = result.family.reduce((s, r) => s + r.wcFreshTons, 0);
  const totalWcFrozenTons = result.family.reduce((s, r) => s + r.wcFrozenTons, 0);
  const totalFppTons = result.family.reduce((s, r) => s + r.fppTons, 0);
  const avgUtilizationPct =
    result.liveBird.length > 0
      ? result.liveBird.reduce((s, r) => s + r.utilizationPct, 0) / result.liveBird.length
      : 0;
  const weeksWithCapacityBreach = result.liveBird.filter((r) => r.exceedsCapacity).length;

  return {
    totalChicksPlaced: totalPlacedChicks,
    totalHarvestableBirds,
    totalCarcassTons,
    totalWcFreshTons,
    totalWcFrozenTons,
    totalFppTons,
    avgUtilizationPct,
    weeksWithCapacityBreach,
  };
}

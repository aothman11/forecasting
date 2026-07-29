import { addDays, differenceInCalendarDays, format } from "date-fns";
import type {
  CarcassSizeWeek,
  CarcassYieldWeek,
  CutKey,
  CutPlanWeek,
  DemandComparisonWeek,
  DemandWeek,
  LiveBirdWeek,
  Parameters,
  PipelineResult,
  PlacementDayRow,
  PlacementRow,
  PlantKey,
  PlantWeek,
  ProductFamilyWeek,
} from "./types";
import { DEFAULT_CHICKS_PER_HOUSE, SIZE_KEYS, SIZE_KG } from "./defaults";

// ---------- shared helpers ----------

export function weekStartDate(planStartDate: string, week: number): string {
  return format(addDays(new Date(planStartDate), (week - 1) * 7), "yyyy-MM-dd");
}

export function dayIndexDate(planStartDate: string, dayIndex: number): string {
  return format(addDays(new Date(planStartDate), dayIndex), "yyyy-MM-dd");
}

/** JS Date.getDay(): 0=Sun ... 5=Fri ... 6=Sat. */
export function isFridayDate(dateStr: string): boolean {
  return new Date(dateStr).getDay() === 5;
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
  fridayOff: boolean,
  defaultChicksPerHouse: number = DEFAULT_CHICKS_PER_HOUSE
): PlacementDayRow[] {
  const byIndex = new Map(existing.map((r) => [r.dayIndex, r]));
  const rows: PlacementDayRow[] = [];
  for (let d = 0; d < horizonDays; d++) {
    const date = dayIndexDate(planStartDate, d);
    const prior = byIndex.get(d);
    const forceOff = fridayOff && isFridayDate(date);
    rows.push(
      prior
        ? { ...prior, date, farmsPlacing: forceOff ? 0 : prior.farmsPlacing }
        : {
            dayIndex: d,
            date,
            farmsPlacing: 0,
            chicksPerHouse: defaultChicksPerHouse,
          }
    );
  }
  return rows;
}

/** Places `houseCount` houses on every eligible day (skipping Fridays when `fridayOff` is on). */
export function quickFillPlacementDays(
  horizonDays: number,
  houseCount: number,
  planStartDate: string,
  fridayOff: boolean,
  chicksPerHouse: number = DEFAULT_CHICKS_PER_HOUSE
): PlacementDayRow[] {
  const rows: PlacementDayRow[] = [];
  for (let d = 0; d < horizonDays; d++) {
    const date = dayIndexDate(planStartDate, d);
    const isOff = fridayOff && isFridayDate(date);
    rows.push({
      dayIndex: d,
      date,
      farmsPlacing: isOff ? 0 : houseCount,
      chicksPerHouse,
    });
  }
  return rows;
}

/** Rolls the daily placement input up into weekly totals consumed by every downstream step. */
export function aggregateToWeeklyPlacement(
  days: PlacementDayRow[],
  params: Pick<Parameters, "planningHorizonWeeks" | "planStartDate" | "fridayOff">
): PlacementRow[] {
  const start = new Date(params.planStartDate);
  const weeks: PlacementRow[] = [];
  for (let w = 1; w <= params.planningHorizonWeeks; w++) {
    weeks.push({ week: w, weekStarting: weekStartDate(params.planStartDate, w), farmsPlacing: 0, totalChicksPlaced: 0 });
  }
  for (const day of days) {
    if (params.fridayOff && isFridayDate(day.date)) continue;
    const week = Math.floor(differenceInCalendarDays(new Date(day.date), start) / 7) + 1;
    const target = weeks[week - 1];
    if (!target) continue;
    target.farmsPlacing += day.farmsPlacing;
    target.totalChicksPlaced += day.farmsPlacing * day.chicksPerHouse;
  }
  return weeks;
}

// ---------- Processing Funnel (Steps A-G): harvestable -> dispatched -> electronic count -> slaughtered -> carcass ----------

export interface ProcessingFunnel {
  harvestMortalityBirds: number;
  dispatchedBirds: number;
  doaBirds: number;
  culledBirds: number;
  electronicBirdCount: number;
  pluckingRejectBirds: number;
  slaughteredBirds: number;
  slaughteredCarcassWeightKg: number;
}

export function computeProcessingFunnel(harvestableBirds: number, params: Parameters): ProcessingFunnel {
  const harvestMortalityBirds = harvestableBirds * params.harvestMortalityRate;
  const dispatchedBirds = harvestableBirds - harvestMortalityBirds;
  const doaBirds = dispatchedBirds * params.doaRate;
  const culledBirds = dispatchedBirds * params.culledRate;
  const electronicBirdCount = dispatchedBirds - doaBirds - culledBirds;
  const pluckingRejectBirds = electronicBirdCount * params.pluckingRejectRate;
  const slaughteredBirds = electronicBirdCount - pluckingRejectBirds;
  const slaughteredCarcassWeightKg = slaughteredBirds * params.avgCarcassWeightKg;

  return {
    harvestMortalityBirds,
    dispatchedBirds,
    doaBirds,
    culledBirds,
    electronicBirdCount,
    pluckingRejectBirds,
    slaughteredBirds,
    slaughteredCarcassWeightKg,
  };
}

/** Step G: Carcass Yield % = ACW / ALW — a derived ratio, not an editable input. */
export function carcassYieldPct(params: Parameters): number {
  return params.avgLiveWeightKg > 0 ? params.avgCarcassWeightKg / params.avgLiveWeightKg : 0;
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
    const utilizationPct = capacity > 0 ? (harvestableBirds / capacity) * 100 : 0;
    const funnel = computeProcessingFunnel(harvestableBirds, params);

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
      totalPlantCapacity: capacity,
      utilizationPct,
      exceedsCapacity: harvestableBirds > capacity,
      ...funnel,
    };
  });
}

// ---------- Step 3: Carcass Yield & Grade Split ----------

export function computeCarcassYield(
  liveBird: LiveBirdWeek[],
  params: Parameters
): CarcassYieldWeek[] {
  return liveBird.map((lb): CarcassYieldWeek => {
    const carcassWeightKg = lb.slaughteredCarcassWeightKg;
    return {
      week: lb.week,
      carcassCountPc: lb.slaughteredBirds,
      carcassWeightKg,
      gradeAKg: carcassWeightKg * params.gradeSplit.A,
      gradeBKg: carcassWeightKg * params.gradeSplit.B,
      gradeCKg: carcassWeightKg * params.gradeSplit.C,
    };
  });
}

/** Step 4-of-Step-3 add-on: distributes each week's slaughtered birds across fixed carcass weight classes. */
export function computeCarcassSizeDistribution(
  liveBird: LiveBirdWeek[],
  params: Parameters
): CarcassSizeWeek[] {
  return liveBird.map((lb): CarcassSizeWeek => {
    const sizes = {} as CarcassSizeWeek["sizes"];
    for (const key of SIZE_KEYS) {
      const birds = lb.slaughteredBirds * params.carcassSizeDistribution[key];
      sizes[key] = { birds, kg: birds * SIZE_KG[key] };
    }
    return { week: lb.week, sizes };
  });
}

export function carcassSizeDistributionSum(params: Parameters): number {
  return SIZE_KEYS.reduce((sum, key) => sum + params.carcassSizeDistribution[key], 0);
}

// ---------- Step 4: Product Family Allocation ----------

export function computeProductFamily(
  carcass: CarcassYieldWeek[],
  params: Parameters
): ProductFamilyWeek[] {
  return carcass.map((c): ProductFamilyWeek => {
    const { A, B, C } = params.familyAllocation;
    const wcFreshKg = c.gradeAKg * A.wcFresh + c.gradeBKg * B.wcFresh + c.gradeCKg * C.wcFresh;
    const wcFrozenKg = c.gradeAKg * A.wcFrozen + c.gradeBKg * B.wcFrozen + c.gradeCKg * C.wcFrozen;
    const fppKg = c.gradeAKg * A.fpp + c.gradeBKg * B.fpp + c.gradeCKg * C.fpp;
    return {
      week: c.week,
      wcFreshKg,
      wcFrozenKg,
      fppKg,
      totalKg: wcFreshKg + wcFrozenKg + fppKg,
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
      cuts[key] = f.fppKg * params.cutYields[key];
    }
    const totalKg = keys.reduce((sum, k) => sum + cuts[k], 0);
    return { week: f.week, cuts, totalKg };
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
      const liveWeightKg = birds * params.avgLiveWeightKg;
      const carcassKg = computeProcessingFunnel(birds, params).slaughteredCarcassWeightKg;
      const gradeAKg = carcassKg * params.gradeSplit.A;
      const gradeBKg = carcassKg * params.gradeSplit.B;
      const gradeCKg = carcassKg * params.gradeSplit.C;
      const { A, B, C } = params.familyAllocation;
      const wcFreshKg = gradeAKg * A.wcFresh + gradeBKg * B.wcFresh + gradeCKg * C.wcFresh;
      const wcFrozenKg = gradeAKg * A.wcFrozen + gradeBKg * B.wcFrozen + gradeCKg * C.wcFrozen;
      const fppKg = gradeAKg * A.fpp + gradeBKg * B.fpp + gradeCKg * C.fpp;
      const dailyBirds = birds / params.workingDaysPerWeek;

      result.push({
        week: lb.week,
        plant,
        birds,
        liveWeightKg,
        carcassKg,
        gradeAKg,
        gradeBKg,
        gradeCKg,
        wcFreshKg,
        wcFrozenKg,
        fppKg,
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
  const carcassSizes = computeCarcassSizeDistribution(liveBird, params);
  const family = computeProductFamily(carcass, params);
  const cuts = computeCutPlan(family, params);
  const plants = computePlantDistribution(liveBird, params);
  return { placementDays, placement, liveBird, carcass, carcassSizes, family, cuts, plants };
}

// ---------- summary metrics (used by overview cards / PDF export / mobile view) ----------

export interface SummaryMetrics {
  totalChicksPlaced: number;
  totalHarvestableBirds: number;
  totalCarcassKg: number;
  totalWcFreshKg: number;
  totalWcFrozenKg: number;
  totalFppKg: number;
  avgUtilizationPct: number;
  weeksWithCapacityBreach: number;
}

export function computeSummaryMetrics(result: PipelineResult): SummaryMetrics {
  const totalPlacedChicks = result.placement.reduce((s, r) => s + r.totalChicksPlaced, 0);
  const totalHarvestableBirds = result.liveBird.reduce((s, r) => s + r.harvestableBirds, 0);
  const totalCarcassKg = result.carcass.reduce((s, r) => s + r.carcassWeightKg, 0);
  const totalWcFreshKg = result.family.reduce((s, r) => s + r.wcFreshKg, 0);
  const totalWcFrozenKg = result.family.reduce((s, r) => s + r.wcFrozenKg, 0);
  const totalFppKg = result.family.reduce((s, r) => s + r.fppKg, 0);
  const avgUtilizationPct =
    result.liveBird.length > 0
      ? result.liveBird.reduce((s, r) => s + r.utilizationPct, 0) / result.liveBird.length
      : 0;
  const weeksWithCapacityBreach = result.liveBird.filter((r) => r.exceedsCapacity).length;

  return {
    totalChicksPlaced: totalPlacedChicks,
    totalHarvestableBirds,
    totalCarcassKg,
    totalWcFreshKg,
    totalWcFrozenKg,
    totalFppKg,
    avgUtilizationPct,
    weeksWithCapacityBreach,
  };
}

// ---------- Demand Forecast (cross-cutting: demand vs. production plan) ----------

/** Ensures a contiguous demand array for weeks 1..horizon, preserving existing edits by week. */
export function ensureDemandHorizon(existing: DemandWeek[], horizonWeeks: number): DemandWeek[] {
  const byWeek = new Map(existing.map((r) => [r.week, r]));
  const rows: DemandWeek[] = [];
  for (let w = 1; w <= horizonWeeks; w++) {
    rows.push(byWeek.get(w) ?? { week: w, wcFreshKg: 0, wcFrozenKg: 0, fppKg: 0 });
  }
  return rows;
}

/** Seeds a demand forecast from the current production plan, as a starting point to adjust from. */
export function demandFromProduction(family: ProductFamilyWeek[]): DemandWeek[] {
  return family.map((f) => ({
    week: f.week,
    wcFreshKg: Math.round(f.wcFreshKg),
    wcFrozenKg: Math.round(f.wcFrozenKg),
    fppKg: Math.round(f.fppKg),
  }));
}

export function computeDemandComparison(
  demand: DemandWeek[],
  family: ProductFamilyWeek[]
): DemandComparisonWeek[] {
  const familyByWeek = new Map(family.map((f) => [f.week, f]));
  return demand.map((d): DemandComparisonWeek => {
    const f = familyByWeek.get(d.week);
    const wcFreshProductionKg = f?.wcFreshKg ?? 0;
    const wcFrozenProductionKg = f?.wcFrozenKg ?? 0;
    const fppProductionKg = f?.fppKg ?? 0;
    const demandKg = d.wcFreshKg + d.wcFrozenKg + d.fppKg;
    const productionKg = wcFreshProductionKg + wcFrozenProductionKg + fppProductionKg;
    const varianceKg = productionKg - demandKg;
    const fillRatePct = demandKg > 0 ? (productionKg / demandKg) * 100 : 100;

    return {
      week: d.week,
      demandKg,
      productionKg,
      varianceKg,
      fillRatePct,
      wcFreshDemandKg: d.wcFreshKg,
      wcFreshProductionKg,
      wcFrozenDemandKg: d.wcFrozenKg,
      wcFrozenProductionKg,
      fppDemandKg: d.fppKg,
      fppProductionKg,
      shortfall: productionKg < demandKg,
    };
  });
}

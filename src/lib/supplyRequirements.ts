import { activeCutKeys, harvestOffsetWeeks } from "./calculations";
import { getDemandQtyAllChannels } from "./demandPlan";
import type {
  DemandPlanQty,
  DemandProduct,
  Parameters,
  PipelineResult,
  ProductCategory,
  SupplyRequirementsWeek,
} from "./types";

/** Fraction of carcass kg that becomes WC (fresh + frozen combined), using the pipeline's own params. */
export function wcYieldFromCarcass(params: Parameters): number {
  const { A, B, C } = params.familyAllocation;
  const g = params.gradeSplit;
  return (
    g.A * (A.wcFresh + A.wcFrozen) +
    g.B * (B.wcFresh + B.wcFrozen) +
    g.C * (C.wcFresh + C.wcFrozen)
  );
}

/** Fraction of carcass kg that becomes FPP kg. */
export function fppYieldFromCarcass(params: Parameters): number {
  const { A, B, C } = params.familyAllocation;
  const g = params.gradeSplit;
  return g.A * A.fpp + g.B * B.fpp + g.C * C.fpp;
}

/** Fraction of carcass kg that becomes cuts kg (FPP yield × sum of active cut yields). */
export function cutsYieldFromCarcass(params: Parameters): number {
  const fppYield = fppYieldFromCarcass(params);
  const cutSum = activeCutKeys(params.legSplitMode).reduce((s, k) => s + params.cutYields[k], 0);
  return fppYield * cutSum;
}

/**
 * Reverse the processing funnel: given a target carcass weight, derive how many harvestable
 * birds are needed and how many chicks must be placed.
 */
export function carcassKgToPlacement(
  carcassKg: number,
  params: Parameters
): { slaughteredBirds: number; harvestableBirds: number; chicksPlaced: number } {
  if (params.avgCarcassWeightKg <= 0) return { slaughteredBirds: 0, harvestableBirds: 0, chicksPlaced: 0 };
  const slaughteredBirds = carcassKg / params.avgCarcassWeightKg;
  const electronicBirdCount = slaughteredBirds / (1 - params.pluckingRejectRate);
  const dispatchedBirds = electronicBirdCount / (1 - params.doaRate - params.culledRate);
  const harvestableBirds = dispatchedBirds / (1 - params.harvestMortalityRate);
  const mortalitySurvival = 1 - params.mortalityRate;
  const chicksPlaced = mortalitySurvival > 0 ? harvestableBirds / mortalitySurvival : 0;
  return { slaughteredBirds, harvestableBirds, chicksPlaced };
}

export function computeSupplyRequirements(
  demandProducts: DemandProduct[],
  demandQty: DemandPlanQty,
  params: Parameters,
  pipeline: PipelineResult,
  weeks: number[]
): SupplyRequirementsWeek[] {
  const wcYield = wcYieldFromCarcass(params);
  const fppYield = fppYieldFromCarcass(params);
  const cutsYield = cutsYieldFromCarcass(params);

  const carcassByWeek = new Map(pipeline.carcass.map((r) => [r.week, r.carcassWeightKg]));
  const lbByWeek = new Map(pipeline.liveBird.map((r) => [r.week, r]));
  const famByWeek = new Map(pipeline.family.map((r) => [r.week, r]));

  return weeks.map((week): SupplyRequirementsWeek => {
    let wcDemandKg = 0;
    let fppDemandKg = 0;
    let cutsDemandKg = 0;
    let eggsDemandTrays = 0;

    for (const p of demandProducts) {
      const qty = getDemandQtyAllChannels(demandQty, p.id, week);
      if (p.category === "wholeChicken") wcDemandKg += qty;
      else if (p.category === "fpp") fppDemandKg += qty;
      else if (p.category === "cuts") cutsDemandKg += qty;
      else if (p.category === "eggs") eggsDemandTrays += qty;
    }

    const reqForWc = wcYield > 0 ? wcDemandKg / wcYield : 0;
    const reqForFpp = fppYield > 0 ? fppDemandKg / fppYield : 0;
    const reqForCuts = cutsYield > 0 ? cutsDemandKg / cutsYield : 0;

    const requiredCarcassKg = Math.max(reqForWc, reqForFpp, reqForCuts);

    let bindingCategory: ProductCategory | null = null;
    if (requiredCarcassKg > 0) {
      if (requiredCarcassKg === reqForWc && wcDemandKg > 0) bindingCategory = "wholeChicken";
      else if (requiredCarcassKg === reqForFpp && fppDemandKg > 0) bindingCategory = "fpp";
      else if (requiredCarcassKg === reqForCuts && cutsDemandKg > 0) bindingCategory = "cuts";
    }

    const { harvestableBirds: requiredHarvestableBirds, chicksPlaced: requiredChicksPlaced } =
      carcassKgToPlacement(requiredCarcassKg, params);

    const plannedCarcassKg = carcassByWeek.get(week) ?? 0;
    const lbRow = lbByWeek.get(week);
    const famRow = famByWeek.get(week);

    return {
      week,
      wcDemandKg,
      fppDemandKg,
      cutsDemandKg,
      eggsDemandTrays,
      requiredCarcassKg,
      requiredHarvestableBirds,
      requiredChicksPlaced,
      placementWeek: week - harvestOffsetWeeks(params.cycleLengthDays),
      bindingCategory,
      plannedCarcassKg,
      plannedHarvestableBirds: lbRow?.harvestableBirds ?? 0,
      plannedWcKg: famRow ? famRow.wcFreshKg + famRow.wcFrozenKg : 0,
      plannedFppKg: famRow?.fppKg ?? 0,
      carcassGapKg: plannedCarcassKg - requiredCarcassKg,
      harvestableGapBirds: (lbRow?.harvestableBirds ?? 0) - requiredHarvestableBirds,
    };
  });
}

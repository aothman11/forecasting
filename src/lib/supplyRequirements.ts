import { activeCutKeys, harvestOffsetWeeks } from "./calculations";
import { getDemandQtyAllChannels } from "./demandPlan";
import { DEFAULT_FPP_MEAT_CONTENT } from "./defaults";
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

/** Fraction of carcass kg allocated to the cutting line. */
function cutsAllocFromCarcass(params: Parameters): number {
  const { A, B, C } = params.familyAllocation;
  const g = params.gradeSplit;
  return g.A * A.cuts + g.B * B.cuts + g.C * C.cuts;
}

/** Fraction of carcass kg that ends up as FPP (Cuts → FPP: cut output × per-cut FPP routing share). */
export function fppYieldFromCarcass(params: Parameters): number {
  const keys = activeCutKeys(params.legSplitMode);
  const fppPerCutsInput = keys.reduce((s, k) => s + params.cutYields[k] * (params.fppFromCuts[k] ?? 0), 0);
  return cutsAllocFromCarcass(params) * fppPerCutsInput;
}

/** Fraction of carcass kg that becomes saleable cuts (after the FPP draw). */
export function cutsYieldFromCarcass(params: Parameters): number {
  const keys = activeCutKeys(params.legSplitMode);
  const netCutsPerInput = keys.reduce(
    (s, k) => s + params.cutYields[k] * (1 - (params.fppFromCuts[k] ?? 0)),
    0
  );
  return cutsAllocFromCarcass(params) * netCutsPerInput;
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
  const cutsByWeek = new Map(pipeline.cuts.map((r) => [r.week, r]));

  return weeks.map((week): SupplyRequirementsWeek => {
    let wcDemandTons = 0;
    let fppDemandTons = 0;
    let cutsDemandTons = 0;
    let eggsDemandTrays = 0;
    // FPP finished-product demand converted to raw-meat equivalent.
    // Each product's yieldPct is its BOM meat-content ratio (raw meat / finished product).
    // Example: 1 t finished burger × 0.879 = 0.879 t raw meat needed.
    // This raw-meat figure is then divided by fppYield (carcass → raw meat fraction)
    // to get the required carcass kg — both sides of the division are now in raw-meat units.
    let fppRawMeatKg = 0;

    for (const p of demandProducts) {
      const qty = getDemandQtyAllChannels(demandQty, p.id, week);
      if (p.category === "wholeChicken") wcDemandTons += qty;
      else if (p.category === "fpp") {
        fppDemandTons += qty;
        const meatContent = p.yieldPct ?? DEFAULT_FPP_MEAT_CONTENT;
        fppRawMeatKg += qty * 1000 * meatContent;
      }
      else if (p.category === "cuts") cutsDemandTons += qty;
      else if (p.category === "eggs") eggsDemandTrays += qty;
    }

    const wcDemandKg = wcDemandTons * 1000;
    const cutsDemandKg = cutsDemandTons * 1000;

    const reqForWc = wcYield > 0 ? wcDemandKg / wcYield : 0;
    const reqForFpp = fppYield > 0 ? fppRawMeatKg / fppYield : 0;
    const reqForCuts = cutsYield > 0 ? cutsDemandKg / cutsYield : 0;

    const requiredCarcassKg = Math.max(reqForWc, reqForFpp, reqForCuts);

    let bindingCategory: ProductCategory | null = null;
    if (requiredCarcassKg > 0) {
      if (requiredCarcassKg === reqForWc && wcDemandKg > 0) bindingCategory = "wholeChicken";
      else if (requiredCarcassKg === reqForFpp && fppRawMeatKg > 0) bindingCategory = "fpp";
      else if (requiredCarcassKg === reqForCuts && cutsDemandKg > 0) bindingCategory = "cuts";
    }

    const { harvestableBirds: requiredHarvestableBirds, chicksPlaced: requiredChicksPlaced } =
      carcassKgToPlacement(requiredCarcassKg, params);

    const plannedCarcassKg = carcassByWeek.get(week) ?? 0;
    const lbRow = lbByWeek.get(week);
    const famRow = famByWeek.get(week);
    const cutsRow = cutsByWeek.get(week);

    return {
      week,
      wcDemandTons,
      fppDemandTons,
      cutsDemandTons,
      eggsDemandTrays,
      fppRawMeatKg,
      requiredCarcassKg,
      requiredHarvestableBirds,
      requiredChicksPlaced,
      placementWeek: week - harvestOffsetWeeks(params.cycleLengthDays),
      bindingCategory,
      plannedCarcassKg,
      plannedHarvestableBirds: lbRow?.harvestableBirds ?? 0,
      plannedWcKg: famRow ? famRow.wcFreshKg + famRow.wcFrozenKg : 0,
      plannedFppKg: cutsRow?.fppInputKg ?? 0,
      plannedCutsKg: cutsRow?.netCutsKg ?? 0,
      carcassGapKg: plannedCarcassKg - requiredCarcassKg,
      harvestableGapBirds: (lbRow?.harvestableBirds ?? 0) - requiredHarvestableBirds,
    };
  });
}

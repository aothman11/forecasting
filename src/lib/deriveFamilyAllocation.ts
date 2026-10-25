import { DEFAULT_FPP_MEAT_CONTENT } from "./defaults";
import { fppPerCutsInput, netCutsPerInput } from "./supplyRequirements";
import type { DemandPlanQty, DemandProduct, FamilyAllocation, Parameters } from "./types";

export interface SalesPlanMix {
  wcFreshTons: number;
  wcFrozenTons: number;
  cutsTons: number;
  fppTons: number;
  totalTons: number;
}

export interface DerivedFamilyAllocation {
  allocation: FamilyAllocation;
  mix: SalesPlanMix;
  /** Grade whose WC demand exceeds that grade's carcass supply, forcing extra birds. */
  bindingGrade: "A" | "B" | null;
  hasData: boolean;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Inverse of the supply funnel in supplyRequirements.ts: picks the per-grade
 * WC Fresh / WC Frozen / Cuts shares that make the planned carcass deliver
 * exactly the horizon's demand mix. Grade split, cut yields and FPP routing
 * stay as given — they describe the flock, not the customer.
 */
export function deriveFamilyAllocation(
  demandProducts: DemandProduct[],
  demandQty: DemandPlanQty,
  params: Parameters
): DerivedFamilyAllocation {
  const byId = new Map(demandProducts.map((p) => [p.id, p]));
  const wc = { A: { fresh: 0, frozen: 0 }, B: { fresh: 0, frozen: 0 } };
  let cutsKg = 0;
  let fppTons = 0;
  let fppRawMeatKg = 0;

  for (const [key, qty] of Object.entries(demandQty)) {
    if (!qty) continue;
    const [productId, , weekStr] = key.split("::");
    const week = Number(weekStr);
    if (!(week >= 1 && week <= params.planningHorizonWeeks)) continue;
    const p = byId.get(productId);
    if (!p) continue;

    if (p.category === "wholeChicken") {
      const grade = p.grade === "B" ? "B" : "A";
      wc[grade][p.freshFrozen === "frozen" ? "frozen" : "fresh"] += qty * 1000;
    } else if (p.category === "cuts") {
      cutsKg += qty * 1000;
    } else if (p.category === "fpp") {
      fppTons += qty;
      fppRawMeatKg += qty * 1000 * (p.yieldPct ?? DEFAULT_FPP_MEAT_CONTENT);
    }
  }

  const wcA = wc.A.fresh + wc.A.frozen;
  const wcB = wc.B.fresh + wc.B.frozen;
  const mix: SalesPlanMix = {
    wcFreshTons: (wc.A.fresh + wc.B.fresh) / 1000,
    wcFrozenTons: (wc.A.frozen + wc.B.frozen) / 1000,
    cutsTons: cutsKg / 1000,
    fppTons,
    totalTons: (wcA + wcB + cutsKg) / 1000 + fppTons,
  };

  const current = params.familyAllocation;
  if (mix.totalTons <= 0) {
    return { allocation: current, mix, bindingGrade: null, hasData: false };
  }

  // Carcass the cutting line needs to cover both cuts and FPP raw meat.
  const netCuts = netCutsPerInput(params);
  const fppPerInput = fppPerCutsInput(params);
  const cuttingCarcassKg = Math.max(
    netCuts > 0 ? cutsKg / netCuts : 0,
    fppPerInput > 0 ? fppRawMeatKg / fppPerInput : 0
  );

  const { A: gA, B: gB } = params.gradeSplit;
  const balancedKg = wcA + wcB + cuttingCarcassKg;
  const needForA = gA > 0 ? wcA / gA : 0;
  const needForB = gB > 0 ? wcB / gB : 0;
  const carcassKg = Math.max(balancedKg, needForA, needForB);

  let bindingGrade: "A" | "B" | null = null;
  if (carcassKg > balancedKg + 1e-6) bindingGrade = needForA >= needForB ? "A" : "B";

  const rowFor = (g: "A" | "B", share: number) => {
    const gradeKg = share * carcassKg;
    if (gradeKg <= 0) return { wcFresh: 0, wcFrozen: 0, cuts: 1 };
    const wcFresh = round3(wc[g].fresh / gradeKg);
    const wcFrozen = round3(wc[g].frozen / gradeKg);
    return { wcFresh, wcFrozen, cuts: Math.max(0, round3(1 - wcFresh - wcFrozen)) };
  };

  return {
    allocation: {
      A: rowFor("A", gA),
      B: rowFor("B", gB),
      C: { wcFresh: 0, wcFrozen: 0, cuts: 1 },
    },
    mix,
    bindingGrade,
    hasData: true,
  };
}

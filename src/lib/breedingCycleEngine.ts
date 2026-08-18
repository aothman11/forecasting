/**
 * Breeding Cycle Engine — forward PS production chain + procurement schedule.
 *
 * Uses GP eggs/week from computeGpFlockProduction (supply side) and
 * the catching plan (demand side) to compute:
 *   1.  Cobb PS DOC from GP hatchery
 *   2.  PS laying cohort production (Cobb + Ross)
 *   3.  Broiler DOC supply from AWP hatchery
 *   4.  Gap vs catching-plan demand
 *   5.  Procurement actions (Ross POs, GP orders, transfers, depops)
 */

import type { BreedingParams, RossPsOrder } from "./types";
import type { BioChainGpFlock, BioChainAssumptions } from "./biologicalChain/types";
import { computeGpFlockProduction } from "./biologicalChain/calculations";
import type { BreedingCycleResult, PsCohort, ProcurementAction } from "./breedingCycleTypes";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDaysToIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function weeksBetweenIso(from: string, to: string): number {
  return (
    (new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) /
    (7 * 24 * 3600 * 1000)
  );
}

/** ISO date for Monday of plan week W (1-based). */
export function bceWeekStart(planStartDate: string, w: number): string {
  return addDaysToIso(planStartDate, (w - 1) * 7);
}

/** Convert an ISO date to a plan-relative week number (1-based). */
export function bceIsoToWeek(planStartDate: string, iso: string): number {
  return Math.round(weeksBetweenIso(planStartDate, iso)) + 1;
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export function computeBreedingCycle(
  params: BreedingParams,
  bioChainGpFlocks: BioChainGpFlock[],
  bioChainAssumptions: BioChainAssumptions,
  rossPsOrders: RossPsOrder[],
  /** catchingPlan: plan week (1-based) → DOC placed at broiler farms */
  catchingPlan: Map<number, number>,
  planStartDate: string,
  horizonWeeks: number,
  today: string,
): BreedingCycleResult {
  // Span includes 40 weeks before plan start (so we pick up pre-plan GP flocks)
  const weekRange = Array.from(
    { length: horizonWeeks + 60 },
    (_, i) => i + 1 - 20,
  );

  // ── 1. GP egg supply (forward, from registered BC flocks) ─────────────────
  const { supplyByWeek: gpEggsSupply } = computeGpFlockProduction(
    bioChainGpFlocks,
    bioChainAssumptions,
    weekRange,
    1,
    planStartDate,
  );

  // ── 2. Cobb PS DOC from GP hatchery ─────────────────────────────────────
  const eggCollLead = bioChainAssumptions.eggCollectionLeadWeeks ?? 1;
  const incubWks    = params.incubationWeeks;
  const gpHatchRate = params.gpHatchRate;
  const gpMalePct   = params.gpMaleByproductPct;
  const cullPct     = params.hatcheryCullPct ?? 0.02;

  const cobbPsDOCByWeek = new Map<number, number>();
  for (const [w, eggs] of gpEggsSupply.entries()) {
    const arriveWeek = w + eggCollLead + incubWks;
    const docFemales = eggs * gpHatchRate * (1 - gpMalePct) * (1 - cullPct);
    cobbPsDOCByWeek.set(arriveWeek, (cobbPsDOCByWeek.get(arriveWeek) ?? 0) + docFemales);
  }

  // ── 3. Ross PS DOC from orders (date-based) ───────────────────────────────
  const rossPsDOCByOrder = new Map<number, { order: RossPsOrder; arriveWeek: number }[]>();
  for (const order of rossPsOrders) {
    const arriveWeek = bceIsoToWeek(planStartDate, order.arrivalDate);
    const bucket = rossPsDOCByOrder.get(arriveWeek) ?? [];
    bucket.push({ order, arriveWeek });
    rossPsDOCByOrder.set(arriveWeek, bucket);
  }

  // ── 4. Build PS cohorts ──────────────────────────────────────────────────
  const psRearingWks  = params.psRearingWeeks ?? 25;
  const psRearingMort = params.psRearingMortality ?? 0.04;
  const psCohorts: PsCohort[] = [];

  // Cobb PS cohorts (aggregate small weekly batches into practical cohorts)
  // Group weeks with DOC > threshold into cohort objects
  for (const [w, doc] of cobbPsDOCByWeek.entries()) {
    if (doc < 10) continue;
    psCohorts.push({
      id: `cobb-ps-w${w}`,
      breed: "cobb",
      docArrivalWeek: w,
      docFemaleCount: doc,
      layStartWeek: w + psRearingWks,
      layEndWeek: w + psRearingWks + params.cobbLayingWeeks,
      sourceName: `Cobb PS (GP eggs Wk ${w - eggCollLead - incubWks})`,
    });
  }

  // Ross PS cohorts
  for (const ordersAtWeek of rossPsDOCByOrder.values()) {
    for (const { order, arriveWeek } of ordersAtWeek) {
      psCohorts.push({
        id: `ross-ps-${order.id}`,
        breed: "ross",
        docArrivalWeek: arriveWeek,
        docFemaleCount: order.femaleCount,
        layStartWeek: arriveWeek + psRearingWks,
        layEndWeek: arriveWeek + psRearingWks + params.rossLayingWeeks,
        sourceName: order.name,
      });
    }
  }

  // ── 5. PS egg production per week ────────────────────────────────────────
  const psEggsByWeek = new Map<number, { cobb: number; ross: number; total: number }>();

  function addPsEggs(w: number, eggs: number, breed: "cobb" | "ross") {
    const cur = psEggsByWeek.get(w) ?? { cobb: 0, ross: 0, total: 0 };
    psEggsByWeek.set(w, breed === "cobb"
      ? { cobb: cur.cobb + eggs, ross: cur.ross, total: cur.total + eggs }
      : { cobb: cur.cobb, ross: cur.ross + eggs, total: cur.total + eggs });
  }

  for (const cohort of psCohorts) {
    const { breed, layStartWeek, layEndWeek, docFemaleCount } = cohort;
    const hdp       = breed === "cobb" ? params.cobbHDP        : params.rossHDP;
    const layMort   = breed === "cobb" ? params.cobbLayMortWeekly : params.rossLayMortWeekly;
    const settable  = breed === "cobb" ? params.cobbSettableRatio : params.rossSettableRatio;

    for (let w = layStartWeek; w < layEndWeek && w <= horizonWeeks + 10; w++) {
      if (w < 1) continue; // skip pre-plan weeks in the output (still computed for continuity)
      const layIdx      = w - layStartWeek;
      const femalesAlive = docFemaleCount * (1 - psRearingMort) * Math.pow(1 - layMort, layIdx);
      const eggs        = femalesAlive * (hdp / 100) * 7 * settable;
      addPsEggs(w, eggs, breed);
    }
  }

  // ── 6. Broiler DOC supply from AWP hatchery ──────────────────────────────
  const broilerDOCSupply = new Map<number, { cobb: number; ross: number; total: number }>();

  function addBroilerDOC(w: number, doc: number, breed: "cobb" | "ross") {
    const cur = broilerDOCSupply.get(w) ?? { cobb: 0, ross: 0, total: 0 };
    broilerDOCSupply.set(w, breed === "cobb"
      ? { cobb: cur.cobb + doc, ross: cur.ross, total: cur.total + doc }
      : { cobb: cur.cobb, ross: cur.ross + doc, total: cur.total + doc });
  }

  for (const [w, eggs] of psEggsByWeek.entries()) {
    const docWeek = w + eggCollLead + incubWks;
    if (docWeek > horizonWeeks + 10) continue;
    const cobbDOC = eggs.cobb * params.cobbHatchRate * (1 - params.cobbMaleByproductPct) * (1 - cullPct);
    const rossDOC = eggs.ross * params.rossHatchRate * (1 - params.rossMaleByproductPct) * (1 - cullPct);
    if (cobbDOC > 0) addBroilerDOC(docWeek, cobbDOC, "cobb");
    if (rossDOC > 0) addBroilerDOC(docWeek, rossDOC, "ross");
  }

  // ── 7. Broiler DOC demand = catching plan ─────────────────────────────────
  const broilerDOCDemand = new Map(catchingPlan);

  // ── 8. Procurement actions ───────────────────────────────────────────────
  const procurementActions: ProcurementAction[] = [];
  const todayMs           = new Date(today + "T00:00:00Z").getTime();
  const dueSoonMs         = 4 * 7 * 24 * 3600 * 1000; // 4 weeks

  function urgency(iso: string): "ok" | "due-soon" | "overdue" {
    const t = new Date(iso + "T00:00:00Z").getTime();
    if (t < todayMs) return "overdue";
    if (t - todayMs < dueSoonMs) return "due-soon";
    return "ok";
  }

  // Ross: PO date + PS transfer + PS depop
  for (const order of rossPsOrders) {
    const poDate      = addDaysToIso(order.arrivalDate, -params.rossPOLeadWeeks * 7);
    const poWeek      = bceIsoToWeek(planStartDate, poDate);
    const arriveWeek  = bceIsoToWeek(planStartDate, order.arrivalDate);
    const layStart    = arriveWeek + psRearingWks;
    const layStartDate = bceWeekStart(planStartDate, layStart);
    const depopWk     = layStart + params.rossLayingWeeks;
    const depopDate   = bceWeekStart(planStartDate, depopWk);
    const femalesAtLay = Math.round(order.femaleCount * (1 - psRearingMort));
    const femalesAtDepop = Math.round(
      femalesAtLay * Math.pow(1 - params.rossLayMortWeekly, params.rossLayingWeeks),
    );

    procurementActions.push({
      id: `ross-po-${order.id}`, type: "ross-po", breed: "ross-308",
      plant: "Supplier → 1230", actionDate: poDate, actionWeek: poWeek,
      qty: order.femaleCount,
      notes: `${order.name} · ${order.femaleCount.toLocaleString()} F DOC · arrives ${order.arrivalDate}`,
      urgency: urgency(poDate),
    });
    procurementActions.push({
      id: `ross-xfr-${order.id}`, type: "ps-to-laying", breed: "ross-308",
      plant: "1230 → 1220", actionDate: layStartDate, actionWeek: layStart,
      qty: femalesAtLay,
      notes: `${order.name} · transfer to PS Laying`,
      urgency: urgency(layStartDate),
    });
    procurementActions.push({
      id: `ross-depop-${order.id}`, type: "ps-depop", breed: "ross-308",
      plant: "1220", actionDate: depopDate, actionWeek: depopWk,
      qty: femalesAtDepop,
      notes: `${order.name} · depopulate`,
      urgency: urgency(depopDate),
    });
  }

  // GP flocks: order + transfer to laying + depop
  const gpProcLeadWks  = params.gpProcurementLeadWeeks ?? 52;
  const gpRearMort     = params.gpRearingMortality ?? 0.04;

  for (const flock of bioChainGpFlocks) {
    const layStartWk   = flock.placementWeek + bioChainAssumptions.gpRearingWeeks;
    const layEndWk     = flock.placementWeek + bioChainAssumptions.gpLayEndAgeWeeks;
    const transferDate = bceWeekStart(planStartDate, layStartWk);
    const depopDate    = bceWeekStart(planStartDate, layEndWk);
    const orderWk      = flock.placementWeek - gpProcLeadWks;
    const orderDate    = bceWeekStart(planStartDate, orderWk);
    const femalesAtLay = Math.round(flock.femaleCount * (1 - gpRearMort));

    procurementActions.push({
      id: `gp-order-${flock.id}`, type: "gp-order", breed: "cobb-gp",
      plant: "Supplier → 3300", actionDate: orderDate, actionWeek: orderWk,
      qty: flock.femaleCount,
      notes: `${flock.name} · place GP DOC order · placement at W${flock.placementWeek}`,
      urgency: urgency(orderDate),
    });
    procurementActions.push({
      id: `gp-xfr-${flock.id}`, type: "gp-to-laying", breed: "cobb-gp",
      plant: "3300 → 3200", actionDate: transferDate, actionWeek: layStartWk,
      qty: femalesAtLay,
      notes: `${flock.name} · transfer to GP Laying (age ${bioChainAssumptions.gpRearingWeeks} wks)`,
      urgency: urgency(transferDate),
    });
    procurementActions.push({
      id: `gp-depop-${flock.id}`, type: "gp-depop", breed: "cobb-gp",
      plant: "3200", actionDate: depopDate, actionWeek: layEndWk,
      qty: 0,
      notes: `${flock.name} · depopulate GP Laying (age ${bioChainAssumptions.gpLayEndAgeWeeks} wks)`,
      urgency: urgency(depopDate),
    });
  }

  procurementActions.sort((a, b) => a.actionDate.localeCompare(b.actionDate));

  return {
    gpEggsSupply,
    cobbPsDOCByWeek,
    psCohorts,
    psEggsByWeek,
    broilerDOCSupply,
    broilerDOCDemand,
    procurementActions,
    planStartDate,
    horizonWeeks,
  };
}

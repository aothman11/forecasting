/**
 * AWP Biological Chain — pure calculation functions.
 *
 * All calculations work BACKWARD from the Catching Plan using lead-time offsets
 * and conversion rates from BioChainAssumptions.
 *
 * Terminology:
 *   "week W" = plan week index (1-based; negative = before plan start).
 *   A value in week W was the event that happened in calendar week W.
 *
 * No imports from React, Zustand, or Next.js — these are pure functions.
 */

import type {
  BioChainAssumptions,
  BioChainGpFlock,
  BioChainResult,
  CatchingPlanWeek,
  AwpBroilerWeek,
  AwpHatcheryWeek,
  AwpPsLayingWeek,
  AwpPsRearingWeek,
  GpHatcheryWeek,
  GpLayingWeek,
  GpRearingWeek,
  GpFlockStatus,
  GpFlockWeekRow,
} from "./types";

// ─── Internal sparse-map helpers ──────────────────────────────────────────────

/** Sparse week-indexed accumulator.  Keys are integer week numbers (may be negative). */
type WMap = Map<number, number>;

/** Adds `val` to the accumulator at `week`. */
function acc(m: WMap, week: number, val: number): void {
  m.set(week, (m.get(week) ?? 0) + val);
}

/** Returns entries sorted ascending by week. */
function sortedEntries(m: WMap): [number, number][] {
  return [...m.entries()].sort(([a], [b]) => a - b);
}

// ─── Date utility ─────────────────────────────────────────────────────────────

/**
 * Given a known (baseWeek → baseDate) anchor and a target week index,
 * returns the ISO date string for that week's Monday.
 * Exported so UI components can compute dates from week indices.
 */
export function isoForWeek(
  targetWeek: number,
  baseWeek: number,
  baseDate: string,
): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + (targetWeek - baseWeek) * 7);
  return d.toISOString().slice(0, 10);
}

// ─── Stage calculators ────────────────────────────────────────────────────────

/**
 * Step 1 — Catching Plan → AWP Broiler DOC placement.
 *
 * For each catching week W with `birds` caught:
 *   DOC_placement_week = W - broilerGrowoutWeeks
 *   docPlaced          = birds / (1 - broilerMortality)
 *
 * The mortality gross-up accounts for birds that die during grow-out; we need
 * to place more DOC than the final catching target to hit it.
 */
function step1_AwpBroilerDoc(
  catchingPlan: CatchingPlanWeek[],
  a: BioChainAssumptions,
): WMap {
  const m: WMap = new Map();
  for (const row of catchingPlan) {
    if (row.birds <= 0) continue;
    acc(m, row.week - a.broilerGrowoutWeeks, row.birds / (1 - a.broilerMortality));
  }
  return m;
}

/**
 * Step 2 — AWP Broiler DOC → AWP Hatchery eggs-set schedule.
 *
 * For each DOC week W:
 *   eggs_set_week = W - incubationWeeks
 *   eggsSet       = docPlaced / hatchabilityPs
 *
 * Eggs must be set incubationWeeks before the DOC is needed.
 */
function step2_HatcheryEggsSet(
  broilerDocMap: WMap,
  a: BioChainAssumptions,
): WMap {
  const m: WMap = new Map();
  for (const [w, doc] of broilerDocMap) {
    acc(m, w - a.incubationWeeks, doc / a.hatchabilityPs);
  }
  return m;
}

/**
 * Step 3 — AWP Hatchery eggs → AWP PS Laying hen requirement.
 *
 * For each eggs-set week W:
 *   laying_week = W - eggCollectionLeadWeeks
 *   activeHens  = eggsSet / (henDayProduction × 7)   [hen-weeks of laying capacity]
 *   eggsRequired = eggsSet                            [same quantity from the hens' side]
 *
 * The eggCollectionLeadWeeks lag accounts for collection, transport, and grading
 * before the eggs reach the hatchery.
 */
function step3_PsLayingHens(
  hatcheryEggsSetMap: WMap,
  a: BioChainAssumptions,
): { hensMap: WMap; eggsMap: WMap } {
  const hensMap: WMap = new Map();
  const eggsMap: WMap = new Map();
  for (const [w, eggs] of hatcheryEggsSetMap) {
    const layingWeek = w - a.eggCollectionLeadWeeks;
    acc(hensMap, layingWeek, eggs / (a.henDayProduction * 7));
    acc(eggsMap, layingWeek, eggs);
  }
  return { hensMap, eggsMap };
}

/**
 * Step 4 — AWP PS Laying → AWP PS Rearing DOC placement.
 *
 * KEY INSIGHT: A single PS cohort placed once lays eggs continuously for
 * psLayingPeakWeeks (≈40 weeks). The backward chain must only generate a NEW
 * placement event when the required active flock GROWS beyond what existing
 * cohorts can cover — NOT one placement per catching week.
 *
 * Algorithm:
 *   1. Walk laying weeks in ascending order.
 *   2. Expire any cohort whose laying period has ended
 *      (startLayingWeek + psLayingPeakWeeks ≤ current week).
 *   3. If the running active-hen total < the week's requirement, place enough
 *      additional DOC (psRearingWeeks earlier) to cover the shortfall.
 *
 * For a flat 26-week catching plan this yields ONE placement event; for a
 * ramp-up it yields incremental events; for a plan longer than
 * psLayingPeakWeeks it also generates a replacement event when the first
 * cohort ages out.
 */
function step4_PsRearingDoc(
  psLayingHensMap: WMap,
  a: BioChainAssumptions,
): WMap {
  const m: WMap = new Map();
  const sortedWeeks = [...psLayingHensMap.keys()].sort((wa, wb) => wa - wb);

  // cohorts: laying-start week → pullets transferred to laying (after rearing)
  const cohorts = new Map<number, number>();

  for (const w of sortedWeeks) {
    const needed = psLayingHensMap.get(w)!;

    // Expire cohorts whose laying period has ended
    for (const [start] of cohorts) {
      if (w >= start + a.psLayingPeakWeeks) cohorts.delete(start);
    }

    // Sum available hens from all still-active cohorts
    let available = 0;
    for (const h of cohorts.values()) available += h;

    // Only place new DOC when required flock exceeds available capacity
    const marginal = needed - available;
    if (marginal > 0) {
      acc(m, w - a.psRearingWeeks, marginal / (1 - a.psRearingMortality));
      cohorts.set(w, marginal); // record this cohort's pullet contribution
    }
  }
  return m;
}

/**
 * Step 5 — AWP PS Rearing → GP Hatchery PS DOC production.
 *
 * `doc` (from step 4) = PS DOC delivered to AWP = the AWP portion of GP hatch output.
 * gpSelfreplacementRatio = fraction of the TOTAL GP hatch that GP keeps for
 * its own GP flock replacement (the rest goes to AWP).
 *
 * Therefore:
 *   totalHatch    = doc / (1 − gpSelfreplacementRatio)    [total DOC the GP hatchery produces]
 *   psDOCForAwp   = doc                                   [= totalHatch × (1 − ratio)]
 *   gpSelfReplace = totalHatch × gpSelfreplacementRatio   [kept by GP]
 *   gpEggsSet     = totalHatch / hatchabilityGp           [GP fertile eggs to set]
 *
 * Using totalHatch (not just doc) for the eggs calculation ensures the GP
 * Laying flock is sized to cover BOTH the AWP delivery AND GP self-replacement.
 */
function step5_GpHatchery(
  psRearingDocMap: WMap,
  a: BioChainAssumptions,
): { psDocMap: WMap; selfReplaceMap: WMap; eggsSetMap: WMap } {
  const psDocMap: WMap = new Map();
  const selfReplaceMap: WMap = new Map();
  const eggsSetMap: WMap = new Map();

  for (const [w, doc] of psRearingDocMap) {
    const gpHatchWeek    = w - a.gpHatcheryToAwpDeliveryWeeks;
    const gpEggsSetWeek  = gpHatchWeek - a.incubationWeeks;

    // Total GP hatch output required (AWP portion + GP self-replacement)
    const totalHatch = doc / (1 - a.gpSelfreplacementRatio);

    acc(psDocMap,      gpHatchWeek,   doc);
    acc(selfReplaceMap, gpHatchWeek,  totalHatch * a.gpSelfreplacementRatio);
    acc(eggsSetMap,    gpEggsSetWeek, totalHatch / a.hatchabilityGp);
  }

  return { psDocMap, selfReplaceMap, eggsSetMap };
}

/**
 * Step 6 — GP Hatchery eggs → GP Laying hen requirement.
 *
 * Mirrors Step 3 but using GP laying parameters.
 * For each GP eggs-set week W:
 *   gp_laying_week = W - eggCollectionLeadWeeks   [reuses same lead-time param]
 *   activeHens     = gpEggsSet / (gpHenDayProduction × 7)
 */
function step6_GpLayingHens(
  gpHatchEggsSetMap: WMap,
  a: BioChainAssumptions,
): { hensMap: WMap; eggsMap: WMap } {
  const hensMap: WMap = new Map();
  const eggsMap: WMap = new Map();
  for (const [w, eggs] of gpHatchEggsSetMap) {
    const layingWeek = w - a.eggCollectionLeadWeeks;
    acc(hensMap, layingWeek, eggs / (a.gpHenDayProduction * 7));
    acc(eggsMap, layingWeek, eggs);
  }
  return { hensMap, eggsMap };
}

/**
 * Step 7 — GP Laying → GP Rearing DOC placement.
 *
 * Mirrors Step 4 (same marginal/cohort-aware logic) but uses GP rearing
 * and GP laying-peak parameters.
 *
 * A GP cohort placed once provides laying hens for gpLayingPeakWeeks (≈40 wks).
 * New GP DOC placements are only triggered when the required GP laying flock
 * GROWS beyond existing cohort capacity, or when an older cohort ages out.
 */
function step7_GpRearingDoc(
  gpLayingHensMap: WMap,
  a: BioChainAssumptions,
): WMap {
  const m: WMap = new Map();
  const sortedWeeks = [...gpLayingHensMap.keys()].sort((wa, wb) => wa - wb);

  // cohorts: laying-start week → GP pullets transferred to laying
  const cohorts = new Map<number, number>();

  for (const w of sortedWeeks) {
    const needed = gpLayingHensMap.get(w)!;

    // Expire cohorts whose GP laying period has ended
    for (const [start] of cohorts) {
      if (w >= start + a.gpLayingPeakWeeks) cohorts.delete(start);
    }

    // Sum available GP hens from active cohorts
    let available = 0;
    for (const h of cohorts.values()) available += h;

    // Only place new GP DOC when required flock exceeds available capacity
    const marginal = needed - available;
    if (marginal > 0) {
      acc(m, w - a.gpRearingWeeks, marginal / (1 - a.gpRearingMortality));
      cohorts.set(w, marginal);
    }
  }
  return m;
}

// ─── Master export ────────────────────────────────────────────────────────────

/**
 * Computes the full upstream biological supply chain from the Catching Plan.
 *
 * @param catchingPlan  Weekly broiler catching requirements (from AWP pipeline).
 * @param assumptions   Editable biological parameters; defaults in constants.ts.
 * @returns BioChainResult — one typed array per stage, sorted by week ascending.
 *          Weeks < 1 are historical (before plan start); weeks > N are beyond horizon.
 */
export function computeBioChain(
  catchingPlan: CatchingPlanWeek[],
  assumptions: BioChainAssumptions,
): BioChainResult {
  const a = assumptions;

  // Empty plan → empty result
  if (catchingPlan.length === 0) {
    return {
      catchingPlan: [],
      awpBroiler: [], awpHatchery: [], awpPsLaying: [], awpPsRearing: [],
      gpHatchery: [], gpLaying: [], gpRearing: [],
    };
  }

  // Week-to-date anchor (for interpolating dates on negative weeks)
  const anchorWeek = catchingPlan[0].week;
  const anchorDate = catchingPlan[0].weekStart;
  const wsd = (w: number) => isoForWeek(w, anchorWeek, anchorDate);

  // ── Run the 7 backward stages ─────────────────────────────────────────────
  const broilerDocMap                                    = step1_AwpBroilerDoc(catchingPlan, a);
  const hatcheryEggsSetMap                               = step2_HatcheryEggsSet(broilerDocMap, a);
  const { hensMap: psLayingHensMap, eggsMap: psLayingEggsMap } = step3_PsLayingHens(hatcheryEggsSetMap, a);
  const psRearingDocMap                                  = step4_PsRearingDoc(psLayingHensMap, a);
  const { psDocMap: gpHatchPsDocMap,
          selfReplaceMap: gpHatchSelfReplaceMap,
          eggsSetMap: gpHatchEggsSetMap }                = step5_GpHatchery(psRearingDocMap, a);
  const { hensMap: gpLayingHensMap, eggsMap: gpLayingEggsMap } = step6_GpLayingHens(gpHatchEggsSetMap, a);
  const gpRearingDocMap                                  = step7_GpRearingDoc(gpLayingHensMap, a);

  // ── Assemble typed result arrays ──────────────────────────────────────────

  // AWP Broiler: one row per DOC-placement week
  const awpBroiler: AwpBroilerWeek[] = sortedEntries(broilerDocMap).map(([w, doc]) => ({
    week:         w,
    weekStart:    wsd(w),
    docPlaced:    Math.round(doc),
    catchingWeek: w + a.broilerGrowoutWeeks,
  }));

  // AWP Hatchery: union of eggs-set weeks and DOC-output weeks
  // This gives a unified view: "what's going in and what's coming out this week"
  const hatcheryWeekSet = new Set([...hatcheryEggsSetMap.keys(), ...broilerDocMap.keys()]);
  const awpHatchery: AwpHatcheryWeek[] = [...hatcheryWeekSet]
    .sort((wa, wb) => wa - wb)
    .map((w) => ({
      week:      w,
      weekStart: wsd(w),
      eggsSet:   Math.round(hatcheryEggsSetMap.get(w) ?? 0),
      docOutput: Math.round(broilerDocMap.get(w) ?? 0),
    }));

  // AWP PS Laying: one row per laying-active week
  const awpPsLaying: AwpPsLayingWeek[] = sortedEntries(psLayingHensMap).map(([w, hens]) => ({
    week:         w,
    weekStart:    wsd(w),
    activeHens:   Math.round(hens),
    eggsRequired: Math.round(psLayingEggsMap.get(w) ?? 0),
  }));

  // AWP PS Rearing: one row per DOC-placement week
  const awpPsRearing: AwpPsRearingWeek[] = sortedEntries(psRearingDocMap).map(([w, doc]) => ({
    week:            w,
    weekStart:       wsd(w),
    docPlaced:       Math.round(doc),
    pulletsToLaying: Math.round(doc * (1 - a.psRearingMortality)),
  }));

  // GP Hatchery: one row per GP hatch / PS DOC production week
  // gpEggsSet for a given hatch week = eggsSetMap[hatch_week - incubationWeeks]
  const gpHatchery: GpHatcheryWeek[] = sortedEntries(gpHatchPsDocMap).map(([w, doc]) => ({
    week:            w,
    weekStart:       wsd(w),
    gpEggsSet:       Math.round(gpHatchEggsSetMap.get(w - a.incubationWeeks) ?? 0),
    psDOCForAwp:     Math.round(doc),
    gpSelfReplaceDOC: Math.round(gpHatchSelfReplaceMap.get(w) ?? 0),
  }));

  // GP Laying: one row per GP laying-active week
  const gpLaying: GpLayingWeek[] = sortedEntries(gpLayingHensMap).map(([w, hens]) => ({
    week:         w,
    weekStart:    wsd(w),
    activeHens:   Math.round(hens),
    eggsProduced: Math.round(gpLayingEggsMap.get(w) ?? 0),
  }));

  // GP Rearing: one row per GP DOC-placement week
  const gpRearing: GpRearingWeek[] = sortedEntries(gpRearingDocMap).map(([w, doc]) => ({
    week:            w,
    weekStart:       wsd(w),
    docPlaced:       Math.round(doc),
    pulletsToLaying: Math.round(doc * (1 - a.gpRearingMortality)),
  }));

  return {
    catchingPlan,
    awpBroiler,
    awpHatchery,
    awpPsLaying,
    awpPsRearing,
    gpHatchery,
    gpLaying,
    gpRearing,
  };
}

// ─── Aggregation helpers (used by diagram totals) ─────────────────────────────

/** Sum a numeric field across all rows in a stage array. */
export function stageTotal<T extends Record<string, unknown>>(
  rows: T[],
  field: keyof T,
): number {
  return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

/** Total lead time (weeks) from GP Rearing DOC placement to broiler catching. */
export function totalLeadWeeks(a: BioChainAssumptions): number {
  return (
    a.gpRearingWeeks              // GP rearing → GP laying
    + a.eggCollectionLeadWeeks    // GP laying → GP hatchery
    + a.incubationWeeks           // GP incubation → PS DOC
    + a.gpHatcheryToAwpDeliveryWeeks  // GP delivery → AWP PS Rearing
    + a.psRearingWeeks            // AWP PS rearing → AWP PS laying
    + a.eggCollectionLeadWeeks    // AWP PS laying → AWP hatchery
    + a.incubationWeeks           // AWP incubation → Broiler DOC
    + a.broilerGrowoutWeeks       // Broiler grow-out → catching
  );
}

// ─── GP Flock Fleet — forward supply calculation ──────────────────────────────

/**
 * Computes weekly GP fertile-egg supply from the actual GP flock fleet.
 *
 * Each flock:
 *   • Is in rearing for `gpRearingWeeks` weeks (= the lay-start age).
 *   • Lays from age `gpRearingWeeks` to age `gpLayEndAgeWeeks`.
 *   • At lay-start: femalesAlive = femaleCount × (1 − gpRearingMortality).
 *   • During laying: femalesAlive decays weekly by gpLayingMortWeekly.
 *   • Eggs per week = femalesAlive × gpHenDayProduction × 7 × gpSettableRatio.
 *
 * @param flocks     The fleet register from Zustand.
 * @param a          Current biological assumptions.
 * @param weekRange  Plan-relative week indices to evaluate.
 * @param anchorWeek One known week index (used to compute ISO dates).
 * @param anchorDate ISO date for anchorWeek.
 *
 * @returns
 *   supplyByWeek  — Map<weekIndex, totalSettableEggs> (all flocks summed).
 *   flockWeekRows — Per-flock per-week detail rows for the expanded table.
 */
export function computeGpFlockProduction(
  flocks: BioChainGpFlock[],
  a: BioChainAssumptions,
  weekRange: number[],
  anchorWeek: number,
  anchorDate: string,
): { supplyByWeek: Map<number, number>; flockWeekRows: GpFlockWeekRow[] } {
  const supplyByWeek: Map<number, number> = new Map();
  const flockWeekRows: GpFlockWeekRow[] = [];

  const layStartAge = a.gpRearingWeeks;          // = gpLayStartAgeWeeks
  const layEndAge   = a.gpLayEndAgeWeeks;

  for (const flock of flocks) {
    // Females surviving rearing (applied at the moment laying starts)
    const femalesAtLayStart = flock.femaleCount * (1 - a.gpRearingMortality);

    for (const w of weekRange) {
      const ageWeeks = w - flock.placementWeek;  // negative = not yet placed

      let status: GpFlockStatus;
      let femalesAlive = 0;
      let eggsProduced = 0;

      if (ageWeeks < 0) {
        status = "future";
      } else if (ageWeeks < layStartAge) {
        status = "rearing";
        // Linear approximation: survive from femaleCount → femalesAtLayStart over rearing period
        const survivalFraction = 1 - (a.gpRearingMortality * ageWeeks / layStartAge);
        femalesAlive = Math.round(flock.femaleCount * Math.max(0, survivalFraction));
      } else if (ageWeeks < layEndAge) {
        status = "laying";
        const layingWeekIndex = ageWeeks - layStartAge;
        femalesAlive = Math.round(
          femalesAtLayStart * Math.pow(1 - a.gpLayingMortWeekly, layingWeekIndex),
        );
        eggsProduced = Math.round(
          femalesAlive * a.gpHenDayProduction * 7 * a.gpSettableRatio,
        );
        // Accumulate into weekly supply totals
        supplyByWeek.set(w, (supplyByWeek.get(w) ?? 0) + eggsProduced);
      } else {
        status = "completed";
      }

      flockWeekRows.push({
        week:        w,
        weekStart:   isoForWeek(w, anchorWeek, anchorDate),
        flockId:     flock.id,
        flockName:   flock.name,
        ageWeeks,
        status,
        femalesAlive,
        eggsProduced,
      });
    }
  }

  return { supplyByWeek, flockWeekRows };
}

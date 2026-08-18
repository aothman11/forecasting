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
  BioChainResult,
  CatchingPlanWeek,
  AwpBroilerWeek,
  AwpHatcheryWeek,
  AwpPsLayingWeek,
  AwpPsRearingWeek,
  GpHatcheryWeek,
  GpLayingWeek,
  GpRearingWeek,
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
 */
function isoForWeek(
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
 * For each laying week W with `activeHens` required:
 *   rearing_week    = W - psRearingWeeks
 *   docPlaced       = activeHens / (1 - psRearingMortality)
 *
 * The rearing-mortality gross-up: we place more PS DOC than the final laying
 * flock size to offset deaths during the 18-week rearing period.
 */
function step4_PsRearingDoc(
  psLayingHensMap: WMap,
  a: BioChainAssumptions,
): WMap {
  const m: WMap = new Map();
  for (const [w, hens] of psLayingHensMap) {
    acc(m, w - a.psRearingWeeks, hens / (1 - a.psRearingMortality));
  }
  return m;
}

/**
 * Step 5 — AWP PS Rearing → GP Hatchery PS DOC production.
 *
 * For each AWP PS Rearing placement week W with `docPlaced` PS DOC needed:
 *   gp_hatch_week     = W - gpHatcheryToAwpDeliveryWeeks
 *   psDOCForAwp       = docPlaced                               [what GP hatchery produces]
 *   gpSelfReplaceDOC  = psDOCForAwp × gpSelfreplacementRatio   [GP keeps for own GP flock replacement]
 *   gp_eggs_set_week  = gp_hatch_week - incubationWeeks
 *   gpEggsSet         = psDOCForAwp / hatchabilityGp           [GP fertile eggs needed]
 *
 * Note: gpSelfreplacementRatio represents the fraction of GP hatch output
 * redirected for GP rearing (self-replacement). This is tracked as a separate flow.
 */
function step5_GpHatchery(
  psRearingDocMap: WMap,
  a: BioChainAssumptions,
): { psDocMap: WMap; selfReplaceMap: WMap; eggsSetMap: WMap } {
  const psDocMap: WMap = new Map();
  const selfReplaceMap: WMap = new Map();
  const eggsSetMap: WMap = new Map();

  for (const [w, doc] of psRearingDocMap) {
    const gpHatchWeek = w - a.gpHatcheryToAwpDeliveryWeeks;
    const gpEggsSetWeek = gpHatchWeek - a.incubationWeeks;

    acc(psDocMap, gpHatchWeek, doc);
    acc(selfReplaceMap, gpHatchWeek, doc * a.gpSelfreplacementRatio);
    acc(eggsSetMap, gpEggsSetWeek, doc / a.hatchabilityGp);
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
 * Mirrors Step 4 but using GP rearing parameters.
 * For each GP laying week W:
 *   gp_rearing_week = W - gpRearingWeeks
 *   docPlaced       = activeHens / (1 - gpRearingMortality)
 */
function step7_GpRearingDoc(
  gpLayingHensMap: WMap,
  a: BioChainAssumptions,
): WMap {
  const m: WMap = new Map();
  for (const [w, hens] of gpLayingHensMap) {
    acc(m, w - a.gpRearingWeeks, hens / (1 - a.gpRearingMortality));
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

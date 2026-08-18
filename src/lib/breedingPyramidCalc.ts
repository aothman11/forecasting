/**
 * Breeding Pyramid calculation engine.
 *
 * Full chain:
 *   GP flock → weekly settable eggs
 *   → (3-wk incubation) → Cobb PS female DOC
 *   → (PS grow-out ~25 wk) → Cobb PS laying → weekly PS settable eggs
 *   → (3-wk incubation) → Broiler female DOC (Cobb path)
 *
 *   Ross PO (external) → Ross PS females arrive
 *   → (PS grow-out ~25 wk) → Ross PS laying → weekly PS settable eggs
 *   → (3-wk incubation) → Broiler female DOC (Ross path)
 *
 * All functions are pure — no side effects, no store imports.
 */

import type { GpFlock, RossPsOrder, BreedingParams, BreedingWeekRow } from "./types";

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Add `n` days to an ISO date string. */
function addDaysToIso(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
}

/** Number of whole weeks between two ISO dates (may be negative). */
function weeksBetween(fromIso: string, toIso: string): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / msPerWeek;
}

// ─── GP Settable Eggs ─────────────────────────────────────────────────────────

/**
 * Weekly settable eggs from a single GP flock in a given week.
 *
 * Formula (matches the Excel Tab1 formula):
 *   eggs = femaleCount
 *          × (1 - layMortWeekly) ^ layingWeekIndex
 *          × (HDP / 100) × 7
 *          × settableRatio
 *
 * where layingWeekIndex = weeks since laying start (0 = first week of lay).
 * Returns 0 if the flock is pre-lay or past the laying period.
 */
function gpFlockEggsInWeek(
  flock: GpFlock,
  weekStart: string,
  p: BreedingParams,
): number {
  const ageWeeks = weeksBetween(flock.placementDate, weekStart);
  const layingWeekIndex = ageWeeks - flock.layStartWeekAge;
  if (layingWeekIndex < 0 || layingWeekIndex >= p.gpLayingWeeks) return 0;

  return (
    flock.femaleCount *
    Math.pow(1 - p.gpLayMortWeekly, layingWeekIndex) *
    (p.gpHDP / 100) *
    7 *
    p.gpSettableRatio
  );
}

// ─── Cobb PS Eggs from a single cohort ───────────────────────────────────────

/**
 * Settable eggs contributed in plan week W by a Cobb PS cohort that
 * arrived (as DOC) at plan week `arrivalWeek` with `femaleCount` females.
 *
 * Mirrors the same decay formula but using Cobb PS parameters.
 */
function cobbPsCohortEggsAtWeek(
  arrivalWeek: number,
  femaleCount: number,
  targetWeek: number,
  p: BreedingParams,
): number {
  const layStartWeek = arrivalWeek + p.cobbLayStartWeekAge;
  const layingWeekIndex = targetWeek - layStartWeek;
  if (layingWeekIndex < 0 || layingWeekIndex >= p.cobbLayingWeeks) return 0;

  return (
    femaleCount *
    Math.pow(1 - p.cobbLayMortWeekly, layingWeekIndex) *
    (p.cobbHDP / 100) *
    7 *
    p.cobbSettableRatio
  );
}

// ─── Ross PS Eggs from a single order ────────────────────────────────────────

/**
 * Settable eggs contributed in plan week W by a Ross PS order whose
 * PS females arrived at plan week `arrivalWeek`.
 */
function rossPsCohortEggsAtWeek(
  arrivalWeek: number,
  femaleCount: number,
  targetWeek: number,
  p: BreedingParams,
): number {
  const layStartWeek = arrivalWeek + p.rossLayStartWeekAge;
  const layingWeekIndex = targetWeek - layStartWeek;
  if (layingWeekIndex < 0 || layingWeekIndex >= p.rossLayingWeeks) return 0;

  return (
    femaleCount *
    Math.pow(1 - p.rossLayMortWeekly, layingWeekIndex) *
    (p.rossHDP / 100) *
    7 *
    p.rossSettableRatio
  );
}

// ─── Main compute function ────────────────────────────────────────────────────

/**
 * Build the full breeding pyramid schedule.
 * Returns one BreedingWeekRow per plan week (1..planHorizonWeeks).
 */
export function computeBreedingPyramid(
  gpFlocks: GpFlock[],
  rossPsOrders: RossPsOrder[],
  p: BreedingParams,
): BreedingWeekRow[] {
  const { planStartDate, planHorizonWeeks, incubationWeeks } = p;

  // Pre-compute week start dates once
  const weekStarts: string[] = [];
  for (let w = 1; w <= planHorizonWeeks; w++) {
    weekStarts.push(addDaysToIso(planStartDate, (w - 1) * 7));
  }

  // ── Pass 1: GP settable eggs [1..N] ───────────────────────────────────────
  const gpEggs: number[] = new Array(planHorizonWeeks + 1).fill(0); // 1-indexed
  for (let w = 1; w <= planHorizonWeeks; w++) {
    let total = 0;
    for (const flock of gpFlocks) {
      total += gpFlockEggsInWeek(flock, weekStarts[w - 1], p);
    }
    gpEggs[w] = Math.round(total);
  }

  // ── Pass 2: Cobb PS DOC arriving each week [1..N] ─────────────────────────
  //   cobbPsDOC[w] = gpEggs[w - incubationWeeks] × hatchRate × (1 - maleByproductPct)
  //   (female PS DOC only — males are byproduct)
  const cobbPsDOC: number[] = new Array(planHorizonWeeks + 1).fill(0);
  for (let w = 1; w <= planHorizonWeeks; w++) {
    const srcWeek = w - incubationWeeks;
    if (srcWeek >= 1) {
      cobbPsDOC[w] = Math.round(
        gpEggs[srcWeek] * p.gpHatchRate * (1 - p.gpMaleByproductPct),
      );
    }
  }

  // ── Pass 3: Cobb PS settable eggs [1..N] ──────────────────────────────────
  //   For each week W, sum contributions from all PS cohorts that arrived
  //   in weeks 1..(W - cobbLayStartWeekAge).
  const cobbPsEggs: number[] = new Array(planHorizonWeeks + 1).fill(0);
  for (let w = 1; w <= planHorizonWeeks; w++) {
    let total = 0;
    for (let wArr = 1; wArr < w; wArr++) {
      if (cobbPsDOC[wArr] === 0) continue;
      total += cobbPsCohortEggsAtWeek(wArr, cobbPsDOC[wArr], w, p);
    }
    cobbPsEggs[w] = Math.round(total);
  }

  // ── Pass 4: Broiler DOC from Cobb PS [1..N] ───────────────────────────────
  const broilerFromCobb: number[] = new Array(planHorizonWeeks + 1).fill(0);
  for (let w = 1; w <= planHorizonWeeks; w++) {
    const srcWeek = w - incubationWeeks;
    if (srcWeek >= 1) {
      broilerFromCobb[w] = Math.round(
        cobbPsEggs[srcWeek] * p.cobbHatchRate * (1 - p.cobbMaleByproductPct),
      );
    }
  }

  // ── Pass 5: Ross PS eggs [1..N] ───────────────────────────────────────────
  //   Convert each Ross PO arrival date to a plan week index, then sum.
  const rossPsEggs: number[] = new Array(planHorizonWeeks + 1).fill(0);
  for (const order of rossPsOrders) {
    // Plan week index of this order's PS arrival (may be 0 or negative = before plan start)
    const arrivalWeekFloat = weeksBetween(planStartDate, order.arrivalDate);
    const arrivalWeek = Math.round(arrivalWeekFloat) + 1; // convert to 1-based
    for (let w = 1; w <= planHorizonWeeks; w++) {
      rossPsEggs[w] += rossPsCohortEggsAtWeek(arrivalWeek, order.femaleCount, w, p);
    }
  }
  // Round after accumulation
  for (let w = 1; w <= planHorizonWeeks; w++) {
    rossPsEggs[w] = Math.round(rossPsEggs[w]);
  }

  // ── Pass 6: Broiler DOC from Ross PS [1..N] ───────────────────────────────
  const broilerFromRoss: number[] = new Array(planHorizonWeeks + 1).fill(0);
  for (let w = 1; w <= planHorizonWeeks; w++) {
    const srcWeek = w - incubationWeeks;
    if (srcWeek >= 1) {
      broilerFromRoss[w] = Math.round(
        rossPsEggs[srcWeek] * p.rossHatchRate * (1 - p.rossMaleByproductPct),
      );
    }
  }

  // ── Build PO date lookup for Ross orders ──────────────────────────────────
  //   PO must be placed rossPOLeadWeeks before arrival.
  const rossPOByWeek = new Map<
    number,
    { name: string; femaleCount: number; poDate: string; arrivalDate: string }[]
  >();
  for (const order of rossPsOrders) {
    const poDate = addDaysToIso(order.arrivalDate, -p.rossPOLeadWeeks * 7);
    const poWeekFloat = weeksBetween(planStartDate, poDate);
    const poWeek = Math.round(poWeekFloat) + 1;
    if (poWeek >= 1 && poWeek <= planHorizonWeeks) {
      const bucket = rossPOByWeek.get(poWeek) ?? [];
      bucket.push({
        name: order.name,
        femaleCount: order.femaleCount,
        poDate,
        arrivalDate: order.arrivalDate,
      });
      rossPOByWeek.set(poWeek, bucket);
    }
  }

  // ── Assemble rows ─────────────────────────────────────────────────────────
  const rows: BreedingWeekRow[] = [];
  for (let w = 1; w <= planHorizonWeeks; w++) {
    rows.push({
      week: w,
      weekStart: weekStarts[w - 1],
      gpSettableEggs: gpEggs[w],
      cobbPsDOC: cobbPsDOC[w],
      cobbPsEggs: cobbPsEggs[w],
      rossPsEggs: rossPsEggs[w],
      broilerFromCobb: broilerFromCobb[w],
      broilerFromRoss: broilerFromRoss[w],
      totalBroilerDOC: broilerFromCobb[w] + broilerFromRoss[w],
      rossPoOrders: rossPOByWeek.get(w) ?? [],
    });
  }

  return rows;
}

// ─── PO date helper (used by the UI to show "order by" date) ─────────────────

/** Compute the PO issue date for a Ross order given its planned arrival date. */
export function rossPODate(arrivalDate: string, leadWeeks: number): string {
  return addDaysToIso(arrivalDate, -leadWeeks * 7);
}

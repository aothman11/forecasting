/**
 * Default values for the AWP Breeding Pyramid module.
 * All biological parameters sourced from AWP Cobb-500 / Ross-308 flock records.
 */
import type { BreedingParams } from "./types";

export const DEFAULT_BREEDING_PARAMS: BreedingParams = {
  planStartDate: new Date().toISOString().slice(0, 10),
  planHorizonWeeks: 52,

  // ── Incubation ──────────────────────────────────────────────────────────
  incubationWeeks: 3,

  // ── GP Grandparent (Cobb-500) ───────────────────────────────────────────
  gpLayingWeeks: 40,
  gpLayMortWeekly: 0.003,   // 0.3% per week during laying
  gpHDP: 65,                // 65% hen-day production
  gpSettableRatio: 0.85,    // 85% of eggs are settable
  gpHatchRate: 0.78,        // 78% hatch rate
  gpMaleByproductPct: 0.50, // 50% male PS DOC (byproduct / sold separately)

  // ── Cobb PS Parent Stock ────────────────────────────────────────────────
  cobbLayStartWeekAge: 25,  // PS females start laying at 25 weeks of age
  cobbLayingWeeks: 38,
  cobbLayMortWeekly: 0.003,
  cobbHDP: 62,
  cobbSettableRatio: 0.87,
  cobbHatchRate: 0.80,
  cobbMaleByproductPct: 0.50,

  // ── Ross-308 PS Parent Stock (external supplier) ────────────────────────
  rossLayStartWeekAge: 25,
  rossLayingWeeks: 38,
  rossLayMortWeekly: 0.003,
  rossHDP: 60,
  rossSettableRatio: 0.85,
  rossHatchRate: 0.78,
  rossMaleByproductPct: 0.50,

  // ── Ross PO lead time ───────────────────────────────────────────────────
  rossPOLeadWeeks: 52,      // Purchase Order must be placed 52 weeks before arrival
};

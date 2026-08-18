/**
 * AWP Biological Chain — TypeScript interfaces.
 *
 * The chain is computed BACKWARD from the Catching Plan:
 *   CatchingPlan → AwpBroiler → AwpHatchery → AwpPsLaying → AwpPsRearing
 *   → GpHatchery → GpLaying → GpRearing
 *
 * All week indices are 1-based relative to the plan start date.
 * Negative week indices represent historical weeks (before plan start).
 */

// ─── Assumptions ─────────────────────────────────────────────────────────────

export interface BioChainAssumptions {
  // AWP Broiler farms
  broilerGrowoutWeeks: number;        // 6 — weeks from DOC placement to catching
  broilerMortality: number;           // 0.05 — fraction dying during grow-out

  // AWP Hatchery (PS eggs → Broiler DOC)
  hatchabilityPs: number;             // 0.82 — fraction of set eggs that hatch
  incubationWeeks: number;            // 3 — weeks from egg setting to hatch

  // AWP PS Laying farms
  henDayProduction: number;           // 0.68 — eggs per hen per day
  eggCollectionLeadWeeks: number;     // 1 — weeks from laying to hatchery setting
  psLayingPeakWeeks: number;          // 40 — informational: peak laying period length

  // AWP PS Rearing farms
  psRearingWeeks: number;             // 18 — weeks from PS DOC to laying start
  psRearingMortality: number;         // 0.04 — fraction dying during PS rearing

  // GP Hatchery (cross-company, GP fertile eggs → PS DOC)
  hatchabilityGp: number;             // 0.78 — fraction of GP eggs that hatch as PS DOC
  gpHatcheryToAwpDeliveryWeeks: number; // 1 — weeks from GP hatch to AWP farm delivery
  gpSelfreplacementRatio: number;     // 0.20 — fraction of GP hatch used for GP self-replacement

  // GP Laying farms
  gpHenDayProduction: number;         // 0.65 — GP fertile eggs per hen per day
  gpLayingPeakWeeks: number;          // 40 — informational

  // GP Rearing farms
  gpRearingWeeks: number;             // 25 — weeks from GP DOC to GP laying start (= lay-start age)
  gpRearingMortality: number;         // 0.04 — fraction dying during GP rearing

  // GP Flock biology (used in forward supply calculation from actual flocks)
  gpLayEndAgeWeeks: number;           // 60 — age at GP depopulation (35-wk lay period)
  gpSettableRatio: number;            // 0.90 — fraction of GP eggs that are settable
  gpLayingMortWeekly: number;         // 0.003 — weekly mortality during GP laying period
}

// ─── Per-stage weekly rows ────────────────────────────────────────────────────

/** Fixed input — directly from AWP pipeline (LiveBirdWeek + PlantWeek). */
export interface CatchingPlanWeek {
  week: number;
  weekStart: string;         // ISO yyyy-mm-dd
  birds: number;             // harvestableBirds across all plants
  liveWeightKg: number;
  byPlant: Record<string, number>;   // plant key → birds
}

/** AWP Broiler Farms — DOC placed in rearing. */
export interface AwpBroilerWeek {
  week: number;              // DOC placement week
  weekStart: string;
  docPlaced: number;         // gross DOC placed (= catching birds / (1 - mortality))
  catchingWeek: number;      // plan week in which these birds will be caught
}

/**
 * AWP Hatchery — both events per calendar week:
 *   eggsSet  → eggs being loaded into incubator THIS week (→ DOC in week+incubation)
 *   docOutput → DOC coming OUT of incubator THIS week (from eggs set in week-incubation)
 */
export interface AwpHatcheryWeek {
  week: number;
  weekStart: string;
  eggsSet: number;           // PS fertile eggs set in incubator
  docOutput: number;         // broiler DOC hatching and leaving for AWP broiler farms
}

/** AWP PS Laying Farms — hen activity driving egg supply. */
export interface AwpPsLayingWeek {
  week: number;
  weekStart: string;
  activeHens: number;        // PS hens required in lay (hen-weeks)
  eggsRequired: number;      // total PS fertile eggs produced (= activeHens × HDP × 7)
}

/** AWP PS Rearing Farms — PS pullet rearing. */
export interface AwpPsRearingWeek {
  week: number;
  weekStart: string;
  docPlaced: number;         // PS female DOC placed in rearing (gross)
  pulletsToLaying: number;   // PS pullets transferred to laying (= docPlaced × (1-mortality))
}

/** GP Hatchery — cross-company PS DOC production + GP self-replacement. */
export interface GpHatcheryWeek {
  week: number;              // GP hatch / PS DOC delivery week
  weekStart: string;
  gpEggsSet: number;         // GP fertile eggs set 3 weeks earlier to produce this hatch
  psDOCForAwp: number;       // PS female DOC delivered to AWP PS Rearing this week
  gpSelfReplaceDOC: number;  // GP DOC retained for GP self-replacement (→ GP Rearing)
}

/** GP Laying Farms — GP fertile egg production. */
export interface GpLayingWeek {
  week: number;
  weekStart: string;
  activeHens: number;        // GP hens in lay (hen-weeks required)
  eggsProduced: number;      // GP fertile eggs produced
}

/** GP Rearing Farms — GP pullet rearing. */
export interface GpRearingWeek {
  week: number;
  weekStart: string;
  docPlaced: number;         // GP female DOC placed in rearing (gross)
  pulletsToLaying: number;   // GP pullets transferred to GP laying (= docPlaced × (1-mortality))
}

// ─── GP Flock fleet types ─────────────────────────────────────────────────────

/**
 * One GP flock in the fleet register.
 * placementWeek is a plan-relative week index (negative = placed before plan start).
 */
export interface BioChainGpFlock {
  id: string;
  name: string;
  placementWeek: number;    // plan week when this flock was/will be placed
  femaleCount: number;      // females placed (before rearing mortality)
}

export type GpFlockStatus = "future" | "rearing" | "laying" | "completed";

/** Weekly detail row for one flock (used in the flock-level detail table). */
export interface GpFlockWeekRow {
  week: number;
  weekStart: string;
  flockId: string;
  flockName: string;
  ageWeeks: number;
  status: GpFlockStatus;
  femalesAlive: number;
  eggsProduced: number;     // settable eggs this week from this flock
}

/** Weekly supply vs demand gap row at the GP egg level. */
export interface GpEggGapRow {
  week: number;
  weekStart: string;
  activeFlockCount: number;
  gpEggsSupply: number;     // total settable eggs from all active flocks (forward calc)
  gpEggsDemand: number;     // GP eggs required by backward chain
  gap: number;              // supply - demand  (positive = surplus, negative = shortage)
}

// ─── Master result ────────────────────────────────────────────────────────────

export interface BioChainResult {
  catchingPlan:  CatchingPlanWeek[];
  awpBroiler:    AwpBroilerWeek[];
  awpHatchery:   AwpHatcheryWeek[];
  awpPsLaying:   AwpPsLayingWeek[];
  awpPsRearing:  AwpPsRearingWeek[];
  gpHatchery:    GpHatcheryWeek[];
  gpLaying:      GpLayingWeek[];
  gpRearing:     GpRearingWeek[];
}

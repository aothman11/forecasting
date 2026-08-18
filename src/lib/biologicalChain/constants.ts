/**
 * AWP Biological Chain — default assumption values and UI grouping metadata.
 */
import type { BioChainAssumptions, BioChainGpFlock, ProductionCurvePoint } from "./types";

// ─── PS Production Curve (ages 25–64) ────────────────────────────────────────
// 3-segment: ramp (wks 25–30) → peak at 85% (wks 30–35) → decline to 47% (wk 64)
// HDP = total eggs per hen per day (fraction 0–1). Apply psSettableRatio separately.
// Placeholder values — update once AWP confirms actual flock performance records.

export const DEFAULT_PS_PRODUCTION_CURVE: ProductionCurvePoint[] = [
  { ageWeeks: 25, hdp: 0.40 }, // ramp-up start
  { ageWeeks: 26, hdp: 0.56 },
  { ageWeeks: 27, hdp: 0.70 },
  { ageWeeks: 28, hdp: 0.78 },
  { ageWeeks: 29, hdp: 0.83 },
  { ageWeeks: 30, hdp: 0.85 }, // peak
  { ageWeeks: 31, hdp: 0.85 },
  { ageWeeks: 32, hdp: 0.85 },
  { ageWeeks: 33, hdp: 0.85 },
  { ageWeeks: 34, hdp: 0.85 },
  { ageWeeks: 35, hdp: 0.85 },
  { ageWeeks: 36, hdp: 0.84 }, // gentle decline
  { ageWeeks: 37, hdp: 0.83 },
  { ageWeeks: 38, hdp: 0.82 },
  { ageWeeks: 39, hdp: 0.81 },
  { ageWeeks: 40, hdp: 0.80 },
  { ageWeeks: 41, hdp: 0.79 },
  { ageWeeks: 42, hdp: 0.78 },
  { ageWeeks: 43, hdp: 0.77 },
  { ageWeeks: 44, hdp: 0.76 },
  { ageWeeks: 45, hdp: 0.75 },
  { ageWeeks: 46, hdp: 0.74 },
  { ageWeeks: 47, hdp: 0.73 },
  { ageWeeks: 48, hdp: 0.72 },
  { ageWeeks: 49, hdp: 0.71 },
  { ageWeeks: 50, hdp: 0.70 },
  { ageWeeks: 51, hdp: 0.68 },
  { ageWeeks: 52, hdp: 0.66 },
  { ageWeeks: 53, hdp: 0.64 },
  { ageWeeks: 54, hdp: 0.62 },
  { ageWeeks: 55, hdp: 0.60 },
  { ageWeeks: 56, hdp: 0.58 },
  { ageWeeks: 57, hdp: 0.56 },
  { ageWeeks: 58, hdp: 0.54 },
  { ageWeeks: 59, hdp: 0.52 },
  { ageWeeks: 60, hdp: 0.50 },
  { ageWeeks: 61, hdp: 0.50 },
  { ageWeeks: 62, hdp: 0.49 },
  { ageWeeks: 63, hdp: 0.48 },
  { ageWeeks: 64, hdp: 0.47 }, // depop
];
// Weighted average HDP across ages 25–64 ≈ 0.694

// ─── GP Production Curve (ages 24–60) ────────────────────────────────────────
// 3-segment: ramp (wks 24–30) → peak at 81% (wks 30–34) → decline to 42% (wk 60)
// Placeholder values — update once GP confirms actual flock performance records.

export const DEFAULT_GP_PRODUCTION_CURVE: ProductionCurvePoint[] = [
  { ageWeeks: 24, hdp: 0.35 }, // ramp-up start (lay-start age = 24 wks)
  { ageWeeks: 25, hdp: 0.50 },
  { ageWeeks: 26, hdp: 0.62 },
  { ageWeeks: 27, hdp: 0.70 },
  { ageWeeks: 28, hdp: 0.76 },
  { ageWeeks: 29, hdp: 0.79 },
  { ageWeeks: 30, hdp: 0.81 }, // peak
  { ageWeeks: 31, hdp: 0.81 },
  { ageWeeks: 32, hdp: 0.81 },
  { ageWeeks: 33, hdp: 0.81 },
  { ageWeeks: 34, hdp: 0.81 },
  { ageWeeks: 35, hdp: 0.80 }, // gentle decline
  { ageWeeks: 36, hdp: 0.79 },
  { ageWeeks: 37, hdp: 0.78 },
  { ageWeeks: 38, hdp: 0.77 },
  { ageWeeks: 39, hdp: 0.76 },
  { ageWeeks: 40, hdp: 0.75 },
  { ageWeeks: 41, hdp: 0.73 },
  { ageWeeks: 42, hdp: 0.71 },
  { ageWeeks: 43, hdp: 0.69 },
  { ageWeeks: 44, hdp: 0.67 },
  { ageWeeks: 45, hdp: 0.65 },
  { ageWeeks: 46, hdp: 0.63 },
  { ageWeeks: 47, hdp: 0.61 },
  { ageWeeks: 48, hdp: 0.59 },
  { ageWeeks: 49, hdp: 0.57 },
  { ageWeeks: 50, hdp: 0.55 },
  { ageWeeks: 51, hdp: 0.53 },
  { ageWeeks: 52, hdp: 0.51 },
  { ageWeeks: 53, hdp: 0.49 },
  { ageWeeks: 54, hdp: 0.48 },
  { ageWeeks: 55, hdp: 0.47 },
  { ageWeeks: 56, hdp: 0.46 },
  { ageWeeks: 57, hdp: 0.45 },
  { ageWeeks: 58, hdp: 0.44 },
  { ageWeeks: 59, hdp: 0.43 },
  { ageWeeks: 60, hdp: 0.42 }, // depop
];
// Weighted average HDP across ages 24–60 ≈ 0.653

export const DEFAULT_BIO_ASSUMPTIONS: BioChainAssumptions = {
  // AWP Broiler farms
  broilerGrowoutWeeks:           4,     // grow-out = 25.5 days; total cycle = 43 days (incl. cleaning)
  broilerMortality:              0.05,

  // AWP Hatchery (PS eggs → Broiler DOC)
  hatchabilityPs:                0.84,  // confirmed: 84% for both Cobb and Ross at AWP hatchery
  hatcheryCullPct:               0.02,  // 2% of hatched DOC culled at inspection before delivery
  incubationWeeks:               3,

  // AWP PS Laying
  henDayProduction:              0.69,  // average of psProductionCurve; used in manual-override derive
  psSettableRatio:               0.87,  // 87% of total PS eggs laid are settable quality
  eggCollectionLeadWeeks:        1,
  psLayingPeakWeeks:             40,    // full PS laying period (ages 25→64 = 40 wks); drives cohort expiry

  // AWP PS Rearing
  psRearingWeeks:                25,    // = lay-start age (PS hens begin laying at age 25 wks)
  psRearingMortality:            0.08,  // 8% mortality over rearing period
  psMaleRatio:                   0.10,  // 10% of total DOC placed are males (9:1 F:M = Cobb 500 PS standard)

  // PS production curve
  psProductionCurve:             DEFAULT_PS_PRODUCTION_CURVE,

  // GP Hatchery
  hatchabilityGp:                0.80,  // 80% — industry benchmark for GP hatchery (slightly below AWP's 84%)
  gpHatcheryToAwpDeliveryWeeks:  1,
  gpSelfreplacementRatio:        0.20,  // 20% of total GP hatch kept for GP self-replacement

  // GP Laying
  gpHenDayProduction:            0.65,  // average of gpProductionCurve; used in manual-override derive
  gpLayingPeakWeeks:             36,    // full GP laying period (ages 24→60 = 36 wks); drives cohort expiry

  // GP Rearing
  gpRearingWeeks:                24,    // = lay-start age (GP hens begin laying at age 24 wks)
  gpRearingMortality:            0.14,  // 14% mortality over GP rearing period

  // GP Flock biology — used in forward supply calculation
  gpLayEndAgeWeeks:              60,    // depop age (36-wk laying period: 24→60 wks)
  gpSettableRatio:               0.85,  // 85% of GP eggs laid are settable (covers PS DOC + GP self-replace)
  gpLayingMortWeekly:            0.003, // weekly mortality during laying (~10% over 36 wks)

  // GP production curve
  gpProductionCurve:             DEFAULT_GP_PRODUCTION_CURVE,
};

// ─── UI grouping metadata (used by AssumptionsPanel) ─────────────────────────

export interface AssumptionField {
  key: keyof BioChainAssumptions;
  label: string;
  labelAr: string;
  unit: string;
  step: number;
  min: number;
  max: number;
}

export interface AssumptionGroup {
  id: string;
  title: string;
  titleAr: string;
  company: "AWP" | "GP";
  color: string;   // tailwind class fragment
  fields: AssumptionField[];
}

export const ASSUMPTION_GROUPS: AssumptionGroup[] = [
  {
    id: "awpBroiler",
    title: "AWP Broiler Farms",
    titleAr: "مزارع الدجاج اللاحم",
    company: "AWP",
    color: "green",
    fields: [
      { key: "broilerGrowoutWeeks",  label: "Grow-out Period",     labelAr: "فترة التربية",          unit: "weeks",   step: 1,    min: 1,    max: 16    },
      { key: "broilerMortality",     label: "Mortality Rate",       labelAr: "نسبة النفوق",           unit: "decimal", step: 0.01, min: 0,    max: 0.2   },
    ],
  },
  {
    id: "awpHatchery",
    title: "AWP Hatchery (PS Eggs)",
    titleAr: "مفرخة AWP (بيض الأمهات)",
    company: "AWP",
    color: "green",
    fields: [
      { key: "hatchabilityPs",   label: "Hatchability",         labelAr: "نسبة الفقس",            unit: "decimal", step: 0.01, min: 0.5,  max: 1   },
      { key: "hatcheryCullPct",  label: "Hatchery Cull %",      labelAr: "نسبة الإتلاف في المفرخة", unit: "decimal", step: 0.01, min: 0,    max: 0.1 },
      { key: "incubationWeeks",  label: "Incubation Period",    labelAr: "فترة الحضانة",          unit: "weeks",   step: 1,    min: 1,    max: 5   },
    ],
  },
  {
    id: "awpPsLaying",
    title: "AWP PS Laying Farms",
    titleAr: "مزارع وضع الأمهات",
    company: "AWP",
    color: "green",
    fields: [
      { key: "henDayProduction",       label: "Avg HDP (curve avg)",  labelAr: "متوسط إنتاج اليوم",     unit: "eggs/hen/day", step: 0.01, min: 0.3, max: 1   },
      { key: "psSettableRatio",        label: "Settable Egg Ratio",   labelAr: "نسبة البيض القابل للتفريخ", unit: "decimal", step: 0.01, min: 0.7, max: 1   },
      { key: "eggCollectionLeadWeeks", label: "Egg Collection Lead",  labelAr: "فترة تجميع البيض",      unit: "weeks",   step: 1,    min: 0,   max: 4   },
      { key: "psLayingPeakWeeks",      label: "Full Laying Period",   labelAr: "فترة الوضع الكاملة",    unit: "weeks",   step: 1,    min: 10,  max: 60  },
    ],
  },
  {
    id: "awpPsRearing",
    title: "AWP PS Rearing Farms",
    titleAr: "مزارع تربية الأمهات",
    company: "AWP",
    color: "green",
    fields: [
      { key: "psRearingWeeks",     label: "Rearing Period (= Lay-Start Age)", labelAr: "فترة التربية (= سن بدء الوضع)", unit: "weeks",   step: 1,    min: 18,  max: 35  },
      { key: "psRearingMortality", label: "Rearing Mortality",                labelAr: "نسبة النفوق في التربية",         unit: "decimal", step: 0.01, min: 0,   max: 0.2 },
      { key: "psMaleRatio",        label: "Male DOC Ratio",                   labelAr: "نسبة ذكور الكتاكيت",             unit: "decimal", step: 0.01, min: 0,   max: 0.2 },
    ],
  },
  {
    id: "gpHatchery",
    title: "GP Hatchery (Cross-Company)",
    titleAr: "مفرخة GP (بين الشركات)",
    company: "GP",
    color: "gold",
    fields: [
      { key: "hatchabilityGp",                 label: "Hatchability",            labelAr: "نسبة الفقس",          unit: "decimal", step: 0.01, min: 0.5, max: 1   },
      { key: "gpHatcheryToAwpDeliveryWeeks",   label: "Delivery Lead Time",      labelAr: "وقت التسليم",         unit: "weeks",   step: 1,    min: 0,   max: 6   },
      { key: "gpSelfreplacementRatio",         label: "Self-Replacement Ratio",  labelAr: "نسبة الاستبدال الذاتي", unit: "decimal", step: 0.01, min: 0, max: 0.5 },
    ],
  },
  {
    id: "gpLaying",
    title: "GP Laying Farms",
    titleAr: "مزارع وضع GP",
    company: "GP",
    color: "gold",
    fields: [
      { key: "gpHenDayProduction",  label: "Hen-Day Production",    labelAr: "إنتاج اليوم / دجاجة",  unit: "eggs/hen/day", step: 0.01, min: 0.3, max: 1    },
      { key: "gpLayingPeakWeeks",   label: "Full Laying Period",    labelAr: "فترة الوضع الكاملة",  unit: "weeks",        step: 1,    min: 10,  max: 60   },
      { key: "gpLayEndAgeWeeks",    label: "Depop Age",             labelAr: "عمر الإزالة",           unit: "weeks",        step: 1,    min: 40,  max: 80   },
      { key: "gpSettableRatio",     label: "Settable Egg Ratio",    labelAr: "نسبة البيض القابل",     unit: "decimal",      step: 0.01, min: 0.7, max: 1    },
      { key: "gpLayingMortWeekly",  label: "Weekly Laying Mort.",   labelAr: "نفوق أسبوعي خلال الوضع", unit: "decimal",   step: 0.001,min: 0,   max: 0.02 },
    ],
  },
  {
    id: "gpRearing",
    title: "GP Rearing Farms",
    titleAr: "مزارع تربية GP",
    company: "GP",
    color: "gold",
    fields: [
      { key: "gpRearingWeeks",      label: "Rearing Period (= Lay-Start Age)", labelAr: "فترة التربية (= سن بدء الوضع)", unit: "weeks",   step: 1,    min: 18, max: 36  },
      { key: "gpRearingMortality",  label: "Mortality Rate",                   labelAr: "نسبة النفوق",                   unit: "decimal", step: 0.01, min: 0,  max: 0.2 },
    ],
  },
];

// ─── Default GP Flock Fleet (9 flocks: 5 laying + 4 rearing at plan W1) ──────
//
// Fleet cycle: ~7-week placement interval (36-wk laying period / 5 flocks ≈ 7 wks/cycle).
// Lay-start age = 24 wks; depop age = 60 wks; laying period = 24→60 = 36 wks.
// At plan week 1:
//   Laying (age 24-60):  Flock 1 (age 25), 2 (32), 3 (39), 4 (46), 5 (53)
//   Rearing (age 0-24):  Flock 6 (18), 7 (11), 8 (4), 9 (future W4)
//
// placementWeek = plan week when the flock was/will be placed.
// Age at plan W1 = 1 − placementWeek.

export const DEFAULT_BIO_CHAIN_GP_FLOCKS: BioChainGpFlock[] = [
  { id: "gp-a", name: "GP Flock 1", placementWeek: -24, femaleCount: 12198 }, // age 25 → just started laying
  { id: "gp-b", name: "GP Flock 2", placementWeek: -31, femaleCount: 12198 }, // age 32
  { id: "gp-c", name: "GP Flock 3", placementWeek: -38, femaleCount: 12198 }, // age 39
  { id: "gp-d", name: "GP Flock 4", placementWeek: -45, femaleCount: 12198 }, // age 46
  { id: "gp-e", name: "GP Flock 5", placementWeek: -52, femaleCount: 12198 }, // age 53 (7 wks to depop)
  { id: "gp-f", name: "GP Flock 6", placementWeek: -17, femaleCount: 12198 }, // age 18 → starts laying W8
  { id: "gp-g", name: "GP Flock 7", placementWeek: -10, femaleCount: 12198 }, // age 11 → starts laying W15
  { id: "gp-h", name: "GP Flock 8", placementWeek:  -3, femaleCount: 12198 }, // age  4 → starts laying W22
  { id: "gp-i", name: "GP Flock 9", placementWeek:   4, femaleCount: 12198 }, // future  → starts laying W29
];

// ─── Bilingual stage labels ───────────────────────────────────────────────────

export const STAGE_LABELS: Record<string, { en: string; ar: string }> = {
  catchingPlan: { en: "Catching Plan",         ar: "خطة الإمساك"              },
  awpBroiler:   { en: "AWP Broiler Farms",     ar: "مزارع لاحم AWP"           },
  awpHatchery:  { en: "AWP Hatchery",          ar: "مفرخة AWP"                },
  awpPsLaying:  { en: "AWP PS Laying Farms",   ar: "مزارع وضع الأمهات AWP"    },
  awpPsRearing: { en: "AWP PS Rearing Farms",  ar: "مزارع تربية الأمهات AWP"  },
  gpHatchery:   { en: "GP Hatchery",           ar: "مفرخة GP"                 },
  gpLaying:     { en: "GP Laying Farms",       ar: "مزارع وضع GP"             },
  gpRearing:    { en: "GP Rearing Farms",      ar: "مزارع تربية GP"           },
};

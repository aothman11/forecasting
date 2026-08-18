/**
 * AWP Biological Chain — default assumption values and UI grouping metadata.
 */
import type { BioChainAssumptions, BioChainGpFlock } from "./types";

export const DEFAULT_BIO_ASSUMPTIONS: BioChainAssumptions = {
  // AWP Broiler farms
  broilerGrowoutWeeks:           6,
  broilerMortality:              0.05,

  // AWP Hatchery (PS)
  hatchabilityPs:                0.82,
  incubationWeeks:               3,

  // AWP PS Laying
  henDayProduction:              0.68,
  eggCollectionLeadWeeks:        1,
  psLayingPeakWeeks:             40,

  // AWP PS Rearing
  psRearingWeeks:                18,
  psRearingMortality:            0.04,

  // GP Hatchery
  hatchabilityGp:                0.78,
  gpHatcheryToAwpDeliveryWeeks:  1,
  gpSelfreplacementRatio:        0.20,

  // GP Laying
  gpHenDayProduction:            0.65,
  gpLayingPeakWeeks:             40,

  // GP Rearing
  gpRearingWeeks:                25,    // = lay-start age (hens begin laying at 25 wks)
  gpRearingMortality:            0.04,

  // GP Flock biology — used in forward supply calculation
  gpLayEndAgeWeeks:              60,    // depop age (35-wk laying period: 25→60 wks)
  gpSettableRatio:               0.90,  // fraction of GP eggs that are settable
  gpLayingMortWeekly:            0.003, // weekly mortality during laying (~10% over 35 wks)
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
      { key: "hatchabilityPs",          label: "Hatchability",          labelAr: "نسبة الفقس",            unit: "decimal", step: 0.01, min: 0.5, max: 1   },
      { key: "incubationWeeks",         label: "Incubation Period",      labelAr: "فترة الحضانة",          unit: "weeks",   step: 1,    min: 1,   max: 5   },
    ],
  },
  {
    id: "awpPsLaying",
    title: "AWP PS Laying Farms",
    titleAr: "مزارع وضع الأمهات",
    company: "AWP",
    color: "green",
    fields: [
      { key: "henDayProduction",        label: "Hen-Day Production",     labelAr: "إنتاج اليوم / دجاجة",  unit: "eggs/hen/day", step: 0.01, min: 0.3, max: 1 },
      { key: "eggCollectionLeadWeeks",  label: "Egg Collection Lead",    labelAr: "فترة تجميع البيض",     unit: "weeks",   step: 1,    min: 0,   max: 4   },
      { key: "psLayingPeakWeeks",       label: "Peak Laying Period",     labelAr: "فترة الذروة للوضع",    unit: "weeks",   step: 1,    min: 10,  max: 60  },
    ],
  },
  {
    id: "awpPsRearing",
    title: "AWP PS Rearing Farms",
    titleAr: "مزارع تربية الأمهات",
    company: "AWP",
    color: "green",
    fields: [
      { key: "psRearingWeeks",          label: "Rearing Period",         labelAr: "فترة التربية",          unit: "weeks",   step: 1,    min: 10,  max: 30  },
      { key: "psRearingMortality",      label: "Mortality Rate",         labelAr: "نسبة النفوق",           unit: "decimal", step: 0.01, min: 0,   max: 0.2 },
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
      { key: "gpLayingPeakWeeks",   label: "Peak Laying Period",    labelAr: "فترة الذروة للوضع",    unit: "weeks",        step: 1,    min: 10,  max: 60   },
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
// Fleet cycle: 7-week placement interval (35-wk laying period / 5 flocks = 7 wks/cycle).
// At plan week 1:
//   Laying (age 25-60):  A(25), B(32), C(39), D(46), E(53)
//   Rearing (age 0-25):  F(18), G(11), H(4), I(future, placed W4)
//
// placementWeek = plan week when the flock was/will be placed.
// Age at plan W1 = 1 − placementWeek.

export const DEFAULT_BIO_CHAIN_GP_FLOCKS: BioChainGpFlock[] = [
  { id: "gp-a", name: "GP Flock A", placementWeek: -24, femaleCount: 12198 }, // age 25 → just started laying
  { id: "gp-b", name: "GP Flock B", placementWeek: -31, femaleCount: 12198 }, // age 32
  { id: "gp-c", name: "GP Flock C", placementWeek: -38, femaleCount: 12198 }, // age 39
  { id: "gp-d", name: "GP Flock D", placementWeek: -45, femaleCount: 12198 }, // age 46
  { id: "gp-e", name: "GP Flock E", placementWeek: -52, femaleCount: 12198 }, // age 53 (7 wks to depop)
  { id: "gp-f", name: "GP Flock F", placementWeek: -17, femaleCount: 12198 }, // age 18 → starts laying W8
  { id: "gp-g", name: "GP Flock G", placementWeek: -10, femaleCount: 12198 }, // age 11 → starts laying W15
  { id: "gp-h", name: "GP Flock H", placementWeek:  -3, femaleCount: 12198 }, // age  4 → starts laying W22
  { id: "gp-i", name: "GP Flock I", placementWeek:   4, femaleCount: 12198 }, // future  → starts laying W29
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

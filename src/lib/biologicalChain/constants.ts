/**
 * AWP Biological Chain — default assumption values and UI grouping metadata.
 */
import type { BioChainAssumptions } from "./types";

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
  gpRearingWeeks:                20,
  gpRearingMortality:            0.04,
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
      { key: "gpHenDayProduction",      label: "Hen-Day Production",     labelAr: "إنتاج اليوم / دجاجة",  unit: "eggs/hen/day", step: 0.01, min: 0.3, max: 1 },
      { key: "gpLayingPeakWeeks",       label: "Peak Laying Period",     labelAr: "فترة الذروة للوضع",    unit: "weeks",   step: 1,    min: 10,  max: 60  },
    ],
  },
  {
    id: "gpRearing",
    title: "GP Rearing Farms",
    titleAr: "مزارع تربية GP",
    company: "GP",
    color: "gold",
    fields: [
      { key: "gpRearingWeeks",          label: "Rearing Period",         labelAr: "فترة التربية",          unit: "weeks",   step: 1,    min: 10,  max: 36  },
      { key: "gpRearingMortality",      label: "Mortality Rate",         labelAr: "نسبة النفوق",           unit: "decimal", step: 0.01, min: 0,   max: 0.2 },
    ],
  },
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

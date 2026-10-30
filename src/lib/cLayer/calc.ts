// C.Layer projection engine — pure, side-effect-free. Imports only date-fns and types so it runs
// unchanged in the browser, in route handlers, and under `node --test`.
// Planning only: every quantity here is a projection from planned flocks and breed standards.
import { addDays, format, getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import type {
  LayerBreedStandardRow,
  LayerSkuPackaging,
  LayerFeedStage,
  LayerPlacement,
  LayerPlant,
  LayerPrepOperation,
  LayerSettings,
  LayerSku,
} from "./types";

// ── Business rules (C.Layer Business Process document) ────────────────────────

export const TRANSFER_AGE_RANGE = { min: 10, max: 25 } as const;
export const DEPLETION_AGE_RANGE = { min: 79, max: 100 } as const;
export const MAX_STANDARD_AGE_WEEK = 100;
export const DOCUMENT_START_OF_LAY_WEEK = 20;
export const KPI_AGE_WEEK = 80;

/** The document's feed-stage weeks count completed weeks (start at 0): document week n = age week n + 1. */
export const FEED_STAGE_WEEK_OFFSET = 1;

/**
 * Bird base for hen-day eggs. "average" = (opening + closing birds) / 2; "opening" = birds at the
 * start of the week. Single switch — change here if AWP calculates hen-day on opening birds.
 */
export type HenDayBase = "average" | "opening";
export const HEN_DAY_BASE: HenDayBase = "average";

export type LayerPhase = "rearing" | "laying";

// ── Calendar ──────────────────────────────────────────────────────────────────
// parseISO reads yyyy-mm-dd as local midnight, so adding days never drifts across a timezone.

export function addWeeksIso(mondayIso: string, weeks: number): string {
  return format(addDays(parseISO(mondayIso), weeks * 7), "yyyy-MM-dd");
}

export function isoWeekLabel(dateIso: string): string {
  const d = parseISO(dateIso);
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`;
}

/** Age week 1 is the placement week itself. */
export function ageWeekToCalendarWeek(placementWeekStart: string, ageWeek: number): string {
  return addWeeksIso(placementWeekStart, ageWeek - 1);
}

/** Monday of the ISO week that contains the given date. */
export function mondayOf(dateIso: string): string {
  const d = parseISO(dateIso);
  const offset = (d.getDay() + 6) % 7;
  return format(addDays(d, -offset), "yyyy-MM-dd");
}

/** "2026-W45" → Monday of that ISO week; null when the label is malformed. */
export function isoWeekToMonday(label: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(label.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const monday = addWeeksIso(mondayOf(`${year}-01-04`), week - 1);
  return isoWeekLabel(monday) === `${year}-W${m[2]}` ? monday : null;
}

/** Every Monday from `from` to `to` inclusive. */
export function weekRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let w = mondayOf(from); w <= to; w = addWeeksIso(w, 1)) out.push(w);
  return out;
}

// ── Age rules ─────────────────────────────────────────────────────────────────

export function transferAgeError(age: number): string | null {
  const { min, max } = TRANSFER_AGE_RANGE;
  return Number.isInteger(age) && age >= min && age <= max ? null : `Transfer age must be a whole week from ${min} to ${max}.`;
}

export function depletionAgeError(age: number): string | null {
  const { min, max } = DEPLETION_AGE_RANGE;
  return Number.isInteger(age) && age >= min && age <= max ? null : `Depletion age must be a whole week from ${min} to ${max}.`;
}

/** Feed stage for an age week, after mapping to the document's 0-based week numbering. */
export function feedStageFor(ageWeek: number, stages: Pick<LayerFeedStage, "name" | "fromWeek" | "toWeek">[]): string | null {
  const docWeek = ageWeek - FEED_STAGE_WEEK_OFFSET;
  return stages.find((s) => docWeek >= s.fromWeek && docWeek <= s.toWeek)?.name ?? null;
}

/**
 * Production-order phase of a flock (AWP, plan age weeks): rearing order 1–15 consumes DOC and
 * produces Pullet 14WK; pre-lay order 16–20 (laying farm) consumes Pullet 14WK and produces Laying
 * Pullet 19WK; from 21 the flock is an asset producing the breed's egg material.
 */
export type MaterialStage = "rearing" | "preLay" | "laying";

export const MATERIAL_STAGE_LABELS: Record<MaterialStage, string> = {
  rearing: "Rearing order",
  preLay: "Pre-lay order",
  laying: "Laying (asset)",
};

/** Materials each phase consumes and produces, by breed field. */
export const MATERIAL_STAGE_FLOW: Record<MaterialStage, { consumes: string | null; produces: string }> = {
  rearing: { consumes: "docMaterialNo", produces: "pullet14MaterialNo" },
  preLay: { consumes: "pullet14MaterialNo", produces: "layingPullet19MaterialNo" },
  laying: { consumes: null, produces: "eggMaterialNo" },
};

export interface MaterialStageAges {
  preLayFromAge: number | null;
  assetFromAge: number | null;
}

/** Phase for an age week; null when the phase ages are not both set. */
export function materialStageFor(ageWeek: number, s: MaterialStageAges): MaterialStage | null {
  if (s.preLayFromAge === null || s.assetFromAge === null) return null;
  if (ageWeek >= s.assetFromAge) return "laying";
  if (ageWeek >= s.preLayFromAge) return "preLay";
  return "rearing";
}

/** First age week with hen-day % above 0; null when the standard never lays. */
export function firstLayAgeWeek(standards: LayerBreedStandardRow[]): number | null {
  const sorted = [...standards].sort((a, b) => a.ageWeek - b.ageWeek);
  return sorted.find((r) => r.henDayPct > 0)?.ageWeek ?? null;
}

/** Breed-level notes, e.g. a start of lay that differs from the document's week 20. */
export function breedStandardNotes(standards: LayerBreedStandardRow[]): string[] {
  if (!standards.length) return ["No weekly standard uploaded yet."];
  const first = firstLayAgeWeek(standards);
  if (first === null) return ["The standard never lays (hen-day % is 0 in every week)."];
  return first === DOCUMENT_START_OF_LAY_WEEK
    ? []
    : [`Start of lay is age week ${first}; the business process document states week ${DOCUMENT_START_OF_LAY_WEEK}.`];
}

// ── Flock projection ──────────────────────────────────────────────────────────

export type FlockInput = Pick<
  LayerPlacement,
  | "id"
  | "placementWeekStart"
  | "chicks"
  | "breedId"
  | "rearingFarmId"
  | "rearingHouses"
  | "layingFarmId"
  | "layingHouses"
  | "transferAgeWeek"
  | "depletionAgeWeek"
>;

export interface ProjectionContext {
  defaultTransferAge: number | null;
  defaultDepletionAge: number | null;
  feedStages?: Pick<LayerFeedStage, "name" | "fromWeek" | "toWeek">[];
  materialStageAges?: MaterialStageAges;
  henDayBase?: HenDayBase;
}

export interface FlockWeek {
  ageWeek: number;
  /** Monday of the calendar week (yyyy-mm-dd). */
  weekStart: string;
  isoWeek: string;
  /** null only when no transfer age is known. */
  plant: LayerPlant | null;
  phase: LayerPhase;
  farmId: string | null;
  feedStage: string | null;
  /** null when the material stage ages are not set. */
  materialStage: MaterialStage | null;
  birdsStart: number;
  birdsEnd: number;
  avgBirds: number;
  eggs: number;
}

export interface FlockProjection {
  placementId: string;
  breedId: string;
  rearingFarmId: string;
  layingFarmId: string;
  placementWeekStart: string;
  weeks: FlockWeek[];
  /** Effective ages after defaults; null when unknown (missing setting) or invalid. */
  transferAge: number | null;
  depletionAge: number | null;
  /** Projected pullets moving 1260 → 1250 = birds_end(transfer age − 1), in the transfer week. */
  transferWeekStart: string | null;
  transferBirds: number | null;
  firstLayAgeWeek: number | null;
  /** Live birds at the start of the first week whose eggs are counted (hen-day % > 0 and, when set, from the asset week). */
  hensAtPointOfLay: number | null;
  /** birds_end(depletion age); they leave in the week after depletion. */
  spentHens: number | null;
  depletionWeekStart: string | null;
  /** Σ eggs for age ≤ 80, or null with kpiNote explaining why. */
  eggsTo80: number | null;
  kpiNote: string | null;
  missingSettings: string[];
  warnings: string[];
}

export function projectFlock(flock: FlockInput, standards: LayerBreedStandardRow[], ctx: ProjectionContext): FlockProjection {
  const warnings: string[] = [];
  const missing: string[] = [];

  let transfer = flock.transferAgeWeek ?? ctx.defaultTransferAge;
  if (transfer === null) missing.push("Default transfer age");
  else if (transferAgeError(transfer)) {
    warnings.push(transferAgeError(transfer)!);
    transfer = null;
  }
  let depletion = flock.depletionAgeWeek ?? ctx.defaultDepletionAge;
  if (depletion === null) missing.push("Default depletion age");
  else if (depletionAgeError(depletion)) {
    warnings.push(depletionAgeError(depletion)!);
    depletion = null;
  }

  const base: FlockProjection = {
    placementId: flock.id,
    breedId: flock.breedId,
    rearingFarmId: flock.rearingFarmId,
    layingFarmId: flock.layingFarmId,
    placementWeekStart: flock.placementWeekStart,
    weeks: [],
    transferAge: transfer,
    depletionAge: depletion,
    transferWeekStart: null,
    transferBirds: null,
    firstLayAgeWeek: null,
    hensAtPointOfLay: null,
    spentHens: null,
    depletionWeekStart: null,
    eggsTo80: null,
    kpiNote: null,
    missingSettings: missing,
    warnings,
  };
  if (standards.length === 0) {
    warnings.push("The breed has no weekly standard, so this flock cannot be projected.");
    return { ...base, kpiNote: "No breed standard" };
  }

  const byAge = new Map(standards.map((r) => [r.ageWeek, r]));
  const maxAge = Math.max(...standards.map((r) => r.ageWeek));
  if (depletion !== null && depletion > maxAge) {
    warnings.push(`Depletion age ${depletion} is beyond the breed standard (ends at week ${maxAge}); depletion is not projected.`);
    depletion = null;
  }
  if (transfer !== null && depletion !== null && depletion <= transfer) {
    warnings.push(`Depletion age ${depletion} is not after transfer age ${transfer}; depletion is not projected.`);
    depletion = null;
  }

  const firstLay = firstLayAgeWeek(standards);
  const henDayBase = ctx.henDayBase ?? HEN_DAY_BASE;
  // Eggs count only once the flock is an asset (AWP, 2026-10-29); eggs the breed curve shows earlier are not planned.
  const assetFrom = ctx.materialStageAges?.assetFromAge ?? null;
  const lastAge = depletion ?? maxAge;
  const weeks: FlockWeek[] = [];
  let birds = flock.chicks;

  for (let age = 1; age <= lastAge; age++) {
    const std = byAge.get(age);
    if (!std) {
      warnings.push(`The breed standard has no row for age week ${age}; projection stops at week ${age - 1}.`);
      if (depletion !== null) depletion = null;
      break;
    }
    const birdsStart = birds;
    const birdsEnd = birdsStart * (1 - std.mortalityPct / 100);
    const avgBirds = (birdsStart + birdsEnd) / 2;
    const plant: LayerPlant | null = transfer === null ? null : age < transfer ? "1260" : "1250";
    const phase: LayerPhase =
      plant === "1250" ? "laying" : plant === "1260" ? "rearing" : firstLay !== null && age >= firstLay ? "laying" : "rearing";
    const weekStart = ageWeekToCalendarWeek(flock.placementWeekStart, age);
    weeks.push({
      ageWeek: age,
      weekStart,
      isoWeek: isoWeekLabel(weekStart),
      plant,
      phase,
      farmId: plant === "1250" ? flock.layingFarmId : plant === "1260" ? flock.rearingFarmId : null,
      feedStage: ctx.feedStages ? feedStageFor(age, ctx.feedStages) : null,
      materialStage: ctx.materialStageAges ? materialStageFor(age, ctx.materialStageAges) : null,
      birdsStart,
      birdsEnd,
      avgBirds,
      eggs: assetFrom !== null && age < assetFrom ? 0 : (henDayBase === "opening" ? birdsStart : avgBirds) * (std.henDayPct / 100) * 7,
    });
    birds = birdsEnd;
  }

  const projectedTransfer = transfer !== null && transfer <= weeks.length;
  const last = weeks[weeks.length - 1];
  const depleted = depletion !== null && last?.ageWeek === depletion;

  let eggsTo80: number | null = null;
  let kpiNote: string | null = null;
  if (depletion === null) kpiNote = missing.includes("Default depletion age") ? "Missing setting: depletion age" : "Depletion not projected";
  else if (depletion < KPI_AGE_WEEK) kpiNote = `Depleted at week ${depletion}, before week ${KPI_AGE_WEEK}`;
  else eggsTo80 = weeks.filter((w) => w.ageWeek <= KPI_AGE_WEEK).reduce((s, w) => s + w.eggs, 0);

  return {
    ...base,
    weeks,
    depletionAge: depletion,
    transferWeekStart: projectedTransfer ? weeks[transfer! - 1].weekStart : null,
    transferBirds: projectedTransfer ? weeks[transfer! - 2].birdsEnd : null,
    firstLayAgeWeek: firstLay,
    // Point of lay = first week whose eggs are counted (first hen-day > 0, or the asset week if later).
    hensAtPointOfLay: weeks.find((w) => w.eggs > 0)?.birdsStart ?? null,
    spentHens: depleted ? last.birdsEnd : null,
    depletionWeekStart: depleted ? addWeeksIso(last.weekStart, 1) : null,
    eggsTo80,
    kpiNote,
  };
}

export function projectAll(
  flocks: FlockInput[],
  standardsByBreed: Record<string, LayerBreedStandardRow[]>,
  ctx: ProjectionContext,
): FlockProjection[] {
  return flocks.map((f) => projectFlock(f, standardsByBreed[f.breedId] ?? [], ctx));
}

// ── Settings-dependent outputs ────────────────────────────────────────────────

export const SETTING_LABELS = {
  prToPoDays: "PR → PO lead time",
  poToDeliveryDays: "PO → DOC delivery lead time",
  defaultTransferAge: "Default transfer age",
  defaultDepletionAge: "Default depletion age",
  rejectPct: "Reject %",
  gradeTablePct: "Grade split (90001 / 90002)",
  gradeCPct: "Grade split (90001 / 90002)",
} as const;

export type SettingKey = keyof typeof SETTING_LABELS;

/** Labels of the given settings that are not set yet (deduplicated). */
export function missingSettings(settings: Partial<Record<SettingKey, number | null>>, keys: SettingKey[]): string[] {
  const labels = keys.filter((k) => settings[k] === null || settings[k] === undefined).map((k) => SETTING_LABELS[k]);
  return [...new Set(labels)];
}

export type GradingSettings = Pick<LayerSettings, "rejectPct" | "gradeTablePct" | "gradeCPct">;

export interface GradedEggs {
  rejects: number | null;
  graded: number | null;
  /** 90001 unpacked table egg */
  table: number | null;
  /** 90002 unpacked Grade C egg */
  gradeC: number | null;
}

/** rejects = eggs × reject %; graded = eggs − rejects; 90001 / 90002 = graded × split. */
export function gradeEggs(eggs: number, s: GradingSettings): GradedEggs {
  if (s.rejectPct === null) return { rejects: null, graded: null, table: null, gradeC: null };
  const rejects = eggs * (s.rejectPct / 100);
  const graded = eggs - rejects;
  const split = s.gradeTablePct !== null && s.gradeCPct !== null;
  return {
    rejects,
    graded,
    table: split ? graded * (s.gradeTablePct! / 100) : null,
    gradeC: split ? graded * (s.gradeCPct! / 100) : null,
  };
}

export interface SkuOutput {
  materialNo: string;
  grade: LayerSku["grade"];
  eggs: number | null;
  packs: number | null;
}

/** Packs per SKU = eggs assigned to the SKU (by its grade's pack mix) ÷ pieces per pack. */
export function packSkus(graded: Pick<GradedEggs, "table" | "gradeC">, skus: Pick<LayerSku, "materialNo" | "grade" | "piecesPerPack" | "packMixPct">[]): SkuOutput[] {
  return skus.map((s) => {
    const pool = s.grade === "table" ? graded.table : graded.gradeC;
    const eggs = pool === null || s.packMixPct === null ? null : pool * (s.packMixPct / 100);
    return { materialNo: s.materialNo, grade: s.grade, eggs, packs: eggs === null ? null : eggs / s.piecesPerPack };
  });
}

export interface PurchaseLine {
  placementId: string;
  prDate: string | null;
  poDate: string | null;
  placementWeekStart: string;
  isoWeek: string;
  chicks: number;
  breedId: string;
  rearingFarmId: string;
  prInPast: boolean;
}

/** PO = placement − PO→delivery days; PR = PO − PR→PO days. Sorted by PR date, unknown dates last. */
export function purchaseSchedule(
  flocks: Pick<FlockInput, "id" | "placementWeekStart" | "chicks" | "breedId" | "rearingFarmId">[],
  settings: Pick<LayerSettings, "prToPoDays" | "poToDeliveryDays">,
  today: string,
): { lines: PurchaseLine[]; warnings: string[] } {
  const lines = flocks.map((p): PurchaseLine => {
    const poDate =
      settings.poToDeliveryDays === null
        ? null
        : format(addDays(parseISO(p.placementWeekStart), -settings.poToDeliveryDays), "yyyy-MM-dd");
    const prDate =
      poDate === null || settings.prToPoDays === null
        ? null
        : format(addDays(parseISO(poDate), -settings.prToPoDays), "yyyy-MM-dd");
    return {
      placementId: p.id,
      prDate,
      poDate,
      placementWeekStart: p.placementWeekStart,
      isoWeek: isoWeekLabel(p.placementWeekStart),
      chicks: p.chicks,
      breedId: p.breedId,
      rearingFarmId: p.rearingFarmId,
      prInPast: prDate !== null && prDate < today,
    };
  });
  const key = (l: PurchaseLine) => l.prDate ?? "9999-12-31";
  lines.sort((a, b) => key(a).localeCompare(key(b)) || a.placementWeekStart.localeCompare(b.placementWeekStart));
  const missing = missingSettings(settings, ["poToDeliveryDays", "prToPoDays"]);
  return { lines, warnings: missing.map((m) => `Missing setting: ${m}. Dates that depend on it are blank.`) };
}

// ── Calendar-week aggregation ─────────────────────────────────────────────────

export interface ProjectionFilter {
  /** Matches the farm the birds are on that week (rearing farm in 1260, laying farm in 1250). */
  farmId?: string;
  breedId?: string;
  plant?: LayerPlant;
}

export interface FlockAge {
  placementId: string;
  breedId: string;
  farmId: string | null;
  plant: LayerPlant | null;
  ageWeek: number;
  feedStage: string | null;
  materialStage: MaterialStage | null;
}

export interface CalendarWeekTotals {
  weekStart: string;
  isoWeek: string;
  /** Birds alive at the start of the week, by plant. */
  birds1260: number;
  birds1250: number;
  /** Birds of flocks without a known transfer age (plant unknown). */
  birdsUnassigned: number;
  /** Birds alive at the start of the week by SAP material stage (empty when the stage ages are not set). */
  birdsByStage: Partial<Record<MaterialStage, number>>;
  eggs: number;
  /** Eggs keyed by the breed's egg material (60001 / 60002 / 60005); "?" when the breed has none. */
  eggsByMaterial: Record<string, number>;
  transferBirds: number;
  depletedBirds: number;
  flocks: FlockAge[];
}

const weekMatches = (w: Pick<FlockWeek, "farmId" | "plant">, f: ProjectionFilter) =>
  (!f.farmId || w.farmId === f.farmId) && (!f.plant || w.plant === f.plant);

/**
 * Sums all matching flocks into calendar weeks. With no range, the result spans the first to the
 * last projected week with no gaps.
 */
export function weeklyTotals(
  projections: FlockProjection[],
  filter: ProjectionFilter = {},
  range?: { from: string; to: string },
  eggMaterialByBreed: Record<string, string> = {},
): CalendarWeekTotals[] {
  const included = projections.filter((p) => (!filter.breedId || p.breedId === filter.breedId) && p.weeks.length > 0);
  if (!range) {
    if (included.length === 0) return [];
    const starts = included.map((p) => p.weeks[0].weekStart).sort();
    const ends = included.map((p) => p.depletionWeekStart ?? p.weeks[p.weeks.length - 1].weekStart).sort();
    range = { from: starts[0], to: ends[ends.length - 1] };
  }

  const totals = new Map<string, CalendarWeekTotals>();
  for (const w of weekRange(range.from, range.to)) {
    totals.set(w, {
      weekStart: w,
      isoWeek: isoWeekLabel(w),
      birds1260: 0,
      birds1250: 0,
      birdsUnassigned: 0,
      birdsByStage: {},
      eggs: 0,
      eggsByMaterial: {},
      transferBirds: 0,
      depletedBirds: 0,
      flocks: [],
    });
  }
  for (const p of included) {
    const material = eggMaterialByBreed[p.breedId] || "?";
    for (const wk of p.weeks) {
      const t = totals.get(wk.weekStart);
      if (!t || !weekMatches(wk, filter)) continue;
      if (wk.plant === "1260") t.birds1260 += wk.birdsStart;
      else if (wk.plant === "1250") t.birds1250 += wk.birdsStart;
      else t.birdsUnassigned += wk.birdsStart;
      if (wk.materialStage) t.birdsByStage[wk.materialStage] = (t.birdsByStage[wk.materialStage] ?? 0) + wk.birdsStart;
      t.eggs += wk.eggs;
      if (wk.eggs > 0) t.eggsByMaterial[material] = (t.eggsByMaterial[material] ?? 0) + wk.eggs;
      t.flocks.push({
        placementId: p.placementId,
        breedId: p.breedId,
        farmId: wk.farmId,
        plant: wk.plant,
        ageWeek: wk.ageWeek,
        feedStage: wk.feedStage,
        materialStage: wk.materialStage,
      });
    }
    const tt = p.transferWeekStart ? totals.get(p.transferWeekStart) : undefined;
    if (tt && p.transferBirds !== null && (!filter.farmId || filter.farmId === p.rearingFarmId || filter.farmId === p.layingFarmId)) {
      tt.transferBirds += p.transferBirds;
    }
    const dt = p.depletionWeekStart ? totals.get(p.depletionWeekStart) : undefined;
    if (dt && p.spentHens !== null && (!filter.farmId || filter.farmId === p.layingFarmId) && filter.plant !== "1260") {
      dt.depletedBirds += p.spentHens;
    }
  }
  return [...totals.values()];
}

export interface TransferLine {
  weekStart: string;
  isoWeek: string;
  placementId: string;
  breedId: string;
  fromFarmId: string;
  toFarmId: string;
  ageWeek: number;
  birds: number;
}

/** Projected pullet transfers 1260 → 1250, by week (a planned quantity, not a goods movement). */
export function transferSchedule(projections: FlockProjection[], filter: Omit<ProjectionFilter, "plant"> = {}): TransferLine[] {
  return projections
    .filter((p) => p.transferWeekStart !== null && p.transferBirds !== null && p.transferAge !== null)
    .filter((p) => (!filter.breedId || p.breedId === filter.breedId) && (!filter.farmId || filter.farmId === p.rearingFarmId || filter.farmId === p.layingFarmId))
    .map((p) => ({
      weekStart: p.transferWeekStart!,
      isoWeek: isoWeekLabel(p.transferWeekStart!),
      placementId: p.placementId,
      breedId: p.breedId,
      fromFarmId: p.rearingFarmId,
      toFarmId: p.layingFarmId,
      ageWeek: p.transferAge!,
      birds: p.transferBirds!,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.toFarmId.localeCompare(b.toFarmId));
}

export interface DepletionLine {
  weekStart: string;
  isoWeek: string;
  placementId: string;
  farmId: string;
  breedId: string;
  /** Depletion age — the last laying week; birds leave in the following calendar week. */
  depletionAge: number;
  birds: number;
}

export function depletionSchedule(projections: FlockProjection[], filter: Omit<ProjectionFilter, "plant"> = {}): DepletionLine[] {
  return projections
    .filter((p) => p.depletionWeekStart !== null && p.spentHens !== null && p.depletionAge !== null)
    .filter((p) => (!filter.breedId || p.breedId === filter.breedId) && (!filter.farmId || p.layingFarmId === filter.farmId))
    .map((p) => ({
      weekStart: p.depletionWeekStart!,
      isoWeek: isoWeekLabel(p.depletionWeekStart!),
      placementId: p.placementId,
      farmId: p.layingFarmId,
      breedId: p.breedId,
      depletionAge: p.depletionAge!,
      birds: p.spentHens!,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.farmId.localeCompare(b.farmId));
}

/** Egg output by week × farm × breed — the only shape exposed to roles that may see egg output alone. */
export interface EggCell {
  weekStart: string;
  farmId: string;
  breedId: string;
  eggMaterialNo: string;
  eggs: number;
  minAge: number;
  maxAge: number;
}

export function eggCells(projections: FlockProjection[], eggMaterialByBreed: Record<string, string> = {}): EggCell[] {
  const cells = new Map<string, EggCell>();
  for (const p of projections) {
    for (const wk of p.weeks) {
      if (wk.eggs <= 0) continue;
      const farmId = wk.farmId ?? p.layingFarmId;
      const key = `${wk.weekStart}::${farmId}::${p.breedId}`;
      const c = cells.get(key);
      if (c) {
        c.eggs += wk.eggs;
        c.minAge = Math.min(c.minAge, wk.ageWeek);
        c.maxAge = Math.max(c.maxAge, wk.ageWeek);
      } else {
        cells.set(key, {
          weekStart: wk.weekStart,
          farmId,
          breedId: p.breedId,
          eggMaterialNo: eggMaterialByBreed[p.breedId] || "?",
          eggs: wk.eggs,
          minAge: wk.ageWeek,
          maxAge: wk.ageWeek,
        });
      }
    }
  }
  return [...cells.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

export interface FlockKpi {
  placementId: string;
  breedId: string;
  hensAtPointOfLay: number | null;
  eggsTo80: number | null;
  /** Net = graded eggs (eggs − rejects); needs the reject % setting. */
  netEggsTo80: number | null;
  eggsPerHenHoused: number | null;
  netEggsPerHenHoused: number | null;
  note: string | null;
}

export interface BreedKpi {
  breedId: string;
  flocks: number;
  hensAtPointOfLay: number;
  eggsPerHenHoused: number | null;
  netEggsPerHenHoused: number | null;
}

/**
 * Eggs per hen housed at 80 weeks = Σ eggs (age ≤ 80) ÷ hens at point of lay. Shown as eggs per hen
 * (the document labels it "%", but the formula yields eggs). Per breed, flocks are pooled (Σ eggs ÷ Σ hens).
 */
export function kpis(projections: FlockProjection[], settings: Pick<LayerSettings, "rejectPct">): { flocks: FlockKpi[]; breeds: BreedKpi[] } {
  const net = (eggs: number | null) => (eggs === null || settings.rejectPct === null ? null : eggs * (1 - settings.rejectPct / 100));
  const flocks = projections.map((p): FlockKpi => {
    const hens = p.hensAtPointOfLay;
    const ok = p.eggsTo80 !== null && hens !== null && hens > 0;
    const netEggs = net(p.eggsTo80);
    return {
      placementId: p.placementId,
      breedId: p.breedId,
      hensAtPointOfLay: hens,
      eggsTo80: p.eggsTo80,
      netEggsTo80: netEggs,
      eggsPerHenHoused: ok ? p.eggsTo80! / hens! : null,
      netEggsPerHenHoused: ok && netEggs !== null ? netEggs / hens! : null,
      note: p.kpiNote ?? (hens === null ? "No point of lay in the projection" : null),
    };
  });

  const byBreed = new Map<string, FlockKpi[]>();
  for (const k of flocks) {
    if (k.eggsPerHenHoused === null) continue;
    const list = byBreed.get(k.breedId) ?? [];
    list.push(k);
    byBreed.set(k.breedId, list);
  }
  const breeds = [...byBreed.entries()].map(([breedId, ks]): BreedKpi => {
    const hens = ks.reduce((s, k) => s + k.hensAtPointOfLay!, 0);
    const eggs = ks.reduce((s, k) => s + k.eggsTo80!, 0);
    const netEggs = net(eggs);
    return {
      breedId,
      flocks: ks.length,
      hensAtPointOfLay: hens,
      eggsPerHenHoused: eggs / hens,
      netEggsPerHenHoused: netEggs === null ? null : netEggs / hens,
    };
  });
  return { flocks, breeds };
}

// ── Flock numbers ─────────────────────────────────────────────────────────────

/**
 * Resolves flock numbers for an import: given numbers are kept, blanks get the next running numbers
 * after the highest one already used (existing flocks and the file itself), in file order.
 * Numbers that appear more than once in the file are reported as duplicates.
 */
export function assignFlockNumbers(requested: (number | null)[], existing: number[]): { numbers: number[]; duplicates: number[] } {
  const seen = new Map<number, number>();
  for (const n of requested) if (n !== null) seen.set(n, (seen.get(n) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([n]) => n).sort((a, b) => a - b);
  let next = Math.max(0, ...existing, ...seen.keys()) + 1;
  return { numbers: requested.map((n) => n ?? next++), duplicates };
}

export function nextFlockNumber(existing: (number | null)[]): number {
  return Math.max(0, ...existing.filter((n): n is number => n !== null)) + 1;
}

// ── House preparation ("Cage House Prepared") ─────────────────────────────────

export interface PrepPlan {
  group: string;
  /** Length of the preparation order in days (highest operation day). */
  days: number;
  operations: Pick<LayerPrepOperation, "opCode" | "text" | "day">[];
}

/** Preparation plan per plant from the routing: LR01 → rearing farms (1260), LL01 → laying farms (1250). */
export function prepPlansByPlant(
  ops: Pick<LayerPrepOperation, "group" | "opCode" | "text" | "day">[],
  groupPlant: Record<string, LayerPlant>,
): Partial<Record<LayerPlant, PrepPlan>> {
  const out: Partial<Record<LayerPlant, PrepPlan>> = {};
  for (const op of ops) {
    const plant = groupPlant[op.group];
    if (!plant) continue;
    const plan = (out[plant] ??= { group: op.group, days: 0, operations: [] });
    plan.operations.push({ opCode: op.opCode, text: op.text, day: op.day });
    plan.days = Math.max(plan.days, op.day);
  }
  for (const plan of Object.values(out)) plan!.operations.sort((a, b) => a.day - b.day || a.opCode.localeCompare(b.opCode));
  return out;
}

/** Operation text(s) on a preparation day, e.g. "Rest period" or "Lab · Rest period - Last Day". */
export function prepStepOn(plan: PrepPlan, day: number): string {
  return [...new Set(plan.operations.filter((o) => o.day === day).map((o) => o.text))].join(" · ");
}

const dayDiff = (from: string, to: string) => Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
const addDaysIso = (iso: string, days: number) => format(addDays(parseISO(iso), days), "yyyy-MM-dd");

/** First Monday on or after a date. */
export function nextMondayOnOrAfter(dateIso: string): string {
  const monday = mondayOf(dateIso);
  return monday === dateIso ? monday : addWeeksIso(monday, 1);
}

export interface PrepWindow {
  /** Day 1 of preparation (the Monday the flock leaves the farm). */
  start: string;
  /** Date of the last preparation day. */
  lastDay: string;
  /** The farm can take its next flock from this Monday. */
  freeFrom: string;
}

/** Preparation runs `days` days from the Monday the flock leaves; the farm is free from the next Monday after. */
export function prepWindow(leaveMonday: string, days: number): PrepWindow {
  const lastDay = addDaysIso(leaveMonday, days - 1);
  return { start: leaveMonday, lastDay, freeFrom: nextMondayOnOrAfter(addDaysIso(lastDay, 1)) };
}

// ── Farm occupancy ────────────────────────────────────────────────────────────

export type StayKind = "flock" | "preparation";

/** A farm is busy with a flock (Monday to Monday, inclusive weeks) or with its preparation order. */
export interface FarmStay {
  kind: StayKind;
  placementId: string;
  farmId: string;
  plant: LayerPlant;
  houses: number | null;
  /** First and last Monday of the busy period (inclusive). */
  from: string;
  to: string;
  /** Preparation only: exact days and the Monday the farm is free again. */
  prep?: PrepWindow;
}

/**
 * Busy periods per farm: the rearing farm holds the flock from placement until the week before
 * transfer, then is prepared (LR01) from the transfer week; the laying farm holds it from the
 * transfer week through depletion, then is prepared (LL01) from the week after depletion.
 */
export function farmStays(
  flocks: Pick<FlockInput, "id" | "rearingHouses" | "layingHouses">[],
  projections: FlockProjection[],
  prepPlans: Partial<Record<LayerPlant, PrepPlan>> = {},
): FarmStay[] {
  const housesById = new Map(flocks.map((f) => [f.id, f]));
  const stays: FarmStay[] = [];
  const addPrep = (p: FlockProjection, farmId: string, plant: LayerPlant, leave: string) => {
    const plan = prepPlans[plant];
    if (!plan || plan.days <= 0) return;
    const w = prepWindow(leave, plan.days);
    stays.push({ kind: "preparation", placementId: p.placementId, farmId, plant, houses: null, from: w.start, to: mondayOf(w.lastDay), prep: w });
  };
  for (const p of projections) {
    if (!p.weeks.length || p.transferAge === null || !p.transferWeekStart) continue;
    const f = housesById.get(p.placementId);
    stays.push({
      kind: "flock",
      placementId: p.placementId,
      farmId: p.rearingFarmId,
      plant: "1260",
      houses: f?.rearingHouses ?? null,
      from: p.weeks[0].weekStart,
      to: p.weeks[p.transferAge - 2].weekStart,
    });
    addPrep(p, p.rearingFarmId, "1260", p.transferWeekStart);
    stays.push({
      kind: "flock",
      placementId: p.placementId,
      farmId: p.layingFarmId,
      plant: "1250",
      houses: f?.layingHouses ?? null,
      from: p.transferWeekStart,
      to: p.weeks[p.weeks.length - 1].weekStart,
    });
    if (p.depletionWeekStart) addPrep(p, p.layingFarmId, "1250", p.depletionWeekStart);
  }
  return stays;
}

export interface FarmOverlap {
  farmId: string;
  placementIds: [string, string];
  fromWeek: string;
  toWeek: string;
  /** "occupied": two flocks on the farm; "preparation": a flock while the farm is being prepared after another. */
  kind: "occupied" | "preparation";
}

/**
 * Two flocks overlap when they occupy the same farm in the same week, unless both give house counts
 * that fit the farm together. A flock on a farm that is still being prepared after another flock is
 * always an overlap: preparation blocks the whole farm.
 */
export function farmOverlaps(
  flocks: Pick<FlockInput, "id" | "rearingHouses" | "layingHouses">[],
  projections: FlockProjection[],
  farmHouses: Record<string, number | null>,
  prepPlans: Partial<Record<LayerPlant, PrepPlan>> = {},
): FarmOverlap[] {
  const stays = farmStays(flocks, projections, prepPlans);
  const out: FarmOverlap[] = [];
  for (let i = 0; i < stays.length; i++) {
    for (let j = i + 1; j < stays.length; j++) {
      const a = stays[i];
      const b = stays[j];
      if (a.farmId !== b.farmId || a.placementId === b.placementId) continue;
      if (a.kind === "preparation" && b.kind === "preparation") continue;
      const from = a.from > b.from ? a.from : b.from;
      const to = a.to < b.to ? a.to : b.to;
      if (from > to) continue;
      if (a.kind === "flock" && b.kind === "flock") {
        const cap = farmHouses[a.farmId] ?? null;
        if (a.houses !== null && b.houses !== null && cap !== null && a.houses + b.houses <= cap) continue;
      }
      const kind = a.kind === "preparation" || b.kind === "preparation" ? "preparation" : "occupied";
      const order: [string, string] = a.kind === "preparation" ? [a.placementId, b.placementId] : [b.placementId, a.placementId];
      out.push({ farmId: a.farmId, placementIds: kind === "preparation" ? order : [a.placementId, b.placementId], fromWeek: from, toWeek: to, kind });
    }
  }
  return out;
}

export interface FarmWeekStatus {
  weekStart: string;
  status: "free" | "occupied" | "preparation";
  /** Flocks on the farm (occupied) or the flock whose departure is being prepared for (preparation). */
  placementIds: string[];
  /** Preparation only: day range and operation(s) in this week. */
  prepDays?: [number, number];
  prepSteps?: string;
  /** Occupied only: the farm should still be in preparation this week (a flock arrived too early). */
  prepConflict?: boolean;
}

export interface FarmAvailability {
  farmId: string;
  weeks: FarmWeekStatus[];
  /** First Monday from which the farm has no planned flock or preparation left; null = free throughout. */
  freeFrom: string | null;
}

/** Week-by-week status of each farm in a range, and when it is free for its next flock. */
export function farmAvailability(
  farmIds: string[],
  stays: FarmStay[],
  prepPlans: Partial<Record<LayerPlant, PrepPlan>>,
  range: { from: string; to: string },
): FarmAvailability[] {
  const weeks = weekRange(range.from, range.to);
  return farmIds.map((farmId) => {
    const mine = stays.filter((s) => s.farmId === farmId);
    const freeFrom = mine.length
      ? mine.map((s) => (s.kind === "preparation" ? s.prep!.freeFrom : addWeeksIso(s.to, 1))).sort().at(-1)!
      : null;
    return {
      farmId,
      freeFrom,
      weeks: weeks.map((w): FarmWeekStatus => {
        const flocks = mine.filter((s) => s.kind === "flock" && s.from <= w && w <= s.to);
        const prep = mine.find((s) => s.kind === "preparation" && s.from <= w && w <= s.to);
        if (flocks.length) {
          return { weekStart: w, status: "occupied", placementIds: flocks.map((s) => s.placementId), ...(prep ? { prepConflict: true } : {}) };
        }
        if (!prep) return { weekStart: w, status: "free", placementIds: [] };
        const plan = prepPlans[prep.plant]!;
        const first = Math.max(1, dayDiff(prep.prep!.start, w) + 1);
        const last = Math.min(plan.days, first + 6);
        const steps = [...new Set(Array.from({ length: last - first + 1 }, (_, i) => prepStepOn(plan, first + i)).filter(Boolean))].join(" → ");
        return { weekStart: w, status: "preparation", placementIds: [prep.placementId], prepDays: [first, last], prepSteps: steps };
      }),
    };
  });
}

export interface PrepPhase {
  text: string;
  fromDay: number;
  toDay: number;
  /** Operation codes in this phase, in routing order. */
  opCodes: string[];
}

/**
 * Consecutive operations with the same text form one phase, e.g. "Rest period" days 11–41. Different
 * operations on the same single day share one phase ("Lab · Rest period - Last Day").
 */
export function prepPhases(ops: Pick<LayerPrepOperation, "opCode" | "text" | "day">[]): PrepPhase[] {
  const phases: PrepPhase[] = [];
  for (const o of [...ops].sort((a, b) => a.day - b.day)) {
    const last = phases.at(-1);
    if (last && last.text === o.text && o.day <= last.toDay + 1) {
      last.toDay = Math.max(last.toDay, o.day);
      last.opCodes.push(o.opCode);
    } else if (last && o.day === last.fromDay && o.day === last.toDay) {
      last.text = `${last.text} · ${o.text}`;
      last.opCodes.push(o.opCode);
    } else {
      phases.push({ text: o.text, fromDay: o.day, toDay: o.day, opCodes: [o.opCode] });
    }
  }
  return phases;
}

// ── Feed STO planning ─────────────────────────────────────────────────────────

/** One weekly feed requirement = one planned STO line: feed mill → farm, one feed material, one week. */
export interface FeedStoLine {
  /** Monday of the consumption / delivery week. */
  weekStart: string;
  isoWeek: string;
  /** Date the STO is to be created (delivery Monday − lead days); null when the lead time is not set. */
  stoDate: string | null;
  farmId: string;
  plant: LayerPlant;
  feedStage: string;
  /** "" when the feed stage has no SAP material yet. */
  materialNo: string;
  tons: number;
  avgBirds: number;
  placementIds: string[];
  /** Full trucks needed; null when no truck size is set. */
  trucks: number | null;
  /** Deliveries the silo needs this week (tons ÷ silo); null when the farm has no silo capacity. */
  siloDeliveries: number | null;
  /** Days of feed one full silo holds at this week's intake; null when the farm has no silo capacity. */
  siloCoverDays: number | null;
}

export interface FeedGap {
  placementId: string;
  reason: "noFeedIntake" | "noFeedStage";
  ageWeeks: number[];
}

export interface FeedPlanResult {
  lines: FeedStoLine[];
  /** Weeks a flock's feed could not be planned: no feed intake in the standard, or no feed stage. */
  gaps: FeedGap[];
}

export interface FeedPlanContext {
  feedStages: Pick<LayerFeedStage, "name" | "materialNo">[];
  leadDays: number | null;
  truckTons: number | null;
  siloByFarm: Record<string, number | null>;
}

/**
 * Weekly feed per farm and feed material: average live birds × feed g/bird/day (breed standard at
 * that age) × 7. Feed goes to the farm the flock is on that week (rearing farm before transfer,
 * laying farm after); an empty farm needs none. Weeks without a feed stage or a feed standard are
 * skipped and reported.
 */
export function feedStoPlan(
  projections: FlockProjection[],
  standards: Record<string, Pick<LayerBreedStandardRow, "ageWeek" | "feedGPerDay">[]>,
  ctx: FeedPlanContext,
  range?: { from: string; to: string },
): FeedPlanResult {
  const material = new Map(ctx.feedStages.map((s) => [s.name, s.materialNo]));
  const byKey = new Map<string, FeedStoLine>();
  const gaps = new Map<string, FeedGap>();
  const gap = (placementId: string, reason: FeedGap["reason"], age: number) => {
    const k = `${placementId}|${reason}`;
    (gaps.get(k) ?? gaps.set(k, { placementId, reason, ageWeeks: [] }).get(k)!).ageWeeks.push(age);
  };
  for (const p of projections) {
    const feed = new Map((standards[p.breedId] ?? []).map((r) => [r.ageWeek, r.feedGPerDay]));
    for (const w of p.weeks) {
      if (range && (w.weekStart < range.from || w.weekStart > range.to)) continue;
      if (!w.farmId || !w.plant || w.avgBirds <= 0) continue;
      const g = feed.get(w.ageWeek);
      if (g === null || g === undefined) {
        gap(p.placementId, "noFeedIntake", w.ageWeek);
        continue;
      }
      if (!w.feedStage) {
        gap(p.placementId, "noFeedStage", w.ageWeek);
        continue;
      }
      const key = `${w.weekStart}|${w.farmId}|${w.feedStage}`;
      const line = byKey.get(key) ?? {
        weekStart: w.weekStart,
        isoWeek: w.isoWeek,
        stoDate: ctx.leadDays === null ? null : format(addDays(parseISO(w.weekStart), -ctx.leadDays), "yyyy-MM-dd"),
        farmId: w.farmId,
        plant: w.plant,
        feedStage: w.feedStage,
        materialNo: material.get(w.feedStage) ?? "",
        tons: 0,
        avgBirds: 0,
        placementIds: [],
        trucks: null,
        siloDeliveries: null,
        siloCoverDays: null,
      };
      line.tons += (w.avgBirds * g * 7) / 1_000_000;
      line.avgBirds += w.avgBirds;
      if (!line.placementIds.includes(p.placementId)) line.placementIds.push(p.placementId);
      byKey.set(key, line);
    }
  }
  const lines = [...byKey.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.farmId.localeCompare(b.farmId) || a.feedStage.localeCompare(b.feedStage));
  // Silo figures use the farm's whole weekly feed (all materials share the farm's silo capacity).
  const farmWeekTons = new Map<string, number>();
  for (const l of lines) farmWeekTons.set(`${l.weekStart}|${l.farmId}`, (farmWeekTons.get(`${l.weekStart}|${l.farmId}`) ?? 0) + l.tons);
  for (const l of lines) {
    l.tons = Math.round(l.tons * 1000) / 1000;
    if (ctx.truckTons) l.trucks = Math.ceil(l.tons / ctx.truckTons - 1e-9);
    const silo = ctx.siloByFarm[l.farmId] ?? null;
    const weekTons = farmWeekTons.get(`${l.weekStart}|${l.farmId}`)!;
    if (silo) {
      l.siloDeliveries = Math.ceil(weekTons / silo - 1e-9);
      l.siloCoverDays = weekTons > 0 ? Math.round((silo / (weekTons / 7)) * 10) / 10 : null;
    }
  }
  return { lines, gaps: [...gaps.values()] };
}

// ── Packaging planning ────────────────────────────────────────────────────────

/** Weekly need of one packaging material across all SKUs that use it. */
export interface PackagingLine {
  weekStart: string;
  isoWeek: string;
  /** Packing week Monday − lead days; null when the lead time is not set. */
  orderDate: string | null;
  /** "" when the code is not entered yet (rows are then grouped by component name). */
  materialNo: string;
  component: string;
  /** BOM unit and the quantity consumed (rounded up to a whole BOM unit). */
  unit: string;
  qty: number;
  /** Unit it is bought in and the quantity in that unit (not rounded: whole rolls are rounded over the period); null = bought in the BOM unit. */
  orderUnit: string | null;
  perOrderUnit: number | null;
  orderQty: number | null;
  /** Packs of each SKU this week that use the material. */
  bySku: Record<string, number>;
}

/**
 * Packaging per week: eggs of all flocks → graded 90001 / 90002 → packs per SKU (pack mix) →
 * × quantity per pack of each packaging component. Same material code across SKUs is one line;
 * components without a code are grouped by name and unit. Returns no lines while grading or the
 * pack mix is incomplete (packs cannot be known).
 */
export function packagingPlan(
  projections: FlockProjection[],
  grading: GradingSettings,
  skus: Pick<LayerSku, "materialNo" | "grade" | "piecesPerPack" | "packMixPct">[],
  bom: Pick<LayerSkuPackaging, "skuMaterialNo" | "component" | "materialNo" | "qtyPerPack" | "unit" | "orderUnit" | "perOrderUnit">[],
  leadDays: number | null,
  range?: { from: string; to: string },
): PackagingLine[] {
  const eggsByWeek = new Map<string, number>();
  for (const p of projections) {
    for (const w of p.weeks) {
      if (w.eggs <= 0 || (range && (w.weekStart < range.from || w.weekStart > range.to))) continue;
      eggsByWeek.set(w.weekStart, (eggsByWeek.get(w.weekStart) ?? 0) + w.eggs);
    }
  }
  const out = new Map<string, PackagingLine>();
  for (const [weekStart, eggs] of [...eggsByWeek].sort(([a], [b]) => a.localeCompare(b))) {
    for (const sku of packSkus(gradeEggs(eggs, grading), skus)) {
      if (sku.packs === null || sku.packs <= 0) continue;
      for (const c of bom.filter((b) => b.skuMaterialNo === sku.materialNo)) {
        const key = `${weekStart}|${c.materialNo || `~${c.component}|${c.unit}`}`;
        const line = out.get(key) ?? {
          weekStart,
          isoWeek: isoWeekLabel(weekStart),
          orderDate: leadDays === null ? null : format(addDays(parseISO(weekStart), -leadDays), "yyyy-MM-dd"),
          materialNo: c.materialNo,
          component: c.component,
          unit: c.unit,
          qty: 0,
          orderUnit: c.orderUnit,
          perOrderUnit: c.perOrderUnit,
          orderQty: null,
          bySku: {},
        };
        line.qty += sku.packs * c.qtyPerPack;
        line.bySku[sku.materialNo] = (line.bySku[sku.materialNo] ?? 0) + sku.packs;
        out.set(key, line);
      }
    }
  }
  return [...out.values()].map((l) => ({
    ...l,
    qty: Math.ceil(l.qty - 1e-9),
    orderQty: l.orderUnit && l.perOrderUnit ? Math.round((l.qty / l.perOrderUnit) * 100) / 100 : null,
  }));
}

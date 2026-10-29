// C.Layer projection engine — pure, side-effect-free. Imports only date-fns and types so it runs
// unchanged in the browser, in route handlers, and under `node --test`.
// Planning only: every quantity here is a projection from planned flocks and breed standards.
import { addDays, format, getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import type { LayerBreedStandardRow, LayerFeedStage, LayerPlacement, LayerPlant, LayerSettings, LayerSku } from "./types";

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

/** SAP material stage of a flock: DOC → Pullet 14WK → Laying Pullet 19WK → asset (takes the breed's egg material). */
export type MaterialStage = "doc" | "pullet14" | "layingPullet19" | "asset";

export const MATERIAL_STAGE_LABELS: Record<MaterialStage, string> = {
  doc: "DOC",
  pullet14: "Pullet 14WK",
  layingPullet19: "Laying Pullet 19WK",
  asset: "Asset (eggs)",
};

export interface MaterialStageAges {
  pulletFromAge: number | null;
  layingPulletFromAge: number | null;
  assetFromAge: number | null;
}

/** Stage for an age week; null when the switch ages are not all set. */
export function materialStageFor(ageWeek: number, s: MaterialStageAges): MaterialStage | null {
  if (s.pulletFromAge === null || s.layingPulletFromAge === null || s.assetFromAge === null) return null;
  if (ageWeek >= s.assetFromAge) return "asset";
  if (ageWeek >= s.layingPulletFromAge) return "layingPullet19";
  if (ageWeek >= s.pulletFromAge) return "pullet14";
  return "doc";
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
  /** Live birds at the start of the first week with hen-day % > 0. */
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
      eggs: (henDayBase === "opening" ? birdsStart : avgBirds) * (std.henDayPct / 100) * 7,
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
    hensAtPointOfLay: firstLay !== null && firstLay <= weeks.length ? weeks[firstLay - 1].birdsStart : null,
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

// ── Farm occupancy ────────────────────────────────────────────────────────────

export interface FarmOverlap {
  farmId: string;
  placementIds: [string, string];
  fromWeek: string;
  toWeek: string;
}

interface Stay {
  placementId: string;
  farmId: string;
  houses: number | null;
  from: string;
  to: string;
}

/**
 * Two flocks overlap when they occupy the same farm in the same week: the rearing farm from
 * placement until the week before transfer, the laying farm from transfer through the last
 * projected week. When both flocks give house counts that fit the farm's houses together, they can
 * share it and no overlap is reported.
 */
export function farmOverlaps(
  flocks: Pick<FlockInput, "id" | "rearingHouses" | "layingHouses">[],
  projections: FlockProjection[],
  farmHouses: Record<string, number | null>,
): FarmOverlap[] {
  const housesById = new Map(flocks.map((f) => [f.id, f]));
  const stays: Stay[] = [];
  for (const p of projections) {
    if (!p.weeks.length || p.transferAge === null || !p.transferWeekStart) continue;
    const f = housesById.get(p.placementId);
    const lastRearing = p.weeks[p.transferAge - 2];
    stays.push({ placementId: p.placementId, farmId: p.rearingFarmId, houses: f?.rearingHouses ?? null, from: p.weeks[0].weekStart, to: lastRearing.weekStart });
    stays.push({ placementId: p.placementId, farmId: p.layingFarmId, houses: f?.layingHouses ?? null, from: p.transferWeekStart, to: p.weeks[p.weeks.length - 1].weekStart });
  }
  const out: FarmOverlap[] = [];
  for (let i = 0; i < stays.length; i++) {
    for (let j = i + 1; j < stays.length; j++) {
      const a = stays[i];
      const b = stays[j];
      if (a.farmId !== b.farmId || a.placementId === b.placementId) continue;
      const from = a.from > b.from ? a.from : b.from;
      const to = a.to < b.to ? a.to : b.to;
      if (from > to) continue;
      const cap = farmHouses[a.farmId] ?? null;
      if (a.houses !== null && b.houses !== null && cap !== null && a.houses + b.houses <= cap) continue;
      out.push({ farmId: a.farmId, placementIds: [a.placementId, b.placementId], fromWeek: from, toWeek: to });
    }
  }
  return out;
}

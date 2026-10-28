// C.Layer projection engine — pure, side-effect-free. Imports only date-fns and types so it runs
// unchanged in the browser, in route handlers, and under `node --test`.
import { addDays, format, getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import type { LayerBreedStandardRow, LayerPlacement, LayerSettings } from "./types";

export type LayerPhase = "rearing" | "laying";

export interface FlockWeek {
  ageWeek: number;
  /** Monday of the calendar week (yyyy-mm-dd). */
  weekStart: string;
  /** ISO week label, e.g. "2026-W45". */
  isoWeek: string;
  phase: LayerPhase;
  birdsStart: number;
  birdsEnd: number;
  avgBirds: number;
  eggs: number;
}

export type ProjectablePlacement = Pick<
  LayerPlacement,
  "id" | "placementWeekStart" | "chicks" | "farmId" | "breedId" | "endOfLayWeek"
>;

export interface FlockProjection {
  placementId: string;
  farmId: string;
  breedId: string;
  placementWeekStart: string;
  weeks: FlockWeek[];
  firstLayAgeWeek: number | null;
  /** Effective end of lay after defaults and truncation; null when the breed has no standard. */
  endOfLayWeek: number | null;
  /** Birds alive at the end of the last laying week; they leave the following week. */
  spentHens: number;
  spentHensWeekStart: string | null;
  warnings: string[];
}

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

// ── Flock projection ──────────────────────────────────────────────────────────

/** First age week with hen-day % above 0; null when the standard never lays. */
export function firstLayAgeWeek(standards: LayerBreedStandardRow[]): number | null {
  const sorted = [...standards].sort((a, b) => a.ageWeek - b.ageWeek);
  return sorted.find((r) => r.henDayPct > 0)?.ageWeek ?? null;
}

export function projectFlock(
  placement: ProjectablePlacement,
  standards: LayerBreedStandardRow[],
): FlockProjection {
  const base = {
    placementId: placement.id,
    farmId: placement.farmId,
    breedId: placement.breedId,
    placementWeekStart: placement.placementWeekStart,
  };
  if (standards.length === 0) {
    return {
      ...base,
      weeks: [],
      firstLayAgeWeek: null,
      endOfLayWeek: null,
      spentHens: 0,
      spentHensWeekStart: null,
      warnings: ["The breed has no weekly standard, so this placement cannot be projected."],
    };
  }

  const byAge = new Map(standards.map((r) => [r.ageWeek, r]));
  const maxAge = Math.max(...standards.map((r) => r.ageWeek));
  const warnings: string[] = [];

  let endOfLay = placement.endOfLayWeek ?? maxAge;
  if (endOfLay > maxAge) {
    warnings.push(
      `End of lay is age week ${endOfLay}, but the breed standard ends at week ${maxAge}. Projection stops at week ${maxAge}.`,
    );
    endOfLay = maxAge;
  }

  const firstLay = firstLayAgeWeek(standards);
  const weeks: FlockWeek[] = [];
  let birds = placement.chicks;

  for (let age = 1; age <= endOfLay; age++) {
    const std = byAge.get(age);
    if (!std) {
      warnings.push(`The breed standard has no row for age week ${age}. Projection stops at week ${age - 1}.`);
      endOfLay = age - 1;
      break;
    }
    const birdsStart = birds;
    const birdsEnd = birdsStart * (1 - std.mortalityPct / 100);
    const avgBirds = (birdsStart + birdsEnd) / 2;
    const weekStart = ageWeekToCalendarWeek(placement.placementWeekStart, age);
    weeks.push({
      ageWeek: age,
      weekStart,
      isoWeek: isoWeekLabel(weekStart),
      phase: firstLay === null || age < firstLay ? "rearing" : "laying",
      birdsStart,
      birdsEnd,
      avgBirds,
      eggs: avgBirds * (std.henDayPct / 100) * 7,
    });
    birds = birdsEnd;
  }

  const last = weeks[weeks.length - 1];
  return {
    ...base,
    weeks,
    firstLayAgeWeek: firstLay,
    endOfLayWeek: weeks.length ? endOfLay : null,
    spentHens: last ? last.birdsEnd : 0,
    spentHensWeekStart: last ? addWeeksIso(last.weekStart, 1) : null,
    warnings,
  };
}

export function projectAll(
  placements: ProjectablePlacement[],
  standardsByBreed: Record<string, LayerBreedStandardRow[]>,
): FlockProjection[] {
  return placements.map((p) => projectFlock(p, standardsByBreed[p.breedId] ?? []));
}

// ── Settings-dependent outputs ────────────────────────────────────────────────

export const SETTING_LABELS = {
  prToPoDays: "PR → PO lead time",
  poToDeliveryDays: "PO → delivery lead time",
  eggsPerTray: "Eggs per tray",
  traysPerCase: "Trays per case",
} as const;

export type SettingKey = keyof typeof SETTING_LABELS;

/** Labels of the given settings that are not set yet. */
export function missingSettings(settings: Partial<Pick<LayerSettings, SettingKey>>, keys: SettingKey[]): string[] {
  return keys.filter((k) => settings[k] === null || settings[k] === undefined).map((k) => SETTING_LABELS[k]);
}

export function packEggs(
  eggs: number,
  settings: Pick<LayerSettings, "eggsPerTray" | "traysPerCase">,
): { trays: number | null; cases: number | null } {
  if (settings.eggsPerTray === null) return { trays: null, cases: null };
  const trays = eggs / settings.eggsPerTray;
  return { trays, cases: settings.traysPerCase === null ? null : trays / settings.traysPerCase };
}

export interface PurchaseLine {
  placementId: string;
  prDate: string | null;
  poDate: string | null;
  placementWeekStart: string;
  isoWeek: string;
  chicks: number;
  breedId: string;
  farmId: string;
  prInPast: boolean;
}

/** PO = placement − PO→delivery days; PR = PO − PR→PO days. Sorted by PR date, unknown dates last. */
export function purchaseSchedule(
  placements: ProjectablePlacement[],
  settings: Pick<LayerSettings, "prToPoDays" | "poToDeliveryDays">,
  today: string,
): { lines: PurchaseLine[]; warnings: string[] } {
  const lines = placements.map((p): PurchaseLine => {
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
      farmId: p.farmId,
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
  farmId?: string;
  breedId?: string;
}

export interface FlockAge {
  placementId: string;
  farmId: string;
  breedId: string;
  ageWeek: number;
}

export interface CalendarWeekTotals {
  weekStart: string;
  isoWeek: string;
  /** Birds alive at the start of the week, by phase. */
  rearingBirds: number;
  layingBirds: number;
  eggs: number;
  flocks: FlockAge[];
}

function matches(p: { farmId: string; breedId: string }, f: ProjectionFilter): boolean {
  return (!f.farmId || p.farmId === f.farmId) && (!f.breedId || p.breedId === f.breedId);
}

/** Every Monday from `from` to `to` inclusive. */
export function weekRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let w = mondayOf(from); w <= to; w = addWeeksIso(w, 1)) out.push(w);
  return out;
}

/**
 * Sums all matching flocks into calendar weeks. With no range, the result spans the first to the
 * last projected week with no gaps.
 */
export function weeklyTotals(
  projections: FlockProjection[],
  filter: ProjectionFilter = {},
  range?: { from: string; to: string },
): CalendarWeekTotals[] {
  const included = projections.filter((p) => matches(p, filter) && p.weeks.length > 0);
  if (!range) {
    if (included.length === 0) return [];
    const starts = included.map((p) => p.weeks[0].weekStart).sort();
    const ends = included.map((p) => p.weeks[p.weeks.length - 1].weekStart).sort();
    range = { from: starts[0], to: ends[ends.length - 1] };
  }

  const totals = new Map<string, CalendarWeekTotals>();
  for (const w of weekRange(range.from, range.to)) {
    totals.set(w, { weekStart: w, isoWeek: isoWeekLabel(w), rearingBirds: 0, layingBirds: 0, eggs: 0, flocks: [] });
  }
  for (const p of included) {
    for (const wk of p.weeks) {
      const t = totals.get(wk.weekStart);
      if (!t) continue;
      if (wk.phase === "rearing") t.rearingBirds += wk.birdsStart;
      else t.layingBirds += wk.birdsStart;
      t.eggs += wk.eggs;
      t.flocks.push({ placementId: p.placementId, farmId: p.farmId, breedId: p.breedId, ageWeek: wk.ageWeek });
    }
  }
  return [...totals.values()];
}

export interface SpentHenLine {
  weekStart: string;
  isoWeek: string;
  placementId: string;
  farmId: string;
  breedId: string;
  birds: number;
  /** Age of the flock in the week it leaves (end of lay + 1). */
  ageWeek: number;
}

export function spentHensSchedule(projections: FlockProjection[], filter: ProjectionFilter = {}): SpentHenLine[] {
  return projections
    .filter((p) => matches(p, filter) && p.spentHensWeekStart !== null && p.endOfLayWeek !== null)
    .map((p) => ({
      weekStart: p.spentHensWeekStart!,
      isoWeek: isoWeekLabel(p.spentHensWeekStart!),
      placementId: p.placementId,
      farmId: p.farmId,
      breedId: p.breedId,
      birds: p.spentHens,
      ageWeek: p.endOfLayWeek! + 1,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.farmId.localeCompare(b.farmId));
}

/** Egg output by week × farm × breed — the only shape exposed to roles that may see egg output alone. */
export interface EggCell {
  weekStart: string;
  farmId: string;
  breedId: string;
  eggs: number;
  minAge: number;
  maxAge: number;
}

export function eggCells(projections: FlockProjection[]): EggCell[] {
  const cells = new Map<string, EggCell>();
  for (const p of projections) {
    for (const wk of p.weeks) {
      if (wk.eggs <= 0) continue;
      const key = `${wk.weekStart}::${p.farmId}::${p.breedId}`;
      const c = cells.get(key);
      if (c) {
        c.eggs += wk.eggs;
        c.minAge = Math.min(c.minAge, wk.ageWeek);
        c.maxAge = Math.max(c.maxAge, wk.ageWeek);
      } else {
        cells.set(key, {
          weekStart: wk.weekStart,
          farmId: p.farmId,
          breedId: p.breedId,
          eggs: wk.eggs,
          minAge: wk.ageWeek,
          maxAge: wk.ageWeek,
        });
      }
    }
  }
  return [...cells.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

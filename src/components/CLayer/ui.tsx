"use client";

import {
  MATERIAL_STAGE_LABELS,
  addWeeksIso,
  isoWeekLabel,
  mondayOf,
  type CalendarWeekTotals,
  type MaterialStage,
  type ProjectionFilter,
} from "@/lib/cLayer/calc";
import { LAYER_PLANTS, type LayerBreed, type LayerFarm, type LayerPlant } from "@/lib/cLayer/types";

export const fmtInt = (n: number) => Math.round(n).toLocaleString();
export const fmtDec = (n: number, dp = 1) => n.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: dp });

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Card({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="section-title text-sm text-neutral-800">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Notice({ tone = "warn", lines }: { tone?: "warn" | "error" | "info" | "ok"; lines: string[] }) {
  if (!lines.length) return null;
  const cls = {
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-300 bg-red-50 text-red-800",
    info: "border-[var(--border-subtle)] bg-brand-green-tint text-brand-green-dark",
    ok: "border-green-300 bg-green-50 text-green-800",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-2.5 text-xs leading-relaxed ${cls}`}>
      {lines.length === 1 ? lines[0] : (
        <ul className="list-disc pl-4 space-y-0.5">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      )}
    </div>
  );
}

export const btn = "text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border-subtle)] bg-white hover:border-brand-green hover:text-brand-green transition-colors disabled:opacity-40 disabled:pointer-events-none";
export const btnPrimary = "text-xs font-semibold px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors disabled:opacity-40 disabled:pointer-events-none";
export const btnDanger = "text-xs font-medium px-2 py-1 rounded-md text-brand-alert hover:bg-red-50 transition-colors";
export const btnText = "text-xs font-medium px-2 py-1 rounded-md text-brand-green-dark hover:bg-brand-green-tint transition-colors";
export const btnMuted = "text-xs font-medium px-2 py-1 rounded-md text-neutral-500 hover:bg-neutral-100 transition-colors";
export const input = "text-sm rounded-md border border-[var(--border-subtle)] px-2 py-1.5 bg-white focus:outline-none focus:border-brand-green";
export const label = "text-[10px] font-semibold uppercase tracking-wider text-neutral-500";

export interface FilterState {
  farmId: string;
  breedId: string;
  plant: "" | LayerPlant;
}

export const emptyFilter = (): FilterState => ({ farmId: "", breedId: "", plant: "" });

export function toProjectionFilter(f: FilterState): ProjectionFilter {
  return { farmId: f.farmId || undefined, breedId: f.breedId || undefined, plant: f.plant || undefined };
}

type FarmOption = Pick<LayerFarm, "id" | "code" | "name"> & { plant?: LayerPlant | null };
type BreedOption = Pick<LayerBreed, "id" | "name"> & { eggMaterialNo?: string };

export function FilterBar({ farms, breeds, value, onChange, showPlant = false, onlyPlant }: {
  farms: FarmOption[];
  breeds: BreedOption[];
  value: FilterState;
  onChange: (v: FilterState) => void;
  showPlant?: boolean;
  /** Restrict the farm list to one plant (e.g. depletion happens only on 1250 laying farms). */
  onlyPlant?: LayerPlant;
}) {
  const farmList = farms.filter((f) => (!onlyPlant || f.plant === onlyPlant) && (!value.plant || f.plant === value.plant));
  return (
    <div className="flex flex-wrap items-end gap-3">
      {showPlant && (
        <label className="flex flex-col gap-1">
          <span className={label}>Plant</span>
          <select className={input} value={value.plant} onChange={(e) => onChange({ ...value, plant: e.target.value as FilterState["plant"], farmId: "" })}>
            <option value="">1260 + 1250</option>
            {(Object.keys(LAYER_PLANTS) as LayerPlant[]).map((p) => <option key={p} value={p}>{p} · {LAYER_PLANTS[p]}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className={label}>Farm</span>
        <select className={input} value={value.farmId} onChange={(e) => onChange({ ...value, farmId: e.target.value })}>
          <option value="">All farms</option>
          {farmList.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.plant ?? "?"} · {f.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Breed</span>
        <select className={input} value={value.breedId} onChange={(e) => onChange({ ...value, breedId: e.target.value })}>
          <option value="">All breeds</option>
          {breeds.map((b) => <option key={b.id} value={b.id}>{b.name}{b.eggMaterialNo ? ` · ${b.eggMaterialNo}` : ""}</option>)}
        </select>
      </label>
    </div>
  );
}

/** Week-column tooltip: calendar week, then each flock's plant, farm, breed, age and feed stage. */
export function weekTooltip(
  week: Pick<CalendarWeekTotals, "isoWeek" | "weekStart" | "flocks">,
  farmCode: Map<string, string>,
  breedName: Map<string, string>,
  flockNo: Map<string, number | null> = new Map(),
  breedMaterials: Map<string, BreedMaterials> = new Map(),
): string {
  if (!week.flocks.length) return `${week.isoWeek} · Mon ${week.weekStart}\nNo flocks this week`;
  return [
    `${week.isoWeek} · Mon ${week.weekStart}`,
    ...week.flocks.map((f) => {
      const material = f.materialStage ? ` · ${materialLabel(f.materialStage, breedMaterials.get(f.breedId))}` : "";
      return `Flock ${flockNo.get(f.placementId) ?? "?"} · ${f.plant ?? "plant ?"} · ${(f.farmId && farmCode.get(f.farmId)) || "?"} · ${breedName.get(f.breedId) ?? "?"} · age wk ${f.ageWeek}${f.feedStage ? ` · ${f.feedStage}` : ""}${material}`;
    }),
  ].join("\n");
}

export type BreedMaterials = Pick<LayerBreed, "docMaterialNo" | "pullet14MaterialNo" | "layingPullet19MaterialNo" | "eggMaterialNo">;

const STAGE_FIELD: Record<MaterialStage, keyof BreedMaterials> = {
  doc: "docMaterialNo",
  pullet14: "pullet14MaterialNo",
  layingPullet19: "layingPullet19MaterialNo",
  asset: "eggMaterialNo",
};

/** "Pullet 14WK 1234567" — or "(no code)" while the breed's material number is not entered yet. */
export function materialLabel(stage: MaterialStage, breed?: BreedMaterials): string {
  const code = breed?.[STAGE_FIELD[stage]];
  return `${MATERIAL_STAGE_LABELS[stage]} ${code || "(no code)"}`;
}

export interface RangeState {
  from: string;
  weeks: number;
}

export const defaultRange = (): RangeState => ({ from: mondayOf(todayIso()), weeks: 52 });

export function rangeBounds(r: RangeState): { from: string; to: string } {
  return { from: r.from, to: addWeeksIso(r.from, r.weeks - 1) };
}

export function RangeControls({ value, onChange }: { value: RangeState; onChange: (v: RangeState) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className={label}>From week</span>
        <input
          type="date"
          className={input}
          value={value.from}
          onChange={(e) => e.target.value && onChange({ ...value, from: mondayOf(e.target.value) })}
        />
      </label>
      <span className="text-xs text-neutral-500 pb-2">{isoWeekLabel(value.from)}</span>
      <label className="flex flex-col gap-1">
        <span className={label}>Show</span>
        <select className={input} value={value.weeks} onChange={(e) => onChange({ ...value, weeks: Number(e.target.value) })}>
          {[13, 26, 52, 78, 104].map((w) => <option key={w} value={w}>{w} weeks</option>)}
        </select>
      </label>
    </div>
  );
}

export function KpiRow({ items }: { items: { label: string; value: string; sub?: string; tone?: "green" | "gold" | "alert" | "neutral" }[] }) {
  const border = { green: "border-l-brand-green", gold: "border-l-brand-gold", alert: "border-l-brand-alert", neutral: "border-l-neutral-300" };
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((k) => (
        <div key={k.label} className={`rounded-xl border border-[var(--border-subtle)] border-l-4 ${border[k.tone ?? "neutral"]} bg-white shadow-sm px-4 py-3`}>
          <div className={label}>{k.label}</div>
          <div className="text-xl font-bold tabular-nums text-neutral-800 mt-1">{k.value}</div>
          {k.sub && <div className="text-[11px] text-neutral-400 mt-0.5">{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

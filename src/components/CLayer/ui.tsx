"use client";

import { addWeeksIso, isoWeekLabel, mondayOf } from "@/lib/cLayer/calc";
import type { LayerBreed, LayerFarm } from "@/lib/cLayer/types";

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
}

export function FilterBar({ farms, breeds, value, onChange }: {
  farms: Pick<LayerFarm, "id" | "code" | "name">[];
  breeds: Pick<LayerBreed, "id" | "name">[];
  value: FilterState;
  onChange: (v: FilterState) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className={label}>Farm</span>
        <select className={input} value={value.farmId} onChange={(e) => onChange({ ...value, farmId: e.target.value })}>
          <option value="">All farms</option>
          {farms.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Breed</span>
        <select className={input} value={value.breedId} onChange={(e) => onChange({ ...value, breedId: e.target.value })}>
          <option value="">All breeds</option>
          {breeds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
    </div>
  );
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

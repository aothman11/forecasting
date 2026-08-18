"use client";

import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { usePlanStore } from "@/lib/store";
import { computeBreedingPyramid, rossPODate } from "@/lib/breedingPyramidCalc";
import type { GpFlock, RossPsOrder, BreedingWeekRow, BreedingParams } from "@/lib/types";

// ─── Local helpers ────────────────────────────────────────────────────────────

const fmtN = (n: number) => {
  if (n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
};
const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const todayIso = () => new Date().toISOString().slice(0, 10);
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function wksBetween(fromIso: string, toIso: string) {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (7 * 86400_000);
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-[var(--border-subtle)] ${className}`}>
      {children}
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
      <div className="text-sm font-bold text-neutral-800">{title}</div>
      {sub && <div className="text-[11px] text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Kpi({ label, value, sub, color = "green" }: {
  label: string; value: string; sub?: string;
  color?: "green" | "gold" | "blue" | "violet" | "neutral";
}) {
  const cls =
    color === "green"  ? "text-brand-green-dark" :
    color === "gold"   ? "text-amber-700" :
    color === "blue"   ? "text-sky-700" :
    color === "violet" ? "text-violet-700" : "text-neutral-700";
  return (
    <div className="bg-white rounded-xl border border-[var(--border-subtle)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}

const Th = ({ children, right = false }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={`py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
    {children}
  </th>
);
const Td = ({ children, right = false, dim = false, bold = false, green = false, violet = false, red = false }: {
  children: React.ReactNode; right?: boolean; dim?: boolean; bold?: boolean;
  green?: boolean; violet?: boolean; red?: boolean;
}) => (
  <td className={`py-1.5 px-3 text-xs whitespace-nowrap
    ${right ? "text-right font-mono" : ""}
    ${dim ? "text-neutral-300" : bold ? "font-bold text-neutral-800" : "text-neutral-600"}
    ${green ? "text-brand-green-dark font-semibold" : ""}
    ${violet ? "text-violet-700 font-semibold" : ""}
    ${red ? "text-red-600 font-semibold" : ""}
  `}>{children}</td>
);

// ─── Derived data types ───────────────────────────────────────────────────────

interface GpFlockWeek {
  flockId: string; flockName: string;
  inLay: boolean; ageWks: number; layWkIdx: number;
  femalesAlive: number; settableEggs: number;
}
interface GpWeekRow extends BreedingWeekRow {
  flockDetail: GpFlockWeek[];
}

interface CohortRow {
  label: string; arrivalWeek: number; arrivalDate: string;
  females: number; layStartWk: number; layEndWk: number;
  peakSettableEggs: number;
  poDate?: string; isPOPast?: boolean;
}

interface PsWeekRow {
  week: number; weekStart: string;
  activeCohorts: number; femalesInLay: number; settableEggs: number;
}

// ─── Computation helpers ──────────────────────────────────────────────────────

function buildGpDetail(
  rows: BreedingWeekRow[],
  gpFlocks: GpFlock[],
  p: BreedingParams,
): GpWeekRow[] {
  return rows.map((row) => {
    const flockDetail: GpFlockWeek[] = gpFlocks.map((f) => {
      const ageWks = wksBetween(f.placementDate, row.weekStart);
      const lwi = ageWks - f.layStartWeekAge;
      const inLay = lwi >= 0 && lwi < p.gpLayingWeeks;
      const femalesAlive = inLay ? Math.round(f.femaleCount * Math.pow(1 - p.gpLayMortWeekly, lwi)) : 0;
      const settableEggs = inLay ? Math.round(femalesAlive * (p.gpHDP / 100) * 7 * p.gpSettableRatio) : 0;
      return { flockId: f.id, flockName: f.name, inLay, ageWks: Math.round(ageWks), layWkIdx: inLay ? Math.round(lwi) : -1, femalesAlive, settableEggs };
    });
    return { ...row, flockDetail };
  });
}

function buildCobbCohorts(rows: BreedingWeekRow[], p: BreedingParams): CohortRow[] {
  return rows
    .filter((r) => r.cobbPsDOC > 0)
    .map((r) => ({
      label: `Cobb-W${String(r.week).padStart(2, "0")}`,
      arrivalWeek: r.week,
      arrivalDate: r.weekStart,
      females: r.cobbPsDOC,
      layStartWk: r.week + p.cobbLayStartWeekAge,
      layEndWk: r.week + p.cobbLayStartWeekAge + p.cobbLayingWeeks - 1,
      peakSettableEggs: Math.round(r.cobbPsDOC * (p.cobbHDP / 100) * 7 * p.cobbSettableRatio),
    }));
}

function buildRossCohorts(rossPsOrders: RossPsOrder[], p: BreedingParams): CohortRow[] {
  return rossPsOrders.map((o) => {
    const arrivalWeek = Math.round(wksBetween(p.planStartDate, o.arrivalDate)) + 1;
    const po = rossPODate(o.arrivalDate, p.rossPOLeadWeeks);
    return {
      label: o.name,
      arrivalWeek,
      arrivalDate: o.arrivalDate,
      females: o.femaleCount,
      layStartWk: arrivalWeek + p.rossLayStartWeekAge,
      layEndWk: arrivalWeek + p.rossLayStartWeekAge + p.rossLayingWeeks - 1,
      peakSettableEggs: Math.round(o.femaleCount * (p.rossHDP / 100) * 7 * p.rossSettableRatio),
      poDate: po,
      isPOPast: new Date(po) < new Date(),
    };
  });
}

function buildPsWeekly(
  rows: BreedingWeekRow[],
  cohorts: CohortRow[],
  p: BreedingParams,
  strain: "cobb" | "ross",
): PsWeekRow[] {
  const [layStartAge, layMort] = strain === "cobb"
    ? [p.cobbLayStartWeekAge, p.cobbLayMortWeekly]
    : [p.rossLayStartWeekAge, p.rossLayMortWeekly];

  return rows.map((row) => {
    const active = cohorts.filter((c) => row.week >= c.layStartWk && row.week <= c.layEndWk);
    const femalesInLay = active.reduce((sum, c) => {
      const lwi = row.week - c.arrivalWeek - layStartAge;
      return sum + c.females * Math.pow(1 - layMort, lwi);
    }, 0);
    const settableEggs = strain === "cobb" ? row.cobbPsEggs : row.rossPsEggs;
    return { week: row.week, weekStart: row.weekStart, activeCohorts: active.length, femalesInLay: Math.round(femalesInLay), settableEggs };
  });
}

// ─── Tab 1: GP Supply ─────────────────────────────────────────────────────────

function GpSupplyTab() {
  const gpFlocks = usePlanStore((s) => s.gpFlocks);
  const breedingParams = usePlanStore((s) => s.breedingParams);
  const addGpFlock = usePlanStore((s) => s.addGpFlock);
  const updateGpFlock = usePlanStore((s) => s.updateGpFlock);
  const removeGpFlock = usePlanStore((s) => s.removeGpFlock);
  const rows = usePlanStore.getState;

  const baseRows = useMemo(
    () => computeBreedingPyramid(gpFlocks, [], breedingParams),
    [gpFlocks, breedingParams],
  );

  const gpWeekly = useMemo(
    () => buildGpDetail(baseRows, gpFlocks, breedingParams),
    [baseRows, gpFlocks, breedingParams],
  );

  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<GpFlock, "id">>({
    name: "", placementDate: todayIso(), femaleCount: 50000, layStartWeekAge: 25,
  });

  const totalEggs52 = baseRows.reduce((s, r) => s + r.gpSettableEggs, 0);
  const peakWeekEggs = Math.max(...baseRows.map((r) => r.gpSettableEggs), 0);
  const totalFemales = gpFlocks.reduce((s, f) => s + f.femaleCount, 0);

  function startAdd() {
    setEditId("__new__");
    setForm({
      name: `GP-${new Date().getFullYear()}-${gpFlocks.length + 1}`,
      placementDate: todayIso(), femaleCount: 50000, layStartWeekAge: 25,
    });
  }
  function startEdit(f: GpFlock) { setEditId(f.id); setForm({ name: f.name, placementDate: f.placementDate, femaleCount: f.femaleCount, layStartWeekAge: f.layStartWeekAge }); }
  function save() {
    if (!form.name || !form.placementDate || form.femaleCount <= 0) return;
    if (editId === "__new__") addGpFlock({ id: newId(), ...form });
    else if (editId) updateGpFlock(editId, form);
    setEditId(null);
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Kpi label="GP Flocks (Cobb-500)" value={String(gpFlocks.length)} sub={`${fmtN(totalFemales)} total females placed`} color="green" />
        <Kpi label="Peak Weekly Settable Eggs" value={fmtN(peakWeekEggs)} sub="across all flocks" color="gold" />
        <Kpi label="52-Week Total Eggs" value={fmtN(totalEggs52)} sub="settable eggs" color="blue" />
      </div>

      {/* Flock register */}
      <Card>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <div className="text-sm font-bold text-neutral-800">GP Flock Register — Cobb-500</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">Each flock enters the pyramid as a separate egg-production cohort</div>
          </div>
          <button onClick={startAdd} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors">+ Add Flock</button>
        </div>

        {editId && (
          <div className="px-5 py-4 bg-brand-green-tint/50 border-b border-brand-green/20 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Flock Name", key: "name" as const, type: "text", placeholder: "GP-2026-A" },
              { label: "Placement Date", key: "placementDate" as const, type: "date" },
              { label: "Female Count", key: "femaleCount" as const, type: "number" },
              { label: "Lay Start Age (wks)", key: "layStartWeekAge" as const, type: "number" },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{label}</label>
                <input type={type} className="cell-input mt-1 w-full" value={String(form[key])} placeholder={placeholder}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))} />
              </div>
            ))}
            <div className="col-span-2 lg:col-span-4 flex gap-2">
              <button onClick={save} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-brand-green text-white hover:bg-brand-green-dark">Save</button>
              <button onClick={() => setEditId(null)} className="px-3 py-1.5 text-xs font-semibold rounded-md border border-neutral-300 text-neutral-600 hover:border-neutral-400">Cancel</button>
            </div>
          </div>
        )}

        {gpFlocks.length === 0 ? (
          <div className="text-center py-10 text-sm text-neutral-400">No GP flocks yet — click <strong>+ Add Flock</strong>.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-[var(--border-subtle)]">
                <Th>Flock</Th><Th>Placement Date</Th><Th>Females</Th>
                <Th>Lay Start Age</Th><Th>Lay Start Date</Th><Th>Lay End Date</Th>
                <Th>Laying Wks</Th><Th></Th>
              </tr></thead>
              <tbody>
                {gpFlocks.map((f) => {
                  const layStart = new Date(f.placementDate);
                  layStart.setDate(layStart.getDate() + f.layStartWeekAge * 7);
                  const layEnd = new Date(layStart);
                  layEnd.setDate(layEnd.getDate() + breedingParams.gpLayingWeeks * 7);
                  return (
                    <tr key={f.id} className="border-b border-[var(--border-subtle)]/50 hover:bg-neutral-50">
                      <Td bold>{f.name}</Td>
                      <Td>{fmtDate(f.placementDate)}</Td>
                      <td className="py-1.5 px-3 text-xs font-mono">{fmtN(f.femaleCount)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono">{f.layStartWeekAge} wks</td>
                      <td className="py-1.5 px-3 text-xs text-brand-green-dark font-semibold">{fmtDate(layStart.toISOString().slice(0, 10))}</td>
                      <td className="py-1.5 px-3 text-xs text-neutral-500">{fmtDate(layEnd.toISOString().slice(0, 10))}</td>
                      <td className="py-1.5 px-3 text-xs font-mono">{breedingParams.gpLayingWeeks}</td>
                      <td className="py-1.5 px-3">
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(f)} className="text-[10px] font-semibold text-brand-green hover:underline">Edit</button>
                          <button onClick={() => removeGpFlock(f.id)} className="text-[10px] font-semibold text-red-500 hover:underline">Remove</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Weekly GP Egg Production — full detail */}
      {gpFlocks.length > 0 && (
        <Card>
          <SectionHead
            title="Weekly GP Settable Egg Production — Full Detail"
            sub="Per-flock breakdown: females alive each week (mortality applied) × HDP × 7 days × settable ratio"
          />
          <div className="overflow-x-auto">
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-neutral-50 z-10">
                  <tr className="border-b-2 border-[var(--border-subtle)]">
                    <Th>Wk</Th>
                    <Th>Week Start</Th>
                    {gpFlocks.map((f) => (
                      <>
                        <th key={`${f.id}-age`} className="py-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 text-right whitespace-nowrap border-l border-neutral-100">Age (wk)</th>
                        <th key={`${f.id}-fem`} className="py-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 text-right whitespace-nowrap">{f.name} Females</th>
                        <th key={`${f.id}-egg`} className="py-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-brand-green text-right whitespace-nowrap">Settable Eggs</th>
                      </>
                    ))}
                    <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-800 text-right whitespace-nowrap border-l-2 border-neutral-300 bg-brand-green-tint/60">Total Eggs</th>
                  </tr>
                </thead>
                <tbody>
                  {gpWeekly.map((row) => {
                    const hasEggs = row.gpSettableEggs > 0;
                    return (
                      <tr key={row.week} className={`border-b border-[var(--border-subtle)]/40 hover:bg-neutral-50 ${!hasEggs ? "opacity-40" : ""}`}>
                        <td className="py-1.5 px-3 text-xs font-mono text-neutral-400">{row.week}</td>
                        <td className="py-1.5 px-3 text-xs text-neutral-500 whitespace-nowrap">{fmtDate(row.weekStart)}</td>
                        {row.flockDetail.map((fd) => (
                          <>
                            <td key={`${fd.flockId}-age`} className="py-1.5 px-2 text-xs font-mono text-neutral-400 text-right border-l border-neutral-100">{fd.inLay ? fd.ageWks : `${fd.ageWks}`}</td>
                            <td key={`${fd.flockId}-fem`} className={`py-1.5 px-2 text-xs font-mono text-right ${fd.inLay ? "text-neutral-600" : "text-neutral-300"}`}>{fd.inLay ? fmtN(fd.femalesAlive) : "—"}</td>
                            <td key={`${fd.flockId}-egg`} className={`py-1.5 px-2 text-xs font-mono text-right ${fd.inLay ? "text-brand-green-dark font-semibold" : "text-neutral-300"}`}>{fd.inLay ? fmtN(fd.settableEggs) : "—"}</td>
                          </>
                        ))}
                        <td className="py-1.5 px-3 text-xs font-mono font-bold text-neutral-800 text-right border-l-2 border-neutral-300 bg-brand-green-tint/30">{fmtN(row.gpSettableEggs)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-neutral-300 bg-brand-green-tint/40">
                    <td colSpan={2} className="py-2 px-3 text-xs font-bold text-neutral-700">52-Week Total</td>
                    {gpFlocks.map((f) => (
                      <>
                        <td key={`${f.id}-t-age`} className="border-l border-neutral-100" />
                        <td key={`${f.id}-t-fem`} className="py-2 px-2 text-xs font-mono font-bold text-right text-neutral-600">{fmtN(gpWeekly.reduce((s, r) => s + (r.flockDetail.find((fd) => fd.flockId === f.id)?.femalesAlive ?? 0), 0))}</td>
                        <td key={`${f.id}-t-egg`} className="py-2 px-2 text-xs font-mono font-bold text-right text-brand-green-dark">{fmtN(gpWeekly.reduce((s, r) => s + (r.flockDetail.find((fd) => fd.flockId === f.id)?.settableEggs ?? 0), 0))}</td>
                      </>
                    ))}
                    <td className="py-2 px-3 text-xs font-mono font-bold text-neutral-800 text-right border-l-2 border-neutral-300 bg-brand-green-tint">{fmtN(totalEggs52)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 2: PS Supply ─────────────────────────────────────────────────────────

function PsSupplyTab({ rows }: { rows: BreedingWeekRow[] }) {
  const breedingParams = usePlanStore((s) => s.breedingParams);
  const rossPsOrders = usePlanStore((s) => s.rossPsOrders);
  const addRossPsOrder = usePlanStore((s) => s.addRossPsOrder);
  const updateRossPsOrder = usePlanStore((s) => s.updateRossPsOrder);
  const removeRossPsOrder = usePlanStore((s) => s.removeRossPsOrder);

  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<RossPsOrder, "id">>({ name: "", arrivalDate: todayIso(), femaleCount: 30000 });

  const cobbCohorts = useMemo(() => buildCobbCohorts(rows, breedingParams), [rows, breedingParams]);
  const rossCohorts = useMemo(() => buildRossCohorts(rossPsOrders, breedingParams), [rossPsOrders, breedingParams]);
  const cobbWeekly = useMemo(() => buildPsWeekly(rows, cobbCohorts, breedingParams, "cobb"), [rows, cobbCohorts, breedingParams]);
  const rossWeekly = useMemo(() => buildPsWeekly(rows, rossCohorts, breedingParams, "ross"), [rows, rossCohorts, breedingParams]);

  const totalCobbEggs = rows.reduce((s, r) => s + r.cobbPsEggs, 0);
  const totalRossEggs = rows.reduce((s, r) => s + r.rossPsEggs, 0);
  const peakCobbFemales = Math.max(...cobbWeekly.map((w) => w.femalesInLay), 0);

  function startAdd() { setEditId("__new__"); setForm({ name: `Ross-PO-${String(rossPsOrders.length + 1).padStart(3, "0")}`, arrivalDate: todayIso(), femaleCount: 30000 }); }
  function startEdit(o: RossPsOrder) { setEditId(o.id); setForm({ name: o.name, arrivalDate: o.arrivalDate, femaleCount: o.femaleCount }); }
  function save() {
    if (!form.name || !form.arrivalDate || form.femaleCount <= 0) return;
    if (editId === "__new__") addRossPsOrder({ id: newId(), ...form });
    else if (editId) updateRossPsOrder(editId, form);
    setEditId(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Cobb PS Cohorts" value={String(cobbCohorts.length)} sub="derived from GP flocks" color="green" />
        <Kpi label="Cobb PS Eggs (52-wk)" value={fmtN(totalCobbEggs)} sub="settable eggs" color="green" />
        <Kpi label="Peak Cobb PS Females" value={fmtN(peakCobbFemales)} sub="in lay at one time" color="gold" />
        <Kpi label="Ross PS Orders" value={String(rossPsOrders.length)} sub={`${fmtN(totalRossEggs)} settable eggs`} color="violet" />
      </div>

      {/* ── Cobb PS Section ─────────────────────────────────────── */}
      <Card>
        <SectionHead
          title="Cobb PS Cohort Register — Derived from GP Eggs"
          sub={`Each batch of GP eggs that hatches creates a Cobb PS cohort arriving ${breedingParams.incubationWeeks} weeks later. 50% are female (male byproduct sold separately).`}
        />
        {cobbCohorts.length === 0 ? (
          <div className="text-center py-8 text-xs text-neutral-400 px-5">No Cobb PS cohorts yet — add GP flocks in the GP Supply tab.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-neutral-50 z-10">
                  <tr className="border-b-2 border-[var(--border-subtle)]">
                    <Th>Cohort</Th><Th>Arrival Wk</Th><Th>Arrival Date</Th>
                    <Th right>Female DOC</Th><Th right>Lay Start Wk</Th>
                    <Th>Lay Start Date</Th><Th right>Lay End Wk</Th>
                    <Th>Lay End Date</Th><Th right>Peak Eggs/Wk</Th>
                  </tr>
                </thead>
                <tbody>
                  {cobbCohorts.map((c, i) => {
                    const lsDate = new Date(c.arrivalDate);
                    lsDate.setDate(lsDate.getDate() + breedingParams.cobbLayStartWeekAge * 7);
                    const leDate = new Date(lsDate);
                    leDate.setDate(leDate.getDate() + breedingParams.cobbLayingWeeks * 7);
                    const inPlan = c.layStartWk <= breedingParams.planHorizonWeeks;
                    return (
                      <tr key={i} className={`border-b border-[var(--border-subtle)]/50 hover:bg-neutral-50 ${!inPlan ? "opacity-40" : ""}`}>
                        <td className="py-1.5 px-3 text-xs font-semibold text-neutral-700">{c.label}</td>
                        <td className="py-1.5 px-3 text-xs font-mono text-neutral-500">Wk {c.arrivalWeek}</td>
                        <td className="py-1.5 px-3 text-xs text-neutral-600">{fmtDate(c.arrivalDate)}</td>
                        <td className="py-1.5 px-3 text-xs font-mono text-right text-brand-green-dark font-semibold">{fmtN(c.females)}</td>
                        <td className="py-1.5 px-3 text-xs font-mono text-right text-neutral-500">{c.layStartWk}</td>
                        <td className="py-1.5 px-3 text-xs text-brand-green">{inPlan ? fmtDate(lsDate.toISOString().slice(0, 10)) : "—"}</td>
                        <td className="py-1.5 px-3 text-xs font-mono text-right text-neutral-500">{c.layEndWk}</td>
                        <td className="py-1.5 px-3 text-xs text-neutral-400">{fmtDate(leDate.toISOString().slice(0, 10))}</td>
                        <td className="py-1.5 px-3 text-xs font-mono text-right text-amber-700 font-semibold">{fmtN(c.peakSettableEggs)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionHead
          title="Cobb PS Weekly Production Schedule"
          sub={`Settable eggs = PS females in lay × HDP ${breedingParams.cobbHDP}% × 7 days × settable ratio ${(breedingParams.cobbSettableRatio * 100).toFixed(0)}%`}
        />
        <div className="overflow-x-auto">
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-neutral-50 z-10">
                <tr className="border-b-2 border-[var(--border-subtle)]">
                  <Th>Wk</Th><Th>Week Start</Th>
                  <Th right>Active Cohorts</Th><Th right>PS Females in Lay</Th><Th right>Cobb PS Settable Eggs</Th>
                  <Th right>→ Cobb Broiler DOC (Wk+{breedingParams.incubationWeeks})</Th>
                </tr>
              </thead>
              <tbody>
                {cobbWeekly.map((w, i) => {
                  const futureDoc = rows[i + breedingParams.incubationWeeks];
                  return (
                    <tr key={w.week} className={`border-b border-[var(--border-subtle)]/40 hover:bg-neutral-50 ${w.settableEggs === 0 ? "opacity-40" : ""}`}>
                      <td className="py-1.5 px-3 text-xs font-mono text-neutral-400">{w.week}</td>
                      <td className="py-1.5 px-3 text-xs text-neutral-500">{fmtDate(w.weekStart)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-neutral-500">{w.activeCohorts > 0 ? w.activeCohorts : "—"}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-neutral-600">{fmtN(w.femalesInLay)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-brand-green-dark font-semibold">{fmtN(w.settableEggs)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-sky-600">{futureDoc ? fmtN(futureDoc.broilerFromCobb) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-200 bg-brand-green-tint/30">
                  <td colSpan={3} className="py-2 px-3 text-xs font-bold">52-Week Totals</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-neutral-600">{fmtN(cobbWeekly.reduce((s, r) => s + r.femalesInLay, 0))}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-brand-green-dark">{fmtN(totalCobbEggs)}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-sky-600">{fmtN(rows.reduce((s, r) => s + r.broilerFromCobb, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Card>

      {/* ── Ross PS Section ─────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <div className="text-sm font-bold text-neutral-800">Ross-308 PS Purchase Orders — External Supplier</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">PO must be placed <strong>{breedingParams.rossPOLeadWeeks} weeks</strong> before PS arrival. No GP flock needed for Ross-308.</div>
          </div>
          <button onClick={startAdd} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-violet-600 text-white hover:bg-violet-700 transition-colors">+ Add PO</button>
        </div>

        {editId && (
          <div className="px-5 py-4 bg-violet-50 border-b border-violet-200 grid grid-cols-3 gap-3">
            {[
              { label: "PO Name", key: "name" as const, type: "text" },
              { label: "PS Arrival Date", key: "arrivalDate" as const, type: "date" },
              { label: "Female Count", key: "femaleCount" as const, type: "number" },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{label}</label>
                <input type={type} className="cell-input mt-1 w-full" value={String(form[key])}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))} />
              </div>
            ))}
            <div className="col-span-3 flex gap-2">
              <button onClick={save} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-violet-600 text-white hover:bg-violet-700">Save</button>
              <button onClick={() => setEditId(null)} className="px-3 py-1.5 text-xs font-semibold rounded-md border border-neutral-300 text-neutral-600">Cancel</button>
            </div>
          </div>
        )}

        {rossPsOrders.length === 0 ? (
          <div className="text-center py-8 text-xs text-neutral-400">No Ross POs yet — click <strong>+ Add PO</strong>.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-[var(--border-subtle)]">
                <Th>PO Name</Th><Th>PO Issue Date</Th><Th right>Lead Wks</Th>
                <Th>PS Arrival Date</Th><Th right>Female Count</Th>
                <Th right>Lay Start Wk</Th><Th>Lay Start Date</Th><Th right>Lay End Wk</Th>
                <Th right>Peak Eggs/Wk</Th><Th></Th>
              </tr></thead>
              <tbody>
                {rossCohorts.map((c, i) => {
                  const lsDate = new Date(c.arrivalDate);
                  lsDate.setDate(lsDate.getDate() + breedingParams.rossLayStartWeekAge * 7);
                  const leDate = new Date(lsDate);
                  leDate.setDate(leDate.getDate() + breedingParams.rossLayingWeeks * 7);
                  const order = rossPsOrders[i];
                  return (
                    <tr key={c.label} className="border-b border-[var(--border-subtle)]/50 hover:bg-neutral-50">
                      <td className="py-1.5 px-3 text-xs font-semibold text-neutral-800">{c.label}</td>
                      <td className={`py-1.5 px-3 text-xs font-semibold ${c.isPOPast ? "text-red-600" : "text-violet-700"}`}>
                        {fmtDate(c.poDate ?? "")}
                        {c.isPOPast && <span className="ml-1.5 text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded">OVERDUE</span>}
                      </td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-neutral-400">{breedingParams.rossPOLeadWeeks}</td>
                      <td className="py-1.5 px-3 text-xs text-brand-green-dark font-semibold">{fmtDate(c.arrivalDate)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right">{fmtN(c.females)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-neutral-500">{c.layStartWk}</td>
                      <td className="py-1.5 px-3 text-xs text-violet-600">{fmtDate(lsDate.toISOString().slice(0, 10))}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-neutral-400">{c.layEndWk}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-amber-700 font-semibold">{fmtN(c.peakSettableEggs)}</td>
                      <td className="py-1.5 px-3">
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(order)} className="text-[10px] font-semibold text-brand-green hover:underline">Edit</button>
                          <button onClick={() => removeRossPsOrder(order.id)} className="text-[10px] font-semibold text-red-500 hover:underline">Remove</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rossPsOrders.length > 0 && (
        <Card>
          <SectionHead
            title="Ross PS Weekly Production Schedule"
            sub={`HDP ${breedingParams.rossHDP}% × 7 days × settable ratio ${(breedingParams.rossSettableRatio * 100).toFixed(0)}%`}
          />
          <div className="overflow-x-auto">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-neutral-50 z-10">
                  <tr className="border-b-2 border-[var(--border-subtle)]">
                    <Th>Wk</Th><Th>Week Start</Th>
                    <Th right>Active Orders</Th><Th right>Ross PS Females in Lay</Th><Th right>Ross PS Settable Eggs</Th>
                    <Th right>→ Ross Broiler DOC (Wk+{breedingParams.incubationWeeks})</Th>
                  </tr>
                </thead>
                <tbody>
                  {rossWeekly.map((w, i) => {
                    const futureDoc = rows[i + breedingParams.incubationWeeks];
                    return (
                      <tr key={w.week} className={`border-b border-[var(--border-subtle)]/40 hover:bg-neutral-50 ${w.settableEggs === 0 ? "opacity-40" : ""}`}>
                        <td className="py-1.5 px-3 text-xs font-mono text-neutral-400">{w.week}</td>
                        <td className="py-1.5 px-3 text-xs text-neutral-500">{fmtDate(w.weekStart)}</td>
                        <td className="py-1.5 px-3 text-xs font-mono text-right text-neutral-500">{w.activeCohorts > 0 ? w.activeCohorts : "—"}</td>
                        <td className="py-1.5 px-3 text-xs font-mono text-right text-violet-600">{fmtN(w.femalesInLay)}</td>
                        <td className="py-1.5 px-3 text-xs font-mono text-right text-violet-700 font-semibold">{fmtN(w.settableEggs)}</td>
                        <td className="py-1.5 px-3 text-xs font-mono text-right text-sky-600">{futureDoc ? fmtN(futureDoc.broilerFromRoss) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-neutral-200 bg-violet-50/40">
                    <td colSpan={3} className="py-2 px-3 text-xs font-bold">52-Week Totals</td>
                    <td className="py-2 px-3 text-xs font-mono font-bold text-right text-violet-600">{fmtN(rossWeekly.reduce((s, r) => s + r.femalesInLay, 0))}</td>
                    <td className="py-2 px-3 text-xs font-mono font-bold text-right text-violet-700">{fmtN(totalRossEggs)}</td>
                    <td className="py-2 px-3 text-xs font-mono font-bold text-right text-sky-600">{fmtN(rows.reduce((s, r) => s + r.broilerFromRoss, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 3: Hatchery & Broiler DOC ───────────────────────────────────────────

function HatcheryDocTab({ rows }: { rows: BreedingWeekRow[] }) {
  const breedingParams = usePlanStore((s) => s.breedingParams);

  const totalCobbBroiler = rows.reduce((s, r) => s + r.broilerFromCobb, 0);
  const totalRossBroiler = rows.reduce((s, r) => s + r.broilerFromRoss, 0);
  const totalBroiler = totalCobbBroiler + totalRossBroiler;
  const peakWeek = rows.reduce((max, r) => r.totalBroilerDOC > max.totalBroilerDOC ? r : max, rows[0] ?? { totalBroilerDOC: 0, week: 0, weekStart: "" });

  let cumulDOC = 0;
  const tableRows = rows.map((r) => {
    // eggs set THIS week → DOC in week+3
    const cobbEggsSet = r.cobbPsEggs;
    const rossEggsSet = r.rossPsEggs;
    // DOC arriving THIS week (= eggs set 3 weeks ago)
    const srcIdx = r.week - 1 - breedingParams.incubationWeeks;
    const srcRow = rows[srcIdx];
    const cobbEggsAtHatch = srcRow ? srcRow.cobbPsEggs : 0;
    const rossEggsAtHatch = srcRow ? srcRow.rossPsEggs : 0;
    cumulDOC += r.totalBroilerDOC;
    return { ...r, cobbEggsSet, rossEggsSet, cobbEggsAtHatch, rossEggsAtHatch, cumulDOC };
  });

  const chartData = rows.filter((_, i) => i % 2 === 0).map((r) => ({
    week: `Wk ${r.week}`,
    cobb: r.broilerFromCobb,
    ross: r.broilerFromRoss,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Broiler DOC (52-wk)" value={fmtN(totalBroiler)} sub="Cobb + Ross combined" color="green" />
        <Kpi label="From Cobb PS" value={fmtN(totalCobbBroiler)} sub="52-week total" color="green" />
        <Kpi label="From Ross PS" value={fmtN(totalRossBroiler)} sub="52-week total" color="violet" />
        <Kpi label="Peak Week" value={peakWeek.totalBroilerDOC > 0 ? `Wk ${peakWeek.week}` : "—"} sub={`${fmtN(peakWeek.totalBroilerDOC)} DOC — ${fmtDate(peakWeek.weekStart)}`} color="gold" />
      </div>

      {/* Hatchery schedule — full detail */}
      <Card>
        <SectionHead
          title="Hatchery Schedule — PS Eggs In → Broiler DOC Out"
          sub={`${breedingParams.incubationWeeks}-week incubation: eggs SET in week W become DOC in week W+${breedingParams.incubationWeeks}. This table aligns both views per week.`}
        />
        <div className="overflow-x-auto">
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-neutral-50 z-10">
                <tr className="border-b border-neutral-200">
                  <th colSpan={2} className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 text-center border-r border-neutral-200"></th>
                  <th colSpan={3} className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-600 text-center border-r border-neutral-200 bg-amber-50">PS Eggs Set in Hatchery This Week</th>
                  <th colSpan={4} className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-sky-700 text-center bg-sky-50">Broiler DOC Arriving This Week (from wk-{breedingParams.incubationWeeks} eggs)</th>
                </tr>
                <tr className="border-b-2 border-[var(--border-subtle)]">
                  <Th>Wk</Th><Th>Week Start</Th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-amber-700 text-right border-l border-neutral-200 whitespace-nowrap">Cobb PS Eggs</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-violet-600 text-right whitespace-nowrap">Ross PS Eggs</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-600 text-right border-r border-neutral-200 whitespace-nowrap">Total Eggs Set</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-amber-600 text-right bg-sky-50/60 whitespace-nowrap">Eggs at Hatch (Cobb)</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-violet-500 text-right bg-sky-50/60 whitespace-nowrap">Eggs at Hatch (Ross)</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-brand-green text-right bg-sky-50/60 whitespace-nowrap">Cobb Broiler DOC</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-violet-700 text-right bg-sky-50/60 whitespace-nowrap">Ross Broiler DOC</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => {
                  const hasAny = r.cobbEggsSet > 0 || r.rossEggsSet > 0 || r.totalBroilerDOC > 0;
                  return (
                    <tr key={r.week} className={`border-b border-[var(--border-subtle)]/40 hover:bg-neutral-50 ${!hasAny ? "opacity-35" : ""}`}>
                      <td className="py-1.5 px-3 text-xs font-mono text-neutral-400">{r.week}</td>
                      <td className="py-1.5 px-3 text-xs text-neutral-500">{fmtDate(r.weekStart)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-amber-700 border-l border-neutral-100">{fmtN(r.cobbEggsSet)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-violet-600">{fmtN(r.rossEggsSet)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right font-semibold text-neutral-700 border-r border-neutral-200">{fmtN(r.cobbEggsSet + r.rossEggsSet)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-amber-500 bg-sky-50/30">{fmtN(r.cobbEggsAtHatch)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-violet-400 bg-sky-50/30">{fmtN(r.rossEggsAtHatch)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-brand-green-dark font-semibold bg-sky-50/30">{fmtN(r.broilerFromCobb)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-violet-700 font-semibold bg-sky-50/30">{fmtN(r.broilerFromRoss)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-300 bg-brand-green-tint/30">
                  <td colSpan={2} className="py-2 px-3 text-xs font-bold">52-Week Total</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-amber-700 border-l border-neutral-200">{fmtN(rows.reduce((s, r) => s + r.cobbPsEggs, 0))}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-violet-600">{fmtN(rows.reduce((s, r) => s + r.rossPsEggs, 0))}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-neutral-700 border-r border-neutral-200">{fmtN(rows.reduce((s, r) => s + r.cobbPsEggs + r.rossPsEggs, 0))}</td>
                  <td colSpan={2} className="bg-sky-50/30" />
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-brand-green-dark bg-sky-50/30">{fmtN(totalCobbBroiler)}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-violet-700 bg-sky-50/30">{fmtN(totalRossBroiler)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Card>

      {/* Broiler DOC with cumulative */}
      <Card>
        <SectionHead title="Broiler DOC Weekly Supply — Cobb vs Ross" />
        {rows.some((r) => r.totalBroilerDOC > 0) ? (
          <div className="p-5">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="week" tick={{ fontSize: 9 }} interval={3} />
                <YAxis tickFormatter={fmtN} tick={{ fontSize: 10 }} width={52} />
                <Tooltip formatter={(v) => [fmtN(Number(v)), ""]} />
                <Legend />
                <Area type="monotone" dataKey="cobb" name="Cobb PS" stroke="#047836" fill="#d1fae5" strokeWidth={2} stackId="1" />
                <Area type="monotone" dataKey="ross" name="Ross PS" stroke="#7c3aed" fill="#ede9fe" strokeWidth={2} stackId="1" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-8 text-xs text-neutral-400 px-5">
            Broiler DOC appears {breedingParams.cobbLayStartWeekAge + breedingParams.incubationWeeks * 2}+ weeks after GP placement (GP lay-start + incubation + PS grow-out + incubation). Add GP flocks or Ross POs to see projections.
          </div>
        )}
      </Card>

      {/* Cumulative DOC table */}
      {rows.some((r) => r.totalBroilerDOC > 0) && (
        <Card>
          <SectionHead title="Broiler DOC Detailed Weekly Table" sub="Female DOC only — males are byproduct (sold separately)" />
          <div className="overflow-x-auto">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-neutral-50 z-10">
                  <tr className="border-b-2 border-[var(--border-subtle)]">
                    <Th>Wk</Th><Th>Week Start</Th>
                    <Th right>Cobb Broiler DOC</Th><Th right>Ross Broiler DOC</Th>
                    <Th right>Total DOC</Th><Th right>Cumulative DOC</Th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => (
                    <tr key={r.week} className={`border-b border-[var(--border-subtle)]/40 hover:bg-neutral-50 ${r.totalBroilerDOC === 0 ? "opacity-35" : ""}`}>
                      <td className="py-1.5 px-3 text-xs font-mono text-neutral-400">{r.week}</td>
                      <td className="py-1.5 px-3 text-xs text-neutral-500">{fmtDate(r.weekStart)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-brand-green-dark font-semibold">{fmtN(r.broilerFromCobb)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-violet-700 font-semibold">{fmtN(r.broilerFromRoss)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right font-bold text-neutral-800">{fmtN(r.totalBroilerDOC)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-sky-700">{fmtN(r.cumulDOC)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-neutral-300 bg-brand-green-tint/30">
                    <td colSpan={2} className="py-2 px-3 text-xs font-bold">52-Week Total</td>
                    <td className="py-2 px-3 text-xs font-mono font-bold text-right text-brand-green-dark">{fmtN(totalCobbBroiler)}</td>
                    <td className="py-2 px-3 text-xs font-mono font-bold text-right text-violet-700">{fmtN(totalRossBroiler)}</td>
                    <td className="py-2 px-3 text-xs font-mono font-bold text-right text-neutral-800">{fmtN(totalBroiler)}</td>
                    <td className="py-2 px-3 text-xs font-mono font-bold text-right text-sky-700">{fmtN(totalBroiler)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 4: Parameters & Summary ─────────────────────────────────────────────

function SummaryTab({ rows }: { rows: BreedingWeekRow[] }) {
  const breedingParams = usePlanStore((s) => s.breedingParams);
  const setBreedingParams = usePlanStore((s) => s.setBreedingParams);
  const gpFlocks = usePlanStore((s) => s.gpFlocks);
  const rossPsOrders = usePlanStore((s) => s.rossPsOrders);

  const poActionItems = rows.flatMap((r) => r.rossPoOrders);
  const totalBroilerDOC = rows.reduce((s, r) => s + r.totalBroilerDOC, 0);
  const totalGpEggs = rows.reduce((s, r) => s + r.gpSettableEggs, 0);
  const totalCobbPS = rows.reduce((s, r) => s + r.cobbPsDOC, 0);

  const chartData = rows.filter((_, i) => i % 2 === 0).map((r) => ({
    week: `Wk ${r.week}`,
    gpEggs: r.gpSettableEggs,
    cobbPS: r.cobbPsEggs,
    rossPS: r.rossPsEggs,
    broilerCobb: r.broilerFromCobb,
    broilerRoss: r.broilerFromRoss,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="GP Flocks" value={String(gpFlocks.length)} sub={`Cobb-500 · ${fmtN(gpFlocks.reduce((s, f) => s + f.femaleCount, 0))} females`} color="green" />
        <Kpi label="GP Eggs (52-wk)" value={fmtN(totalGpEggs)} sub="settable eggs" color="gold" />
        <Kpi label="Cobb PS DOC (52-wk)" value={fmtN(totalCobbPS)} sub="female DOC placed" color="blue" />
        <Kpi label="Total Broiler DOC (52-wk)" value={fmtN(totalBroilerDOC)} sub="Cobb + Ross combined" color="green" />
      </div>

      {/* Full chain chart */}
      <Card>
        <SectionHead title="Full Pyramid Flow — 52 Weeks" sub="GP Settable Eggs → Cobb/Ross PS Eggs → Broiler DOC" />
        <div className="p-5">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="week" tick={{ fontSize: 9 }} interval={3} />
              <YAxis tickFormatter={fmtN} tick={{ fontSize: 10 }} width={52} />
              <Tooltip formatter={(v) => [fmtN(Number(v)), ""]} />
              <Legend />
              <Area type="monotone" dataKey="gpEggs" name="GP Eggs" stroke="#C49A1A" fill="#fef9c3" strokeWidth={1.5} />
              <Area type="monotone" dataKey="cobbPS" name="Cobb PS Eggs" stroke="#047836" fill="#d1fae5" strokeWidth={1.5} />
              <Area type="monotone" dataKey="rossPS" name="Ross PS Eggs" stroke="#a855f7" fill="#f3e8ff" strokeWidth={1.5} />
              <Area type="monotone" dataKey="broilerCobb" name="Broiler (Cobb)" stroke="#0ea5e9" fill="#e0f2fe" strokeWidth={2} />
              <Area type="monotone" dataKey="broilerRoss" name="Broiler (Ross)" stroke="#7c3aed" fill="#ede9fe" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Full chain table */}
      <Card>
        <SectionHead title="Complete Pipeline — All Stages per Week" sub="GP Eggs → Cobb PS DOC → PS Eggs → Broiler DOC" />
        <div className="overflow-x-auto">
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-neutral-50 z-10">
                <tr className="border-b border-neutral-200">
                  <th colSpan={2} className="border-r border-neutral-200" />
                  <th colSpan={2} className="py-1.5 px-3 text-[10px] font-semibold uppercase tracking-wide text-amber-700 text-center border-r border-neutral-200 bg-amber-50">Stage 1 — GP</th>
                  <th colSpan={3} className="py-1.5 px-3 text-[10px] font-semibold uppercase tracking-wide text-brand-green text-center border-r border-neutral-200 bg-green-50">Stage 2 — PS Supply</th>
                  <th colSpan={3} className="py-1.5 px-3 text-[10px] font-semibold uppercase tracking-wide text-sky-700 text-center bg-sky-50">Stage 3 — Broiler DOC</th>
                </tr>
                <tr className="border-b-2 border-[var(--border-subtle)]">
                  <Th>Wk</Th><Th>Week Start</Th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-amber-600 text-right whitespace-nowrap border-l border-neutral-200 bg-amber-50/40">GP Settable Eggs</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-amber-600 text-right whitespace-nowrap border-r border-neutral-200 bg-amber-50/40">Cobb PS DOC Arriving</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-brand-green text-right whitespace-nowrap bg-green-50/40">Cobb PS Eggs</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-violet-600 text-right whitespace-nowrap bg-green-50/40">Ross PS Eggs</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-600 text-right whitespace-nowrap border-r border-neutral-200 bg-green-50/40">Total PS Eggs</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-brand-green text-right whitespace-nowrap bg-sky-50/40">Cobb Broiler DOC</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-violet-700 text-right whitespace-nowrap bg-sky-50/40">Ross Broiler DOC</th>
                  <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-sky-800 text-right whitespace-nowrap bg-sky-50/40">Total DOC</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const hasAny = r.gpSettableEggs > 0 || r.totalBroilerDOC > 0;
                  return (
                    <tr key={r.week} className={`border-b border-[var(--border-subtle)]/40 hover:bg-neutral-50 ${!hasAny ? "opacity-35" : ""}`}>
                      <td className="py-1.5 px-3 text-xs font-mono text-neutral-400">{r.week}</td>
                      <td className="py-1.5 px-3 text-xs text-neutral-500">{fmtDate(r.weekStart)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-amber-700 border-l border-neutral-100 bg-amber-50/20">{fmtN(r.gpSettableEggs)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-amber-600 border-r border-neutral-200 bg-amber-50/20">{fmtN(r.cobbPsDOC)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-brand-green-dark font-semibold bg-green-50/20">{fmtN(r.cobbPsEggs)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-violet-600 bg-green-50/20">{fmtN(r.rossPsEggs)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right font-bold text-neutral-700 border-r border-neutral-200 bg-green-50/20">{fmtN(r.cobbPsEggs + r.rossPsEggs)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-brand-green-dark bg-sky-50/20">{fmtN(r.broilerFromCobb)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right text-violet-700 bg-sky-50/20">{fmtN(r.broilerFromRoss)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono text-right font-bold text-sky-800 bg-sky-50/20">{fmtN(r.totalBroilerDOC)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-300 bg-neutral-100/50">
                  <td colSpan={2} className="py-2 px-3 text-xs font-bold">52-Week Total</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-amber-700 border-l border-neutral-200">{fmtN(totalGpEggs)}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-amber-600 border-r border-neutral-200">{fmtN(totalCobbPS)}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-brand-green-dark">{fmtN(rows.reduce((s, r) => s + r.cobbPsEggs, 0))}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-violet-600">{fmtN(rows.reduce((s, r) => s + r.rossPsEggs, 0))}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-neutral-700 border-r border-neutral-200">{fmtN(rows.reduce((s, r) => s + r.cobbPsEggs + r.rossPsEggs, 0))}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-brand-green-dark">{fmtN(rows.reduce((s, r) => s + r.broilerFromCobb, 0))}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-violet-700">{fmtN(rows.reduce((s, r) => s + r.broilerFromRoss, 0))}</td>
                  <td className="py-2 px-3 text-xs font-mono font-bold text-right text-sky-800">{fmtN(totalBroilerDOC)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Card>

      {/* Ross PO actions */}
      {poActionItems.length > 0 && (
        <Card>
          <SectionHead title="⚠ Ross PO Actions Required" sub="These purchase orders fall within the planning horizon." />
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full mt-2">
              <thead><tr className="border-b border-[var(--border-subtle)]">
                <Th>Order</Th><Th>PO Issue Date</Th><Th>PS Arrival Date</Th><Th right>Females</Th>
              </tr></thead>
              <tbody>
                {poActionItems.map((po, i) => {
                  const isPast = new Date(po.poDate) < new Date();
                  return (
                    <tr key={i} className="border-b border-[var(--border-subtle)]/50 hover:bg-neutral-50">
                      <td className="py-2 px-3 text-xs font-semibold text-neutral-800">{po.name}</td>
                      <td className={`py-2 px-3 text-xs font-semibold ${isPast ? "text-red-600" : "text-violet-700"}`}>
                        {fmtDate(po.poDate)}
                        {isPast && <span className="ml-1.5 text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded">OVERDUE</span>}
                      </td>
                      <td className="py-2 px-3 text-xs text-brand-green-dark">{fmtDate(po.arrivalDate)}</td>
                      <td className="py-2 px-3 text-xs font-mono text-right">{fmtN(po.femaleCount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Parameters */}
      <Card>
        <SectionHead title="Biological Parameters" sub="Change these to update all calculations above. Values source from AWP flock records." />
        <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Plan Start Date", key: "planStartDate" as const, type: "date" },
            { label: "Horizon (weeks)", key: "planHorizonWeeks" as const, type: "number" },
            { label: "Incubation Weeks", key: "incubationWeeks" as const, type: "number" },
            { label: "Ross PO Lead Weeks", key: "rossPOLeadWeeks" as const, type: "number" },
            { label: "GP Laying Weeks", key: "gpLayingWeeks" as const, type: "number" },
            { label: "GP HDP (%)", key: "gpHDP" as const, type: "number" },
            { label: "GP Settable Ratio", key: "gpSettableRatio" as const, type: "number" },
            { label: "GP Hatch Rate", key: "gpHatchRate" as const, type: "number" },
            { label: "Cobb PS Lay Start Age", key: "cobbLayStartWeekAge" as const, type: "number" },
            { label: "Cobb PS Laying Weeks", key: "cobbLayingWeeks" as const, type: "number" },
            { label: "Cobb PS HDP (%)", key: "cobbHDP" as const, type: "number" },
            { label: "Cobb PS Hatch Rate", key: "cobbHatchRate" as const, type: "number" },
            { label: "Ross PS Lay Start Age", key: "rossLayStartWeekAge" as const, type: "number" },
            { label: "Ross PS Laying Weeks", key: "rossLayingWeeks" as const, type: "number" },
            { label: "Ross PS HDP (%)", key: "rossHDP" as const, type: "number" },
            { label: "Ross PS Hatch Rate", key: "rossHatchRate" as const, type: "number" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</label>
              <input
                type={type}
                className="cell-input mt-1 w-full"
                value={String(breedingParams[key])}
                onChange={(e) => setBreedingParams({ [key]: type === "number" ? Number(e.target.value) : e.target.value })}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS = ["GP Supply", "PS Supply", "Hatchery & DOC", "Summary & Parameters"] as const;
type Tab = (typeof TABS)[number];

export function BreedingPyramid() {
  const gpFlocks = usePlanStore((s) => s.gpFlocks);
  const rossPsOrders = usePlanStore((s) => s.rossPsOrders);
  const breedingParams = usePlanStore((s) => s.breedingParams);
  const [activeTab, setActiveTab] = useState<Tab>("GP Supply");

  const rows = useMemo(
    () => computeBreedingPyramid(gpFlocks, rossPsOrders, breedingParams),
    [gpFlocks, rossPsOrders, breedingParams],
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-neutral-800">Breeding Pyramid Plan</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          GP (Cobb-500) → PS DOC → PS laying → Broiler DOC · Ross-308 PS from external supplier (52-wk PO lead time) · 52-week horizon
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-[var(--border-subtle)]">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-brand-green text-brand-green-dark"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "GP Supply"            && <GpSupplyTab />}
      {activeTab === "PS Supply"            && <PsSupplyTab rows={rows} />}
      {activeTab === "Hatchery & DOC"       && <HatcheryDocTab rows={rows} />}
      {activeTab === "Summary & Parameters" && <SummaryTab rows={rows} />}
    </div>
  );
}

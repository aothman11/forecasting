"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { usePlanStore } from "@/lib/store";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fmtBirds(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}K`
    : String(Math.round(n));
}

function fmtTons(kg: number) {
  return `${(kg / 1000).toFixed(1)} t`;
}

function addDaysToIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function daysBetween(isoA: string, isoB: string): number {
  return Math.round(
    (new Date(isoB + "T00:00:00").getTime() - new Date(isoA + "T00:00:00").getTime()) / 86_400_000,
  );
}

function isoWeekRange(startIso: string): string {
  const end = addDaysToIso(startIso, 6);
  return `${fmtDate(startIso)} – ${fmtDate(end)}`;
}

// ─── Data model ───────────────────────────────────────────────────────────────

interface CatchRow {
  placementDate: string;
  catchDate: string;
  catchDayIndex: number;   // days from planStartDate
  catchWeekNum: number;    // 1-based week of the plan
  houses: number;
  chicksPlaced: number;
  liveBirds: number;
  liveKg: number;
  ageAtCatch: number;      // days
}

interface WeekSummary {
  weekNum: number;
  weekLabel: string;       // "Wk 4 · 18 Aug – 24 Aug"
  weekStart: string;       // ISO of Monday
  rows: CatchRow[];
  totalHouses: number;
  totalLiveBirds: number;
  totalLiveKg: number;
}

// ─── Derive catching schedule from placement days ────────────────────────────

function buildCatchSchedule(
  placementDays: { dayIndex: number; date: string; farmsPlacing: number; chicksPerHouse: number }[],
  planStartDate: string,
  cycleLengthDays: number,
  mortalityRate: number,
  avgLiveWeightKg: number,
): CatchRow[] {
  // NOTE: placementDays[i].date is the CATCHING (harvest) date — Step 1 stores it that way.
  // The placement date is back-calculated as catchDate − cycleLengthDays.
  // Do NOT add cycleLengthDays again here; dayIndex already points to the catch day.
  void planStartDate; // planStartDate not needed — dates come directly from placementDays
  return placementDays
    .filter((d) => d.farmsPlacing > 0 && d.chicksPerHouse > 0)
    .map((d) => {
      const chicksPlaced = d.farmsPlacing * d.chicksPerHouse;
      const ageAtCatch = Math.round(cycleLengthDays);
      const catchDate = d.date;                                          // already the catch date
      const catchDayIndex = d.dayIndex;                                  // already the catch day index
      const placementDate = addDaysToIso(d.date, -ageAtCatch);          // back-calculate placement
      const liveBirds = Math.round(chicksPlaced * (1 - mortalityRate));
      const liveKg = liveBirds * avgLiveWeightKg;
      const catchWeekNum = Math.floor(catchDayIndex / 7) + 1;
      return {
        placementDate,
        catchDate,
        catchDayIndex,
        catchWeekNum,
        houses: d.farmsPlacing,
        chicksPlaced,
        liveBirds,
        liveKg,
        ageAtCatch,
      };
    })
    .sort((a, b) => a.catchDayIndex - b.catchDayIndex);
}

function groupByWeek(rows: CatchRow[], planStartDate: string): WeekSummary[] {
  const map = new Map<number, CatchRow[]>();
  for (const r of rows) {
    const list = map.get(r.catchWeekNum) ?? [];
    list.push(r);
    map.set(r.catchWeekNum, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([weekNum, weekRows]) => {
      const weekStart = addDaysToIso(planStartDate, (weekNum - 1) * 7);
      return {
        weekNum,
        weekLabel: `Wk ${weekNum} · ${isoWeekRange(weekStart)}`,
        weekStart,
        rows: weekRows,
        totalHouses: weekRows.reduce((s, r) => s + r.houses, 0),
        totalLiveBirds: weekRows.reduce((s, r) => s + r.liveBirds, 0),
        totalLiveKg: weekRows.reduce((s, r) => s + r.liveKg, 0),
      };
    });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-[var(--border-subtle)] p-5 ${className}`}>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "gold" | "blue";
}) {
  const color =
    accent === "green"
      ? "text-brand-green-dark"
      : accent === "gold"
      ? "text-amber-700"
      : accent === "blue"
      ? "text-sky-700"
      : "text-neutral-800";
  return (
    <div className="bg-white rounded-xl border border-[var(--border-subtle)] p-4">
      <div className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function WeekBarChart({ weeks, activeWeekNum }: { weeks: WeekSummary[]; activeWeekNum: number }) {
  const data = weeks.slice(0, 8).map((w) => ({
    label: `Wk ${w.weekNum}`,
    liveKg: Math.round(w.totalLiveKg / 1000), // tonnes
    active: w.weekNum === activeWeekNum,
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tickFormatter={(v) => `${v}t`} tick={{ fontSize: 10 }} width={36} />
        <Tooltip formatter={(v) => [`${v} t`, "Live weight"]} />
        <Bar dataKey="liveKg" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.active ? "#047836" : "#d1fae5"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function CatchTable({ rows }: { rows: CatchRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-neutral-400">
        No catching activity in this week.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            {[
              "Catch Date",
              "Placement Date",
              "Age at Catch",
              "Houses",
              "Chicks Placed",
              "Mortality",
              "Live Birds",
              "Live Weight",
            ].map((h) => (
              <th
                key={h}
                className="text-left py-2 px-3 text-[10px] uppercase tracking-wide text-neutral-500 font-semibold whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const mortality = r.chicksPlaced - r.liveBirds;
            return (
              <tr key={i} className="border-b border-[var(--border-subtle)]/50 hover:bg-neutral-50">
                <td className="py-2 px-3 font-semibold text-brand-green-dark whitespace-nowrap">
                  {fmtDate(r.catchDate)}
                </td>
                <td className="py-2 px-3 text-neutral-500 whitespace-nowrap">
                  {fmtDate(r.placementDate)}
                </td>
                <td className="py-2 px-3 text-neutral-600 font-mono">
                  {r.ageAtCatch} days
                </td>
                <td className="py-2 px-3 font-mono font-semibold text-neutral-800">
                  {r.houses}
                </td>
                <td className="py-2 px-3 font-mono text-neutral-600">
                  {fmtBirds(r.chicksPlaced)}
                </td>
                <td className="py-2 px-3 font-mono text-red-500">
                  -{fmtBirds(mortality)}
                </td>
                <td className="py-2 px-3 font-mono font-bold text-neutral-800">
                  {fmtBirds(r.liveBirds)}
                </td>
                <td className="py-2 px-3 font-mono font-bold text-sky-700">
                  {fmtTons(r.liveKg)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-200 bg-brand-green-tint/30">
            <td className="py-2 px-3 font-bold text-neutral-700 text-xs" colSpan={3}>
              Week Total
            </td>
            <td className="py-2 px-3 font-bold font-mono text-neutral-800 text-xs">
              {rows.reduce((s, r) => s + r.houses, 0)}
            </td>
            <td className="py-2 px-3 font-bold font-mono text-neutral-800 text-xs">
              {fmtBirds(rows.reduce((s, r) => s + r.chicksPlaced, 0))}
            </td>
            <td className="py-2 px-3 font-bold font-mono text-red-500 text-xs">
              -{fmtBirds(rows.reduce((s, r) => s + (r.chicksPlaced - r.liveBirds), 0))}
            </td>
            <td className="py-2 px-3 font-bold font-mono text-neutral-800 text-xs">
              {fmtBirds(rows.reduce((s, r) => s + r.liveBirds, 0))}
            </td>
            <td className="py-2 px-3 font-bold font-mono text-sky-700 text-xs">
              {fmtTons(rows.reduce((s, r) => s + r.liveKg, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Cycle Gantt ─────────────────────────────────────────────────────────────

function CycleGantt({ rows }: { rows: CatchRow[] }) {
  if (rows.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);

  // Window: earliest placement date → last catch date + 7 days buffer
  const winStart = rows.reduce(
    (m, r) => (r.placementDate < m ? r.placementDate : m),
    rows[0].placementDate,
  );
  const lastCatch = rows.reduce(
    (m, r) => (r.catchDate > m ? r.catchDate : m),
    rows[0].catchDate,
  );
  const winEnd = addDaysToIso(lastCatch, 7);
  const totalDays = Math.max(1, daysBetween(winStart, winEnd));

  // Week tick marks: find the Monday on or before winStart
  const startDate = new Date(winStart + "T00:00:00");
  const dow = startDate.getDay(); // 0=Sun
  const mondayShift = dow === 0 ? -6 : 1 - dow;
  const firstMonday = addDaysToIso(winStart, mondayShift);
  const weekMarkers: string[] = [];
  let wk = firstMonday;
  while (wk <= winEnd) {
    weekMarkers.push(wk);
    wk = addDaysToIso(wk, 7);
  }

  const pct = (iso: string) =>
    Math.max(0, Math.min(100, (daysBetween(winStart, iso) / totalDays) * 100));

  const todayPct = pct(today);
  const showToday = today >= winStart && today <= winEnd;
  const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  return (
    <div className="bg-white rounded-xl border border-[var(--border-subtle)] overflow-hidden shadow-sm">
      <div className="px-5 pt-4 pb-3">
        {/* heading + legend */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Production Cycle Timeline
          </span>
          <div className="flex-1 h-px bg-[var(--border-subtle)]" />
          <div className="flex items-center gap-3 text-[10px] text-neutral-400 shrink-0">
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-4 h-2 rounded-sm"
                style={{ background: "linear-gradient(90deg,#c8e6d5,#047836)" }}
              />
              Grow period
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm bg-brand-gold" />
              Catch date
            </span>
            {showToday && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-0.5 h-3 rounded bg-brand-alert" />
                Today
              </span>
            )}
          </div>
        </div>

        {/* Gantt layout */}
        <div className="flex">
          {/* Labels column */}
          <div className="shrink-0" style={{ width: 52 }}>
            {/* spacer aligns with ruler row */}
            <div style={{ height: 28 }} />
            {rows.map((_, i) => (
              <div key={i} className="flex items-center justify-end pr-2" style={{ height: 40 }}>
                <span
                  className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0"
                  style={{ background: "var(--brand-green)" }}
                >
                  {LABELS[i] ?? i + 1}
                </span>
              </div>
            ))}
          </div>

          {/* Tracks column — position:relative so today line can span full height */}
          <div className="flex-1 relative border-l border-[var(--border-subtle)]">

            {/* Week ruler */}
            <div className="relative border-b border-[var(--border-subtle)]" style={{ height: 28 }}>
              {weekMarkers.map((iso) => {
                const p = pct(iso);
                if (p < 0 || p > 100) return null;
                return (
                  <div key={iso} className="absolute top-0 bottom-0" style={{ left: `${p}%` }}>
                    <div className="w-px h-full bg-[var(--border-subtle)]" />
                    <span
                      className="absolute text-[9px] font-medium text-neutral-400 whitespace-nowrap"
                      style={{ top: 6, left: 3 }}
                    >
                      {fmtDate(iso)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Cohort rows */}
            {rows.map((row, i) => {
              const barLeft = pct(row.placementDate);
              const barWidth = (row.ageAtCatch / totalDays) * 100;
              return (
                <div
                  key={i}
                  className="relative border-b border-[var(--border-subtle)]/40 last:border-0"
                  style={{ height: 40 }}
                >
                  {/* Alternating column stripes */}
                  {weekMarkers.map((iso, wi) => {
                    if (wi % 2 !== 0) return null;
                    const p1 = pct(iso);
                    const p2 = pct(addDaysToIso(iso, 7));
                    return (
                      <div
                        key={iso}
                        className="absolute inset-y-0 bg-brand-green-tint/25 pointer-events-none"
                        style={{ left: `${Math.max(0, p1)}%`, width: `${Math.min(100, p2) - Math.max(0, p1)}%` }}
                      />
                    );
                  })}

                  {/* Grow bar */}
                  <div
                    className="absolute rounded overflow-visible"
                    title={`Cohort ${LABELS[i] ?? i + 1} · Placed ${fmtDate(row.placementDate)} → Catch ${fmtDate(row.catchDate)} · ${row.houses} houses · ${fmtBirds(row.liveBirds)} birds · ${fmtTons(row.liveKg)}`}
                    style={{
                      left: `${barLeft}%`,
                      width: `${barWidth}%`,
                      top: 7,
                      bottom: 7,
                      background: "linear-gradient(90deg,#c8e6d5 0%,#047836 100%)",
                      opacity: 0.88,
                    }}
                  >
                    {/* Bar label */}
                    <span
                      className="absolute text-[9px] font-semibold text-white/90 whitespace-nowrap pointer-events-none select-none"
                      style={{ left: 6, top: "50%", transform: "translateY(-50%)", textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
                    >
                      {row.houses}h · {fmtBirds(row.liveBirds)}
                    </span>
                    {/* Catch dot */}
                    <span
                      className="absolute rounded-full border-2 border-white shadow-sm"
                      style={{
                        right: -5,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 12,
                        height: 12,
                        background: "var(--brand-gold)",
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Today line — spans ruler + all rows */}
            {showToday && (
              <div
                className="absolute top-0 bottom-0 z-10 pointer-events-none"
                style={{ left: `${todayPct}%`, width: 2, background: "var(--brand-alert)" }}
              >
                <span
                  className="absolute text-[9px] font-bold whitespace-nowrap px-1 rounded"
                  style={{ top: 4, left: 4, color: "var(--brand-alert)", background: "rgba(255,255,255,0.85)" }}
                >
                  Today
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
      <div className="text-5xl">🐥</div>
      <div className="text-sm font-semibold text-neutral-600">No placement data yet</div>
      <div className="text-xs text-neutral-400 max-w-xs">
        Enter chick placements in <strong>Step 1 — Placement Plan</strong> first. The catching
        schedule is calculated from those placements plus the grow-out cycle length.
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ShortTermPlanning() {
  const placementDays = usePlanStore((s) => s.placementDays);
  const params = usePlanStore((s) => s.params);

  const { cycleLengthDays, mortalityRate, avgLiveWeightKg, planStartDate } = params;

  const catchSchedule = useMemo(
    () => buildCatchSchedule(placementDays, planStartDate, cycleLengthDays, mortalityRate, avgLiveWeightKg),
    [placementDays, planStartDate, cycleLengthDays, mortalityRate, avgLiveWeightKg],
  );

  const weekSummaries = useMemo(() => groupByWeek(catchSchedule, planStartDate), [catchSchedule, planStartDate]);

  const firstWeekNum = weekSummaries[0]?.weekNum ?? 1;
  const [activeWeekNum, setActiveWeekNum] = useState<number>(firstWeekNum);

  // Keep active week valid if data changes
  const validWeekNum = weekSummaries.some((w) => w.weekNum === activeWeekNum)
    ? activeWeekNum
    : (weekSummaries[0]?.weekNum ?? 1);

  const activeWeek = weekSummaries.find((w) => w.weekNum === validWeekNum);
  const hasData = catchSchedule.length > 0;

  // 4-week window of summaries centred around active week
  const windowStart = Math.max(0, weekSummaries.findIndex((w) => w.weekNum === validWeekNum) - 1);
  const windowWeeks = weekSummaries.slice(windowStart, windowStart + 4);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-bold text-neutral-800">Broiler Short-Term Catching Plan</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Weekly catch schedule derived from Step 1 placements. Catch date = placement date + {Math.round(cycleLengthDays)} days grow-out.
          Mortality rate {(mortalityRate * 100).toFixed(1)}% · Average live weight {avgLiveWeightKg} kg/bird.
        </p>
      </div>

      {!hasData ? (
        <Card>
          <EmptyState />
        </Card>
      ) : (
        <>
          {/* Gantt cycle timeline */}
          <CycleGantt rows={catchSchedule} />

          {/* Week selector + bar chart overview */}
          <Card>
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              {/* Left: week picker */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-neutral-600 mb-3">Select Catching Week</div>
                <div className="flex flex-wrap gap-1.5">
                  {weekSummaries.map((w) => (
                    <button
                      key={w.weekNum}
                      onClick={() => setActiveWeekNum(w.weekNum)}
                      className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors border whitespace-nowrap ${
                        validWeekNum === w.weekNum
                          ? "bg-brand-green text-white border-brand-green shadow-sm"
                          : "border-[var(--border-subtle)] text-neutral-600 hover:border-brand-green hover:text-brand-green"
                      }`}
                    >
                      <div>{`Wk ${w.weekNum}`}</div>
                      <div className="text-[9px] opacity-80 font-normal">{fmtDate(w.weekStart)}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: 4-week bar chart */}
              <div className="lg:w-64 shrink-0">
                <div className="text-xs font-semibold text-neutral-600 mb-2">Live Weight by Week (t)</div>
                <WeekBarChart weeks={weekSummaries} activeWeekNum={validWeekNum} />
              </div>
            </div>
          </Card>

          {/* KPI cards for active week */}
          {activeWeek && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Catching Week"
                value={`Wk ${activeWeek.weekNum}`}
                sub={isoWeekRange(activeWeek.weekStart)}
                accent="green"
              />
              <KpiCard
                label="Live Birds to Plant"
                value={fmtBirds(activeWeek.totalLiveBirds)}
                sub={`from ${fmtBirds(activeWeek.rows.reduce((s, r) => s + r.chicksPlaced, 0))} placed`}
                accent="blue"
              />
              <KpiCard
                label="Total Live Weight"
                value={fmtTons(activeWeek.totalLiveKg)}
                sub={`avg ${avgLiveWeightKg} kg/bird`}
                accent="gold"
              />
              <KpiCard
                label="Houses Catching"
                value={String(activeWeek.totalHouses)}
                sub={`${activeWeek.rows.length} placement batch${activeWeek.rows.length !== 1 ? "es" : ""}`}
              />
            </div>
          )}

          {/* 4-week window summary strip */}
          {windowWeeks.length > 1 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {windowWeeks.map((w) => (
                <button
                  key={w.weekNum}
                  onClick={() => setActiveWeekNum(w.weekNum)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    w.weekNum === validWeekNum
                      ? "border-brand-green bg-brand-green-tint shadow-sm"
                      : "border-[var(--border-subtle)] bg-white hover:border-brand-green/50"
                  }`}
                >
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide font-semibold mb-1">
                    Wk {w.weekNum} · {fmtDate(w.weekStart)}
                  </div>
                  <div className="text-base font-bold text-neutral-800">{fmtTons(w.totalLiveKg)}</div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">{fmtBirds(w.totalLiveBirds)} birds</div>
                </button>
              ))}
            </div>
          )}

          {/* Detailed daily catch table */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-neutral-800">
                Daily Catching Schedule — {activeWeek ? `Wk ${activeWeek.weekNum}` : ""}
              </h3>
              {activeWeek && (
                <span className="text-xs text-neutral-500">
                  {isoWeekRange(activeWeek.weekStart)}
                </span>
              )}
            </div>
            <CatchTable rows={activeWeek?.rows ?? []} />
          </Card>

          {/* Info note */}
          <p className="text-[11px] text-neutral-400 px-1">
            ℹ Catch dates are computed as Placement Date + {Math.round(cycleLengthDays)} days (cycle length from Parameters).
            Adjust cycle length, mortality rate, or live weight in the Parameters panel (⚙) to update this schedule.
          </p>
        </>
      )}
    </div>
  );
}

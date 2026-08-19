"use client";

import { useMemo } from "react";
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

function WeekBarChart({ weeks }: { weeks: WeekSummary[] }) {
  const data = weeks.slice(0, 12).map((w) => ({
    label: `Wk ${w.weekNum}`,
    liveKg: Math.round(w.totalLiveKg / 1000), // tonnes
  }));

  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tickFormatter={(v) => `${v}t`} tick={{ fontSize: 10 }} width={36} />
        <Tooltip formatter={(v) => [`${v} t`, "Live weight"]} />
        <Bar dataKey="liveKg" radius={[3, 3, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill="#047836" fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Full-schedule table (all weeks at once) ──────────────────────────────────

function FullScheduleTable({ weeks }: { weeks: WeekSummary[] }) {
  if (weeks.length === 0) return null;

  const planTotalHouses    = weeks.reduce((s, w) => s + w.totalHouses, 0);
  const planTotalChicks    = weeks.reduce((s, w) => s + w.rows.reduce((rs, r) => rs + r.chicksPlaced, 0), 0);
  const planTotalMortality = weeks.reduce((s, w) => s + w.rows.reduce((rs, r) => rs + (r.chicksPlaced - r.liveBirds), 0), 0);
  const planTotalLiveBirds = weeks.reduce((s, w) => s + w.totalLiveBirds, 0);
  const planTotalLiveKg    = weeks.reduce((s, w) => s + w.totalLiveKg, 0);

  const cols = ["Catch Date", "Placed", "Age", "Houses", "Chicks", "Mortality", "Live Birds", "Live Weight"];

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] shadow-sm">
      <table className="w-full text-xs border-collapse">
        {/* Sticky column headers */}
        <thead>
          <tr className="bg-brand-green-tint border-b border-[var(--border-subtle)]">
            {cols.map((h, i) => (
              <th
                key={h}
                className={`py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wide text-brand-green-dark whitespace-nowrap
                  ${i >= 3 ? "text-right" : "text-left"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {weeks.map((week) => (
            <>
              {/* ── Week group header ── */}
              <tr key={`wk-${week.weekNum}-hdr`} className="bg-neutral-50 border-y border-[var(--border-subtle)]">
                <td colSpan={3} className="py-1.5 px-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Week {week.weekNum}
                  </span>
                  <span className="text-[10px] text-neutral-400 ml-2">{isoWeekRange(week.weekStart)}</span>
                </td>
                <td className="py-1.5 px-3 text-right">
                  <span className="text-[10px] font-semibold text-neutral-600">{week.totalHouses}</span>
                </td>
                <td className="py-1.5 px-3 text-right">
                  <span className="text-[10px] text-neutral-400">
                    {fmtBirds(week.rows.reduce((s, r) => s + r.chicksPlaced, 0))}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-right">
                  <span className="text-[10px] text-neutral-400">
                    -{fmtBirds(week.rows.reduce((s, r) => s + (r.chicksPlaced - r.liveBirds), 0))}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-right">
                  <span className="text-[10px] font-semibold text-neutral-600">{fmtBirds(week.totalLiveBirds)}</span>
                </td>
                <td className="py-1.5 px-3 text-right">
                  <span className="text-[10px] font-semibold text-neutral-600">{fmtTons(week.totalLiveKg)}</span>
                </td>
              </tr>

              {/* ── Catch-event rows for this week ── */}
              {week.rows.map((r, i) => {
                const mortality = r.chicksPlaced - r.liveBirds;
                return (
                  <tr
                    key={`wk-${week.weekNum}-row-${i}`}
                    className="border-b border-[var(--border-subtle)]/50 bg-white hover:bg-neutral-50 transition-colors"
                  >
                    <td className="py-2 px-3 font-semibold text-brand-green-dark whitespace-nowrap">
                      {fmtDate(r.catchDate)}
                    </td>
                    <td className="py-2 px-3 text-neutral-500 whitespace-nowrap">
                      {fmtDate(r.placementDate)}
                    </td>
                    <td className="py-2 px-3 text-neutral-600 font-mono">
                      {r.ageAtCatch}d
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold text-neutral-800 text-right">
                      {r.houses}
                    </td>
                    <td className="py-2 px-3 font-mono text-neutral-500 text-right">
                      {fmtBirds(r.chicksPlaced)}
                    </td>
                    <td className="py-2 px-3 font-mono text-red-500 text-right">
                      -{fmtBirds(mortality)}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-neutral-800 text-right">
                      {fmtBirds(r.liveBirds)}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-sky-700 text-right">
                      {fmtTons(r.liveKg)}
                    </td>
                  </tr>
                );
              })}
            </>
          ))}
        </tbody>

        {/* Plan grand total */}
        <tfoot>
          <tr className="border-t-2 border-neutral-300 bg-brand-green-tint/50">
            <td colSpan={3} className="py-2.5 px-3 text-xs font-bold text-neutral-700">
              Plan Total
            </td>
            <td className="py-2.5 px-3 font-bold font-mono text-neutral-800 text-right text-xs">
              {planTotalHouses}
            </td>
            <td className="py-2.5 px-3 font-bold font-mono text-neutral-800 text-right text-xs">
              {fmtBirds(planTotalChicks)}
            </td>
            <td className="py-2.5 px-3 font-bold font-mono text-red-600 text-right text-xs">
              -{fmtBirds(planTotalMortality)}
            </td>
            <td className="py-2.5 px-3 font-bold font-mono text-neutral-800 text-right text-xs">
              {fmtBirds(planTotalLiveBirds)}
            </td>
            <td className="py-2.5 px-3 font-bold font-mono text-sky-700 text-right text-xs">
              {fmtTons(planTotalLiveKg)}
            </td>
          </tr>
        </tfoot>
      </table>
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
  const hasData = catchSchedule.length > 0;

  // Plan-level totals for KPI strip
  const planTotalLiveBirds = useMemo(() => weekSummaries.reduce((s, w) => s + w.totalLiveBirds, 0), [weekSummaries]);
  const planTotalLiveKg    = useMemo(() => weekSummaries.reduce((s, w) => s + w.totalLiveKg, 0), [weekSummaries]);
  const planTotalHouses    = useMemo(() => weekSummaries.reduce((s, w) => s + w.totalHouses, 0), [weekSummaries]);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-bold text-neutral-800">Broiler Short-Term Catching Plan</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Full catch schedule derived from Step 1 placements. Catch date = placement date + {Math.round(cycleLengthDays)} days grow-out.
          Mortality {(mortalityRate * 100).toFixed(1)}% · Avg live weight {avgLiveWeightKg} kg/bird.
        </p>
      </div>

      {!hasData ? (
        <Card>
          <EmptyState />
        </Card>
      ) : (
        <>
          {/* Plan KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Catching Weeks"
              value={String(weekSummaries.length)}
              sub={weekSummaries.length > 0 ? `${fmtDate(weekSummaries[0].weekStart)} – ${fmtDate(addDaysToIso(weekSummaries[weekSummaries.length - 1].weekStart, 6))}` : undefined}
              accent="green"
            />
            <KpiCard
              label="Total Live Birds"
              value={fmtBirds(planTotalLiveBirds)}
              sub={`from ${fmtBirds(catchSchedule.reduce((s, r) => s + r.chicksPlaced, 0))} placed`}
              accent="blue"
            />
            <KpiCard
              label="Total Live Weight"
              value={fmtTons(planTotalLiveKg)}
              sub={`avg ${avgLiveWeightKg} kg/bird`}
              accent="gold"
            />
            <KpiCard
              label="Total Houses"
              value={String(planTotalHouses)}
              sub={`${catchSchedule.length} catching event${catchSchedule.length !== 1 ? "s" : ""}`}
            />
          </div>

          {/* Bar chart overview */}
          <Card className="!p-4">
            <div className="text-xs font-semibold text-neutral-600 mb-2">Live Weight by Week (t)</div>
            <WeekBarChart weeks={weekSummaries} />
          </Card>

          {/* Full schedule table */}
          <FullScheduleTable weeks={weekSummaries} />

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

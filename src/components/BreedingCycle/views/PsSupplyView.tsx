"use client";
/**
 * PsSupplyView — PS cohort tracking + weekly PS egg production + broiler DOC gap.
 *
 * Shows:
 *   1. PS Cohort Register — all PS cohorts (Cobb from GP hatchery + Ross from orders)
 *   2. Weekly broiler DOC supply vs demand table
 */

import React, { useMemo, useState } from "react";
import type { BreedingCycleResult, PsCohort } from "@/lib/breedingCycleTypes";
import { bceWeekStart } from "@/lib/breedingCycleEngine";

const N = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const Nk = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M`
  : v >= 1000    ? `${(v / 1000).toFixed(1)}k`
  : N.format(Math.round(v));

interface Props {
  cycleResult: BreedingCycleResult;
  horizonWeeks: number;
  planStartDate: string;
}

// ─── Cohort status ─────────────────────────────────────────────────────────────

function cohortStatus(c: PsCohort, planWeek: number): "future" | "rearing" | "laying" | "completed" {
  if (planWeek < c.docArrivalWeek) return "future";
  if (planWeek < c.layStartWeek)   return "rearing";
  if (planWeek < c.layEndWeek)     return "laying";
  return "completed";
}

const ST_COLORS: Record<string, { bg: string; text: string }> = {
  future:    { bg: "rgba(156,163,175,0.15)", text: "#6b7280" },
  rearing:   { bg: "rgba(59,130,246,0.12)",  text: "#1d4ed8" },
  laying:    { bg: "rgba(4,120,54,0.12)",     text: "#047836" },
  completed: { bg: "rgba(107,114,128,0.08)", text: "#9ca3af" },
};

// ─── Main component ───────────────────────────────────────────────────────────

export function PsSupplyView({ cycleResult, horizonWeeks, planStartDate }: Props) {
  const [showAll, setShowAll] = useState(false);

  const currentPlanWeek = 1; // Always show status at week 1 for the register

  // Build week table rows for the gap analysis
  const weekRows = useMemo(() => {
    const rows: Array<{
      week: number;
      weekStart: string;
      cobbEggs: number;
      rossEggs: number;
      totalEggs: number;
      cobbDOC: number;
      rossDOC: number;
      totalDOC: number;
      demand: number;
      gap: number;
    }> = [];
    for (let w = 1; w <= horizonWeeks; w++) {
      const ps  = cycleResult.psEggsByWeek.get(w)        ?? { cobb: 0, ross: 0, total: 0 };
      const doc = cycleResult.broilerDOCSupply.get(w)    ?? { cobb: 0, ross: 0, total: 0 };
      const dem = cycleResult.broilerDOCDemand.get(w)    ?? 0;
      if (ps.total === 0 && doc.total === 0 && dem === 0) continue;
      rows.push({
        week: w,
        weekStart: bceWeekStart(planStartDate, w),
        cobbEggs:  ps.cobb,   rossEggs: ps.ross,   totalEggs: ps.total,
        cobbDOC:   doc.cobb,  rossDOC:  doc.ross,  totalDOC:  doc.total,
        demand:    dem,       gap:       doc.total - dem,
      });
    }
    return rows;
  }, [cycleResult, horizonWeeks, planStartDate]);

  const shortageRows = weekRows.filter((r) => r.gap < 0);
  const surplusRows  = weekRows.filter((r) => r.gap > 0 && r.demand > 0);

  // Cohort list
  const displayedCohorts = showAll ? cycleResult.psCohorts : cycleResult.psCohorts.slice(0, 20);

  return (
    <div className="p-6 space-y-6">
      {/* ── KPI pills ── */}
      <div className="flex flex-wrap gap-3">
        <Pill label="PS Cohorts" value={String(cycleResult.psCohorts.length)} color="blue" />
        <Pill label="Cobb PS" value={String(cycleResult.psCohorts.filter((c) => c.breed === "cobb").length)} color="gold" />
        <Pill label="Ross PS"  value={String(cycleResult.psCohorts.filter((c) => c.breed === "ross").length)} color="blue" />
        <Pill label="Shortage Weeks" value={String(shortageRows.length)} color={shortageRows.length > 0 ? "alert" : "green"} />
        <Pill label="Surplus Weeks"  value={String(surplusRows.length)}  color="green" />
      </div>

      {/* ── PS Cohort register ── */}
      <section className="bg-white border border-[var(--border-subtle)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-800">PS Cohort Register</h3>
          <span className="text-xs text-neutral-400">{cycleResult.psCohorts.length} cohorts</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-50/70">
                {["Source", "Breed", "DOC Arrival Wk", "DOC Females", "Lay Start Wk", "Lay End Wk", "Status at W1"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-neutral-600 border-b border-blue-100 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedCohorts.map((c) => {
                const status = cohortStatus(c, currentPlanWeek);
                const sc = ST_COLORS[status];
                return (
                  <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-3 py-2 font-medium text-neutral-700 max-w-[200px] truncate" title={c.sourceName}>{c.sourceName}</td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: c.breed === "cobb" ? "rgba(180,83,9,0.12)" : "rgba(59,130,246,0.12)", color: c.breed === "cobb" ? "#92400e" : "#1d4ed8" }}>
                        {c.breed === "cobb" ? "Cobb-500" : "Ross-308"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-600">W{c.docArrivalWeek}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-neutral-800">{N.format(Math.round(c.docFemaleCount))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-600">W{c.layStartWeek}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-600">W{c.layEndWeek}</td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize"
                        style={{ background: sc.bg, color: sc.text }}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {cycleResult.psCohorts.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400 text-xs">
                  No PS cohorts yet. Enter a catching plan or add Ross PS orders to generate cohorts.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {cycleResult.psCohorts.length > 20 && (
          <div className="px-4 py-2 border-t border-[var(--border-subtle)]">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-brand-green hover:underline"
            >
              {showAll ? "Show less ↑" : `Show all ${cycleResult.psCohorts.length} cohorts ↓`}
            </button>
          </div>
        )}
      </section>

      {/* ── Weekly DOC gap table ── */}
      <section className="bg-white border border-[var(--border-subtle)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold text-neutral-800">Broiler DOC — Weekly Supply vs Demand</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: "var(--brand-green-tint)" }}>
                {["Week", "Date", "Cobb PS Eggs", "Ross PS Eggs", "Total PS Eggs", "Cobb DOC", "Ross DOC", "Total DOC Supply", "DOC Demand", "Gap"].map((h) => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-neutral-700 border-b border-green-200 whitespace-nowrap text-[11px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekRows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-neutral-400">
                  No data yet — add a catching plan to see demand.
                </td></tr>
              ) : (
                weekRows.map((r) => (
                  <tr key={r.week} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-3 py-1.5 font-medium text-neutral-700">W{r.week}</td>
                    <td className="px-3 py-1.5 text-right text-neutral-500 tabular-nums">{r.weekStart}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">{Nk(r.cobbEggs)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">{Nk(r.rossEggs)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-neutral-700">{Nk(r.totalEggs)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">{Nk(r.cobbDOC)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">{Nk(r.rossDOC)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-bold text-green-700">{Nk(r.totalDOC)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-700">{Nk(r.demand)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-bold"
                      style={{ color: r.gap < 0 ? "#d24918" : r.gap === 0 ? "#6b7280" : "#047836" }}>
                      {r.gap >= 0 ? "+" : ""}{Nk(r.gap)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── Pill helper ──────────────────────────────────────────────────────────────

function Pill({ label, value, color }: { label: string; value: string; color: "green" | "gold" | "alert" | "blue" | "neutral" }) {
  const styles: Record<string, { bg: string; text: string }> = {
    green:   { bg: "rgba(4,120,54,0.10)",   text: "#047836" },
    gold:    { bg: "rgba(196,154,26,0.12)",  text: "#c49a1a" },
    alert:   { bg: "rgba(210,73,24,0.10)",   text: "#d24918" },
    blue:    { bg: "rgba(59,130,246,0.12)",  text: "#1d4ed8" },
    neutral: { bg: "rgba(107,114,128,0.10)", text: "#6b7280" },
  };
  const s = styles[color];
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-transparent text-xs" style={{ background: s.bg }}>
      <span className="text-neutral-500">{label}</span>
      <span className="font-bold tabular-nums" style={{ color: s.text }}>{value}</span>
    </div>
  );
}

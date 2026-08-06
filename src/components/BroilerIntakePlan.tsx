"use client";

import { useMemo } from "react";
import * as XLSX from "xlsx";
import { usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import { explodeSalesPlan, weeksInPlan, plantsInPlan } from "@/lib/processingPlanCalc";

// ─── constants ────────────────────────────────────────────────────────────────

/** Maps the pipeline's internal plant keys to SAP plant codes used in the Processing Plan. */
const PIPELINE_PLANT_TO_CODE: Record<string, string> = {
  plant1: "1100",
  plant2: "1200",
  plant3: "1300",
};

// ─── week helpers ─────────────────────────────────────────────────────────────

/** Convert a plan-relative week number (1-indexed from planStartDate) to ISO week-of-year. */
function planWeekToISOWeek(planWeek: number, planStartDate: string): number {
  const [y, m, d] = planStartDate.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d + (planWeek - 1) * 7));
  const day = base.getUTCDay() || 7;
  base.setUTCDate(base.getUTCDate() + 4 - day); // shift to Thursday of the ISO week
  const yearStart = new Date(Date.UTC(base.getUTCFullYear(), 0, 1));
  return Math.ceil((((base.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ─── number formatters ────────────────────────────────────────────────────────

function fmtNum(n: number) { return Math.round(n).toLocaleString(); }
function fmtKg(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

// ─── coverage badge ───────────────────────────────────────────────────────────

function CoverageBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-neutral-300 text-xs">—</span>;
  const cls =
    pct >= 100 ? "bg-green-100 text-green-800 border-green-200" :
    pct >= 80  ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                 "bg-red-100 text-red-800 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cls}`}>
      {pct >= 100 ? "✓" : "✗"} {pct.toFixed(0)}%
    </span>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function BroilerIntakePlan() {
  const salesPlanCartonRows = usePlanStore((s) => s.salesPlanCartonRows);
  const bomRecords          = usePlanStore((s) => s.bomRecords);
  const params              = usePlanStore((s) => s.params);
  const setProcessingPlanOpen = usePlanStore((s) => s.setProcessingPlanOpen);
  const setBroilerIntakeOpen  = usePlanStore((s) => s.setBroilerIntakeOpen);

  // ── production pipeline supply ──
  const { result } = usePipeline();

  // Build a supply map: plantCode::isoWeek → available carcass KG + birds
  const supplyMap = useMemo(() => {
    const m = new Map<string, { carcassKg: number; birds: number }>();
    for (const pw of result.plants) {
      const code = PIPELINE_PLANT_TO_CODE[pw.plant];
      if (!code) continue;
      const isoWeek = planWeekToISOWeek(pw.week, params.planStartDate);
      const key = `${code}::${isoWeek}`;
      const cur = m.get(key) ?? { carcassKg: 0, birds: 0 };
      m.set(key, { carcassKg: cur.carcassKg + pw.carcassKg, birds: cur.birds + pw.birds });
    }
    return m;
  }, [result.plants, params.planStartDate]);

  // ── processing plan demand ──
  const { cells } = useMemo(
    () =>
      salesPlanCartonRows.length > 0
        ? explodeSalesPlan(salesPlanCartonRows, bomRecords, params.gradeYields)
        : { cells: [], unmatched: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salesPlanCartonRows, bomRecords, JSON.stringify(params.gradeYields)]
  );

  // Aggregate demand to plant × week (sum all grade pools)
  const demandMap = useMemo(() => {
    const m = new Map<string, { carcassKg: number; cartons: number }>();
    for (const c of cells) {
      const key = `${c.plant}::${c.week}`;
      const cur = m.get(key) ?? { carcassKg: 0, cartons: 0 };
      m.set(key, { carcassKg: cur.carcassKg + c.requiredCarcassKg, cartons: cur.cartons + c.cartons });
    }
    return m;
  }, [cells]);

  const weeks  = useMemo(() => weeksInPlan(cells),  [cells]);
  const plants = useMemo(() => plantsInPlan(cells), [cells]);

  const hasData = cells.length > 0;

  // ── summary KPIs ──
  const totalReqKg = useMemo(
    () => [...demandMap.values()].reduce((s, v) => s + v.carcassKg, 0),
    [demandMap]
  );
  const totalAvailKg = useMemo(
    () => [...demandMap.keys()].reduce((s, k) => s + (supplyMap.get(k)?.carcassKg ?? 0), 0),
    [demandMap, supplyMap]
  );
  const shortfallWeeks = useMemo(() => {
    if (!hasData) return 0;
    return weeks.filter((w) => {
      const reqKg   = plants.reduce((s, p) => s + (demandMap.get(`${p}::${w}`)?.carcassKg ?? 0), 0);
      const availKg = plants.reduce((s, p) => s + (supplyMap.get(`${p}::${w}`)?.carcassKg ?? 0), 0);
      return availKg < reqKg;
    }).length;
  }, [weeks, plants, demandMap, supplyMap, hasData]);

  // ── navigation ──
  const goToProcessingPlan = () => { setBroilerIntakeOpen(false); setProcessingPlanOpen(true); };

  // ── export ──
  const handleExport = () => {
    const rows: Record<string, unknown>[] = [];
    for (const plant of plants) {
      for (const week of weeks) {
        const d = demandMap.get(`${plant}::${week}`);
        const s = supplyMap.get(`${plant}::${week}`);
        const reqKg   = d?.carcassKg ?? 0;
        const availKg = s?.carcassKg ?? 0;
        rows.push({
          Plant: plant,
          "ISO Week": week,
          "Required Carcass KG": parseFloat(reqKg.toFixed(2)),
          "Required Birds": Math.round(params.avgCarcassWeightKg > 0 ? reqKg / params.avgCarcassWeightKg : 0),
          "Available Carcass KG (Pipeline)": parseFloat(availKg.toFixed(2)),
          "Available Birds (Pipeline)": Math.round(s?.birds ?? 0),
          "Gap KG": parseFloat((availKg - reqKg).toFixed(2)),
          "Coverage %": reqKg > 0 ? parseFloat(((availKg / reqKg) * 100).toFixed(1)) : null,
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Broiler Intake");
    XLSX.writeFile(wb, "AWP_Broiler_Intake_Plan.xlsx");
  };

  // ── empty state ──
  if (!hasData) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-brand-green-dark">Broiler Intake Plan</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Pipeline supply vs processing demand — by plant × week.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-4">
          <div className="text-2xl mt-0.5">📋</div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-900">No processing demand data yet</div>
            <div className="text-xs text-amber-800 mt-1 leading-relaxed">
              The Broiler Intake Plan is driven by the <strong>Processing Plan</strong>. Upload your SAP
              sales plan in <strong>Demand Plan (M1)</strong> first, then come back here.
            </div>
            <button
              onClick={goToProcessingPlan}
              className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
            >
              → Go to Processing Plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-brand-green-dark">Broiler Intake Plan</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Pipeline supply (from Placement Plan) vs processing demand (from SAP sales plan) — by plant × week.
        </p>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-3">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Required Carcass</div>
          <div className="text-xl font-bold text-neutral-800 tabular-nums mt-1">{fmtKg(totalReqKg)} KG</div>
          <div className="text-[11px] text-neutral-400">from sales plan demand</div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-3">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Pipeline Supply</div>
          <div className="text-xl font-bold text-blue-700 tabular-nums mt-1">{fmtKg(totalAvailKg)} KG</div>
          <div className="text-[11px] text-neutral-400">from placement schedule</div>
        </div>
        <div className={`rounded-xl border shadow-sm p-3 ${totalAvailKg >= totalReqKg ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Total Gap</div>
          <div className={`text-xl font-bold tabular-nums mt-1 ${totalAvailKg >= totalReqKg ? "text-green-700" : "text-red-700"}`}>
            {totalAvailKg >= totalReqKg ? "+" : ""}{fmtKg(totalAvailKg - totalReqKg)} KG
          </div>
          <div className="text-[11px] text-neutral-400">supply minus demand</div>
        </div>
        <div className={`rounded-xl border shadow-sm p-3 ${shortfallWeeks === 0 ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Shortfall Weeks</div>
          <div className={`text-xl font-bold tabular-nums mt-1 ${shortfallWeeks === 0 ? "text-green-700" : "text-red-700"}`}>
            {shortfallWeeks}
          </div>
          <div className="text-[11px] text-neutral-400">weeks under-covered</div>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-neutral-500">
        <span>
          🔗 <strong>Supply</strong> comes from the Production Pipeline (Placement Plan → grow-out → slaughter).
          Adjust placement in <strong>Step 1</strong> to close any shortfall.
          <span className="ml-2 text-neutral-400">
            Pipeline weeks mapped to ISO weeks via plan start date ({params.planStartDate}).
            Plants: plant1→1100, plant2→1200, plant3→1300.
          </span>
        </span>
        <button
          onClick={handleExport}
          className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-neutral-700 hover:border-brand-green hover:text-brand-green-dark transition-colors"
        >
          ⬇ Export Excel
        </button>
      </div>

      {/* Per-plant tables */}
      {plants.map((plant) => {
        const plantReqKg   = weeks.reduce((s, w) => s + (demandMap.get(`${plant}::${w}`)?.carcassKg ?? 0), 0);
        const plantAvailKg = weeks.reduce((s, w) => s + (supplyMap.get(`${plant}::${w}`)?.carcassKg ?? 0), 0);
        const plantCovPct  = plantReqKg > 0 ? (plantAvailKg / plantReqKg) * 100 : null;

        return (
          <div key={plant} className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
            {/* Plant header */}
            <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-3 bg-brand-green-tint flex-wrap">
              <span className="font-bold text-brand-green-dark text-sm">Plant {plant}</span>
              <span className="text-xs text-neutral-600">
                Required: <span className="font-semibold tabular-nums">{fmtKg(plantReqKg)}</span> KG
              </span>
              <span className="text-xs text-neutral-600">
                Available: <span className="font-semibold tabular-nums text-blue-700">{fmtKg(plantAvailKg)}</span> KG
              </span>
              {plantCovPct !== null && <CoverageBadge pct={plantCovPct} />}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-500 text-[11px] uppercase tracking-wide">
                    <th className="px-3 py-2.5 text-left sticky left-0 bg-neutral-50 z-10 w-40">Metric</th>
                    {weeks.map((w) => (
                      <th key={w} className="px-3 py-2.5 text-right whitespace-nowrap font-semibold">Wk {w}</th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Required carcass KG */}
                  <tr className="border-t border-[var(--border-subtle)] bg-white">
                    <td className="px-3 py-2 text-neutral-600 sticky left-0 bg-white z-10 font-medium whitespace-nowrap">
                      Required (KG)
                    </td>
                    {weeks.map((w) => {
                      const d = demandMap.get(`${plant}::${w}`);
                      return (
                        <td key={w} className="px-3 py-2 text-right tabular-nums text-neutral-700 font-semibold">
                          {d ? fmtKg(d.carcassKg) : <span className="text-neutral-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-neutral-700">{fmtKg(plantReqKg)}</td>
                  </tr>

                  {/* Available from pipeline */}
                  <tr className="border-t border-[var(--border-subtle)] bg-blue-50/30">
                    <td className="px-3 py-2 text-blue-700 font-medium sticky left-0 bg-blue-50/30 z-10 whitespace-nowrap">
                      Pipeline supply (KG)
                    </td>
                    {weeks.map((w) => {
                      const s = supplyMap.get(`${plant}::${w}`);
                      return (
                        <td key={w} className="px-3 py-2 text-right tabular-nums text-blue-700 font-semibold">
                          {s ? fmtKg(s.carcassKg) : <span className="text-neutral-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-blue-700">{fmtKg(plantAvailKg)}</td>
                  </tr>

                  {/* Available birds from pipeline */}
                  <tr className="border-t border-[var(--border-subtle)] bg-neutral-50/40">
                    <td className="px-3 py-2 text-neutral-400 sticky left-0 bg-neutral-50/40 z-10 whitespace-nowrap">
                      Pipeline birds
                    </td>
                    {weeks.map((w) => {
                      const s = supplyMap.get(`${plant}::${w}`);
                      return (
                        <td key={w} className="px-3 py-2 text-right tabular-nums text-neutral-500">
                          {s ? fmtNum(s.birds) : <span className="text-neutral-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                      {fmtNum(weeks.reduce((s, w) => s + (supplyMap.get(`${plant}::${w}`)?.birds ?? 0), 0))}
                    </td>
                  </tr>

                  {/* Gap KG */}
                  <tr className="border-t border-[var(--border-subtle)] bg-white">
                    <td className="px-3 py-2 text-neutral-400 sticky left-0 bg-white z-10 whitespace-nowrap">
                      Gap (KG)
                    </td>
                    {weeks.map((w) => {
                      const d = demandMap.get(`${plant}::${w}`);
                      const s = supplyMap.get(`${plant}::${w}`);
                      if (!d) return <td key={w} className="px-3 py-2 text-right text-neutral-200">—</td>;
                      const gap = (s?.carcassKg ?? 0) - d.carcassKg;
                      return (
                        <td key={w} className={`px-3 py-2 text-right tabular-nums font-semibold ${gap >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {(gap >= 0 ? "+" : "") + fmtKg(gap)}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2 text-right tabular-nums font-bold ${plantAvailKg >= plantReqKg ? "text-green-700" : "text-red-700"}`}>
                      {(plantAvailKg >= plantReqKg ? "+" : "") + fmtKg(plantAvailKg - plantReqKg)}
                    </td>
                  </tr>

                  {/* Coverage % */}
                  <tr className="border-t border-neutral-100 bg-neutral-50/50">
                    <td className="px-3 py-2 text-neutral-400 sticky left-0 bg-neutral-50/50 z-10 whitespace-nowrap">
                      Coverage
                    </td>
                    {weeks.map((w) => {
                      const d = demandMap.get(`${plant}::${w}`);
                      const s = supplyMap.get(`${plant}::${w}`);
                      const pct = d && d.carcassKg > 0 ? ((s?.carcassKg ?? 0) / d.carcassKg) * 100 : null;
                      return (
                        <td key={w} className="px-3 py-2 text-center">
                          <CoverageBadge pct={pct} />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">
                      <CoverageBadge pct={plantCovPct} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import * as XLSX from "xlsx";
import { usePlanStore } from "@/lib/store";
import { explodeSalesPlan, weeksInPlan, plantsInPlan } from "@/lib/processingPlanCalc";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number) {
  return Math.round(n).toLocaleString();
}
function fmtKg(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

// ─── coverage badge ───────────────────────────────────────────────────────────

function CoverageBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-neutral-300 text-xs">—</span>;
  const cls =
    pct >= 100
      ? "bg-green-100 text-green-800 border-green-200"
      : pct >= 80
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : "bg-red-100 text-red-800 border-red-200";
  const icon = pct >= 100 ? "✓" : "✗";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cls}`}>
      {icon} {pct.toFixed(0)}%
    </span>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function BroilerIntakePlan() {
  const salesPlanCartonRows = usePlanStore((s) => s.salesPlanCartonRows);
  const bomRecords = usePlanStore((s) => s.bomRecords);
  const params = usePlanStore((s) => s.params);
  const broilerCapacity = usePlanStore((s) => s.broilerCapacity);
  const setBroilerCapacity = usePlanStore((s) => s.setBroilerCapacity);
  const setProcessingPlanOpen = usePlanStore((s) => s.setProcessingPlanOpen);
  const setBroilerIntakeOpen = usePlanStore((s) => s.setBroilerIntakeOpen);

  const avgCarcassWeightKg = params.avgCarcassWeightKg; // e.g. 0.83

  // ── explosion (memoised) ──
  const { cells } = useMemo(
    () =>
      salesPlanCartonRows.length > 0
        ? explodeSalesPlan(salesPlanCartonRows, bomRecords, params.gradeYields)
        : { cells: [], unmatched: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salesPlanCartonRows, bomRecords, JSON.stringify(params.gradeYields)]
  );

  // ── aggregate to plant × week (sum all grade pools) ──
  const demandMap = useMemo(() => {
    const m = new Map<string, { carcassKg: number; cartons: number }>();
    for (const c of cells) {
      const key = `${c.plant}::${c.week}`;
      const cur = m.get(key) ?? { carcassKg: 0, cartons: 0 };
      m.set(key, { carcassKg: cur.carcassKg + c.requiredCarcassKg, cartons: cur.cartons + c.cartons });
    }
    return m;
  }, [cells]);

  const weeks = useMemo(() => weeksInPlan(cells), [cells]);
  const plants = useMemo(() => plantsInPlan(cells), [cells]);

  const hasData = cells.length > 0;

  // ── summary KPIs ──
  const totalBirdsRequired = useMemo(
    () => (avgCarcassWeightKg > 0 ? [...demandMap.values()].reduce((s, v) => s + v.carcassKg, 0) / avgCarcassWeightKg : 0),
    [demandMap, avgCarcassWeightKg]
  );

  const totalBirdsAvailable = useMemo(
    () => Object.values(broilerCapacity).reduce((s, v) => s + v, 0),
    [broilerCapacity]
  );

  const shortfallWeeks = useMemo(() => {
    if (!hasData) return 0;
    return weeks.reduce((count, w) => {
      const totalReqKg = plants.reduce((s, p) => {
        const d = demandMap.get(`${p}::${w}`);
        return s + (d?.carcassKg ?? 0);
      }, 0);
      const totalAvailBirds = plants.reduce((s, p) => s + (broilerCapacity[`${p}::${w}`] ?? 0), 0);
      const availKg = totalAvailBirds * avgCarcassWeightKg;
      return count + (availKg < totalReqKg ? 1 : 0);
    }, 0);
  }, [weeks, plants, demandMap, broilerCapacity, avgCarcassWeightKg, hasData]);

  // ── navigate to Processing Plan ──
  const goToProcessingPlan = () => {
    setBroilerIntakeOpen(false);
    setProcessingPlanOpen(true);
  };

  // ── export ──
  const handleExport = () => {
    const rows: Record<string, unknown>[] = [];
    for (const plant of plants) {
      for (const week of weeks) {
        const d = demandMap.get(`${plant}::${week}`);
        const reqKg = d?.carcassKg ?? 0;
        const reqBirds = avgCarcassWeightKg > 0 ? reqKg / avgCarcassWeightKg : 0;
        const availBirds = broilerCapacity[`${plant}::${week}`] ?? 0;
        const availKg = availBirds * avgCarcassWeightKg;
        rows.push({
          Plant: plant,
          Week: week,
          "Required Carcass KG": parseFloat(reqKg.toFixed(2)),
          "Required Birds": Math.round(reqBirds),
          "Available Birds": availBirds,
          "Available Carcass KG": parseFloat(availKg.toFixed(2)),
          "Gap Birds": Math.round(availBirds - reqBirds),
          "Coverage %": reqBirds > 0 ? parseFloat(((availBirds / reqBirds) * 100).toFixed(1)) : null,
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Broiler Intake");
    XLSX.writeFile(wb, "AWP_Broiler_Intake_Plan.xlsx");
  };

  if (!hasData) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-brand-green-dark">Broiler Intake Plan</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Weekly live bird intake required to meet processing demand — plant by plant.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-4">
          <div className="text-2xl mt-0.5">📋</div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-900">No processing demand data yet</div>
            <div className="text-xs text-amber-800 mt-1 leading-relaxed">
              The Broiler Intake Plan is driven by the <strong>Processing Plan</strong>. Upload your SAP sales plan in <strong>Demand Plan (M1)</strong> first, then come back here.
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
          Weekly live bird intake required to meet processing demand. Enter available birds per plant × week to check coverage.
        </p>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-3">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Birds Required</div>
          <div className="text-xl font-bold text-neutral-800 tabular-nums mt-1">{fmtNum(totalBirdsRequired)}</div>
          <div className="text-[11px] text-neutral-400">total across all weeks</div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-3">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Birds Available</div>
          <div className="text-xl font-bold text-blue-700 tabular-nums mt-1">{fmtNum(totalBirdsAvailable)}</div>
          <div className="text-[11px] text-neutral-400">as entered below</div>
        </div>
        <div className={`rounded-xl border shadow-sm p-3 ${shortfallWeeks > 0 ? "border-red-200 bg-red-50/50" : "border-green-200 bg-green-50/50"}`}>
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Shortfall Weeks</div>
          <div className={`text-xl font-bold tabular-nums mt-1 ${shortfallWeeks > 0 ? "text-red-700" : "text-green-700"}`}>
            {shortfallWeeks}
          </div>
          <div className="text-[11px] text-neutral-400">weeks under-covered</div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-3">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Avg Carcass Weight</div>
          <div className="text-xl font-bold text-neutral-700 tabular-nums mt-1">{avgCarcassWeightKg.toFixed(2)} kg</div>
          <div className="text-[11px] text-neutral-400">live-to-carcass conversion</div>
        </div>
      </div>

      {/* Info + Export row */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-neutral-500">
        <span>
          💡 <strong>Birds Required</strong> = Carcass KG needed ÷ {avgCarcassWeightKg} kg/bird.
          Enter your available birds per cell — green = covered, red = shortfall.
        </span>
        <button
          onClick={handleExport}
          className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-neutral-700 hover:border-brand-green hover:text-brand-green-dark transition-colors"
        >
          ⬇ Export Excel
        </button>
      </div>

      {/* Plant × Week pivot tables */}
      {plants.map((plant) => {
        const plantReqKg = weeks.reduce((s, w) => s + (demandMap.get(`${plant}::${w}`)?.carcassKg ?? 0), 0);
        const plantAvailBirds = weeks.reduce((s, w) => s + (broilerCapacity[`${plant}::${w}`] ?? 0), 0);
        const plantReqBirds = avgCarcassWeightKg > 0 ? plantReqKg / avgCarcassWeightKg : 0;
        const plantCovPct = plantReqBirds > 0 ? (plantAvailBirds / plantReqBirds) * 100 : null;

        return (
          <div key={plant} className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
            {/* Plant header */}
            <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-3 bg-brand-green-tint">
              <span className="font-bold text-brand-green-dark text-sm">Plant {plant}</span>
              <span className="text-xs text-neutral-600">
                Required: <span className="font-semibold tabular-nums">{fmtNum(plantReqBirds)}</span> birds
                ({fmtKg(plantReqKg)} KG)
              </span>
              {plantCovPct !== null && <CoverageBadge pct={plantCovPct} />}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-500 text-[11px] uppercase tracking-wide">
                    <th className="px-3 py-2.5 text-left sticky left-0 bg-neutral-50 z-10 w-36">Metric</th>
                    {weeks.map((w) => (
                      <th key={w} className="px-3 py-2.5 text-right whitespace-nowrap font-semibold">Wk {w}</th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Required birds row */}
                  <tr className="border-t border-[var(--border-subtle)] bg-white">
                    <td className="px-3 py-2 text-neutral-500 sticky left-0 bg-white z-10 font-medium whitespace-nowrap">
                      Required birds
                    </td>
                    {weeks.map((w) => {
                      const d = demandMap.get(`${plant}::${w}`);
                      const reqBirds = d && avgCarcassWeightKg > 0 ? d.carcassKg / avgCarcassWeightKg : 0;
                      return (
                        <td key={w} className="px-3 py-2 text-right tabular-nums text-neutral-700 font-semibold">
                          {d ? fmtNum(reqBirds) : <span className="text-neutral-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-neutral-700">
                      {fmtNum(plantReqBirds)}
                    </td>
                  </tr>

                  {/* Required carcass KG row */}
                  <tr className="border-t border-[var(--border-subtle)] bg-neutral-50/40">
                    <td className="px-3 py-2 text-neutral-400 sticky left-0 bg-neutral-50/40 z-10 whitespace-nowrap">
                      Carcass KG req.
                    </td>
                    {weeks.map((w) => {
                      const d = demandMap.get(`${plant}::${w}`);
                      return (
                        <td key={w} className="px-3 py-2 text-right tabular-nums text-neutral-500">
                          {d ? fmtKg(d.carcassKg) : <span className="text-neutral-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{fmtKg(plantReqKg)}</td>
                  </tr>

                  {/* Available birds row — editable */}
                  <tr className="border-t border-[var(--border-subtle)] bg-blue-50/30">
                    <td className="px-3 py-2 text-blue-700 font-medium sticky left-0 bg-blue-50/30 z-10 whitespace-nowrap">
                      Available birds ✏
                    </td>
                    {weeks.map((w) => {
                      const val = broilerCapacity[`${plant}::${w}`] ?? 0;
                      const d = demandMap.get(`${plant}::${w}`);
                      const reqBirds = d && avgCarcassWeightKg > 0 ? d.carcassKg / avgCarcassWeightKg : 0;
                      const isShortfall = d && val > 0 && val < reqBirds;
                      const isCovered = d && val >= reqBirds;
                      return (
                        <td key={w} className="px-1.5 py-1.5 text-right">
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={val === 0 ? "" : val}
                            placeholder="—"
                            onChange={(e) => {
                              const n = parseFloat(e.target.value);
                              setBroilerCapacity(plant, w, isNaN(n) ? 0 : Math.max(0, n));
                            }}
                            className={`w-24 text-right text-xs px-2 py-1 rounded border font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-green transition-colors
                              ${isCovered ? "border-green-300 bg-green-50 text-green-800 focus:ring-green-400"
                                : isShortfall ? "border-red-300 bg-red-50 text-red-800 focus:ring-red-400"
                                : "border-[var(--border-subtle)] bg-white text-neutral-700"}`}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-blue-700">
                      {fmtNum(plantAvailBirds)}
                    </td>
                  </tr>

                  {/* Gap row */}
                  <tr className="border-t border-[var(--border-subtle)] bg-white">
                    <td className="px-3 py-2 text-neutral-400 sticky left-0 bg-white z-10 whitespace-nowrap">
                      Gap (birds)
                    </td>
                    {weeks.map((w) => {
                      const d = demandMap.get(`${plant}::${w}`);
                      if (!d) return <td key={w} className="px-3 py-2 text-right text-neutral-200">—</td>;
                      const reqBirds = avgCarcassWeightKg > 0 ? d.carcassKg / avgCarcassWeightKg : 0;
                      const avail = broilerCapacity[`${plant}::${w}`] ?? 0;
                      const gap = avail - reqBirds;
                      const hasInput = avail > 0;
                      return (
                        <td key={w} className={`px-3 py-2 text-right tabular-nums font-semibold ${hasInput ? (gap >= 0 ? "text-green-700" : "text-red-700") : "text-neutral-300"}`}>
                          {hasInput ? (gap >= 0 ? "+" : "") + fmtNum(gap) : "—"}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2 text-right tabular-nums font-bold ${plantAvailBirds > 0 ? (plantAvailBirds >= plantReqBirds ? "text-green-700" : "text-red-700") : "text-neutral-300"}`}>
                      {plantAvailBirds > 0 ? (plantAvailBirds >= plantReqBirds ? "+" : "") + fmtNum(plantAvailBirds - plantReqBirds) : "—"}
                    </td>
                  </tr>

                  {/* Coverage % row */}
                  <tr className="border-t border-neutral-100 bg-neutral-50/50">
                    <td className="px-3 py-2 text-neutral-400 sticky left-0 bg-neutral-50/50 z-10 whitespace-nowrap">
                      Coverage
                    </td>
                    {weeks.map((w) => {
                      const d = demandMap.get(`${plant}::${w}`);
                      if (!d) return <td key={w} className="px-3 py-2 text-center text-neutral-200">—</td>;
                      const reqBirds = avgCarcassWeightKg > 0 ? d.carcassKg / avgCarcassWeightKg : 0;
                      const avail = broilerCapacity[`${plant}::${w}`] ?? 0;
                      const pct = reqBirds > 0 && avail > 0 ? (avail / reqBirds) * 100 : null;
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

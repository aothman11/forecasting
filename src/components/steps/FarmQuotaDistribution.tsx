"use client";

import { useMemo, useState } from "react";
import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";
import { computeFarmQuota, computeFarmWeekRollups, validateFarmQuotas } from "@/lib/farmQuota";
import { exportMEQ1ToExcel } from "@/lib/export";
import { SummaryCard } from "../shared/SummaryCard";
import type { Farm } from "@/lib/types";

function num(n: number) {
  return Math.round(n).toLocaleString();
}

// ── Inline editable cell ─────────────────────────────────────────────────────
function EditCell({
  value,
  onChange,
  type = "text",
  min,
  max,
  className = "",
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number";
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full px-2 py-1 text-sm border border-transparent rounded hover:border-[var(--border-subtle)] focus:border-brand-green focus:outline-none bg-transparent ${className}`}
    />
  );
}

// ── Farm roster row ──────────────────────────────────────────────────────────
function FarmRow({
  farm,
  onUpdate,
  onRemove,
}: {
  farm: Farm;
  onUpdate: (patch: Partial<Farm>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className={`border-b border-[var(--border-subtle)] ${!farm.active ? "opacity-50" : ""}`}>
      <td className="px-2 py-1.5">
        <input
          type="checkbox"
          checked={farm.active}
          onChange={(e) => onUpdate({ active: e.target.checked })}
          className="accent-brand-green w-4 h-4"
        />
      </td>
      <td className="px-1 py-1">
        <EditCell value={farm.name} onChange={(v) => onUpdate({ name: v })} />
      </td>
      <td className="px-1 py-1">
        <EditCell value={farm.sapVendorCode} onChange={(v) => onUpdate({ sapVendorCode: v })} />
      </td>
      <td className="px-1 py-1 w-24">
        <EditCell
          value={farm.quotaSharePct}
          type="number"
          min={0}
          max={100}
          onChange={(v) => onUpdate({ quotaSharePct: parseFloat(v) || 0 })}
          className="text-right"
        />
      </td>
      <td className="px-1 py-1 w-28">
        <EditCell
          value={farm.maxHousesPerDay}
          type="number"
          min={0}
          onChange={(v) => onUpdate({ maxHousesPerDay: parseInt(v) || 0 })}
          className="text-right"
        />
      </td>
      <td className="px-2 py-1 text-center">
        <button
          onClick={onRemove}
          title="Remove farm"
          className="text-neutral-400 hover:text-brand-alert text-base leading-none px-1"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function FarmQuotaDistribution() {
  const { result, params } = usePipeline();
  const farms = usePlanStore((s) => s.farms);
  const addFarm = usePlanStore((s) => s.addFarm);
  const updateFarm = usePlanStore((s) => s.updateFarm);
  const removeFarm = usePlanStore((s) => s.removeFarm);

  const [activeTab, setActiveTab] = useState<"weekly" | "daily">("weekly");

  const validationError = useMemo(() => validateFarmQuotas(farms), [farms]);

  const allocs = useMemo(
    () => computeFarmQuota(result.placementDays, farms, params.chicksPerHouse),
    [result.placementDays, farms, params.chicksPerHouse]
  );

  const rollups = useMemo(
    () => computeFarmWeekRollups(allocs, farms, params.chicksPerHouse),
    [allocs, farms, params.chicksPerHouse]
  );

  const activeFarms = farms.filter((f) => f.active);
  const totalShare = activeFarms.reduce((s, f) => s + f.quotaSharePct, 0);
  const totalChicks = rollups.reduce((s, r) => s + r.totalChicks, 0) / activeFarms.length || 0;
  const totalHouses = rollups.reduce((s, r) => s + r.totalHouses, 0) / activeFarms.length || 0;

  const weeks = Array.from(new Set(rollups.map((r) => r.week))).sort((a, b) => a - b);

  function handleAddFarm() {
    addFarm({
      id: `farm-${Date.now()}`,
      name: "New Farm",
      sapVendorCode: "",
      quotaSharePct: 0,
      maxHousesPerDay: 0,
      active: true,
    });
  }

  function handleExport() {
    exportMEQ1ToExcel(rollups, farms, result.placementDays, params.chicksPerHouse);
  }

  // Weekly table: rows = farms, columns = weeks
  const weeklyRows = activeFarms.map((farm) => {
    const byWeek = new Map(rollups.filter((r) => r.farmId === farm.id).map((r) => [r.week, r]));
    return { farm, byWeek };
  });

  // Daily table: rows = days × farms (flat)
  const dailyRows = result.placementDays
    .filter((d) => d.farmsPlacing > 0)
    .flatMap((d) =>
      activeFarms.map((f) => {
        const alloc = allocs.find((a) => a.date === d.date && a.farmId === f.id);
        return { date: d.date, farm: f, houses: alloc?.housesAllocated ?? 0, chicks: alloc?.chicksAllocated ?? 0 };
      })
    );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold section-title">Step 7 — Farm Quota Distribution</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Distribute daily chick placements across contracted farms and export the SAP MEQ1 quota arrangement file.
        </p>
      </div>

      {/* Validation banner */}
      {validationError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <span className="text-base">⚠</span>
          {validationError}
        </div>
      )}

      {/* Summary cards */}
      <div className="flex flex-wrap gap-3">
        <SummaryCard label="Active Farms" value={String(activeFarms.length)} accent="green" />
        <SummaryCard
          label="Total Quota Share"
          value={`${totalShare.toFixed(1)}%`}
          accent={Math.abs(totalShare - 100) < 0.5 ? "green" : "alert"}
        />
        <SummaryCard label="Avg Houses / Farm" value={num(totalHouses)} />
        <SummaryCard label="Avg Chicks / Farm" value={num(totalChicks)} accent="gold" />
      </div>

      {/* Farm Roster ────────────────────────────────────── */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]">
          <span className="font-semibold text-sm text-neutral-700">Farm Roster</span>
          <div className="flex gap-2">
            <button
              onClick={handleAddFarm}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-brand-green text-brand-green hover:bg-brand-green-tint transition-colors"
            >
              + Add Farm
            </button>
            <button
              onClick={handleExport}
              disabled={!!validationError}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↓ Export MEQ1
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-subtle)] text-xs text-neutral-500 uppercase tracking-wide">
                <th className="px-2 py-2 text-left w-8">Active</th>
                <th className="px-2 py-2 text-left">Farm Name</th>
                <th className="px-2 py-2 text-left">SAP Vendor Code</th>
                <th className="px-2 py-2 text-right w-24">Quota %</th>
                <th className="px-2 py-2 text-right w-36">Max Houses/Day<br /><span className="text-[10px] normal-case font-normal">(0 = unlimited)</span></th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {farms.map((farm) => (
                <FarmRow
                  key={farm.id}
                  farm={farm}
                  onUpdate={(patch) => updateFarm(farm.id, patch)}
                  onRemove={() => removeFarm(farm.id)}
                />
              ))}
              {farms.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-400 text-sm">
                    No farms configured. Click <b>+ Add Farm</b> to start.
                  </td>
                </tr>
              )}
            </tbody>
            {activeFarms.length > 0 && (
              <tfoot>
                <tr className="border-t border-[var(--border-subtle)] bg-[var(--surface-raised)] font-semibold text-xs">
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5">Total ({activeFarms.length} active)</td>
                  <td />
                  <td className={`px-2 py-1.5 text-right ${Math.abs(totalShare - 100) > 0.5 ? "text-brand-alert" : "text-brand-green-dark"}`}>
                    {totalShare.toFixed(1)}%
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Distribution preview ───────────────────────────── */}
      {activeFarms.length > 0 && !validationError && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center justify-between px-4 border-b border-[var(--border-subtle)]">
            <div className="flex">
              {(["weekly", "daily"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                    activeTab === t
                      ? "border-brand-green text-brand-green-dark"
                      : "border-transparent text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {t === "weekly" ? "Weekly Rollup" : "Daily Detail"}
                </button>
              ))}
            </div>
            <span className="text-xs text-neutral-400 pr-1">
              {activeTab === "weekly" ? `${weeks.length} weeks × ${activeFarms.length} farms` : `${dailyRows.length} rows`}
            </span>
          </div>

          <div className="overflow-x-auto">
            {/* ── Weekly view: pivot table farm × week ── */}
            {activeTab === "weekly" && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-subtle)]">
                    <th className="px-3 py-2 text-left sticky left-0 bg-[var(--surface-raised)] z-10 min-w-[160px]">Farm</th>
                    <th className="px-2 py-2 text-right text-neutral-500">Share</th>
                    {weeks.map((w) => (
                      <th key={w} className="px-2 py-2 text-right min-w-[72px]">W{w}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold min-w-[80px]">Total Houses</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRows.map(({ farm, byWeek }, i) => {
                    const farmTotal = Array.from(byWeek.values()).reduce((s, r) => s + r.totalHouses, 0);
                    return (
                      <tr key={farm.id} className={i % 2 === 0 ? "bg-white" : "bg-[var(--surface-raised)]"}>
                        <td className={`px-3 py-1.5 font-medium sticky left-0 z-10 ${i % 2 === 0 ? "bg-white" : "bg-[var(--surface-raised)]"}`}>
                          {farm.name}
                          <span className="ml-1.5 text-[10px] text-neutral-400">{farm.sapVendorCode}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-neutral-500">{farm.quotaSharePct}%</td>
                        {weeks.map((w) => {
                          const r = byWeek.get(w);
                          return (
                            <td key={w} className="px-2 py-1.5 text-right tabular-nums">
                              {r ? (
                                <span title={`${num(r.totalChicks)} chicks`}>
                                  {r.totalHouses > 0 ? r.totalHouses : <span className="text-neutral-300">—</span>}
                                </span>
                              ) : (
                                <span className="text-neutral-300">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{num(farmTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[var(--border-subtle)] bg-[var(--surface-raised)] font-semibold text-xs">
                    <td className="px-3 py-1.5 sticky left-0 bg-[var(--surface-raised)] z-10">Total</td>
                    <td className="px-2 py-1.5 text-right text-brand-green-dark">{totalShare.toFixed(0)}%</td>
                    {weeks.map((w) => {
                      const weekTotal = rollups.filter((r) => r.week === w).reduce((s, r) => s + r.totalHouses, 0);
                      // divide by activeFarms.length to avoid double-counting (each farm has its own row)
                      const unique = rollups.find((r) => r.week === w);
                      const dayTotal = result.placementDays
                        .filter((d) => Math.floor(d.dayIndex / 7) + 1 === w)
                        .reduce((s, d) => s + d.farmsPlacing, 0);
                      return (
                        <td key={w} className="px-2 py-1.5 text-right tabular-nums">{num(dayTotal)}</td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {num(result.placementDays.reduce((s, d) => s + d.farmsPlacing, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* ── Daily view ── */}
            {activeTab === "daily" && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-subtle)]">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Farm</th>
                    <th className="px-2 py-2 text-left text-neutral-500">SAP Code</th>
                    <th className="px-2 py-2 text-right">Houses</th>
                    <th className="px-3 py-2 text-right">Chicks</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[var(--surface-raised)]"}>
                      <td className="px-3 py-1 font-mono">{r.date}</td>
                      <td className="px-3 py-1">{r.farm.name}</td>
                      <td className="px-2 py-1 text-neutral-500">{r.farm.sapVendorCode}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.houses > 0 ? r.houses : <span className="text-neutral-300">—</span>}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{r.chicks > 0 ? num(r.chicks) : <span className="text-neutral-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* MEQ1 info callout */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-neutral-600">
        <p className="font-medium text-neutral-700 mb-1">How to use the MEQ1 export in SAP</p>
        <ol className="list-decimal list-inside space-y-0.5 text-xs">
          <li>Click <b>Export MEQ1</b> to download the workbook.</li>
          <li>Open the <b>Quota Arrangement</b> sheet — one row per farm per week.</li>
          <li>In SAP, run transaction <b>MEQ1</b> (Maintain Quota Arrangements) or use <b>LSMW</b> for mass upload.</li>
          <li>Map the <b>Vendor Code (SAP)</b> column to the Quota Arrangement source field.</li>
          <li>The <b>Daily Detail</b> sheet provides the full day-by-day audit trail for farm coordination.</li>
        </ol>
      </div>
    </div>
  );
}

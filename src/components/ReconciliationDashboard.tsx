"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import { usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import { alignDemandToSupply, categoryTotal, computeFrozenStock, weekLabel } from "@/lib/demandPlan";
import { SummaryCard } from "./shared/SummaryCard";

interface ReconciliationWeek {
  week: number;
  wcDemandTons: number;
  fppDemandTons: number;
  cutsDemandTons: number;
  totalDemandTons: number;
  wcSupplyTons: number;
  fppSupplyTons: number;
  cutsSupplyTons: number;
  totalSupplyTons: number;
  wcGapTons: number;
  fppGapTons: number;
  cutsGapTons: number;
  totalGapTons: number;
  status: "surplus" | "balanced" | "deficit";
}

function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return Math.round(n).toString();
}

function gapColor(gap: number, demand: number): string {
  if (demand === 0) return "text-neutral-400";
  const pct = gap / demand;
  if (pct < -0.02) return "text-red-600 font-semibold";
  if (pct < 0.05) return "text-amber-600 font-semibold";
  return "text-green-700 font-semibold";
}

function StatusPill({ status }: { status: ReconciliationWeek["status"] }) {
  const styles = {
    deficit: "bg-red-100 text-red-700 border-red-200",
    balanced: "bg-amber-100 text-amber-700 border-amber-200",
    surplus: "bg-green-100 text-green-700 border-green-200",
  };
  const labels = { deficit: "Deficit", balanced: "Balanced", surplus: "Surplus" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function CategoryCard({
  label,
  demandTons,
  supplyTons,
  icon,
}: {
  label: string;
  demandTons: number;
  supplyTons: number;
  icon: string;
}) {
  const gap = supplyTons - demandTons;
  const pct = demandTons > 0 ? (gap / demandTons) * 100 : 0;
  const isDeficit = gap < -demandTons * 0.02;
  const isTight = !isDeficit && gap < demandTons * 0.05;
  const accentColor = isDeficit ? "border-red-200 bg-red-50" : isTight ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50";
  const gapText = isDeficit ? "text-red-600" : isTight ? "text-amber-600" : "text-green-700";

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${accentColor}`}>
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs font-semibold text-neutral-700">{label}</span>
      </div>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>Demand</span>
        <span className="font-medium tabular-nums text-neutral-800">{demandTons > 0 ? `${fmtK(demandTons * 1000)} kg` : "—"}</span>
      </div>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>Supply</span>
        <span className="font-medium tabular-nums text-neutral-800">{supplyTons > 0 ? `${fmtK(supplyTons * 1000)} kg` : "—"}</span>
      </div>
      <div className={`flex justify-between text-xs mt-1 border-t border-current/10 pt-1 ${gapText}`}>
        <span>Gap</span>
        <span className="tabular-nums">
          {demandTons > 0
            ? `${gap >= 0 ? "+" : ""}${fmtK(gap * 1000)} kg (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`
            : "—"}
        </span>
      </div>
    </div>
  );
}

export function ReconciliationDashboard() {
  const { result, params } = usePipeline();
  const demandProducts = usePlanStore((s) => s.demandProducts);
  const demandQty = usePlanStore((s) => s.demandQty);
  const setDemandQty = usePlanStore((s) => s.setDemandQty);
  const [alignMessage, setAlignMessage] = useState<string | null>(null);

  const weeks = Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1);

  const famByWeek = new Map(result.family.map((r) => [r.week, r]));
  const cutsByWeek = new Map(result.cuts.map((r) => [r.week, r]));

  const rows: ReconciliationWeek[] = weeks.map((week) => {
    const fam = famByWeek.get(week);
    const cuts = cutsByWeek.get(week);

    const wcDemandTons = categoryTotal(demandProducts, demandQty, "wholeChicken", "ALL", [week]);
    const fppDemandTons = categoryTotal(demandProducts, demandQty, "fpp", "ALL", [week]);
    const cutsDemandTons = categoryTotal(demandProducts, demandQty, "cuts", "ALL", [week]);
    const totalDemandTons = wcDemandTons + fppDemandTons + cutsDemandTons;

    const wcSupplyTons = fam ? (fam.wcFreshKg + fam.wcFrozenKg) / 1000 : 0;
    const fppSupplyTons = cuts ? cuts.fppInputKg / 1000 : 0;
    const cutsSupplyTons = cuts ? cuts.netCutsKg / 1000 : 0;
    const totalSupplyTons = wcSupplyTons + fppSupplyTons + cutsSupplyTons;

    const wcGapTons = wcSupplyTons - wcDemandTons;
    const fppGapTons = fppSupplyTons - fppDemandTons;
    const cutsGapTons = cutsSupplyTons - cutsDemandTons;
    const totalGapTons = totalSupplyTons - totalDemandTons;

    const hasDeficit =
      (wcDemandTons > 0 && wcGapTons < -wcDemandTons * 0.02) ||
      (fppDemandTons > 0 && fppGapTons < -fppDemandTons * 0.02) ||
      (cutsDemandTons > 0 && cutsGapTons < -cutsDemandTons * 0.02);
    const hasTight =
      !hasDeficit &&
      ((wcDemandTons > 0 && wcGapTons < wcDemandTons * 0.05) ||
        (fppDemandTons > 0 && fppGapTons < fppDemandTons * 0.05) ||
        (cutsDemandTons > 0 && cutsGapTons < cutsDemandTons * 0.05));

    const status: ReconciliationWeek["status"] = hasDeficit
      ? "deficit"
      : hasTight
      ? "balanced"
      : "surplus";

    return {
      week,
      wcDemandTons,
      fppDemandTons,
      cutsDemandTons,
      totalDemandTons,
      wcSupplyTons,
      fppSupplyTons,
      cutsSupplyTons,
      totalSupplyTons,
      wcGapTons,
      fppGapTons,
      cutsGapTons,
      totalGapTons,
      status,
    };
  });

  // Horizon-level totals
  const totalWcDemand = rows.reduce((s, r) => s + r.wcDemandTons, 0);
  const totalFppDemand = rows.reduce((s, r) => s + r.fppDemandTons, 0);
  const totalCutsDemand = rows.reduce((s, r) => s + r.cutsDemandTons, 0);
  const totalDemand = totalWcDemand + totalFppDemand + totalCutsDemand;

  const totalWcSupply = rows.reduce((s, r) => s + r.wcSupplyTons, 0);
  const totalFppSupply = rows.reduce((s, r) => s + r.fppSupplyTons, 0);
  const totalCutsSupply = rows.reduce((s, r) => s + r.cutsSupplyTons, 0);
  const totalSupply = totalWcSupply + totalFppSupply + totalCutsSupply;

  const deficitWeeks = rows.filter((r) => r.status === "deficit" && r.totalDemandTons > 0).length;
  const hasDemand = totalDemand > 0;

  // Frozen stock rollforward + avg fresh/frozen split
  const frozenStock = computeFrozenStock(result.family, demandProducts, demandQty, weeks, params.openingFrozenStockKg);
  const totalFreshKg = result.family.reduce((s, r) => s + r.wcFreshKg, 0);
  const totalFrozenKg = result.family.reduce((s, r) => s + r.wcFrozenKg, 0);
  const totalWcKg = totalFreshKg + totalFrozenKg;
  const freshPct = totalWcKg > 0 ? (totalFreshKg / totalWcKg) * 100 : 0;
  const WC_CARTON_KG = 15;
  const kgToCar = (kg: number) => Math.round(kg / WC_CARTON_KG);
  const endingFrozenStockKg = frozenStock.length > 0 ? frozenStock[frozenStock.length - 1].closingKg : params.openingFrozenStockKg;
  const negativeStockWeeks = frozenStock.filter((r) => r.closingKg < 0).length;

  // Supply-first S&OP: adjust the sales plan down to what production delivers.
  const handleAlignToProduction = () => {
    const supplyMap: Record<string, number> = {};
    for (const r of rows) {
      supplyMap[`wholeChicken::${r.week}`] = r.wcSupplyTons;
      supplyMap[`cuts::${r.week}`] = r.cutsSupplyTons;
      supplyMap[`fpp::${r.week}`] = r.fppSupplyTons;
    }
    const { next, adjustedCells, adjustedWeeks } = alignDemandToSupply(demandProducts, demandQty, weeks, supplyMap);
    if (adjustedCells === 0) {
      setAlignMessage("Sales plan already fits production — nothing to adjust.");
      return;
    }
    if (!confirm(`Scale down ${adjustedCells} sales-plan cells across ${adjustedWeeks} deficit week(s) to match production? Channel shares are kept pro-rata.`)) return;
    setDemandQty(next);
    setAlignMessage(`Adjusted ${adjustedCells} cells in ${adjustedWeeks} week(s) — sales plan now matches production availability.`);
  };

  // Chart data
  const chartData = rows.map((r) => ({
    week: weekLabel(r.week, params.planStartDate),
    wcSupply: Math.round(r.wcSupplyTons * 1000),
    fppSupply: Math.round(r.fppSupplyTons * 1000),
    cutsSupply: Math.round(r.cutsSupplyTons * 1000),
    totalDemand: r.totalDemandTons > 0 ? Math.round(r.totalDemandTons * 1000) : null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold section-title">Reconciliation</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Demand vs supply side-by-side. Production is the anchor — the sales plan can be adjusted down to
            what the plants actually deliver.
          </p>
        </div>
        {hasDemand && (
          <button
            onClick={handleAlignToProduction}
            className="text-xs font-semibold px-3 py-2 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
            title="Scale the sales plan down pro-rata (per category × week) wherever demand exceeds production"
          >
            ⚖️ Align Sales Plan to Production
          </button>
        )}
      </div>

      {alignMessage && (
        <div className="text-xs text-brand-green-dark bg-brand-green-tint rounded-md px-3 py-1.5">
          ✓ {alignMessage}
        </div>
      )}

      {!hasDemand && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No demand entered yet. Open <strong>Demand Plan</strong> to add weekly quantities.
        </div>
      )}

      {/* Horizon summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Demand" value={hasDemand ? `${fmtK(totalDemand * 1000)} kg` : "—"} accent="green" icon="📊" />
        <SummaryCard label="Total Supply" value={`${fmtK(totalSupply * 1000)} kg`} icon="🏭" />
        <SummaryCard
          label="Net Gap"
          value={`${(totalSupply - totalDemand) >= 0 ? "+" : ""}${fmtK((totalSupply - totalDemand) * 1000)} kg`}
          accent={(totalSupply - totalDemand) < 0 ? "alert" : "neutral"}
          icon="⚖️"
        />
        <SummaryCard
          label="Deficit Weeks"
          value={String(deficitWeeks)}
          accent={deficitWeeks > 0 ? "alert" : "neutral"}
          icon="⚠️"
        />
      </div>

      {/* Per-category summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <CategoryCard label="Whole Chicken" icon="🐔" demandTons={totalWcDemand} supplyTons={totalWcSupply} />
        <CategoryCard label="FPP (from cuts)" icon="🍗" demandTons={totalFppDemand} supplyTons={totalFppSupply} />
        <CategoryCard label="Cuts (net of FPP)" icon="🔪" demandTons={totalCutsDemand} supplyTons={totalCutsSupply} />
      </div>

      {/* Frozen stock + fresh/frozen mix */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Opening Frozen Stock"
          value={`${kgToCar(params.openingFrozenStockKg).toLocaleString()} CAR`}
          sublabel="set in Assumptions → Frozen Stock"
          icon="🧊"
        />
        <SummaryCard
          label="Ending Frozen Stock"
          value={`${endingFrozenStockKg >= 0 ? "" : "−"}${Math.abs(kgToCar(endingFrozenStockKg)).toLocaleString()} CAR`}
          accent={endingFrozenStockKg < 0 ? "alert" : "green"}
          icon="📦"
        />
        <SummaryCard
          label="Stock-out Weeks"
          value={String(negativeStockWeeks)}
          sublabel="weeks with negative frozen balance"
          accent={negativeStockWeeks > 0 ? "alert" : "neutral"}
          icon="⚠️"
        />
        <SummaryCard
          label="Avg Fresh / Frozen"
          value={`${freshPct.toFixed(1)}% / ${(100 - freshPct).toFixed(1)}%`}
          sublabel="share of WC production"
          icon="❄️"
        />
      </div>

      {/* Frozen stock rollforward table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-3 pb-1 text-xs font-semibold text-neutral-600 uppercase tracking-wide">
          Frozen Stock Balance (WC Frozen, CAR)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-brand-green-tint text-brand-green-dark text-[11px] uppercase tracking-wide">
                <th className="px-3 py-2 text-left font-semibold">Wk</th>
                <th className="px-3 py-2 text-right font-semibold">Opening</th>
                <th className="px-3 py-2 text-right font-semibold">+ Production (Frozen)</th>
                <th className="px-3 py-2 text-right font-semibold">− Frozen Demand</th>
                <th className="px-3 py-2 text-right font-semibold">Closing</th>
              </tr>
            </thead>
            <tbody>
              {frozenStock.map((r, i) => (
                <tr
                  key={r.week}
                  className={`border-t border-[var(--border-subtle)] ${
                    r.closingKg < 0 ? "bg-red-50 dark:bg-red-950/20" : i % 2 === 0 ? "bg-white" : "bg-neutral-50/50"
                  }`}
                >
                  <td className="px-3 py-1.5 font-semibold text-brand-green-dark whitespace-nowrap">
                    {weekLabel(r.week, params.planStartDate)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">{kgToCar(r.openingKg).toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-green-700">+{kgToCar(r.producedFrozenKg).toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">
                    {r.frozenDemandKg > 0 ? `−${kgToCar(r.frozenDemandKg).toLocaleString()}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${r.closingKg < 0 ? "text-red-600" : "text-neutral-800"}`}>
                    {r.closingKg < 0 ? `−${Math.abs(kgToCar(r.closingKg)).toLocaleString()}` : kgToCar(r.closingKg).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-4">
        <div className="text-xs font-semibold text-neutral-600 mb-3">
          Weekly Supply (stacked) vs Total Demand (line) — kg
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
              <Tooltip formatter={(v) => `${fmtK(Number(v))} kg`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="wcSupply" name="WC Supply" stackId="supply" fill="#047836" radius={[0, 0, 0, 0]} />
              <Bar dataKey="fppSupply" name="FPP Supply" stackId="supply" fill="#34a85a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="cutsSupply" name="Cuts Supply" stackId="supply" fill="#78c993" radius={[3, 3, 0, 0]} />
              <Line
                type="monotone"
                dataKey="totalDemand"
                name="Total Demand"
                stroke="#C49A1A"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#C49A1A" }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Week-by-week reconciliation table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-brand-green-tint text-brand-green-dark text-[11px] uppercase tracking-wide">
                <th className="sticky left-0 bg-brand-green-tint px-3 py-2 text-left font-semibold">Wk</th>
                <th className="px-3 py-2 text-right font-semibold">WC Demand (kg)</th>
                <th className="px-3 py-2 text-right font-semibold">WC Supply (kg)</th>
                <th className="px-3 py-2 text-right font-semibold">WC Gap (kg)</th>
                <th className="px-3 py-2 text-right font-semibold">FPP Demand (kg)</th>
                <th className="px-3 py-2 text-right font-semibold">FPP Supply (kg)</th>
                <th className="px-3 py-2 text-right font-semibold">FPP Gap (kg)</th>
                <th className="px-3 py-2 text-right font-semibold">Cuts Demand (kg)</th>
                <th className="px-3 py-2 text-right font-semibold">Cuts Supply (kg)</th>
                <th className="px-3 py-2 text-right font-semibold">Cuts Gap (kg)</th>
                <th className="px-3 py-2 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.week}
                  className={`border-t border-[var(--border-subtle)] hover:bg-brand-green-tint/20 transition-colors ${
                    r.status === "deficit" && r.totalDemandTons > 0
                      ? "bg-red-50"
                      : i % 2 === 0
                      ? "bg-white"
                      : "bg-neutral-50/50"
                  }`}
                >
                  <td className="sticky left-0 bg-inherit px-3 py-2 font-semibold text-brand-green-dark">{weekLabel(r.week, params.planStartDate)}</td>

                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                    {r.wcDemandTons > 0 ? fmtK(r.wcDemandTons * 1000) : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {r.wcSupplyTons > 0 ? fmtK(r.wcSupplyTons * 1000) : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${gapColor(r.wcGapTons, r.wcDemandTons)}`}>
                    {r.wcDemandTons > 0
                      ? `${r.wcGapTons >= 0 ? "+" : ""}${fmtK(r.wcGapTons * 1000)}`
                      : <span className="text-neutral-300">—</span>}
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                    {r.fppDemandTons > 0 ? fmtK(r.fppDemandTons * 1000) : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {r.fppSupplyTons > 0 ? fmtK(r.fppSupplyTons * 1000) : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${gapColor(r.fppGapTons, r.fppDemandTons)}`}>
                    {r.fppDemandTons > 0
                      ? `${r.fppGapTons >= 0 ? "+" : ""}${fmtK(r.fppGapTons * 1000)}`
                      : <span className="text-neutral-300">—</span>}
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                    {r.cutsDemandTons > 0 ? fmtK(r.cutsDemandTons * 1000) : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {r.cutsSupplyTons > 0 ? fmtK(r.cutsSupplyTons * 1000) : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${gapColor(r.cutsGapTons, r.cutsDemandTons)}`}>
                    {r.cutsDemandTons > 0
                      ? `${r.cutsGapTons >= 0 ? "+" : ""}${fmtK(r.cutsGapTons * 1000)}`
                      : <span className="text-neutral-300">—</span>}
                  </td>

                  <td className="px-3 py-2 text-center">
                    {r.totalDemandTons > 0 ? (
                      <StatusPill status={r.status} />
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Note on Eggs */}
      <p className="text-[11px] text-neutral-400">
        Eggs are excluded from this reconciliation — they have no carcass-side supply in the production pipeline.
        All figures in kg. Gap = Supply − Demand; positive = surplus.
      </p>
    </div>
  );
}

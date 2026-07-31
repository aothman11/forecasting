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
import { usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import { categoryTotal, weekLabel } from "@/lib/demandPlan";
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
        <span className="font-medium tabular-nums text-neutral-800">{demandTons > 0 ? `${demandTons.toFixed(0)} t` : "—"}</span>
      </div>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>Supply</span>
        <span className="font-medium tabular-nums text-neutral-800">{supplyTons > 0 ? `${supplyTons.toFixed(0)} t` : "—"}</span>
      </div>
      <div className={`flex justify-between text-xs mt-1 border-t border-current/10 pt-1 ${gapText}`}>
        <span>Gap</span>
        <span className="tabular-nums">
          {demandTons > 0
            ? `${gap >= 0 ? "+" : ""}${gap.toFixed(0)} t (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`
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
    const fppSupplyTons = fam ? fam.fppKg / 1000 : 0;
    const cutsSupplyTons = cuts ? cuts.totalKg / 1000 : 0;
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

  // Chart data
  const chartData = rows.map((r) => ({
    week: weekLabel(r.week, params.planStartDate),
    wcSupply: +r.wcSupplyTons.toFixed(1),
    fppSupply: +r.fppSupplyTons.toFixed(1),
    cutsSupply: +r.cutsSupplyTons.toFixed(1),
    totalDemand: r.totalDemandTons > 0 ? +r.totalDemandTons.toFixed(1) : null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Reconciliation</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Demand vs supply side-by-side — where the plan meets the market.
        </p>
      </div>

      {!hasDemand && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No demand entered yet. Open <strong>Demand Plan</strong> to add weekly quantities.
        </div>
      )}

      {/* Horizon summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Demand" value={hasDemand ? `${totalDemand.toFixed(0)} t` : "—"} accent="green" icon="📊" />
        <SummaryCard label="Total Supply" value={`${totalSupply.toFixed(0)} t`} icon="🏭" />
        <SummaryCard
          label="Net Gap"
          value={`${(totalSupply - totalDemand) >= 0 ? "+" : ""}${(totalSupply - totalDemand).toFixed(0)} t`}
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
        <CategoryCard label="FPP" icon="🍗" demandTons={totalFppDemand} supplyTons={totalFppSupply} />
        <CategoryCard label="Cuts" icon="🔪" demandTons={totalCutsDemand} supplyTons={totalCutsSupply} />
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-4">
        <div className="text-xs font-semibold text-neutral-600 mb-3">
          Weekly Supply (stacked) vs Total Demand (line) — tons
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}t`} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(1)} t`} />
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
                <th className="px-3 py-2 text-right font-semibold">WC Demand</th>
                <th className="px-3 py-2 text-right font-semibold">WC Supply</th>
                <th className="px-3 py-2 text-right font-semibold">WC Gap</th>
                <th className="px-3 py-2 text-right font-semibold">FPP Demand</th>
                <th className="px-3 py-2 text-right font-semibold">FPP Supply</th>
                <th className="px-3 py-2 text-right font-semibold">FPP Gap</th>
                <th className="px-3 py-2 text-right font-semibold">Cuts Demand</th>
                <th className="px-3 py-2 text-right font-semibold">Cuts Supply</th>
                <th className="px-3 py-2 text-right font-semibold">Cuts Gap</th>
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
                    {r.wcDemandTons > 0 ? `${r.wcDemandTons.toFixed(1)}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {r.wcSupplyTons > 0 ? `${r.wcSupplyTons.toFixed(1)}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${gapColor(r.wcGapTons, r.wcDemandTons)}`}>
                    {r.wcDemandTons > 0
                      ? `${r.wcGapTons >= 0 ? "+" : ""}${r.wcGapTons.toFixed(1)}`
                      : <span className="text-neutral-300">—</span>}
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                    {r.fppDemandTons > 0 ? `${r.fppDemandTons.toFixed(1)}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {r.fppSupplyTons > 0 ? `${r.fppSupplyTons.toFixed(1)}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${gapColor(r.fppGapTons, r.fppDemandTons)}`}>
                    {r.fppDemandTons > 0
                      ? `${r.fppGapTons >= 0 ? "+" : ""}${r.fppGapTons.toFixed(1)}`
                      : <span className="text-neutral-300">—</span>}
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                    {r.cutsDemandTons > 0 ? `${r.cutsDemandTons.toFixed(1)}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {r.cutsSupplyTons > 0 ? `${r.cutsSupplyTons.toFixed(1)}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${gapColor(r.cutsGapTons, r.cutsDemandTons)}`}>
                    {r.cutsDemandTons > 0
                      ? `${r.cutsGapTons >= 0 ? "+" : ""}${r.cutsGapTons.toFixed(1)}`
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
        All figures in metric tons (t). Gap = Supply − Demand; positive = surplus.
      </p>
    </div>
  );
}

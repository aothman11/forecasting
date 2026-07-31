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
import { categoryTotal } from "@/lib/demandPlan";
import { SummaryCard } from "./shared/SummaryCard";

interface ReconciliationWeek {
  week: number;
  wcDemandKg: number;
  fppDemandKg: number;
  cutsDemandKg: number;
  totalDemandKg: number;
  wcSupplyKg: number;
  fppSupplyKg: number;
  cutsSupplyKg: number;
  totalSupplyKg: number;
  wcGapKg: number;
  fppGapKg: number;
  cutsGapKg: number;
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
        <span className="font-medium tabular-nums text-neutral-800">{demandTons > 0 ? `${Math.round(demandTons).toLocaleString()} kg` : "—"}</span>
      </div>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>Supply</span>
        <span className="font-medium tabular-nums text-neutral-800">{supplyTons > 0 ? `${Math.round(supplyTons).toLocaleString()} kg` : "—"}</span>
      </div>
      <div className={`flex justify-between text-xs mt-1 border-t border-current/10 pt-1 ${gapText}`}>
        <span>Gap</span>
        <span className="tabular-nums">
          {demandTons > 0
            ? `${gap >= 0 ? "+" : ""}${Math.round(gap).toLocaleString()} kg (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`
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

    const wcDemandKg = categoryTotal(demandProducts, demandQty, "wholeChicken", "ALL", [week]);
    const fppDemandKg = categoryTotal(demandProducts, demandQty, "fpp", "ALL", [week]);
    const cutsDemandKg = categoryTotal(demandProducts, demandQty, "cuts", "ALL", [week]);
    const totalDemandKg = wcDemandKg + fppDemandKg + cutsDemandKg;

    const wcSupplyKg = fam ? fam.wcFreshKg + fam.wcFrozenKg : 0;
    const fppSupplyKg = fam ? fam.fppKg : 0;
    const cutsSupplyKg = cuts ? cuts.totalKg : 0;
    const totalSupplyKg = wcSupplyKg + fppSupplyKg + cutsSupplyKg;

    const wcGapKg = wcSupplyKg - wcDemandKg;
    const fppGapKg = fppSupplyKg - fppDemandKg;
    const cutsGapKg = cutsSupplyKg - cutsDemandKg;
    const totalGapTons = totalSupplyKg - totalDemandKg;

    const hasDeficit =
      (wcDemandKg > 0 && wcGapKg < -wcDemandKg * 0.02) ||
      (fppDemandKg > 0 && fppGapKg < -fppDemandKg * 0.02) ||
      (cutsDemandKg > 0 && cutsGapKg < -cutsDemandKg * 0.02);
    const hasTight =
      !hasDeficit &&
      ((wcDemandKg > 0 && wcGapKg < wcDemandKg * 0.05) ||
        (fppDemandKg > 0 && fppGapKg < fppDemandKg * 0.05) ||
        (cutsDemandKg > 0 && cutsGapKg < cutsDemandKg * 0.05));

    const status: ReconciliationWeek["status"] = hasDeficit
      ? "deficit"
      : hasTight
      ? "balanced"
      : "surplus";

    return {
      week,
      wcDemandKg,
      fppDemandKg,
      cutsDemandKg,
      totalDemandKg,
      wcSupplyKg,
      fppSupplyKg,
      cutsSupplyKg,
      totalSupplyKg,
      wcGapKg,
      fppGapKg,
      cutsGapKg,
      totalGapTons,
      status,
    };
  });

  // Horizon-level totals
  const totalWcDemand = rows.reduce((s, r) => s + r.wcDemandKg, 0);
  const totalFppDemand = rows.reduce((s, r) => s + r.fppDemandKg, 0);
  const totalCutsDemand = rows.reduce((s, r) => s + r.cutsDemandKg, 0);
  const totalDemand = totalWcDemand + totalFppDemand + totalCutsDemand;

  const totalWcSupply = rows.reduce((s, r) => s + r.wcSupplyKg, 0);
  const totalFppSupply = rows.reduce((s, r) => s + r.fppSupplyKg, 0);
  const totalCutsSupply = rows.reduce((s, r) => s + r.cutsSupplyKg, 0);
  const totalSupply = totalWcSupply + totalFppSupply + totalCutsSupply;

  const deficitWeeks = rows.filter((r) => r.status === "deficit" && r.totalDemandKg > 0).length;
  const hasDemand = totalDemand > 0;

  // Chart data
  const chartData = rows.map((r) => ({
    week: `W${r.week}`,
    wcSupply: +r.wcSupplyKg.toFixed(1),
    fppSupply: +r.fppSupplyKg.toFixed(1),
    cutsSupply: +r.cutsSupplyKg.toFixed(1),
    totalDemand: r.totalDemandKg > 0 ? +r.totalDemandKg.toFixed(1) : null,
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
        <SummaryCard label="Total Demand" value={hasDemand ? `${Math.round(totalDemand).toLocaleString()} kg` : "—"} accent="green" icon="📊" />
        <SummaryCard label="Total Supply" value={`${Math.round(totalSupply).toLocaleString()} kg`} icon="🏭" />
        <SummaryCard
          label="Net Gap"
          value={`${(totalSupply - totalDemand) >= 0 ? "+" : ""}${Math.round(totalSupply - totalDemand).toLocaleString()} kg`}
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
          Weekly Supply (stacked) vs Total Demand (line) — kg
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}t`} />
              <Tooltip formatter={(v) => `${Math.round(Number(v)).toLocaleString()} kg`} />
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
                    r.status === "deficit" && r.totalDemandKg > 0
                      ? "bg-red-50"
                      : i % 2 === 0
                      ? "bg-white"
                      : "bg-neutral-50/50"
                  }`}
                >
                  <td className="sticky left-0 bg-inherit px-3 py-2 font-semibold text-brand-green-dark">W{r.week}</td>

                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                    {r.wcDemandKg > 0 ? `${Math.round(r.wcDemandKg).toLocaleString()}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {r.wcSupplyKg > 0 ? `${Math.round(r.wcSupplyKg).toLocaleString()}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${gapColor(r.wcGapKg, r.wcDemandKg)}`}>
                    {r.wcDemandKg > 0
                      ? `${r.wcGapKg >= 0 ? "+" : ""}${Math.round(r.wcGapKg).toLocaleString()}`
                      : <span className="text-neutral-300">—</span>}
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                    {r.fppDemandKg > 0 ? `${Math.round(r.fppDemandKg).toLocaleString()}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {r.fppSupplyKg > 0 ? `${Math.round(r.fppSupplyKg).toLocaleString()}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${gapColor(r.fppGapKg, r.fppDemandKg)}`}>
                    {r.fppDemandKg > 0
                      ? `${r.fppGapKg >= 0 ? "+" : ""}${Math.round(r.fppGapKg).toLocaleString()}`
                      : <span className="text-neutral-300">—</span>}
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                    {r.cutsDemandKg > 0 ? `${Math.round(r.cutsDemandKg).toLocaleString()}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {r.cutsSupplyKg > 0 ? `${Math.round(r.cutsSupplyKg).toLocaleString()}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${gapColor(r.cutsGapKg, r.cutsDemandKg)}`}>
                    {r.cutsDemandKg > 0
                      ? `${r.cutsGapKg >= 0 ? "+" : ""}${Math.round(r.cutsGapKg).toLocaleString()}`
                      : <span className="text-neutral-300">—</span>}
                  </td>

                  <td className="px-3 py-2 text-center">
                    {r.totalDemandKg > 0 ? (
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

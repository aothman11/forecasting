"use client";

import { useState } from "react";
import { usePipeline } from "@/lib/usePipeline";
import { weekLabel, groupWeeksByMonth } from "@/lib/demandPlan";
import { usePlanStore } from "@/lib/store";
import { carcassSizeDistributionSum } from "@/lib/calculations";
import { SIZE_KEYS, SIZE_LABELS } from "@/lib/defaults";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { GradeChart } from "../charts/GradeChart";
import type { CarcassYieldWeek, SizeKey } from "@/lib/types";

function pct(v: number) {
  return Math.round(v * 10000) / 100;
}

function kg(n: number) {
  return Math.round(n).toLocaleString();
}

interface SizeRow {
  key: SizeKey;
  label: string;
  distPct: number;
  birds: number;
  kg: number;
}

export function CarcassYield() {
  const { result, params } = usePipeline();
  const setParam = usePlanStore((s) => s.setParam);
  const rows = result.carcass;
  const [sizeView, setSizeView] = useState<"total" | "week" | "month">("total");

  const totals = rows.reduce(
    (acc, r) => {
      acc.count += r.carcassCountPc;
      acc.carcass += r.carcassWeightKg;
      acc.a += r.gradeAKg;
      acc.b += r.gradeBKg;
      acc.c += r.gradeCKg;
      return acc;
    },
    { count: 0, carcass: 0, a: 0, b: 0, c: 0 }
  );

  const sum = params.gradeSplit.A + params.gradeSplit.B + params.gradeSplit.C;

  const columns: DataTableColumn<CarcassYieldWeek>[] = [
    { key: "week", header: "Week", render: (r) => weekLabel(r.week, params.planStartDate) },
    {
      key: "count",
      header: "Carcass (PC)",
      align: "right",
      render: (r) => Math.round(r.carcassCountPc).toLocaleString(),
      footer: Math.round(totals.count).toLocaleString(),
    },
    {
      key: "carcass",
      header: "Carcass Weight (kg)",
      align: "right",
      render: (r) => kg(r.carcassWeightKg),
      footer: kg(totals.carcass),
    },
    {
      key: "a",
      header: "Grade A (kg)",
      align: "right",
      render: (r) => kg(r.gradeAKg),
      footer: kg(totals.a),
    },
    {
      key: "b",
      header: "Grade B (kg)",
      align: "right",
      render: (r) => kg(r.gradeBKg),
      footer: kg(totals.b),
    },
    {
      key: "c",
      header: "Grade C (kg)",
      align: "right",
      render: (r) => kg(r.gradeCKg),
      footer: kg(totals.c),
    },
  ];

  const sizeDistSum = carcassSizeDistributionSum(params);
  const sizeTotals: Record<SizeKey, { birds: number; kg: number }> = SIZE_KEYS.reduce((acc, key) => {
    acc[key] = { birds: 0, kg: 0 };
    return acc;
  }, {} as Record<SizeKey, { birds: number; kg: number }>);
  result.carcassSizes.forEach((week) => {
    SIZE_KEYS.forEach((key) => {
      sizeTotals[key].birds += week.sizes[key].birds;
      sizeTotals[key].kg += week.sizes[key].kg;
    });
  });

  const sizeRows: SizeRow[] = SIZE_KEYS.map((key) => ({
    key,
    label: SIZE_LABELS[key],
    distPct: params.carcassSizeDistribution[key],
    birds: sizeTotals[key].birds,
    kg: sizeTotals[key].kg,
  }));

  const sizeColumns: DataTableColumn<SizeRow>[] = [
    { key: "size", header: "Size", render: (r) => r.label },
    {
      key: "dist",
      header: "Distribution %",
      align: "right",
      render: (r) => (
        <input
          type="number"
          step={0.01}
          value={pct(r.distPct)}
          onChange={(e) =>
            setParam({
              carcassSizeDistribution: { ...params.carcassSizeDistribution, [r.key]: Number(e.target.value) / 100 },
            })
          }
          className="w-16 text-right border border-[var(--border-subtle)] rounded px-1 py-0.5 tabular-nums"
        />
      ),
      footer: (
        <span className={Math.abs(sizeDistSum - 1) > 0.01 ? "text-brand-alert" : ""}>
          Σ {(sizeDistSum * 100).toFixed(2)}%
        </span>
      ),
    },
    { key: "birds", header: "Bird Count", align: "right", render: (r) => Math.round(r.birds).toLocaleString() },
    { key: "kg", header: "Weight (kg)", align: "right", render: (r) => kg(r.kg) },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Step 3 — Carcass Yield &amp; Grade Split</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Slaughtered carcass weight from the processing funnel, split into grades and weight classes.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Total carcass count */}
        <div className="rounded-xl border border-[var(--border-subtle)] border-l-4 border-l-brand-green bg-white shadow-sm p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total Carcass</span>
            <span className="text-lg leading-none">🐔</span>
          </div>
          <div className="text-2xl font-bold text-brand-green-dark tabular-nums leading-tight">
            {Math.round(totals.count).toLocaleString()}
          </div>
          <div className="text-[11px] text-neutral-400 font-medium">pc slaughtered</div>
        </div>

        {/* Total carcass weight */}
        <div className="rounded-xl border border-[var(--border-subtle)] border-l-4 border-l-teal-400 bg-white shadow-sm p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total Carcass Weight</span>
            <span className="text-lg leading-none">⚖️</span>
          </div>
          <div className="text-2xl font-bold text-teal-700 tabular-nums leading-tight">
            {kg(totals.carcass)}
          </div>
          <div className="text-[11px] text-neutral-400 font-medium">kg</div>
        </div>

        {/* Grade A */}
        {(
          [
            { label: "Grade A", value: totals.a, borderCls: "border-l-blue-400", valueCls: "text-blue-700", badgeCls: "bg-blue-50 text-blue-600 border-blue-200", icon: "🥇" },
            { label: "Grade B", value: totals.b, borderCls: "border-l-orange-400", valueCls: "text-orange-700", badgeCls: "bg-orange-50 text-orange-600 border-orange-200", icon: "🥈" },
            { label: "Grade C / Reject", value: totals.c, borderCls: "border-l-red-300", valueCls: "text-red-600", badgeCls: "bg-red-50 text-red-600 border-red-200", icon: "🔻" },
          ] as const
        ).map(({ label, value, borderCls, valueCls, badgeCls, icon }) => {
          const share = totals.carcass > 0 ? Math.round((value / totals.carcass) * 100) : 0;
          return (
            <div key={label} className={`rounded-xl border border-[var(--border-subtle)] border-l-4 ${borderCls} bg-white shadow-sm p-4 flex flex-col gap-1.5`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
                <span className="text-lg leading-none">{icon}</span>
              </div>
              <div className={`text-2xl font-bold tabular-nums leading-tight ${valueCls}`}>
                {kg(value)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-400 font-medium">kg</span>
                {share > 0 && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badgeCls}`}>
                    {share}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grade split inputs */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500 font-medium">Grade split (%):</span>
        <div className="flex items-center gap-2 border border-[var(--border-subtle)] rounded-lg px-3 py-2 bg-white">
          {(["A", "B", "C"] as const).map((g) => (
            <label key={g} className="flex flex-col text-xs text-neutral-600">
              Grade {g}
              <input
                type="number"
                step={0.5}
                value={pct(params.gradeSplit[g])}
                onChange={(e) =>
                  setParam({ gradeSplit: { ...params.gradeSplit, [g]: Number(e.target.value) / 100 } })
                }
                className="w-16 text-right border border-[var(--border-subtle)] rounded px-1 py-0.5 tabular-nums"
              />
            </label>
          ))}
          <span className={`text-xs ml-1 ${Math.abs(sum - 1) > 0.005 ? "text-brand-alert font-semibold" : "text-neutral-400"}`}>
            Σ {pct(sum)}%
          </span>
        </div>
      </div>

      <GradeChart data={rows} planStartDate={params.planStartDate} />

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.week} />

      {/* Size Distribution header + view toggle */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold section-title text-brand-green-dark">Carcass Size Distribution</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {sizeView === "total"
              ? `Slaughtered birds split by carcass weight class, totalled over the full ${rows.length}-week horizon.`
              : sizeView === "week"
              ? "Weight (kg) per size bucket by week."
              : "Weight (kg) per size bucket aggregated by calendar month."}
          </p>
        </div>
        <div className="inline-flex items-center bg-neutral-100 rounded-lg p-0.5 gap-0.5 text-xs font-medium shrink-0">
          {(["total", "week", "month"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setSizeView(mode)}
              className={`px-3.5 py-1.5 rounded-md transition-all ${
                sizeView === mode ? "bg-white shadow text-brand-green-dark font-semibold" : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {mode === "total" ? "Total" : mode === "week" ? "By Week" : "By Month"}
            </button>
          ))}
        </div>
      </div>

      {/* Total view — editable distribution % + horizon birds/kg */}
      {sizeView === "total" && (
        <DataTable columns={sizeColumns} rows={sizeRows} rowKey={(r) => r.key} maxHeight="420px" />
      )}

      {/* Weekly view — size rows × week columns (kg) */}
      {sizeView === "week" && (() => {
        const weekNums = result.carcassSizes.map((w) => w.week);
        return (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-brand-green-tint text-brand-green-dark text-[11px] uppercase tracking-wide">
                    <th className="sticky left-0 bg-brand-green-tint px-3 py-2 text-left font-semibold">Size</th>
                    {weekNums.map((w) => (
                      <th key={w} className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                        {weekLabel(w, params.planStartDate)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold bg-brand-green-tint/80">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZE_KEYS.map((key, ri) => (
                    <tr
                      key={key}
                      className={`border-t border-[var(--border-subtle)] ${ri % 2 === 0 ? "bg-white" : "bg-neutral-50/50"} hover:bg-brand-green-tint/20`}
                    >
                      <td className="sticky left-0 bg-inherit px-3 py-2 font-medium text-neutral-700 whitespace-nowrap">
                        {SIZE_LABELS[key]}
                      </td>
                      {result.carcassSizes.map((w) => (
                        <td key={w.week} className="px-3 py-2 text-right tabular-nums text-neutral-700">
                          {w.sizes[key].kg > 0 ? kg(w.sizes[key].kg) : <span className="text-neutral-300">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-green-dark">
                        {kg(sizeTotals[key].kg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border-subtle)] bg-neutral-50 font-semibold text-neutral-700">
                    <td className="sticky left-0 bg-neutral-50 px-3 py-2">Total kg</td>
                    {result.carcassSizes.map((w) => (
                      <td key={w.week} className="px-3 py-2 text-right tabular-nums">
                        {kg(SIZE_KEYS.reduce((s, k) => s + w.sizes[k].kg, 0))}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums text-brand-green-dark">
                      {kg(SIZE_KEYS.reduce((s, k) => s + sizeTotals[k].kg, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Monthly view — size rows × month columns (kg) */}
      {sizeView === "month" && (() => {
        const weekNums = result.carcassSizes.map((w) => w.week);
        const monthGroups = groupWeeksByMonth(weekNums, params.planStartDate);
        const monthSizeTotals = monthGroups.map(({ monthKey, monthLabel, weeks }) => {
          const data = SIZE_KEYS.reduce((acc, key) => {
            acc[key] = { birds: 0, kg: 0 };
            return acc;
          }, {} as Record<SizeKey, { birds: number; kg: number }>);
          weeks.forEach((wNum) => {
            const wData = result.carcassSizes.find((c) => c.week === wNum);
            if (wData) SIZE_KEYS.forEach((key) => { data[key].birds += wData.sizes[key].birds; data[key].kg += wData.sizes[key].kg; });
          });
          return { monthKey, monthLabel, data };
        });
        return (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-brand-green-tint text-brand-green-dark text-[11px] uppercase tracking-wide">
                    <th className="sticky left-0 bg-brand-green-tint px-3 py-2 text-left font-semibold">Size</th>
                    {monthSizeTotals.map(({ monthKey, monthLabel }) => (
                      <th key={monthKey} className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                        {monthLabel}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold bg-brand-green-tint/80">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZE_KEYS.map((key, ri) => (
                    <tr
                      key={key}
                      className={`border-t border-[var(--border-subtle)] ${ri % 2 === 0 ? "bg-white" : "bg-neutral-50/50"} hover:bg-brand-green-tint/20`}
                    >
                      <td className="sticky left-0 bg-inherit px-3 py-2 font-medium text-neutral-700 whitespace-nowrap">
                        {SIZE_LABELS[key]}
                      </td>
                      {monthSizeTotals.map(({ monthKey, data }) => (
                        <td key={monthKey} className="px-3 py-2 text-right tabular-nums text-neutral-700">
                          {data[key].kg > 0 ? kg(data[key].kg) : <span className="text-neutral-300">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-green-dark">
                        {kg(sizeTotals[key].kg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border-subtle)] bg-neutral-50 font-semibold text-neutral-700">
                    <td className="sticky left-0 bg-neutral-50 px-3 py-2">Total kg</td>
                    {monthSizeTotals.map(({ monthKey, data }) => (
                      <td key={monthKey} className="px-3 py-2 text-right tabular-nums">
                        {kg(SIZE_KEYS.reduce((s, k) => s + data[k].kg, 0))}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums text-brand-green-dark">
                      {kg(SIZE_KEYS.reduce((s, k) => s + sizeTotals[k].kg, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

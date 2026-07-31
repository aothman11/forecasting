"use client";

import { useState } from "react";
import { usePipeline } from "@/lib/usePipeline";
import { weekLabel, groupWeeksByMonth } from "@/lib/demandPlan";
import { usePlanStore } from "@/lib/store";
import { carcassSizeDistributionSum } from "@/lib/calculations";
import { SIZE_KEYS, SIZE_LABELS } from "@/lib/defaults";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { SummaryCard } from "../shared/SummaryCard";
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

      <div className="flex flex-wrap items-end gap-3">
        <SummaryCard label="Total Carcass" value={Math.round(totals.count).toLocaleString()} sublabel="pc" accent="green" />
        <SummaryCard label="Total Carcass Weight" value={`${kg(totals.carcass)} kg`} accent="green" />
        <SummaryCard label="Grade A" value={`${kg(totals.a)} kg`} />
        <SummaryCard label="Grade B" value={`${kg(totals.b)} kg`} />
        <SummaryCard label="Grade C / Reject" value={`${kg(totals.c)} kg`} />

        <div className="flex-1" />

        <div className="flex items-end gap-2 border border-[var(--border-subtle)] rounded-md px-3 py-2">
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
        <div className="flex rounded-lg border border-[var(--border-subtle)] overflow-hidden text-xs font-medium shrink-0">
          {(["total", "week", "month"] as const).map((mode, i) => (
            <button
              key={mode}
              onClick={() => setSizeView(mode)}
              className={`px-3 py-1.5 transition-colors ${i > 0 ? "border-l border-[var(--border-subtle)]" : ""} ${
                sizeView === mode ? "bg-brand-green text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"
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

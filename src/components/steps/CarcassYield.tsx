"use client";

import { usePipeline } from "@/lib/usePipeline";
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
    { key: "week", header: "Week", render: (r) => `W${r.week}` },
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

      <GradeChart data={rows} />

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.week} />

      <div>
        <h2 className="text-base font-semibold section-title text-brand-green-dark">Carcass Size Distribution</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Slaughtered birds split by carcass weight class, totalled over the full {rows.length}-week horizon.
        </p>
      </div>

      <DataTable columns={sizeColumns} rows={sizeRows} rowKey={(r) => r.key} maxHeight="420px" />
    </div>
  );
}

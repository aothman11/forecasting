"use client";

import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { SummaryCard } from "../shared/SummaryCard";
import { GradeChart } from "../charts/GradeChart";
import type { CarcassYieldWeek } from "@/lib/types";

function pct(v: number) {
  return Math.round(v * 1000) / 10;
}

function kg(n: number) {
  return Math.round(n).toLocaleString();
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Step 3 — Carcass Yield &amp; Grade Split</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Live weight converted to carcass weight via dressing %, then split into grades.
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
    </div>
  );
}

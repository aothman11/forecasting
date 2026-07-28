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

export function CarcassYield() {
  const { result, params } = usePipeline();
  const setParam = usePlanStore((s) => s.setParam);
  const rows = result.carcass;

  const totals = rows.reduce(
    (acc, r) => {
      acc.carcass += r.carcassWeightTons;
      acc.a += r.gradeATons;
      acc.b += r.gradeBTons;
      acc.c += r.gradeCTons;
      return acc;
    },
    { carcass: 0, a: 0, b: 0, c: 0 }
  );

  const sum = params.gradeSplit.A + params.gradeSplit.B + params.gradeSplit.C;

  const columns: DataTableColumn<CarcassYieldWeek>[] = [
    { key: "week", header: "Week", render: (r) => `W${r.week}` },
    {
      key: "carcass",
      header: "Carcass Weight (tons)",
      align: "right",
      render: (r) => r.carcassWeightTons.toFixed(1),
      footer: totals.carcass.toFixed(1),
    },
    {
      key: "a",
      header: "Grade A (tons)",
      align: "right",
      render: (r) => r.gradeATons.toFixed(1),
      footer: totals.a.toFixed(1),
    },
    {
      key: "b",
      header: "Grade B (tons)",
      align: "right",
      render: (r) => r.gradeBTons.toFixed(1),
      footer: totals.b.toFixed(1),
    },
    {
      key: "c",
      header: "Grade C (tons)",
      align: "right",
      render: (r) => r.gradeCTons.toFixed(1),
      footer: totals.c.toFixed(1),
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
        <SummaryCard label="Total Carcass" value={`${totals.carcass.toFixed(0)} t`} accent="green" />
        <SummaryCard label="Grade A" value={`${totals.a.toFixed(0)} t`} />
        <SummaryCard label="Grade B" value={`${totals.b.toFixed(0)} t`} />
        <SummaryCard label="Grade C / Reject" value={`${totals.c.toFixed(0)} t`} />

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

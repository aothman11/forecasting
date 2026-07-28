"use client";

import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";
import { activeCutKeys, cutYieldSum } from "@/lib/calculations";
import { CUT_LABELS } from "@/lib/defaults";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { SummaryCard } from "../shared/SummaryCard";
import type { CutKey, CutPlanWeek } from "@/lib/types";

function pct(v: number) {
  return Math.round(v * 1000) / 10;
}

function topCutKeys(row: CutPlanWeek, keys: CutKey[], n = 3): Set<CutKey> {
  const sorted = [...keys].sort((a, b) => row.cuts[b] - row.cuts[a]);
  return new Set(sorted.slice(0, n));
}

export function CutPlan() {
  const { result, params } = usePipeline();
  const setParam = usePlanStore((s) => s.setParam);
  const rows = result.cuts;
  const keys = activeCutKeys(params.legSplitMode);

  const totalsByKey = keys.reduce((acc, k) => {
    acc[k] = rows.reduce((s, r) => s + r.cuts[k], 0);
    return acc;
  }, {} as Record<CutKey, number>);
  const grandTotal = keys.reduce((s, k) => s + totalsByKey[k], 0);

  const yieldSum = cutYieldSum(params);
  const outOfTolerance = Math.abs(yieldSum - 1) > 0.02;

  const columns: DataTableColumn<CutPlanWeek>[] = [
    { key: "week", header: "Week", render: (r) => `W${r.week}` },
    ...keys.map((k): DataTableColumn<CutPlanWeek> => ({
      key: k,
      header: CUT_LABELS[k],
      align: "right",
      render: (r) => {
        const isTop = topCutKeys(r, keys).has(k);
        return (
          <span className={isTop ? "font-semibold text-brand-green-dark" : ""}>
            {r.cuts[k].toFixed(1)}
          </span>
        );
      },
      footer: totalsByKey[k].toFixed(1),
    })),
    {
      key: "total",
      header: "Total (tons)",
      align: "right",
      render: (r) => r.totalTons.toFixed(1),
      footer: grandTotal.toFixed(1),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Step 5 — FPP Cut Plan</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          FPP tonnage from Step 4 broken into individual cuts. Top 3 cuts by volume are highlighted per week.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {keys.slice(0, 4).map((k) => (
          <SummaryCard key={k} label={CUT_LABELS[k]} value={`${totalsByKey[k].toFixed(0)} t`} />
        ))}

        <div className="flex-1" />

        <label className="flex items-center gap-2 text-xs text-neutral-600 border border-[var(--border-subtle)] rounded-md px-3 py-2">
          <input
            type="checkbox"
            checked={params.legSplitMode}
            onChange={(e) => setParam({ legSplitMode: e.target.checked })}
          />
          Drumstick + Thigh split mode
        </label>
      </div>

      <div className="border border-[var(--border-subtle)] rounded-lg p-3 overflow-x-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-brand-green-dark uppercase tracking-wide">
            Cut Yields (% of FPP carcass weight)
          </div>
          <span className={`text-xs font-semibold ${outOfTolerance ? "text-brand-alert" : "text-neutral-400"}`}>
            Σ {pct(yieldSum)}% {outOfTolerance ? "(outside ±2% tolerance)" : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          {keys.map((k) => (
            <label key={k} className="flex flex-col text-xs text-neutral-600">
              {CUT_LABELS[k]}
              <input
                type="number"
                step={0.5}
                value={pct(params.cutYields[k])}
                onChange={(e) =>
                  setParam({ cutYields: { ...params.cutYields, [k]: Number(e.target.value) / 100 } })
                }
                className="w-20 text-right border border-[var(--border-subtle)] rounded px-1 py-0.5 tabular-nums"
              />
            </label>
          ))}
        </div>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.week} />
    </div>
  );
}

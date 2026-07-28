"use client";

import { useRef } from "react";
import { usePlanStore } from "@/lib/store";
import { totalChicksPlaced } from "@/lib/calculations";
import { parsePlacementCSV } from "@/lib/csv";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { SummaryCard } from "../shared/SummaryCard";
import type { PlacementRow } from "@/lib/types";
import { MAX_HORIZON_WEEKS, MIN_HORIZON_WEEKS } from "@/lib/defaults";

export function PlacementPlan() {
  const placement = usePlanStore((s) => s.placement);
  const params = usePlanStore((s) => s.params);
  const setPlacementRow = usePlanStore((s) => s.setPlacementRow);
  const setPlacement = usePlanStore((s) => s.setPlacement);
  const quickFillPlacementPlan = usePlanStore((s) => s.quickFillPlacementPlan);
  const setHorizonWeeks = usePlanStore((s) => s.setHorizonWeeks);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runningTotal = placement.reduce((s, r) => s + totalChicksPlaced(r), 0);
  const totalFarmsUsed = placement.reduce((s, r) => s + r.farmsPlacing, 0);

  const handleCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parsePlacementCSV(String(reader.result));
      const byWeek = new Map(parsed.filter((p) => p.week != null).map((p) => [p.week as number, p]));
      setPlacement(
        placement.map((row) => {
          const patch = byWeek.get(row.week);
          return patch ? { ...row, ...patch, week: row.week } : row;
        })
      );
    };
    reader.readAsText(file);
  };

  const columns: DataTableColumn<PlacementRow>[] = [
    { key: "week", header: "Week #", render: (r) => `W${r.week}` },
    { key: "weekStarting", header: "Week Starting", render: (r) => r.weekStarting },
    {
      key: "farmsPlacing",
      header: "Farms Placing",
      align: "right",
      render: (r) => (
        <input
          className="cell-input text-right"
          type="number"
          min={0}
          value={r.farmsPlacing}
          onChange={(e) => setPlacementRow(r.week, { farmsPlacing: Number(e.target.value) })}
        />
      ),
      footer: totalFarmsUsed.toLocaleString(),
    },
    {
      key: "chicksPerFarm",
      header: "Chicks per Farm",
      align: "right",
      render: (r) => (
        <input
          className="cell-input text-right"
          type="number"
          min={0}
          step={500}
          value={r.chicksPerFarm}
          onChange={(e) => setPlacementRow(r.week, { chicksPerFarm: Number(e.target.value) })}
        />
      ),
    },
    {
      key: "total",
      header: "Total Chicks Placed",
      align: "right",
      render: (r) => Math.round(totalChicksPlaced(r)).toLocaleString(),
      footer: Math.round(runningTotal).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Step 1 — Placement Plan</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          The only manual input in the workbench. Every downstream step is calculated from this table.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SummaryCard label="Running Total Chicks" value={Math.round(runningTotal).toLocaleString()} accent="green" />
        <SummaryCard
          label="Total Farm-Placements"
          value={totalFarmsUsed.toLocaleString()}
          sublabel={`vs. ${params.totalFarms} farms in fleet`}
          accent={totalFarmsUsed > params.totalFarms * (params.planningHorizonWeeks / 6) * 1.02 ? "alert" : "neutral"}
        />
        <SummaryCard label="Horizon" value={`${params.planningHorizonWeeks} wks`} />

        <div className="flex-1" />

        <label className="flex items-center gap-1.5 text-xs text-neutral-600">
          Horizon
          <select
            value={params.planningHorizonWeeks}
            onChange={(e) => setHorizonWeeks(Number(e.target.value))}
            className="border border-[var(--border-subtle)] rounded px-1.5 py-1 text-xs"
          >
            {Array.from(
              { length: MAX_HORIZON_WEEKS - MIN_HORIZON_WEEKS + 1 },
              (_, i) => MIN_HORIZON_WEEKS + i
            ).map((w) => (
              <option key={w} value={w}>
                {w} weeks
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={quickFillPlacementPlan}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
        >
          Quick Fill ({params.totalFarms} farms)
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green transition-colors"
        >
          Import CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleCSV(file);
            e.target.value = "";
          }}
        />
      </div>

      <DataTable columns={columns} rows={placement} rowKey={(r) => r.week} />
    </div>
  );
}

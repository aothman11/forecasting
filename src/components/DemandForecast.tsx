"use client";

import { useState } from "react";
import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";
import { computeDemandComparison, demandFromProduction } from "@/lib/calculations";
import { DataTable, type DataTableColumn } from "./shared/DataTable";
import { SummaryCard } from "./shared/SummaryCard";
import { DemandComparisonChart } from "./charts/DemandComparisonChart";
import { SalesPlanImportPanel } from "./SalesPlanImportPanel";
import type { DemandComparisonWeek, DemandWeek } from "@/lib/types";

function kg(n: number) {
  return Math.round(n).toLocaleString();
}

export function DemandForecast() {
  const { result } = usePipeline();
  const demand = usePlanStore((s) => s.demand);
  const setDemandWeek = usePlanStore((s) => s.setDemandWeek);
  const setDemand = usePlanStore((s) => s.setDemand);
  const [importOpen, setImportOpen] = useState(false);

  const comparison = computeDemandComparison(demand, result.family);

  const totals = comparison.reduce(
    (acc, r) => {
      acc.demand += r.demandKg;
      acc.production += r.productionKg;
      return acc;
    },
    { demand: 0, production: 0 }
  );
  const overallFillRate = totals.demand > 0 ? (totals.production / totals.demand) * 100 : 100;
  const shortfallWeeks = comparison.filter((r) => r.shortfall).length;

  const demandColumns: DataTableColumn<DemandWeek>[] = [
    { key: "week", header: "Week", render: (r) => `W${r.week}` },
    {
      key: "fresh",
      header: "WC Fresh Demand (kg)",
      align: "right",
      render: (r) => (
        <input
          className="cell-input text-right"
          type="number"
          min={0}
          value={r.wcFreshKg}
          onChange={(e) => setDemandWeek(r.week, { wcFreshKg: Number(e.target.value) })}
        />
      ),
    },
    {
      key: "frozen",
      header: "WC Frozen Demand (kg)",
      align: "right",
      render: (r) => (
        <input
          className="cell-input text-right"
          type="number"
          min={0}
          value={r.wcFrozenKg}
          onChange={(e) => setDemandWeek(r.week, { wcFrozenKg: Number(e.target.value) })}
        />
      ),
    },
    {
      key: "fpp",
      header: "FPP Demand (kg)",
      align: "right",
      render: (r) => (
        <input
          className="cell-input text-right"
          type="number"
          min={0}
          value={r.fppKg}
          onChange={(e) => setDemandWeek(r.week, { fppKg: Number(e.target.value) })}
        />
      ),
    },
    {
      key: "total",
      header: "Total Demand (kg)",
      align: "right",
      render: (r) => kg(r.wcFreshKg + r.wcFrozenKg + r.fppKg),
    },
  ];

  const comparisonColumns: DataTableColumn<DemandComparisonWeek>[] = [
    { key: "week", header: "Week", render: (r) => `W${r.week}` },
    { key: "demand", header: "Total Demand (kg)", align: "right", render: (r) => kg(r.demandKg) },
    { key: "production", header: "Total Production (kg)", align: "right", render: (r) => kg(r.productionKg) },
    {
      key: "variance",
      header: "Variance (kg)",
      align: "right",
      render: (r) => (
        <span className={r.shortfall ? "text-brand-alert font-semibold" : "text-brand-green"}>
          {r.varianceKg >= 0 ? "+" : ""}
          {kg(r.varianceKg)}
        </span>
      ),
    },
    {
      key: "fillRate",
      header: "Fill Rate %",
      align: "right",
      render: (r) => (
        <span className={r.shortfall ? "text-brand-alert font-semibold" : ""}>{r.fillRatePct.toFixed(1)}%</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Demand Forecast</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Enter weekly demand per product family and compare it against the current production plan (Step 4).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SummaryCard label="Total Demand" value={`${kg(totals.demand)} kg`} accent="gold" />
        <SummaryCard label="Total Production" value={`${kg(totals.production)} kg`} accent="green" />
        <SummaryCard label="Overall Fill Rate" value={`${overallFillRate.toFixed(1)}%`} />
        <SummaryCard
          label="Weeks Short of Demand"
          value={String(shortfallWeeks)}
          accent={shortfallWeeks > 0 ? "alert" : "neutral"}
        />

        <div className="flex-1" />

        <button
          onClick={() => setImportOpen((v) => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
            importOpen
              ? "border-brand-green text-brand-green-dark bg-brand-green-tint"
              : "border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green"
          }`}
        >
          Import Sales Plan
        </button>
        <button
          onClick={() => setDemand(demandFromProduction(result.family))}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
        >
          Sync Demand from Production Plan
        </button>
      </div>

      {importOpen && <SalesPlanImportPanel onClose={() => setImportOpen(false)} />}

      <DemandComparisonChart data={comparison} />

      <div>
        <h2 className="text-base font-semibold section-title text-brand-green-dark">Weekly Demand Input</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Editable per product family. Use &quot;Sync Demand from Production Plan&quot; to start from the current
          plan, then adjust to match sales or customer forecasts.
        </p>
      </div>
      <DataTable columns={demandColumns} rows={demand} rowKey={(r) => r.week} maxHeight="360px" />

      <div>
        <h2 className="text-base font-semibold section-title text-brand-green-dark">Demand vs. Production</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Weeks in red fall short of demand — production plan or placement schedule may need adjusting.
        </p>
      </div>
      <DataTable
        columns={comparisonColumns}
        rows={comparison}
        rowKey={(r) => r.week}
        rowClassName={(r) => (r.shortfall ? "bg-red-50" : "")}
      />
    </div>
  );
}

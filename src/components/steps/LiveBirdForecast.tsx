"use client";

import { usePipeline } from "@/lib/usePipeline";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { SummaryCard } from "../shared/SummaryCard";
import { CapacityChart } from "../charts/CapacityChart";
import type { LiveBirdWeek } from "@/lib/types";

export function LiveBirdForecast() {
  const { result } = usePipeline();
  const rows = result.liveBird;

  const totalBirds = rows.reduce((s, r) => s + r.harvestableBirds, 0);
  const totalKg = rows.reduce((s, r) => s + r.totalLiveWeightKg, 0);
  const breachWeeks = rows.filter((r) => r.exceedsCapacity).length;

  const columns: DataTableColumn<LiveBirdWeek>[] = [
    { key: "week", header: "Week", render: (r) => `W${r.week}` },
    {
      key: "range",
      header: "Harvest Date Range",
      render: (r) => `${r.harvestDateStart} → ${r.harvestDateEnd}`,
    },
    {
      key: "ref",
      header: "Birds from Placement Wk #",
      align: "center",
      render: (r) => (r.placementWeekRef ? `W${r.placementWeekRef}` : "—"),
    },
    {
      key: "birds",
      header: "Harvestable Birds",
      align: "right",
      render: (r) => Math.round(r.harvestableBirds).toLocaleString(),
      footer: Math.round(totalBirds).toLocaleString(),
    },
    {
      key: "kg",
      header: "Total Live Weight (kg)",
      align: "right",
      render: (r) => Math.round(r.totalLiveWeightKg).toLocaleString(),
      footer: Math.round(totalKg).toLocaleString(),
    },
    {
      key: "util",
      header: "Utilization %",
      align: "right",
      render: (r) => (
        <span className={r.exceedsCapacity ? "text-brand-alert font-semibold" : ""}>
          {r.utilizationPct.toFixed(1)}%
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Step 2 — Live Bird Forecast</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Cascaded from the placement plan using the cycle-length offset and mortality rate.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <SummaryCard label="Total Harvestable Birds" value={Math.round(totalBirds).toLocaleString()} accent="green" />
        <SummaryCard label="Total Live Weight" value={`${Math.round(totalKg).toLocaleString()} kg`} />
        <SummaryCard
          label="Weeks Over Capacity"
          value={String(breachWeeks)}
          accent={breachWeeks > 0 ? "alert" : "neutral"}
        />
      </div>

      <CapacityChart data={rows} />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.week}
        rowClassName={(r) => (r.exceedsCapacity ? "bg-red-50" : "")}
      />
    </div>
  );
}

"use client";

import { usePipeline } from "@/lib/usePipeline";
import { weekLabel } from "@/lib/demandPlan";
import { usePlanStore, type PlantFilter } from "@/lib/store";
import { PLANT_LABELS } from "@/lib/defaults";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { SummaryCard } from "../shared/SummaryCard";
import type { PlantKey, PlantWeek } from "@/lib/types";

const PLANT_KEYS: PlantKey[] = ["plant1", "plant2", "plant3"];

function kg(n: number) {
  return Math.round(n).toLocaleString();
}

interface Row {
  week: number;
  birds: number;
  liveWeightKg: number;
  carcassKg: number;
  wcFreshKg: number;
  wcFrozenKg: number;
  fppKg: number;
  dailyBirds: number;
  plantCapacity: number;
  capacityBreach: boolean;
}

export function ProcessingPlan() {
  const { result, params } = usePipeline();
  const selectedPlant = usePlanStore((s) => s.selectedPlant);
  const setSelectedPlant = usePlanStore((s) => s.setSelectedPlant);

  const byWeekPlant = new Map<string, PlantWeek>();
  result.plants.forEach((p) => byWeekPlant.set(`${p.week}-${p.plant}`, p));

  const weeks = result.liveBird.map((lb) => lb.week);

  const rows: Row[] = weeks.map((week) => {
    if (selectedPlant === "all") {
      const parts = PLANT_KEYS.map((pl) => byWeekPlant.get(`${week}-${pl}`)!);
      return {
        week,
        birds: parts.reduce((s, p) => s + p.birds, 0),
        liveWeightKg: parts.reduce((s, p) => s + p.liveWeightKg, 0),
        carcassKg: parts.reduce((s, p) => s + p.carcassKg, 0),
        wcFreshKg: parts.reduce((s, p) => s + p.wcFreshKg, 0),
        wcFrozenKg: parts.reduce((s, p) => s + p.wcFrozenKg, 0),
        fppKg: parts.reduce((s, p) => s + p.fppKg, 0),
        dailyBirds: parts.reduce((s, p) => s + p.dailyBirds, 0),
        plantCapacity: parts.reduce((s, p) => s + p.plantCapacity, 0),
        capacityBreach: parts.some((p) => p.capacityBreach),
      };
    }
    const p = byWeekPlant.get(`${week}-${selectedPlant}`)!;
    return { ...p };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.birds += r.birds;
      acc.carcass += r.carcassKg;
      return acc;
    },
    { birds: 0, carcass: 0 }
  );
  const breachWeeks = rows.filter((r) => r.capacityBreach).length;
  const avgUtilization =
    rows.length > 0
      ? rows.reduce((s, r) => s + (r.plantCapacity > 0 ? r.dailyBirds / r.plantCapacity : 0), 0) / rows.length
      : 0;

  const columns: DataTableColumn<Row>[] = [
    { key: "week", header: "Week", render: (r) => weekLabel(r.week, params.planStartDate) },
    { key: "birds", header: "Birds", align: "right", render: (r) => Math.round(r.birds).toLocaleString() },
    {
      key: "liveWt",
      header: "Live Wt (kg)",
      align: "right",
      render: (r) => kg(r.liveWeightKg),
    },
    {
      key: "carcass",
      header: "Carcass (kg)",
      align: "right",
      render: (r) => kg(r.carcassKg),
    },
    { key: "fresh", header: "WC Fresh (kg)", align: "right", render: (r) => kg(r.wcFreshKg) },
    { key: "frozen", header: "WC Frozen (kg)", align: "right", render: (r) => kg(r.wcFrozenKg) },
    { key: "fpp", header: "FPP (kg)", align: "right", render: (r) => kg(r.fppKg) },
    {
      key: "daily",
      header: "Daily Birds",
      align: "right",
      render: (r) => (
        <span className={r.capacityBreach ? "text-brand-alert font-semibold" : ""}>
          {Math.round(r.dailyBirds).toLocaleString()}
        </span>
      ),
    },
  ];

  const tabs: { key: PlantFilter; label: string }[] = [
    { key: "all", label: "All Plants" },
    { key: "plant1", label: PLANT_LABELS.plant1 },
    { key: "plant2", label: PLANT_LABELS.plant2 },
    { key: "plant3", label: PLANT_LABELS.plant3 },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Step 6 — Processing Plan by Plant</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Weekly plan distributed across the 3 slaughter plants based on capacity share.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <SummaryCard label="Total Birds (horizon)" value={Math.round(totals.birds).toLocaleString()} accent="green" />
        <SummaryCard label="Total Carcass" value={`${kg(totals.carcass)} kg`} accent="gold" />
        <SummaryCard label="Avg Plant Utilization" value={`${(avgUtilization * 100).toFixed(1)}%`} />
        <SummaryCard
          label="Weeks with Capacity Breach"
          value={String(breachWeeks)}
          accent={breachWeeks > 0 ? "alert" : "neutral"}
        />
      </div>

      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSelectedPlant(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              selectedPlant === t.key
                ? "border-brand-green text-brand-green-dark"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
            {t.key !== "all" && (
              <span className="ml-1.5 text-[10px] text-neutral-400">
                {Math.round(params.plantShares[t.key as PlantKey] * 100)}%
              </span>
            )}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.week}
        rowClassName={(r) => (r.capacityBreach ? "bg-red-50" : "")}
      />
    </div>
  );
}

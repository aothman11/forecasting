"use client";

import { useState } from "react";
import { usePlanStore } from "@/lib/store";
import { computeSummaryMetrics, runPipeline } from "@/lib/calculations";
import type { ScenarioSnapshot } from "@/lib/types";

export function ScenarioCompare() {
  const params = usePlanStore((s) => s.params);
  const placementDays = usePlanStore((s) => s.placementDays);
  const scenarios = usePlanStore((s) => s.scenarios);
  const saveScenario = usePlanStore((s) => s.saveScenario);
  const deleteScenario = usePlanStore((s) => s.deleteScenario);
  const [name, setName] = useState("");

  const currentMetrics = computeSummaryMetrics(runPipeline(placementDays, params));

  const columns: { label: string; metrics: ReturnType<typeof computeSummaryMetrics>; id: string | null }[] = [
    { label: "Current (live)", metrics: currentMetrics, id: null },
    ...scenarios.map((sc: ScenarioSnapshot) => ({
      label: sc.name,
      metrics: computeSummaryMetrics(runPipeline(sc.placementDays, sc.params)),
      id: sc.id,
    })),
  ];

  const metricRows: { key: keyof ReturnType<typeof computeSummaryMetrics>; label: string; fmt: (n: number) => string }[] = [
    { key: "totalChicksPlaced", label: "Total Chicks Placed", fmt: (n) => Math.round(n).toLocaleString() },
    { key: "totalHarvestableBirds", label: "Total Harvestable Birds", fmt: (n) => Math.round(n).toLocaleString() },
    { key: "totalCarcassTons", label: "Total Carcass (tons)", fmt: (n) => n.toFixed(0) },
    { key: "totalFppTons", label: "FPP (tons)", fmt: (n) => n.toFixed(0) },
    { key: "totalWcFreshTons", label: "WC Fresh (tons)", fmt: (n) => n.toFixed(0) },
    { key: "totalWcFrozenTons", label: "WC Frozen (tons)", fmt: (n) => n.toFixed(0) },
    { key: "avgUtilizationPct", label: "Avg Capacity Utilization", fmt: (n) => `${n.toFixed(1)}%` },
    { key: "weeksWithCapacityBreach", label: "Weeks Over Capacity", fmt: (n) => String(n) },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Scenario Comparison</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Save up to 3 snapshots of the current parameters and placement plan, then compare key metrics side by side.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Scenario name (e.g. High Mortality)"
          className="border border-[var(--border-subtle)] rounded-md px-3 py-1.5 text-sm w-64"
        />
        <button
          disabled={!name.trim() || scenarios.length >= 3}
          onClick={() => {
            saveScenario(name.trim());
            setName("");
          }}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors disabled:opacity-40"
        >
          Save Current as Scenario
        </button>
        {scenarios.length >= 3 && (
          <span className="text-xs text-brand-gold">Max 3 scenarios saved — delete one to add another.</span>
        )}
      </div>

      <div className="border border-[var(--border-subtle)] rounded-lg overflow-x-auto">
        <table className="data-grid text-sm tabular-nums">
          <thead>
            <tr>
              <th className="text-left">Metric</th>
              {columns.map((c) => (
                <th key={c.label} className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {c.label}
                    {c.id && (
                      <button
                        onClick={() => deleteScenario(c.id!)}
                        className="text-neutral-400 hover:text-brand-alert normal-case font-normal"
                        title="Delete scenario"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((row) => (
              <tr key={row.key}>
                <td className="text-left font-medium">{row.label}</td>
                {columns.map((c) => (
                  <td key={c.label} className="text-right">
                    {row.fmt(c.metrics[row.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

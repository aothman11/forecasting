"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { usePlanStore } from "@/lib/store";
import { isExcelFile, parsePlacementCSV, parsePlacementExcel, type ParsedPlacementRow } from "@/lib/placementImport";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { SummaryCard } from "../shared/SummaryCard";
import type { PlacementDayRow } from "@/lib/types";
import { MAX_HORIZON_WEEKS, MIN_HORIZON_WEEKS } from "@/lib/defaults";

export function PlacementPlan() {
  const placementDays = usePlanStore((s) => s.placementDays);
  const params = usePlanStore((s) => s.params);
  const setPlacementDayRow = usePlanStore((s) => s.setPlacementDayRow);
  const setPlacementDays = usePlanStore((s) => s.setPlacementDays);
  const quickFillPlacementPlan = usePlanStore((s) => s.quickFillPlacementPlan);
  const setHorizonWeeks = usePlanStore((s) => s.setHorizonWeeks);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const runningTotal = placementDays.reduce((s, r) => s + r.farmsPlacing * r.chicksPerFarm, 0);
  const totalFarmsUsed = placementDays.reduce((s, r) => s + r.farmsPlacing, 0);

  const applyParsedRows = (parsed: ParsedPlacementRow[]) => {
    const byDate = new Map(parsed.map((p) => [p.date, p]));
    let matched = 0;
    setPlacementDays(
      placementDays.map((row) => {
        const patch = byDate.get(row.date);
        if (!patch) return row;
        matched++;
        return {
          ...row,
          farmsPlacing: patch.farmsPlacing ?? row.farmsPlacing,
          chicksPerFarm: patch.chicksPerFarm ?? row.chicksPerFarm,
        };
      })
    );
    setImportMessage(
      matched === 0
        ? `No rows matched — check the "Date" column uses yyyy-mm-dd and falls within the current ${placementDays.length}-day horizon.`
        : `Matched ${matched} of ${parsed.length} imported rows to the current horizon.`
    );
  };

  const handleImportFile = (file: File) => {
    if (isExcelFile(file)) {
      const reader = new FileReader();
      reader.onload = () => applyParsedRows(parsePlacementExcel(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => applyParsedRows(parsePlacementCSV(String(reader.result)));
      reader.readAsText(file);
    }
  };

  const columns: DataTableColumn<PlacementDayRow>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => `${r.date} (${format(new Date(r.date), "EEE")})`,
    },
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
          onChange={(e) => setPlacementDayRow(r.dayIndex, { farmsPlacing: Number(e.target.value) })}
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
          onChange={(e) => setPlacementDayRow(r.dayIndex, { chicksPerFarm: Number(e.target.value) })}
        />
      ),
    },
    {
      key: "total",
      header: "Total Chicks Placed",
      align: "right",
      render: (r) => Math.round(r.farmsPlacing * r.chicksPerFarm).toLocaleString(),
      footer: Math.round(runningTotal).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Step 1 — Placement Plan</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          The only manual input in the workbench, entered day by day. Every downstream step rolls this up into
          weekly totals and calculates forward from there.
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
        <SummaryCard label="Horizon" value={`${placementDays.length} days`} sublabel={`${params.planningHorizonWeeks} weeks`} />

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
          Import from Excel / CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {importMessage && (
        <div className="text-xs text-brand-green-dark bg-brand-green-tint rounded-md px-3 py-1.5 -mt-1">
          {importMessage}
        </div>
      )}

      <div className="text-xs text-neutral-400">
        Expected columns: <span className="font-medium text-neutral-500">Date</span> (yyyy-mm-dd),{" "}
        <span className="font-medium text-neutral-500">Farms Placing</span>,{" "}
        <span className="font-medium text-neutral-500">Chicks per Farm</span>.
      </div>

      <DataTable columns={columns} rows={placementDays} rowKey={(r) => r.dayIndex} />
    </div>
  );
}

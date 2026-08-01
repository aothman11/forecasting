"use client";

import { useRef, useState } from "react";
import { format, addDays } from "date-fns";

function horizonRange(planStartDate: string, horizonWeeks: number): string {
  const start = new Date(planStartDate);
  const end = addDays(start, horizonWeeks * 7 - 1);
  const s = format(start, "MMM yyyy");
  const e = format(end, "MMM yyyy");
  return s === e ? s : `${s} – ${e}`;
}
import { usePlanStore } from "@/lib/store";
import { isFridayDate } from "@/lib/calculations";
import { isExcelFile, parsePlacementCSV, parsePlacementExcel, type ParsedPlacementRow } from "@/lib/placementImport";
import { exportPlacementTemplate } from "@/lib/export";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import type { PlacementDayRow } from "@/lib/types";
import { MAX_HORIZON_MONTHS, MAX_HORIZON_WEEKS, MIN_HORIZON_MONTHS, MIN_HORIZON_WEEKS } from "@/lib/defaults";

export function PlacementPlan() {
  const placementDays = usePlanStore((s) => s.placementDays);
  const params = usePlanStore((s) => s.params);
  const setPlacementDayRow = usePlanStore((s) => s.setPlacementDayRow);
  const setPlacementDays = usePlanStore((s) => s.setPlacementDays);
  const quickFillPlacementPlan = usePlanStore((s) => s.quickFillPlacementPlan);
  const setHorizonWeeks = usePlanStore((s) => s.setHorizonWeeks);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const runningTotal = placementDays.reduce((s, r) => s + r.farmsPlacing * r.chicksPerHouse, 0);
  const totalHousesUsed = placementDays.reduce((s, r) => s + r.farmsPlacing, 0);

  const applyParsedRows = (parsed: ParsedPlacementRow[]) => {
    const byDate = new Map(parsed.map((p) => [p.date, p]));
    let matched = 0;
    setPlacementDays(
      placementDays.map((row) => {
        const patch = byDate.get(row.date);
        if (!patch) return row;
        matched++;
        const isFri = params.fridayOff && isFridayDate(row.date);
        return {
          ...row,
          farmsPlacing: isFri ? 0 : patch.farmsPlacing ?? row.farmsPlacing,
          chicksPerHouse: patch.chicksPerHouse ?? row.chicksPerHouse,
        };
      })
    );
    setImportMessage(
      matched === 0
        ? `No rows matched — check the "Placement Date" column uses yyyy-mm-dd and falls within the current ${placementDays.length}-day horizon. Tip: the template uses placement dates (harvest date − ${Math.round(params.cycleLengthDays)} days).`
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
      header: "Harvest Date",
      render: (r) => {
        const placementDate = addDays(new Date(r.date), -Math.round(params.cycleLengthDays));
        return (
          <div>
            <div className="font-medium">{r.date} ({format(new Date(r.date), "EEE")})</div>
            <div className="text-[11px] text-neutral-400">Place: {format(placementDate, "yyyy-MM-dd")} ({format(placementDate, "EEE")})</div>
          </div>
        );
      },
    },
    {
      key: "farmsPlacing",
      header: "House Placing",
      align: "right",
      render: (r) => {
        const isFri = params.fridayOff && isFridayDate(r.date);
        return isFri ? (
          <span className="text-neutral-400 italic">Off</span>
        ) : (
          <input
            className="cell-input text-right"
            type="number"
            min={0}
            value={r.farmsPlacing}
            onChange={(e) => setPlacementDayRow(r.dayIndex, { farmsPlacing: Number(e.target.value) })}
          />
        );
      },
      footer: totalHousesUsed.toLocaleString(),
    },
    {
      key: "chicksPerHouse",
      header: "Chicks per House",
      align: "right",
      render: (r) => (
        <input
          className="cell-input text-right"
          type="number"
          min={0}
          step={500}
          value={r.chicksPerHouse}
          onChange={(e) => setPlacementDayRow(r.dayIndex, { chicksPerHouse: Number(e.target.value) })}
        />
      ),
    },
    {
      key: "total",
      header: "Total Chicks Placed",
      align: "right",
      render: (r) => Math.round(r.farmsPlacing * r.chicksPerHouse).toLocaleString(),
      footer: Math.round(runningTotal).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Step 1 — Placement Plan</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          The only manual input in the workbench, entered day by day. Every downstream step rolls this up into
          weekly totals and calculates forward from there.{" "}
          {params.fridayOff && "Friday is off for placement and catching."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--border-subtle)] border-l-4 border-l-brand-green bg-white shadow-sm p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Running Total Chicks</span>
            <span className="text-base leading-none">🐣</span>
          </div>
          <div className="text-2xl font-bold text-brand-green-dark tabular-nums leading-tight">
            {Math.round(runningTotal).toLocaleString()}
          </div>
          <div className="text-[11px] text-neutral-400 font-medium">chicks placed</div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] border-l-4 border-l-blue-400 bg-white shadow-sm p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total House-Placements</span>
            <span className="text-base leading-none">🏠</span>
          </div>
          <div className="text-2xl font-bold text-blue-700 tabular-nums leading-tight">
            {totalHousesUsed.toLocaleString()}
          </div>
          <div className="text-[11px] text-neutral-400 font-medium">Quick Fill rate: {params.houseCount}/day</div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] border-l-4 border-l-violet-400 bg-white shadow-sm p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Horizon</span>
            <span className="text-base leading-none">📅</span>
          </div>
          <div className="text-lg font-bold text-violet-700 leading-tight">
            {horizonRange(params.planStartDate, params.planningHorizonWeeks)}
          </div>
          <div className="text-[11px] text-neutral-400 font-medium">{params.planningHorizonWeeks / 4} months · {placementDays.length} days</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1" />

        <label className="flex items-center gap-1.5 text-xs text-neutral-600">
          Horizon
          <select
            value={params.planningHorizonWeeks}
            onChange={(e) => setHorizonWeeks(Number(e.target.value))}
            className="border border-[var(--border-subtle)] rounded px-1.5 py-1 text-xs"
          >
            {Array.from({ length: MAX_HORIZON_MONTHS - MIN_HORIZON_MONTHS + 1 }, (_, i) => MIN_HORIZON_MONTHS + i).map((m) => (
              <option key={m} value={m * 4}>
                {horizonRange(params.planStartDate, m * 4)} ({m} {m === 1 ? "month" : "months"})
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={quickFillPlacementPlan}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
        >
          Quick Fill ({params.houseCount} houses/day)
        </button>

        <button
          onClick={() => exportPlacementTemplate(placementDays)}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green transition-colors"
        >
          Download Template
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
        Expected columns: <span className="font-medium text-neutral-500">Placement Date</span> (yyyy-mm-dd, the back-calculated placement date = harvest − {Math.round(params.cycleLengthDays)} days),{" "}
        <span className="font-medium text-neutral-500">House Placing</span>,{" "}
        <span className="font-medium text-neutral-500">Chicks per House</span>.
      </div>

      <DataTable
        columns={columns}
        rows={placementDays}
        rowKey={(r) => r.dayIndex}
        rowClassName={(r) => (params.fridayOff && isFridayDate(r.date) ? "bg-neutral-50 text-neutral-400" : "")}
      />

      <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
        <button
          onClick={() => {
            if (confirm("Clear all placement quantities? This will set every day to 0 houses. This cannot be undone.")) {
              setPlacementDays(placementDays.map((r) => ({ ...r, farmsPlacing: 0 })));
            }
          }}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
        >
          🗑 Delete Plan
        </button>
      </div>
    </div>
  );
}

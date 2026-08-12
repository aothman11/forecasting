"use client";

import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import type { BirdType, Farm, FarmStatus, PlacementEntry } from "@/lib/types";
import {
  checkEntry,
  computeMEQ1Rows,
  computeSequenceQueue,
  farmMonthlyTotal,
  isDuplicate,
} from "@/lib/farmQuota";
import { exportMEQ1ToTxt } from "@/lib/export";

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = "farm-master" | "placement-log" | "sequence-queue" | "meq1";

const TABS: { id: Tab; label: string }[] = [
  { id: "farm-master", label: "Farm Master" },
  { id: "placement-log", label: "Placement Log" },
  { id: "sequence-queue", label: "Sequence Queue" },
  { id: "meq1", label: "MEQ1 Export" },
];

const BIRD_TYPES: BirdType[] = ["Cobb", "Ross", "GP"];

const STATUS_CYCLE: FarmStatus[] = ["Active", "Inactive", "Under Maintenance"];

function nextStatus(current: FarmStatus): FarmStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

// ─── Small shared pieces ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FarmStatus }) {
  const styles: Record<FarmStatus, string> = {
    Active: "bg-green-100 text-green-800",
    Inactive: "bg-red-100 text-red-700",
    "Under Maintenance": "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

function CheckBadge({ label }: { label: string }) {
  const isOk = label === "OK";
  const isWarn = label.startsWith("OVER");
  const cls = isOk
    ? "bg-green-100 text-green-800"
    : isWarn
    ? "bg-amber-100 text-amber-800"
    : "bg-red-100 text-red-700";
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{label}</span>;
}

const fmt = (n: number) => n.toLocaleString();

// ─── Sort helpers ─────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  col: string;
  sortKey: string;
  sortDir: SortDir;
  onSort: (col: string) => void;
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      className={`cursor-pointer select-none hover:bg-neutral-100 transition-colors ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[9px] text-neutral-400">
          {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </span>
    </th>
  );
}

// ─── Excel Farm Master parser ─────────────────────────────────────────────────

function parseFarmsFromSheet(ws: XLSX.WorkSheet): Farm[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  const find = (row: Record<string, unknown>, ...keys: string[]): unknown => {
    const lc = keys.map((k) => k.toLowerCase());
    for (const k of Object.keys(row)) {
      if (lc.some((key) => k.toLowerCase().replace(/[^a-z0-9]/g, "").includes(key.replace(/[^a-z0-9]/g, "")))) {
        return row[k];
      }
    }
    return undefined;
  };

  return rows
    .map((row, i): Farm => ({
      code: String(find(row, "code", "farm", "verid", "farm code") ?? `F${i + 1}`).trim(),
      sequencePosition: Number(find(row, "seq", "sequence", "position", "rotation") ?? (i + 1) * 10),
      type: String(find(row, "type", "farm type") ?? "B").trim(),
      houses: Number(find(row, "house", "houses", "house count") ?? 12),
      fullCapacity: Number(find(row, "full cap", "full capacity", "fullcap") ?? 408000),
      placementPlanCapacity: Number(find(row, "plan cap", "plan capacity", "placement plan", "placementplan", "ceiling") ?? 312000),
      cycleLengthDays: Number(find(row, "cycle", "grow", "growout", "cycle length", "cycledays") ?? 43),
      cleaningDays: Number(find(row, "clean", "cleaning", "downtime", "rest", "cleaning days") ?? 17),
      status: (() => {
        const s = String(find(row, "status") ?? "Active").trim();
        if (s.toLowerCase().includes("inactive")) return "Inactive";
        if (s.toLowerCase().includes("maintenance")) return "Under Maintenance";
        return "Active";
      })() as FarmStatus,
      skipThisCycle: (() => {
        const v = find(row, "skip", "skip this cycle");
        if (v === undefined) return false;
        return v === true || v === 1 || String(v).toLowerCase() === "yes" || String(v).toLowerCase() === "true";
      })(),
    }))
    .filter((f) => f.code && f.code !== "F0");
}

// ─── Tab: Farm Master ─────────────────────────────────────────────────────────

function FarmMasterTab({ farms }: { farms: Farm[] }) {
  const updateFarm = usePlanStore((s) => s.updateFarm);
  const setFarms = usePlanStore((s) => s.setFarms);
  // F-16: used to detect when fullCapacity/houses diverges from the global planning parameter
  const globalChicksPerHouse = usePlanStore((s) => s.params.chicksPerHouse);
  const [statusFilter, setStatusFilter] = useState<FarmStatus | "All">("All");
  const [sortKey, setSortKey] = useState("sequencePosition");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSort(col: string) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("asc"); }
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsed = parseFarmsFromSheet(ws);
        if (parsed.length === 0) { setUploadMsg("No rows found — check column headers."); return; }
        setFarms(parsed);
        setUploadMsg(`Loaded ${parsed.length} farms from ${file.name}`);
      } catch {
        setUploadMsg("Failed to parse file — make sure it's a valid .xlsx.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  const filtered = useMemo(() => {
    const base = statusFilter === "All" ? farms : farms.filter((f) => f.status === statusFilter);
    return [...base].sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case "sequencePosition": av = a.sequencePosition; bv = b.sequencePosition; break;
        case "code": av = a.code; bv = b.code; break;
        case "type": av = a.type; bv = b.type; break;
        case "status": av = a.status; bv = b.status; break;
        case "cycleLengthDays": av = a.cycleLengthDays; bv = b.cycleLengthDays; break;
        case "cleaningDays": av = a.cleaningDays; bv = b.cleaningDays; break;
        case "skip": av = a.skipThisCycle ? 1 : 0; bv = b.skipThisCycle ? 1 : 0; break;
        default: av = a.sequencePosition; bv = b.sequencePosition;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [farms, statusFilter, sortKey, sortDir]);

  const counts = useMemo(
    () => ({
      total: farms.length,
      active: farms.filter((f) => f.status === "Active").length,
      inactive: farms.filter((f) => f.status === "Inactive").length,
      maintenance: farms.filter((f) => f.status === "Under Maintenance").length,
      skipped: farms.filter((f) => f.skipThisCycle).length,
    }),
    [farms]
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {(["All", "Active", "Inactive", "Under Maintenance"] as const).map((s) => {
            const count =
              s === "All" ? counts.total :
              s === "Active" ? counts.active :
              s === "Inactive" ? counts.inactive :
              counts.maintenance;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  statusFilter === s
                    ? "bg-brand-green text-white border-brand-green"
                    : "border-[var(--border-subtle)] text-neutral-600 hover:border-brand-green"
                }`}
              >
                {s} ({count})
              </button>
            );
          })}
          <span className="px-3 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-700">
            Skip This Cycle: {counts.skipped}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 text-xs font-semibold rounded border border-brand-green text-brand-green hover:bg-brand-green-tint transition-colors"
          >
            ↑ Upload Farm Master (.xlsx)
          </button>
        </div>
      </div>

      {uploadMsg && (
        <div className={`text-xs rounded px-3 py-2 ${uploadMsg.startsWith("Loaded") ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {uploadMsg}
          <button onClick={() => setUploadMsg(null)} className="ml-2 text-neutral-400 hover:text-neutral-600">×</button>
        </div>
      )}

      {/* F-16: alert when fullCapacity / houses diverges significantly from global chicksPerHouse.
          fullCapacity is entered from SAP; the global param is used for placement-plan grid
          quick-fill.  When they differ the planner may be using inconsistent capacity figures
          across the pipeline.  Show a list of offending farms so the user can investigate. */}
      {(() => {
        const TOLERANCE = 0.05; // 5 %
        const mismatched = farms.filter((f) => {
          if (f.houses <= 0) return false;
          const impliedPer = f.fullCapacity / f.houses;
          return Math.abs(impliedPer - globalChicksPerHouse) / globalChicksPerHouse > TOLERANCE;
        });
        if (mismatched.length === 0) return null;
        return (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <span className="font-semibold">Capacity mismatch ({mismatched.length} farm{mismatched.length !== 1 ? "s" : ""}):</span>{" "}
            The global <em>Chicks / House</em> parameter is{" "}
            <strong>{globalChicksPerHouse.toLocaleString()}</strong>, but the following farms have a{" "}
            <em>fullCapacity ÷ houses</em> value that differs by more than 5%:
            <ul className="mt-1 pl-3 list-disc space-y-0.5">
              {mismatched.slice(0, 10).map((f) => (
                <li key={f.code}>
                  <span className="font-mono font-semibold">{f.code}</span>:{" "}
                  {f.fullCapacity.toLocaleString()} ÷ {f.houses} ={" "}
                  <strong>{Math.round(f.fullCapacity / f.houses).toLocaleString()}</strong> birds/house
                </li>
              ))}
              {mismatched.length > 10 && <li>…and {mismatched.length - 10} more</li>}
            </ul>
            <p className="mt-1.5 text-amber-700">
              Edit <em>fullCapacity</em> in the table below to match SAP, or update <em>Chicks / House</em>{" "}
              in Parameters to match the farm master.
            </p>
          </div>
        );
      })()}

      <div className="text-xs text-neutral-500 bg-blue-50 border border-blue-200 rounded px-3 py-2">
        All fields are editable inline. Click <strong>Status</strong> to cycle Active → Inactive → Under Maintenance.
        Toggle <strong>Skip</strong> to exclude a farm from this cycle.
        Click column headers to sort. Upload an .xlsx to replace the entire farm list.
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
        <table className="data-grid w-full text-xs">
          <thead>
            <tr>
              <SortHeader label="Seq" col="sequencePosition" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Code" col="code" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Type" col="type" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th>Houses</th>
              <th className="text-right">Full Cap</th>
              <th className="text-right">Plan Cap</th>
              <SortHeader label="Cycle" col="cycleLengthDays" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Clean" col="cleaningDays" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Skip?" col="skip" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.code} className={f.status !== "Active" ? "opacity-60" : ""}>
                <td>
                  <input
                    type="number"
                    min={1}
                    className="cell-input text-xs w-14 text-center font-mono text-neutral-500"
                    value={f.sequencePosition}
                    onChange={(e) => updateFarm(f.code, { sequencePosition: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="cell-input text-xs w-16 font-mono font-semibold"
                    defaultValue={f.code}
                    key={f.code}
                    onBlur={(e) => {
                      const newCode = e.target.value.trim();
                      if (newCode && newCode !== f.code) updateFarm(f.code, { code: newCode });
                    }}
                  />
                </td>
                <td>
                  <input
                    className="cell-input text-xs w-10 text-center"
                    value={f.type}
                    onChange={(e) => updateFarm(f.code, { type: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    className="cell-input text-xs w-12 text-center"
                    value={f.houses}
                    onChange={(e) => updateFarm(f.code, { houses: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    className="cell-input text-xs w-24 text-right"
                    value={f.fullCapacity}
                    onChange={(e) => updateFarm(f.code, { fullCapacity: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    className="cell-input text-xs w-24 text-right font-semibold"
                    value={f.placementPlanCapacity}
                    onChange={(e) => updateFarm(f.code, { placementPlanCapacity: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    className="cell-input text-xs w-14 text-center"
                    value={f.cycleLengthDays}
                    onChange={(e) => updateFarm(f.code, { cycleLengthDays: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    className="cell-input text-xs w-14 text-center"
                    value={f.cleaningDays}
                    onChange={(e) => updateFarm(f.code, { cleaningDays: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <button
                    onClick={() => updateFarm(f.code, { status: nextStatus(f.status) })}
                    title="Click to change status"
                    className="focus:outline-none"
                  >
                    <StatusBadge status={f.status} />
                  </button>
                </td>
                <td className="text-center">
                  <button
                    onClick={() => updateFarm(f.code, { skipThisCycle: !f.skipThisCycle })}
                    title="Toggle skip this cycle"
                    className={`w-8 h-5 rounded-full transition-colors flex items-center ${
                      f.skipThisCycle ? "bg-amber-400" : "bg-neutral-200"
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${
                        f.skipThisCycle ? "translate-x-3" : "translate-x-0"
                      }`}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-400">
        Showing {filtered.length} of {farms.length} farms · Changes persist immediately.
      </p>
    </div>
  );
}

// ─── Suggest entries from pipeline ───────────────────────────────────────────

function generateSuggestions(
  calendarDays: { date: string; plannedQty: number; allocatedQty: number }[],
  farms: Farm[],
  entries: PlacementEntry[],
  monthPrefix: string
): Omit<PlacementEntry, "id">[] {
  const alreadyPlaced = new Set(
    entries.filter((e) => e.date.startsWith(monthPrefix)).map((e) => e.farmCode)
  );

  const queue = farms
    .filter((f) => f.status === "Active" && !f.skipThisCycle && !alreadyPlaced.has(f.code))
    .sort((a, b) => a.sequencePosition - b.sequencePosition);

  const suggestions: Omit<PlacementEntry, "id">[] = [];
  const placedByFarm = new Map<string, number>();
  let queueIdx = 0;

  for (const day of calendarDays) {
    let remaining = day.plannedQty - day.allocatedQty;
    if (remaining <= 0) continue;

    while (remaining > 0 && queueIdx < queue.length) {
      const farm = queue[queueIdx];
      const placedSoFar = placedByFarm.get(farm.code) ?? 0;
      const farmRemaining = farm.placementPlanCapacity - placedSoFar;
      const qty = Math.min(farmRemaining, remaining);
      if (qty > 0) {
        suggestions.push({
          farmCode: farm.code,
          date: day.date,
          birdType: "Cobb",
          qtyPlaced: qty,
        });
        placedByFarm.set(farm.code, placedSoFar + qty);
        remaining -= qty;
      }
      // Only advance to the next farm once this one's ceiling is fully used;
      // a partially-filled farm carries its remainder into the next day.
      if (placedSoFar + qty >= farm.placementPlanCapacity) queueIdx++;
      else break;
    }
  }

  return suggestions;
}

// ─── Tab: Placement Log ───────────────────────────────────────────────────────

function PlacementLogTab({ farms }: { farms: Farm[] }) {
  const entries = usePlanStore((s) => s.placementEntries);
  const config = usePlanStore((s) => s.monthlyPlanConfig);
  const overrides = usePlanStore((s) => s.dailyPlannedQtyOverrides);
  const addEntry = usePlanStore((s) => s.addPlacementEntry);
  const updateEntry = usePlanStore((s) => s.updatePlacementEntry);
  const removeEntry = usePlanStore((s) => s.removePlacementEntry);
  const setEntries = usePlanStore((s) => s.setPlacementEntries);
  const updateConfig = usePlanStore((s) => s.updateMonthlyPlanConfig);
  const setOverride = usePlanStore((s) => s.setDailyPlannedQtyOverride);

  const { result } = usePipeline();

  const monthPrefix = config.planningMonth.slice(0, 7);
  const monthEntries = useMemo(
    () => entries.filter((e) => e.date.startsWith(monthPrefix)),
    [entries, monthPrefix]
  );

  const farmMap = useMemo(() => new Map(farms.map((f) => [f.code, f])), [farms]);

  const calendarDays = useMemo(() => {
    return result.placementDays
      .filter((d) => d.date.startsWith(monthPrefix) && d.farmsPlacing > 0)
      .map((d) => {
        const plannedQty = overrides[d.date] ?? d.farmsPlacing * d.chicksPerHouse;
        const allocatedQty = monthEntries
          .filter((e) => e.date === d.date)
          .reduce((s, e) => s + e.qtyPlaced, 0);
        return { date: d.date, plannedQty, allocatedQty, gap: plannedQty - allocatedQty };
      });
  }, [result.placementDays, monthPrefix, overrides, monthEntries]);

  const [draft, setDraft] = useState<Omit<PlacementEntry, "id">>({
    farmCode: "",
    date: config.planningMonth.slice(0, 10),
    birdType: "Cobb",
    qtyPlaced: 0,
  });

  const [suggesting, setSuggesting] = useState(false);

  function handleAdd() {
    if (!draft.farmCode || !draft.date || draft.qtyPlaced <= 0) return;
    addEntry({ ...draft, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
    setDraft((d) => ({ ...d, farmCode: "", qtyPlaced: 0 }));
  }

  function handleSuggest() {
    setSuggesting(true);
    const suggestions = generateSuggestions(calendarDays, farms, entries, monthPrefix);
    for (const s of suggestions) {
      addEntry({ ...s, id: `sug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
    }
    setSuggesting(false);
  }

  const totalPlanned = calendarDays.reduce((s, d) => s + d.plannedQty, 0);
  const totalPlaced = calendarDays.reduce((s, d) => s + d.allocatedQty, 0);
  const totalGap = totalPlanned - totalPlaced;

  return (
    <div className="space-y-4">
      {/* Config header */}
      <div className="bg-white rounded-lg border border-[var(--border-subtle)] p-4">
        <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
          Plan Configuration
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Planning Month</span>
            <input
              type="month"
              className="cell-input text-xs"
              value={config.planningMonth.slice(0, 7)}
              onChange={(e) =>
                updateConfig({
                  planningMonth: e.target.value + "-01",
                  submissionStatus: "Not Submitted",
                  submittedOn: null,
                })
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Plant (WERKS)</span>
            <input
              className="cell-input text-xs font-mono"
              value={config.plant}
              onChange={(e) => updateConfig({ plant: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Cobb Mat. No.</span>
            <input
              className="cell-input text-xs font-mono"
              value={config.cobbMatNo}
              onChange={(e) => updateConfig({ cobbMatNo: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Ross Mat. No.</span>
            <input
              className="cell-input text-xs font-mono"
              value={config.rossMatNo}
              onChange={(e) => updateConfig({ rossMatNo: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">GP Mat. No.</span>
            <input
              className="cell-input text-xs font-mono"
              value={config.gpMatNo}
              onChange={(e) => updateConfig({ gpMatNo: e.target.value })}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Submission</span>
            <div className="flex items-center h-[30px]">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  config.submissionStatus === "Submitted"
                    ? "bg-green-100 text-green-800"
                    : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {config.submissionStatus}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Entry table */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-700">
              Placement Entries — {config.planningMonth.slice(0, 7)}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">{monthEntries.length} rows</span>
              {calendarDays.length > 0 && totalGap > 0 && (
                <button
                  onClick={handleSuggest}
                  disabled={suggesting}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  title="Auto-distribute remaining planned qty across next available farms in sequence order. Bird type defaults to Cobb — change per entry."
                >
                  {suggesting ? "Suggesting…" : `⚡ Suggest farms (${fmt(totalGap)} gap)`}
                </button>
              )}
              {monthEntries.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm(`Delete all ${monthEntries.length} placement entries for ${monthPrefix}? This cannot be undone.`)) {
                      setEntries(entries.filter((e) => !e.date.startsWith(monthPrefix)));
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                  title="Remove every placement entry in the current planning month"
                >
                  🗑 Delete All
                </button>
              )}
            </div>
          </div>

          {/* Add row */}
          <div className="bg-brand-green-tint border border-brand-green/20 rounded-lg p-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500">Farm Code</span>
              <select
                className="cell-input text-xs w-28"
                value={draft.farmCode}
                onChange={(e) => setDraft((d) => ({ ...d, farmCode: e.target.value }))}
              >
                <option value="">— select —</option>
                {farms
                  .filter((f) => f.status === "Active")
                  .map((f) => (
                    <option key={f.code} value={f.code}>
                      {f.code}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500">Date</span>
              <input
                type="date"
                className="cell-input text-xs"
                value={draft.date}
                onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500">Bird Type</span>
              <select
                className="cell-input text-xs w-20"
                value={draft.birdType}
                onChange={(e) => setDraft((d) => ({ ...d, birdType: e.target.value as BirdType }))}
              >
                {BIRD_TYPES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500">Qty Placed</span>
              <input
                type="number"
                min={0}
                className="cell-input text-xs w-24"
                value={draft.qtyPlaced || ""}
                onChange={(e) => setDraft((d) => ({ ...d, qtyPlaced: Number(e.target.value) }))}
              />
            </label>
            <button
              onClick={handleAdd}
              disabled={!draft.farmCode || draft.qtyPlaced <= 0}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-brand-green text-white hover:bg-brand-green-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              + Add
            </button>
          </div>

          {/* Entries table */}
          <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] max-h-[420px] overflow-y-auto">
            <table className="data-grid w-full text-xs">
              <thead className="sticky top-0 z-10 bg-white">
                <tr>
                  <th>Farm</th>
                  <th>Date</th>
                  <th>Bird Type</th>
                  <th className="text-right">Qty Placed</th>
                  <th className="text-right">Monthly Total</th>
                  <th className="text-right">Ceiling</th>
                  <th className="text-right">Remaining</th>
                  <th>Check</th>
                  <th>Dup?</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {monthEntries.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-6 text-neutral-400">
                      No entries for {config.planningMonth.slice(0, 7)}. Use the form above to add placement
                      events, or click <strong>Suggest farms</strong> to auto-distribute from the pipeline.
                    </td>
                  </tr>
                ) : (
                  monthEntries.map((entry) => {
                    const farm = farmMap.get(entry.farmCode);
                    const monthly = farmMonthlyTotal(entry.farmCode, config.planningMonth, entries);
                    const ceiling = farm?.placementPlanCapacity ?? 0;
                    const remaining = ceiling - monthly;
                    const check = farm
                      ? checkEntry(entry, farm, monthly)
                      : { status: "INACTIVE" as const, label: "Farm not found" };
                    const dup = isDuplicate(entry, monthEntries);
                    return (
                      <tr key={entry.id} className={dup ? "bg-red-50" : ""}>
                        <td className="font-mono font-semibold">{entry.farmCode}</td>
                        <td>
                          <input
                            type="date"
                            className="cell-input text-xs w-28"
                            value={entry.date}
                            onChange={(e) => updateEntry(entry.id, { date: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            className="cell-input text-xs"
                            value={entry.birdType}
                            onChange={(e) =>
                              updateEntry(entry.id, { birdType: e.target.value as BirdType })
                            }
                          >
                            {BIRD_TYPES.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            min={0}
                            className="cell-input text-xs w-24 text-right"
                            value={entry.qtyPlaced}
                            onChange={(e) =>
                              updateEntry(entry.id, { qtyPlaced: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="text-right font-semibold">{fmt(monthly)}</td>
                        <td className="text-right text-neutral-500">{fmt(ceiling)}</td>
                        <td
                          className={`text-right font-semibold ${
                            remaining < 0 ? "text-red-600" : "text-neutral-700"
                          }`}
                        >
                          {fmt(remaining)}
                        </td>
                        <td>
                          <CheckBadge label={check.label} />
                        </td>
                        <td className="text-center">
                          {dup ? (
                            <span className="text-red-600 font-semibold text-[10px]">DUP</span>
                          ) : (
                            <span className="text-neutral-300">—</span>
                          )}
                        </td>
                        <td>
                          <button
                            onClick={() => removeEntry(entry.id)}
                            className="text-red-400 hover:text-red-600 text-xs px-1"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Daily Calendar panel */}
        <div className="w-64 shrink-0">
          <div className="text-sm font-semibold text-neutral-700 mb-1">Daily Calendar</div>
          <div className="text-xs text-neutral-400 mb-2">
            From Step 1 pipeline · amber = override
          </div>
          <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
            <div className="overflow-y-auto max-h-[500px]">
              <table className="data-grid w-full text-xs">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Planned</th>
                    <th className="text-right">Placed</th>
                    <th className="text-right">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {calendarDays.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-4 text-neutral-400 text-[10px]">
                        No placements in Step 1<br />for this month.
                      </td>
                    </tr>
                  ) : (
                    calendarDays.map((d) => {
                      const hasOverride = overrides[d.date] !== undefined;
                      return (
                        <tr key={d.date}>
                          <td className="font-mono text-[10px]">{d.date.slice(5)}</td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              <input
                                type="number"
                                min={0}
                                className={`cell-input text-xs text-right w-20 ${
                                  hasOverride ? "bg-amber-50" : ""
                                }`}
                                value={d.plannedQty}
                                onChange={(e) => setOverride(d.date, Number(e.target.value))}
                              />
                              {hasOverride && (
                                <button
                                  onClick={() => setOverride(d.date, null)}
                                  className="text-amber-500 hover:text-amber-700 text-[10px]"
                                  title="Reset to pipeline"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="text-right font-semibold">{fmt(d.allocatedQty)}</td>
                          <td
                            className={`text-right font-semibold ${
                              d.gap < 0
                                ? "text-red-500"
                                : d.gap > 0
                                ? "text-amber-500"
                                : "text-green-600"
                            }`}
                          >
                            {d.gap === 0 ? "✓" : d.gap > 0 ? `+${fmt(d.gap)}` : fmt(d.gap)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {calendarDays.length > 0 && (
            <div className="mt-2 text-[10px] text-neutral-400">
              Total planned: {fmt(totalPlanned)}
              <br />
              Total placed: {fmt(totalPlaced)}
              {totalGap > 0 && (
                <span className="text-amber-500 font-semibold"><br />Gap: +{fmt(totalGap)}</span>
              )}
              {totalGap === 0 && totalPlaced > 0 && (
                <span className="text-green-600 font-semibold"><br />Fully distributed ✓</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Sequence Queue ──────────────────────────────────────────────────────

function SequenceQueueTab({ farms }: { farms: Farm[] }) {
  const entries = usePlanStore((s) => s.placementEntries);
  const today = new Date().toISOString().slice(0, 10);

  const queueRows = useMemo(
    () => computeSequenceQueue(farms, entries, today),
    [farms, entries, today]
  );

  const availableCount = queueRows.filter((r) => r.isAvailableNow).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-neutral-700">
          Rotation Queue — sorted by sequence position
        </span>
        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-semibold">
          {availableCount} available now
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
        <table className="data-grid w-full text-xs">
          <thead>
            <tr>
              <th>Seq</th>
              <th>Code</th>
              <th>Type</th>
              <th>Status</th>
              <th>Skip?</th>
              <th>Last Placed</th>
              <th className="text-center">Day of Cycle</th>
              <th>Next Available</th>
              <th className="text-center">Days Left</th>
              <th className="text-center">Queue</th>
            </tr>
          </thead>
          <tbody>
            {queueRows.map(
              ({
                farm,
                lastPlacementDate,
                dayOfCycle,
                nextAvailableDate,
                daysUntilAvailable,
                isAvailableNow,
              }) => (
                <tr
                  key={farm.code}
                  className={
                    farm.status !== "Active"
                      ? "opacity-50"
                      : isAvailableNow
                      ? "bg-green-50"
                      : ""
                  }
                >
                  <td className="font-mono text-neutral-400">{farm.sequencePosition}</td>
                  <td className="font-mono font-semibold">{farm.code}</td>
                  <td>{farm.type}</td>
                  <td>
                    <StatusBadge status={farm.status} />
                  </td>
                  <td className="text-center">
                    {farm.skipThisCycle ? (
                      <span className="text-amber-600 font-semibold text-[10px]">Yes</span>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="font-mono text-neutral-500">
                    {lastPlacementDate ?? (
                      <span className="text-neutral-300">Never</span>
                    )}
                  </td>
                  <td className="text-center">
                    {dayOfCycle !== null ? (
                      <span
                        className={
                          dayOfCycle > farm.cycleLengthDays + farm.cleaningDays
                            ? "text-green-600 font-semibold"
                            : ""
                        }
                      >
                        {dayOfCycle}d
                      </span>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="font-mono">
                    {nextAvailableDate ?? (
                      <span className="text-green-600 font-semibold">Now</span>
                    )}
                  </td>
                  <td className="text-center">
                    {daysUntilAvailable <= 0 ? (
                      <span className="text-green-600 font-semibold">✓ Ready</span>
                    ) : (
                      <span className="text-neutral-500">{daysUntilAvailable}d</span>
                    )}
                  </td>
                  <td className="text-center">
                    {isAvailableNow && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-600 text-white">
                        UP
                      </span>
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-400">
        Today: {today} · Cycle = {farms[0]?.cycleLengthDays ?? 43}d grow-out +{" "}
        {farms[0]?.cleaningDays ?? 17}d cleaning ={" "}
        {(farms[0]?.cycleLengthDays ?? 43) + (farms[0]?.cleaningDays ?? 17)}d total
      </p>
    </div>
  );
}

// ─── Tab: MEQ1 Export ─────────────────────────────────────────────────────────

function MEQ1Tab({ farms }: { farms: Farm[] }) {
  const entries = usePlanStore((s) => s.placementEntries);
  const config = usePlanStore((s) => s.monthlyPlanConfig);
  const mortalityRate = usePlanStore((s) => s.params.mortalityRate);
  const updateConfig = usePlanStore((s) => s.updateMonthlyPlanConfig);

  const meq1Rows = useMemo(
    () => computeMEQ1Rows(entries, farms, config, mortalityRate),
    [entries, farms, config, mortalityRate]
  );

  const birdGroups = useMemo(() => {
    const groups: Record<string, typeof meq1Rows> = { Cobb: [], Ross: [], GP: [] };
    for (const r of meq1Rows) {
      if (r.matnr === config.cobbMatNo) groups.Cobb.push(r);
      else if (r.matnr === config.rossMatNo) groups.Ross.push(r);
      else groups.GP.push(r);
    }
    return groups;
  }, [meq1Rows, config]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-[var(--border-subtle)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-neutral-700">
              MEQ1 Upload — {config.planningMonth.slice(0, 7)}
            </div>
            <div className="text-xs text-neutral-500">
              Plant {config.plant} · {meq1Rows.length} rows ·{" "}
              {Object.entries(birdGroups)
                .map(([bt, rows]) => `${bt}: ${rows.length}`)
                .join(" · ")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 rounded text-xs font-semibold ${
                config.submissionStatus === "Submitted"
                  ? "bg-green-100 text-green-800"
                  : "bg-neutral-100 text-neutral-600"
              }`}
            >
              {config.submissionStatus}
              {config.submittedOn && (
                <span className="ml-1 font-normal text-[10px]">
                  {config.submittedOn.slice(0, 10)}
                </span>
              )}
            </span>
            {meq1Rows.length > 0 && (
              <button
                onClick={() => exportMEQ1ToTxt(meq1Rows, config)}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
              >
                Export to TXT (LSMW)
              </button>
            )}
            {config.submissionStatus === "Not Submitted" && meq1Rows.length > 0 && (
              <button
                onClick={() =>
                  updateConfig({
                    submissionStatus: "Submitted",
                    submittedOn: new Date().toISOString(),
                  })
                }
                className="px-3 py-1.5 text-xs font-semibold rounded border border-brand-green text-brand-green hover:bg-brand-green-tint transition-colors"
              >
                Mark as Submitted
              </button>
            )}
          </div>
        </div>
      </div>

      {meq1Rows.length === 0 ? (
        <div className="text-center py-12 text-neutral-400 text-sm">
          No valid MEQ1 rows yet. Add placement entries in the Placement Log tab, ensuring all
          entries pass the Check (status = OK).
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
          <table className="data-grid w-full text-xs font-mono">
            <thead>
              <tr>
                <th>MATNR</th>
                <th>WERKS</th>
                <th>DATAB</th>
                <th>DATBI</th>
                <th>QUPOS</th>
                <th>VERID</th>
                <th className="text-right">QUMAX</th>
                <th className="text-right">QUPRI</th>
                <th className="text-right">QUAZT</th>
                <th className="text-right">QUMIN</th>
              </tr>
            </thead>
            <tbody>
              {meq1Rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.matnr}</td>
                  <td>{r.werks}</td>
                  <td>{r.datab}</td>
                  <td>{r.datbi}</td>
                  <td className="font-bold">{r.qupos}</td>
                  <td className="font-bold">{r.verid}</td>
                  <td className="text-right">{r.qumax.toLocaleString()}</td>
                  <td className="text-right">{r.qupri}</td>
                  <td className="text-right">{r.quazt}</td>
                  <td className="text-right">{r.qumin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-neutral-400">
        Only entries with Check = OK are included. Grouped by bird type (Cobb → Ross → GP).
        QUMAX = placed qty × (1 − {(mortalityRate * 100).toFixed(0)}% mortality) — output birds after grow-out.
        DATAB = DATBI = actual placement date. Downloads as tab-delimited .txt — upload via SAP LSMW.
      </p>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export function FarmQuotaDistribution() {
  const [tab, setTab] = useState<Tab>("placement-log");
  const farms = usePlanStore((s) => s.farms);

  // F-10: cross-module divergence check — compare total chicks in placementEntries
  // against the total in the Step-1 placement grid (placementDays).
  // These two modules track related but separate things: placementDays is the aggregate
  // planning schedule; placementEntries are per-farm actual events.  When both are
  // populated they should sum to the same total — a significant gap means one module
  // was updated without updating the other.
  const placementEntries = usePlanStore((s) => s.placementEntries);
  const placementDays = usePlanStore((s) => s.placementDays);
  const dailyOverrides = usePlanStore((s) => s.dailyPlannedQtyOverrides);
  const chicksPerHouse = usePlanStore((s) => s.params.chicksPerHouse);

  const divergenceBanner = useMemo(() => {
    const entriesTotal = placementEntries.reduce((s, e) => s + e.qtyPlaced, 0);
    const planTotal = placementDays.reduce((s, d) => {
      const qty = dailyOverrides[d.date] ?? d.farmsPlacing * chicksPerHouse;
      return s + qty;
    }, 0);
    if (entriesTotal === 0 || planTotal === 0) return null;
    const delta = Math.abs(entriesTotal - planTotal);
    const pct = delta / planTotal;
    if (pct < 0.01) return null; // within 1% — considered consistent
    return {
      entriesTotal,
      planTotal,
      delta,
      pct,
      isOver: entriesTotal > planTotal,
    };
  }, [placementEntries, placementDays, dailyOverrides, chicksPerHouse]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Step 7 — Farm Distribution by Cycle</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Farm master list with capacity, status, and skip flags per placement cycle. Upload from SAP or edit inline.
        </p>
      </div>

      {divergenceBanner && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-start gap-3 text-sm text-amber-800">
          <span className="text-base mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <span className="font-semibold">Placement totals are out of sync.</span>{" "}
            The Placement Log has{" "}
            <strong>{Math.round(divergenceBanner.entriesTotal).toLocaleString()} chicks</strong> across all
            entries, but the Step 1 Placement Plan shows{" "}
            <strong>{Math.round(divergenceBanner.planTotal).toLocaleString()} chicks</strong>{" "}
            (difference:{" "}
            <strong>
              {divergenceBanner.isOver ? "+" : "-"}
              {Math.round(divergenceBanner.delta).toLocaleString()}
            </strong>
            {" / "}
            {(divergenceBanner.pct * 100).toFixed(1)}%). Update one or both modules so they agree before
            exporting MEQ1.
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-brand-green text-brand-green"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "farm-master" && <FarmMasterTab farms={farms} />}
      {tab === "placement-log" && <PlacementLogTab farms={farms} />}
      {tab === "sequence-queue" && <SequenceQueueTab farms={farms} />}
      {tab === "meq1" && <MEQ1Tab farms={farms} />}
    </div>
  );
}

"use client";

import { useRef, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { usePlanStore } from "@/lib/store";
import { explodeSalesPlan, weeksInPlan, plantsInPlan, isoWeekLabel } from "@/lib/processingPlanCalc";
import type { SalesPlanCartonRow, ProcessingPlanCell } from "@/lib/processingPlanTypes";
import { GRADE_POOL_LABELS } from "@/lib/bomTypes";
import type { GradePool } from "@/lib/bomTypes";

// ─── constants ────────────────────────────────────────────────────────────────

const GRADE_POOLS: GradePool[] = ["930", "931", "932", "933"];

const POOL_COLORS: Record<GradePool, string> = {
  "930": "bg-green-100 text-green-800 border-green-200",
  "931": "bg-blue-100 text-blue-800 border-blue-200",
  "932": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "933": "bg-orange-100 text-orange-800 border-orange-200",
};

const POOL_BAR_COLORS: Record<GradePool, string> = {
  "930": "#16a34a",
  "931": "#2563eb",
  "932": "#ca8a04",
  "933": "#ea580c",
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtKg(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function fmtNum(n: number) {
  return Math.round(n).toLocaleString();
}

// ─── SAP sales plan parser ────────────────────────────────────────────────────

interface ParseResult {
  rows: SalesPlanCartonRow[];
  errors: string[];
}

function parseSapSalesPlan(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  const rows: SalesPlanCartonRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];

    // Week — "Week No. in 2026" or "Week" column
    const weekRaw = r["Week No. in 2026"] ?? r["Week No."] ?? r["Week"];
    const week = typeof weekRaw === "number" ? weekRaw : parseInt(String(weekRaw), 10);

    // Plant
    const plantRaw = String(r["Plnt"] ?? r["Plant"] ?? "").trim();

    // SKU
    const skuCode = String(r["Material Code"] ?? r["Material"] ?? r["SKU Code"] ?? "").trim();
    const skuDescription = String(r["Material Description"] ?? r["Material Number"] ?? r["SKU Description"] ?? "").trim();

    // Cartons — "Gross Sales Volume (CAR)" or "Quantity (Units)" etc.
    const cartonRaw =
      r["Gross Sales Volume (CAR)"] ??
      r["Gross Sales Volume (Car)"] ??
      r["Quantity (Units)"] ??
      r["Cartons"] ??
      r["CAR"];
    const cartons = typeof cartonRaw === "number" ? cartonRaw : parseFloat(String(cartonRaw));

    if (!skuCode) continue; // skip blank rows
    if (isNaN(week) || week <= 0) { errors.push(`Row ${i + 2}: invalid week "${weekRaw}"`); continue; }
    if (!["1100", "1200", "1300"].includes(plantRaw)) { errors.push(`Row ${i + 2}: unknown plant "${plantRaw}" for SKU ${skuCode}`); continue; }
    if (isNaN(cartons) || cartons < 0) { errors.push(`Row ${i + 2}: invalid cartons "${cartonRaw}" for SKU ${skuCode}`); continue; }
    if (cartons === 0) continue;

    rows.push({ week, plant: plantRaw, skuCode, skuDescription, cartons });
  }

  return { rows, errors };
}

// ─── SKU breakdown popover ────────────────────────────────────────────────────

function BreakdownPopover({ cell, onClose }: { cell: ProcessingPlanCell; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl border border-[var(--border-subtle)] w-[480px] max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between sticky top-0 bg-white">
          <div>
            <div className="text-sm font-semibold text-neutral-800">
              Plant {cell.plant} · Week {cell.week}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold ${POOL_COLORS[cell.gradePool]}`}>
                {cell.gradePool} · {GRADE_POOL_LABELS[cell.gradePool]}
              </span>
              <span className="text-xs text-neutral-500">{fmtKg(cell.requiredCarcassKg)} KG · {fmtNum(cell.cartons)} CAR</span>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">✕</button>
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-neutral-50 text-neutral-500 text-[11px] uppercase tracking-wide">
              <th className="px-4 py-2 text-left">SKU</th>
              <th className="px-4 py-2 text-right">Cartons</th>
              <th className="px-4 py-2 text-right">Carcass KG</th>
              <th className="px-4 py-2 text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {cell.skuBreakdown.map((s, i) => (
              <tr key={s.skuCode} className={`border-t border-[var(--border-subtle)] ${i % 2 === 0 ? "bg-white" : "bg-neutral-50/50"}`}>
                <td className="px-4 py-2">
                  <div className="font-mono font-semibold text-neutral-700">{s.skuCode}</div>
                  <div className="text-[11px] text-neutral-400 truncate max-w-[180px]">{s.skuDescription}</div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtNum(s.cartons)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-blue-700">{fmtKg(s.carcassKg)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-500">
                  {cell.requiredCarcassKg > 0 ? ((s.carcassKg / cell.requiredCarcassKg) * 100).toFixed(1) + "%" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function ProcessingPlanDemand() {
  const bomRecords = usePlanStore((s) => s.bomRecords);
  const params = usePlanStore((s) => s.params);
  const salesPlanCartonRows = usePlanStore((s) => s.salesPlanCartonRows);
  const salesPlanCartonConfirmed = usePlanStore((s) => s.salesPlanCartonConfirmed);
  const setSalesPlanCartonRows = usePlanStore((s) => s.setSalesPlanCartonRows);
  const confirmSalesPlan = usePlanStore((s) => s.confirmSalesPlan);
  const clearSalesPlan = usePlanStore((s) => s.clearSalesPlan);
  const setDemandOpen = usePlanStore((s) => s.setDemandOpen);
  const setProcessingPlanOpen = usePlanStore((s) => s.setProcessingPlanOpen);
  const addBomRecord = usePlanStore((s) => s.addBomRecord);

  const fileRef = useRef<HTMLInputElement>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [activeCell, setActiveCell] = useState<ProcessingPlanCell | null>(null);
  const [expandedPool, setExpandedPool] = useState<GradePool | null>(null);

  const gradeYields = params.gradeYields;

  // ── derived data ──
  const hasBom = bomRecords.length > 0;
  const hasRows = salesPlanCartonRows.length > 0;

  const { cells, unmatched } = useMemo(
    () =>
      hasRows
        ? explodeSalesPlan(salesPlanCartonRows, bomRecords, gradeYields)
        : { cells: [], unmatched: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salesPlanCartonRows, bomRecords, JSON.stringify(gradeYields)]
  );

  const weeks = weeksInPlan(cells);
  const plants = plantsInPlan(cells);
  const planYear = new Date(params.planStartDate).getFullYear();

  // cell lookup: `${plant}::${week}::${pool}`
  const cellIndex = new Map(cells.map((c) => [`${c.plant}::${c.week}::${c.gradePool}`, c]));

  // totals
  const totalCartons = salesPlanCartonRows.reduce((s, r) => s + r.cartons, 0);
  const totalCarcassKg = cells.reduce((s, c) => s + c.requiredCarcassKg, 0);
  const poolTotals = Object.fromEntries(
    GRADE_POOLS.map((p) => [p, cells.filter((c) => c.gradePool === p).reduce((s, c) => s + c.requiredCarcassKg, 0)])
  ) as Record<GradePool, number>;

  // ── navigate to Demand Plan ──
  const goToDemandPlan = () => {
    setProcessingPlanOpen(false);
    setDemandOpen(true);
  };

  // ── create placeholder BOM records for all unmatched SKUs ──
  const addDummyBoms = () => {
    // Deduplicate by skuCode — one dummy BOM per unique SKU (plant = ALL)
    const seen = new Set(bomRecords.map((b) => b.skuCode));
    const byCode = new Map<string, { skuCode: string; skuDescription: string }>();
    unmatched.forEach((r) => {
      if (!seen.has(r.skuCode) && !byCode.has(r.skuCode)) {
        byCode.set(r.skuCode, { skuCode: r.skuCode, skuDescription: r.skuDescription });
      }
    });
    byCode.forEach(({ skuCode, skuDescription }) => {
      addBomRecord({
        id: crypto.randomUUID(),
        skuCode,
        skuDescription,
        packageWeightKg: 1.0,   // placeholder — update in Product BOM
        unitsPerCarton: 10,      // placeholder — update in Product BOM
        gradePool: "930",        // default to A-Grade Fresh
        plant: "ALL",
      });
    });
  };

  // ── file upload (direct fallback) ──
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows, errors } = parseSapSalesPlan(ev.target!.result as ArrayBuffer);
      setParseErrors(errors);
      setSalesPlanCartonRows(rows);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // ── export ──
  const handleExport = () => {
    const exportRows = cells.flatMap((c) =>
      c.skuBreakdown.map((s) => ({
        Week: c.week,
        Plant: c.plant,
        "Grade Pool": c.gradePool,
        "Grade Pool Name": GRADE_POOL_LABELS[c.gradePool],
        "SKU Code": s.skuCode,
        "SKU Description": s.skuDescription,
        "Cartons": s.cartons,
        "Required Carcass (KG)": parseFloat(s.carcassKg.toFixed(2)),
      }))
    );
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Processing Plan");
    XLSX.writeFile(wb, "AWP_Processing_Plan_Demand.xlsx");
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-brand-green-dark">Processing Plan</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Demand-driven carcass requirement — derived from the sales plan via Product BOM.
        </p>
      </div>

      {/* BOM warning */}
      {!hasBom && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 font-medium">
          ⚠ No BOM records found. Go to <strong>Product BOM</strong> and add your SKU master before uploading a sales plan.
        </div>
      )}

      {/* Data source panel */}
      {hasRows ? (
        /* ── Loaded state ── */
        <div className="rounded-xl border border-green-200 bg-green-50/60 px-4 py-3 flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold bg-green-100 text-green-800 border-green-200 text-xs shrink-0">
            ✓ Sales plan loaded
          </span>
          <span className="text-xs text-neutral-600">
            <span className="font-semibold tabular-nums">{fmtNum(salesPlanCartonRows.length)}</span> rows ·{" "}
            <span className="font-semibold tabular-nums">{fmtNum(totalCartons)}</span> cartons
            {unmatched.length > 0 && (
              <span className="ml-2 text-amber-700 font-semibold">· ⚠ {unmatched.length} SKU(s) not in BOM</span>
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-neutral-400">Auto-fed from Demand Plan (M1) import</span>
            <button
              onClick={goToDemandPlan}
              title="Go to Demand Plan (M1) to re-import the sales plan"
              className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-brand-green/40 text-brand-green-dark hover:bg-brand-green hover:text-white transition-colors"
            >
              ↺ Sync from M1
            </button>
            <button
              onClick={clearSalesPlan}
              className="text-xs text-neutral-400 hover:text-red-600 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        /* ── Empty state — guide user to M1 ── */
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-4">
          <div className="text-2xl mt-0.5">📥</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-900">No sales plan data yet</div>
            <div className="text-xs text-amber-800 mt-1 leading-relaxed">
              This view is fed automatically from your Demand Plan import.
              Go to <strong>Demand Plan (M1)</strong>, open <strong>Import Sales Plan</strong>, and click <strong>Apply</strong> — the Processing Plan will populate instantly without any second upload.
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={goToDemandPlan}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
              >
                → Go to Demand Plan (M1)
              </button>
              <span className="text-xs text-amber-700">or</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
              <button
                onClick={() => fileRef.current?.click()}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:border-brand-green hover:text-brand-green-dark transition-colors"
              >
                ⬆ Upload SAP file directly
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parse errors from direct upload */}
      {parseErrors.length > 0 && (
        <div className="space-y-1">
          {parseErrors.slice(0, 5).map((e, i) => (
            <div key={i} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">⚠ {e}</div>
          ))}
          {parseErrors.length > 5 && (
            <div className="text-xs text-red-500">…and {parseErrors.length - 5} more errors</div>
          )}
        </div>
      )}

      {/* Unmatched SKUs */}
      {unmatched.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
          <div className="px-4 py-2.5 text-xs font-semibold text-amber-900 flex items-center gap-2 flex-wrap">
            <span>⚠ {unmatched.length} SKU{unmatched.length !== 1 ? "s" : ""} not found in Product BOM — excluded from calculation</span>
            <button
              onClick={addDummyBoms}
              title="Create placeholder BOM entries for all unmatched SKUs (packageWeightKg=1.0, unitsPerCarton=10, gradePool=930). Edit real values in Product BOM."
              className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-700 text-white hover:bg-amber-800 transition-colors"
            >
              + Add dummy BOMs
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-amber-100/70 text-amber-900 text-[11px] uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">SKU Code</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Total Cartons</th>
                  <th className="px-3 py-2 text-left">Plants</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(
                  unmatched.reduce<Record<string, { skuCode: string; skuDescription: string; cartons: number; plants: Set<string> }>>(
                    (acc, r) => {
                      if (!acc[r.skuCode]) acc[r.skuCode] = { skuCode: r.skuCode, skuDescription: r.skuDescription, cartons: 0, plants: new Set() };
                      acc[r.skuCode].cartons += r.cartons;
                      acc[r.skuCode].plants.add(r.plant);
                      return acc;
                    },
                    {}
                  )
                ).map((u, i) => (
                  <tr key={u.skuCode} className={`border-t border-amber-100 ${i % 2 === 0 ? "bg-white" : "bg-amber-50/30"}`}>
                    <td className="px-3 py-1.5 font-mono font-semibold text-amber-900">{u.skuCode}</td>
                    <td className="px-3 py-1.5 text-neutral-600">{u.skuDescription || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(u.cartons)}</td>
                    <td className="px-3 py-1.5 text-neutral-500">{[...u.plants].join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results — only shown when there are matched cells */}
      {cells.length > 0 && (
        <>
          {/* KPI summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-3 col-span-2 md:col-span-1">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Total Cartons</div>
              <div className="text-xl font-bold text-neutral-800 tabular-nums mt-1">{fmtNum(totalCartons)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-3 col-span-2 md:col-span-1">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Total Carcass Req.</div>
              <div className="text-xl font-bold text-blue-700 tabular-nums mt-1">{fmtKg(totalCarcassKg)} KG</div>
            </div>
            {GRADE_POOLS.map((pool) => (
              <div key={pool} className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-3">
                <div className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold mb-1 ${POOL_COLORS[pool]}`}>
                  {pool}
                </div>
                <div className="text-xs text-neutral-500 mb-1">{GRADE_POOL_LABELS[pool]}</div>
                <div className="text-base font-bold tabular-nums" style={{ color: POOL_BAR_COLORS[pool] }}>
                  {fmtKg(poolTotals[pool])} KG
                </div>
                <div className="text-[11px] text-neutral-400 tabular-nums">
                  {totalCarcassKg > 0 ? ((poolTotals[pool] / totalCarcassKg) * 100).toFixed(1) : "0.0"}%
                </div>
              </div>
            ))}
          </div>

          {/* Grade pool selector + export */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-neutral-500">Show pool:</span>
            <button
              onClick={() => setExpandedPool(null)}
              className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-colors ${expandedPool === null ? "bg-brand-green text-white border-brand-green" : "border-[var(--border-subtle)] text-neutral-600 hover:border-brand-green"}`}
            >
              All
            </button>
            {GRADE_POOLS.map((p) => (
              <button
                key={p}
                onClick={() => setExpandedPool(expandedPool === p ? null : p)}
                className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-colors ${expandedPool === p ? POOL_COLORS[p] : "border-[var(--border-subtle)] text-neutral-600 hover:border-brand-green"}`}
              >
                {p} · {GRADE_POOL_LABELS[p]}
              </button>
            ))}
            <button
              onClick={handleExport}
              className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-neutral-700 hover:border-brand-green hover:text-brand-green-dark transition-colors"
            >
              ⬇ Export Excel
            </button>
          </div>

          {/* Weekly table per plant × grade pool */}
          {(expandedPool ? [expandedPool] : GRADE_POOLS).map((pool) => {
            const poolCells = cells.filter((c) => c.gradePool === pool);
            if (poolCells.length === 0) return null;
            const poolWeeks = weeksInPlan(poolCells);
            const poolPlants = plantsInPlan(poolCells);

            return (
              <div key={pool} className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2">
                  <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-bold ${POOL_COLORS[pool]}`}>
                    {pool} · {GRADE_POOL_LABELS[pool]}
                  </span>
                  <span className="text-xs text-neutral-500">Required carcass KG — click any cell for SKU breakdown</span>
                  <span className="ml-auto text-xs font-semibold tabular-nums" style={{ color: POOL_BAR_COLORS[pool] }}>
                    Total: {fmtKg(poolTotals[pool])} KG
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-brand-green-tint text-brand-green-dark text-[11px] uppercase tracking-wide">
                        <th className="px-3 py-2.5 text-left font-semibold sticky left-0 bg-brand-green-tint z-10">Plant</th>
                        {poolWeeks.map((w) => (
                          <th key={w} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{isoWeekLabel(w, planYear)}</th>
                        ))}
                        <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poolPlants.map((plant, pi) => {
                        const plantTotal = poolCells.filter((c) => c.plant === plant).reduce((s, c) => s + c.requiredCarcassKg, 0);
                        return (
                          <tr key={plant} className={`border-t border-[var(--border-subtle)] ${pi % 2 === 0 ? "bg-white" : "bg-neutral-50/50"}`}>
                            <td className="px-3 py-2 font-semibold text-neutral-700 sticky left-0 bg-inherit z-10 whitespace-nowrap">
                              Plant {plant}
                            </td>
                            {poolWeeks.map((w) => {
                              const cell = cellIndex.get(`${plant}::${w}::${pool}`);
                              return (
                                <td key={w} className="px-3 py-2 text-right tabular-nums">
                                  {cell ? (
                                    <button
                                      onClick={() => setActiveCell(cell)}
                                      className="tabular-nums font-semibold text-blue-700 hover:underline cursor-pointer"
                                      title={`${cell.cartons.toLocaleString()} CAR — click for SKU breakdown`}
                                    >
                                      {fmtKg(cell.requiredCarcassKg)}
                                    </button>
                                  ) : (
                                    <span className="text-neutral-300">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: POOL_BAR_COLORS[pool] }}>
                              {fmtKg(plantTotal)}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Weekly total row */}
                      <tr className="border-t-2 border-neutral-200 bg-neutral-50 font-semibold">
                        <td className="px-3 py-2 text-neutral-600 sticky left-0 bg-neutral-50 z-10">Total</td>
                        {poolWeeks.map((w) => {
                          const wTotal = poolCells.filter((c) => c.week === w).reduce((s, c) => s + c.requiredCarcassKg, 0);
                          return (
                            <td key={w} className="px-3 py-2 text-right tabular-nums" style={{ color: POOL_BAR_COLORS[pool] }}>
                              {fmtKg(wTotal)}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: POOL_BAR_COLORS[pool] }}>
                          {fmtKg(poolTotals[pool])}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Empty state */}
      {!hasRows && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 py-16 text-center">
          <div className="text-3xl mb-3">📋</div>
          <div className="text-sm font-semibold text-neutral-600">No sales plan uploaded yet</div>
          <div className="text-xs text-neutral-400 mt-1">Upload your SAP sales plan file above to see the carcass requirement</div>
        </div>
      )}

      {/* SKU breakdown popover */}
      {activeCell && <BreakdownPopover cell={activeCell} onClose={() => setActiveCell(null)} />}
    </div>
  );
}

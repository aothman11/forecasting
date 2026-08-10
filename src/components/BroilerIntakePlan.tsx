"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import { GRADE_POOL_LABELS } from "@/lib/bomTypes";
import type { ProcessingPlanCell } from "@/lib/processingPlanTypes";
import type { Parameters } from "@/lib/types";
import type { BomRecord } from "@/lib/bomTypes";
import {
  forecastToProcessingCells,
  weeksInPlan,
  isoWeekLabel,
  buildPlanWeekLabels,
} from "@/lib/processingPlanCalc";
import { SIZE_KEYS, SIZE_KG } from "@/lib/defaults";

// ─── constants ────────────────────────────────────────────────────────────────

/** Maps the pipeline's internal plant keys to the plant identifiers used in displays and data keys. */
const PIPELINE_PLANT_TO_CODE: Record<string, string> = {
  plant1: "P1",
  plant2: "P2",
  plant3: "P3",
};

const ALL_PLANTS = ["P1", "P2", "P3"] as const;

// ─── number formatters ────────────────────────────────────────────────────────

function fmtNum(n: number) { return Math.round(n).toLocaleString(); }
function fmtKg(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

// ─── coverage badge ───────────────────────────────────────────────────────────

function CoverageBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-neutral-300 text-xs">—</span>;
  const cls =
    pct >= 100 ? "bg-green-100 text-green-800 border-green-200" :
    pct >= 80  ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                 "bg-red-100 text-red-800 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cls}`}>
      {pct >= 100 ? "✓" : "✗"} {pct.toFixed(0)}%
    </span>
  );
}

// ─── pool colours (mirrors ProcessingPlanDemand) ─────────────────────────────

const POOL_COLORS: Record<string, string> = {
  "930": "bg-green-100 text-green-800 border-green-200",
  "931": "bg-blue-100 text-blue-800 border-blue-200",
  "932": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "933": "bg-orange-100 text-orange-800 border-orange-200",
};

// ─── per-SKU birds helper ─────────────────────────────────────────────────────

function birdsForSku(
  skuCode: string,
  carcassKg: number,
  bomMap: Map<string, BomRecord>,
  gradeYields: Parameters["gradeYields"],
  avgCarcassWeightKg: number,
): number {
  const bom = bomMap.get(skuCode);
  if (bom && (bom.gradePool === "930" || bom.gradePool === "931") && bom.packageWeightKg > 0) {
    const y = gradeYields[bom.gradePool] ?? 1;
    return carcassKg * y / bom.packageWeightKg;
  }
  return avgCarcassWeightKg > 0 ? carcassKg / avgCarcassWeightKg : 0;
}

// ─── pipeline birds by size popover ──────────────────────────────────────────

function PipelineBirdsPopover({
  plant, week, isoWeekLbl, carcassKg, params, onClose,
}: {
  plant: string;
  week: number;
  isoWeekLbl: string;
  carcassKg: number;
  params: Parameters;
  onClose: () => void;
}) {
  const dist = params.carcassSizeDistribution;
  const wtdAvgKg = SIZE_KEYS.reduce((s, k) => s + (dist[k] ?? 0) * SIZE_KG[k], 0);
  const totalBirds = wtdAvgKg > 0 ? carcassKg / wtdAvgKg : 0;

  const rows = SIZE_KEYS.map((k) => {
    const pct   = (dist[k] ?? 0) * 100;
    const kgAmt = carcassKg * (dist[k] ?? 0);
    const birds = SIZE_KG[k] > 0 ? kgAmt / SIZE_KG[k] : 0;
    return { key: k, label: `${SIZE_KG[k] * 1000}g`, pct, kgAmt, birds };
  }).filter((r) => r.pct > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl border border-[var(--border-subtle)] w-[460px] max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between sticky top-0 bg-white">
          <div>
            <div className="text-sm font-semibold text-neutral-800">
              Plant {plant} · {isoWeekLbl} — Pipeline Birds
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {fmtKg(carcassKg)} KG carcass · {fmtNum(Math.round(totalBirds))} birds (size-adjusted)
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">✕</button>
        </div>

        {/* Size breakdown table */}
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-neutral-50 text-neutral-500 text-[11px] uppercase tracking-wide">
              <th className="px-4 py-2 text-left">Size bucket</th>
              <th className="px-4 py-2 text-right">Share</th>
              <th className="px-4 py-2 text-right">Carcass KG</th>
              <th className="px-4 py-2 text-right">Birds</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className={`border-t border-[var(--border-subtle)] ${i % 2 === 0 ? "bg-white" : "bg-neutral-50/50"}`}>
                <td className="px-4 py-2 font-semibold text-neutral-700">{r.label}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{r.pct.toFixed(1)}%</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{fmtKg(r.kgAmt)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-800 font-semibold">{fmtNum(Math.round(r.birds))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-200 bg-neutral-50 font-semibold">
              <td className="px-4 py-2 text-neutral-700">Total</td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-600">
                {rows.reduce((s, r) => s + r.pct, 0).toFixed(1)}%
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{fmtKg(carcassKg)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-800">{fmtNum(Math.round(totalBirds))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── breakdown popover ────────────────────────────────────────────────────────

function BroilerBreakdownPopover({
  plant, week, isoWeekLbl, cells, bomRecords, params, onClose,
}: {
  plant: string;
  week: number;
  isoWeekLbl: string;
  cells: ProcessingPlanCell[];
  bomRecords: BomRecord[];
  params: Parameters;
  onClose: () => void;
}) {
  const bomMap = useMemo(() => new Map(bomRecords.map((r) => [r.skuCode, r])), [bomRecords]);
  const plantCells = cells.filter((c) => c.plant === plant && c.week === week);
  const totalBirds = plantCells.reduce((sum, cell) =>
    sum + cell.skuBreakdown.reduce((s, sku) =>
      s + birdsForSku(sku.skuCode, sku.carcassKg, bomMap, params.gradeYields, params.avgCarcassWeightKg), 0), 0);
  const totalCarcassKg = plantCells.reduce((s, c) => s + c.requiredCarcassKg, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl border border-[var(--border-subtle)] w-[560px] max-h-[75vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between sticky top-0 bg-white">
          <div>
            <div className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
              Plant {plant} · {isoWeekLbl}
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">Forecast</span>
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {fmtKg(totalCarcassKg)} KG carcass · {fmtNum(Math.round(totalBirds))} birds required
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const rows: Record<string, unknown>[] = [];
                plantCells.forEach((cell) => {
                  cell.skuBreakdown.forEach((s) => {
                    const birds = birdsForSku(s.skuCode, s.carcassKg, bomMap, params.gradeYields, params.avgCarcassWeightKg);
                    rows.push({
                      Plant: plant,
                      Week: isoWeekLbl,
                      "Grade Pool": `${cell.gradePool} · ${GRADE_POOL_LABELS[cell.gradePool as keyof typeof GRADE_POOL_LABELS] ?? cell.gradePool}`,
                      Product: s.skuDescription,
                      "Demand (t)": parseFloat(s.cartons.toFixed(2)),
                      "Carcass KG": parseFloat(s.carcassKg.toFixed(2)),
                      "Req. Birds": Math.round(birds),
                      "Share %": cell.requiredCarcassKg > 0 ? parseFloat(((s.carcassKg / cell.requiredCarcassKg) * 100).toFixed(1)) : 0,
                    });
                  });
                });
                const ws = XLSX.utils.json_to_sheet(rows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Breakdown");
                XLSX.writeFile(wb, `Broiler_Breakdown_P${plant}_${isoWeekLbl}.xlsx`);
              }}
              className="text-xs px-2.5 py-1 rounded border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 font-medium flex items-center gap-1"
            >
              ↓ Export
            </button>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">✕</button>
          </div>
        </div>

        {/* One section per grade pool */}
        {plantCells.map((cell) => {
          const cellTotalBirds = cell.skuBreakdown.reduce((s, sku) =>
            s + birdsForSku(sku.skuCode, sku.carcassKg, bomMap, params.gradeYields, params.avgCarcassWeightKg), 0);
          return (
            <div key={cell.gradePool}>
              {/* Grade pool sub-header */}
              <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-neutral-50 flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold ${POOL_COLORS[cell.gradePool] ?? ""}`}>
                  {cell.gradePool} · {GRADE_POOL_LABELS[cell.gradePool as keyof typeof GRADE_POOL_LABELS] ?? cell.gradePool}
                </span>
                <span className="text-xs text-neutral-500">
                  {fmtKg(cell.requiredCarcassKg)} KG · {fmtNum(Math.round(cellTotalBirds))} birds
                </span>
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-500 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 text-left">Product</th>
                    <th className="px-4 py-2 text-right">Demand (t)</th>
                    <th className="px-4 py-2 text-right">Carcass KG</th>
                    <th className="px-4 py-2 text-right">Req. Birds</th>
                    <th className="px-4 py-2 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {cell.skuBreakdown.map((s, i) => {
                    const birds = birdsForSku(s.skuCode, s.carcassKg, bomMap, params.gradeYields, params.avgCarcassWeightKg);
                    return (
                      <tr key={s.skuCode} className={`border-t border-[var(--border-subtle)] ${i % 2 === 0 ? "bg-white" : "bg-neutral-50/50"}`}>
                        <td className="px-4 py-2">
                          <div className="text-[11px] text-neutral-600 truncate max-w-[200px]">{s.skuDescription}</div>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {s.cartons.toFixed(1)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-blue-700">{fmtKg(s.carcassKg)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-brand-green-dark">{fmtNum(Math.round(birds))}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-neutral-500">
                          {cell.requiredCarcassKg > 0 ? ((s.carcassKg / cell.requiredCarcassKg) * 100).toFixed(1) + "%" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function BroilerIntakePlan() {
  const bomRecords          = usePlanStore((s) => s.bomRecords);
  const params              = usePlanStore((s) => s.params);
  const demandProducts      = usePlanStore((s) => s.demandProducts);
  const demandQty           = usePlanStore((s) => s.demandQty);
  const setProcessingPlanOpen = usePlanStore((s) => s.setProcessingPlanOpen);
  const setBroilerIntakeOpen  = usePlanStore((s) => s.setBroilerIntakeOpen);
  const setDemandOpen         = usePlanStore((s) => s.setDemandOpen);

  // ── production pipeline supply ──
  const { result } = usePipeline();

  // Build a supply map: plantCode::isoWeek → available carcass KG + birds.
  // pw.isoWeek is computed once in calculations.ts (getISOWeek on harvestDateStart),
  // so it is guaranteed to use the same calendar dates as the SAP file.
  // An "ALL::week" key is also accumulated so files without a Plnt column still match.
  const supplyMap = useMemo(() => {
    const m = new Map<string, { carcassKg: number; birds: number }>();
    const add = (key: string, kg: number, birds: number) => {
      const cur = m.get(key) ?? { carcassKg: 0, birds: 0 };
      m.set(key, { carcassKg: cur.carcassKg + kg, birds: cur.birds + birds });
    };
    for (const pw of result.plants) {
      const code = PIPELINE_PLANT_TO_CODE[pw.plant];
      if (!code) continue;
      add(`${code}::${pw.isoWeek}`, pw.carcassKg, pw.birds);  // per-plant key
      add(`ALL::${pw.isoWeek}`, pw.carcassKg, pw.birds);       // aggregate key
    }
    return m;
  }, [result.plants]);

  // ── plan-week → ISO-week map (from pipeline result) ──
  const planWeekToIsoWeek = useMemo(
    () => new Map(result.plants.map((pw) => [pw.week, pw.isoWeek])),
    [result.plants]
  );

  const horizonWeeks = useMemo(
    () => Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1),
    [params.planningHorizonWeeks]
  );

  // ── processing plan demand — always from Demand Plan forecast ──
  const cells      = useMemo(
    () =>
      forecastToProcessingCells(demandProducts, demandQty, params, horizonWeeks, planWeekToIsoWeek),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demandProducts, JSON.stringify(demandQty), params, horizonWeeks, planWeekToIsoWeek]
  );
  // Aggregate demand to plant × week (sum all grade pools)
  const demandMap = useMemo(() => {
    const m = new Map<string, { carcassKg: number; cartons: number }>();
    for (const c of cells) {
      const key = `${c.plant}::${c.week}`;
      const cur = m.get(key) ?? { carcassKg: 0, cartons: 0 };
      m.set(key, { carcassKg: cur.carcassKg + c.requiredCarcassKg, cartons: cur.cartons + c.cartons });
    }
    return m;
  }, [cells]);

  /**
   * Required birds per plant × week, computed from the SKU breakdown in each
   * processing-plan cell so that the carcass-size distribution is honoured.
   *
   * WC products (grade pool 930 / 931):
   *   birds = skuCarcassKg × gradeYield / packageWeightKg
   *   (uses the actual weight bucket — 800 g, 900 g … — from the BOM)
   *
   * Cuts / FPP (932 / 933) and unknown SKUs:
   *   birds = skuCarcassKg / avgCarcassWeightKg  (parameter fallback)
   */
  const requiredBirdsMap = useMemo(() => {
    const bomMap = new Map(bomRecords.map((r) => [r.skuCode, r]));
    const m = new Map<string, number>();
    for (const cell of cells) {
      const key = `${cell.plant}::${cell.week}`;
      let birds = 0;
      for (const sku of cell.skuBreakdown) {
        const bom = bomMap.get(sku.skuCode);
        if (bom && (bom.gradePool === "930" || bom.gradePool === "931") && bom.packageWeightKg > 0) {
          const yield_ = params.gradeYields[bom.gradePool] ?? 1;
          birds += sku.carcassKg * yield_ / bom.packageWeightKg;
        } else {
          birds += params.avgCarcassWeightKg > 0 ? sku.carcassKg / params.avgCarcassWeightKg : 0;
        }
      }
      m.set(key, (m.get(key) ?? 0) + birds);
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, bomRecords, params.gradeYields, params.avgCarcassWeightKg]);

  /**
   * Pipeline birds — size-adjusted.
   *
   * The pipeline carcassKg was produced by a flock with a known size distribution.
   * Inverting that distribution gives the bird count:
   *
   *   pipelineBirds = carcassKg / Σ(dist[size] × sizeKg[size])
   *
   * This is the exact mathematical inverse of how the pipeline computes carcass weight,
   * making it directly comparable to requiredBirdsMap (which uses SKU-level weights).
   */
  const pipelineBirdsMap = useMemo(() => {
    const dist = params.carcassSizeDistribution;
    const wtdAvgKg = SIZE_KEYS.reduce((s, k) => s + (dist[k] ?? 0) * SIZE_KG[k], 0);
    const m = new Map<string, number>();
    if (wtdAvgKg <= 0) return m;
    for (const [key, val] of supplyMap) {
      m.set(key, val.carcassKg / wtdAvgKg);
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplyMap, params.carcassSizeDistribution]);

  // ── Weeks: union of demand weeks + non-zero supply weeks ──
  // This ensures both early demand weeks (no harvest yet) AND later supply weeks
  // (harvest from in-plan placements) are shown side-by-side.
  const weeks = useMemo(() => {
    const demandWeeks = new Set(weeksInPlan(cells));
    const supplyWeeks = new Set<number>();
    for (const [key, val] of supplyMap) {
      if (val.carcassKg > 0) {
        const isoWeek = Number(key.split("::")[1]);
        supplyWeeks.add(isoWeek);
      }
    }
    return [...new Set([...demandWeeks, ...supplyWeeks])].sort((a, b) => a - b);
  }, [cells, supplyMap]);

  // Always show all three plants so supply data is never hidden.
  const plants = ALL_PLANTS as readonly string[];

  const hasData  = cells.length > 0;
  const planYear = params.planStartDate
    ? parseInt(params.planStartDate.split("-")[0], 10)
    : new Date().getFullYear();

  // Column labels using plan-week start dates — prevents "Jul.W4" for a plan
  // starting Aug 1 (ISO week 31 starts July 27; we want "Aug.W1").
  const planWeekLabels = useMemo(
    () => buildPlanWeekLabels(planWeekToIsoWeek, params.planStartDate),
    [planWeekToIsoWeek, params.planStartDate]
  );
  const wkLabel = (isoWeek: number) => planWeekLabels.get(isoWeek) ?? isoWeekLabel(isoWeek, planYear);

  // ── breakdown popover state ──
  const [activeBreakdown,         setActiveBreakdown]         = useState<{ plant: string; week: number } | null>(null);
  const [activePipelineBreakdown, setActivePipelineBreakdown] = useState<{ plant: string; week: number } | null>(null);

  // ── summary KPIs ──
  const totalReqKg = useMemo(
    () => [...demandMap.values()].reduce((s, v) => s + v.carcassKg, 0),
    [demandMap]
  );
  const totalAvailKg = useMemo(
    () => [...demandMap.keys()].reduce((s, k) => s + (supplyMap.get(k)?.carcassKg ?? 0), 0),
    [demandMap, supplyMap]
  );
  const shortfallWeeks = useMemo(() => {
    if (!hasData) return 0;
    return weeks.filter((w) => {
      const reqKg   = plants.reduce((s, p) => s + (demandMap.get(`${p}::${w}`)?.carcassKg ?? 0), 0);
      const availKg = plants.reduce((s, p) => s + (supplyMap.get(`${p}::${w}`)?.carcassKg ?? 0), 0);
      return availKg < reqKg;
    }).length;
  }, [weeks, plants, demandMap, supplyMap, hasData]);

  // ── navigation ──
  const goToProcessingPlan = () => { setBroilerIntakeOpen(false); setProcessingPlanOpen(true); };
  const goToDemandPlan     = () => { setBroilerIntakeOpen(false); setDemandOpen(true); };

  // ── export ──
  const handleExport = () => {
    const rows: Record<string, unknown>[] = [];
    for (const plant of plants) {
      for (const week of weeks) {
        const d = demandMap.get(`${plant}::${week}`);
        const s = supplyMap.get(`${plant}::${week}`);
        const reqKg   = d?.carcassKg ?? 0;
        const availKg = s?.carcassKg ?? 0;
        rows.push({
          Plant: plant,
          "Week": wkLabel(week),
          "Required Carcass KG": parseFloat(reqKg.toFixed(2)),
          "Required Birds (size-adjusted)": Math.round(demandMap.get(`${plant}::${week}`) ? (requiredBirdsMap.get(`${plant}::${week}`) ?? 0) : 0),
          "Available Carcass KG (Pipeline)": parseFloat(availKg.toFixed(2)),
          "Available Birds (Pipeline, size-adj.)": Math.round(pipelineBirdsMap.get(`${plant}::${week}`) ?? 0),
          "Gap KG": parseFloat((availKg - reqKg).toFixed(2)),
          "Coverage %": reqKg > 0 ? parseFloat(((availKg / reqKg) * 100).toFixed(1)) : null,
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Broiler Intake");
    XLSX.writeFile(wb, "AWP_Broiler_Intake_Plan.xlsx");
  };

  // ── empty state ──
  if (!hasData) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-brand-green-dark">Broiler Intake Plan</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Pipeline supply vs processing demand — by plant × week.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-4">
          <div className="text-2xl mt-0.5">📋</div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-900">No demand data yet</div>
            <div className="text-xs text-amber-800 mt-1 leading-relaxed">
              Enter weekly demand in the <strong>Demand Plan (M1)</strong> — this view will
              populate automatically once demand is saved. You can also review per-grade-pool
              carcass requirements in the <strong>Processing Plan</strong>.
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={goToDemandPlan}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
              >
                Go to Demand Plan
              </button>
              <span className="text-xs text-amber-700">or</span>
              <button
                onClick={goToProcessingPlan}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:border-brand-green hover:text-brand-green-dark transition-colors"
              >
                Go to Processing Plan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-brand-green-dark">Broiler Intake Plan</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Pipeline supply (from Placement Plan) vs processing demand (from Demand Plan forecast) — by plant × week.
        </p>
      </div>

      {/* Data source banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-2.5 flex items-center gap-3 flex-wrap text-xs">
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border font-semibold bg-blue-100 text-blue-800 border-blue-200 shrink-0">
          📊 Demand Plan
        </span>
        <span className="text-neutral-600">
          Demand derived from your <strong>Demand Plan</strong> via pipeline yields.
        </span>
        <button
          onClick={goToDemandPlan}
          className="ml-auto font-medium px-2.5 py-1 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-100 transition-colors whitespace-nowrap"
        >
          Edit Demand Plan
        </button>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-3">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Required Carcass</div>
          <div className="text-xl font-bold text-neutral-800 tabular-nums mt-1">{fmtKg(totalReqKg)} KG</div>
          <div className="text-[11px] text-neutral-400">from demand plan forecast</div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-3">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Pipeline Supply</div>
          <div className="text-xl font-bold text-blue-700 tabular-nums mt-1">{fmtKg(totalAvailKg)} KG</div>
          <div className="text-[11px] text-neutral-400">from placement schedule</div>
        </div>
        <div className={`rounded-xl border shadow-sm p-3 ${totalAvailKg >= totalReqKg ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Total Gap</div>
          <div className={`text-xl font-bold tabular-nums mt-1 ${totalAvailKg >= totalReqKg ? "text-green-700" : "text-red-700"}`}>
            {totalAvailKg >= totalReqKg ? "+" : ""}{fmtKg(totalAvailKg - totalReqKg)} KG
          </div>
          <div className="text-[11px] text-neutral-400">supply minus demand</div>
        </div>
        <div className={`rounded-xl border shadow-sm p-3 ${shortfallWeeks === 0 ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Shortfall Weeks</div>
          <div className={`text-xl font-bold tabular-nums mt-1 ${shortfallWeeks === 0 ? "text-green-700" : "text-red-700"}`}>
            {shortfallWeeks}
          </div>
          <div className="text-[11px] text-neutral-400">weeks under-covered</div>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-neutral-500">
        <span>
          🔗 <strong>Supply</strong> comes from the Production Pipeline (Placement Plan → grow-out → slaughter).
          Adjust placement in <strong>Step 1</strong> to close any shortfall.
          <span className="ml-2 text-neutral-400">
            Weeks matched via harvest dates · Plants: plant1→P1, plant2→P2, plant3→P3 · Demand derived from Demand Plan via yield ratios.
          </span>
        </span>
        <button
          onClick={handleExport}
          className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-neutral-700 hover:border-brand-green hover:text-brand-green-dark transition-colors"
        >
          ⬇ Export Excel
        </button>
      </div>

      {/* Per-plant tables */}
      {plants.map((plant) => {
        const plantReqKg   = weeks.reduce((s, w) => s + (demandMap.get(`${plant}::${w}`)?.carcassKg ?? 0), 0);
        const plantAvailKg = weeks.reduce((s, w) => s + (supplyMap.get(`${plant}::${w}`)?.carcassKg ?? 0), 0);
        const plantCovPct  = plantReqKg > 0 ? (plantAvailKg / plantReqKg) * 100 : null;

        return (
          <div key={plant} className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
            {/* Plant header */}
            <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-3 bg-brand-green-tint flex-wrap">
              <span className="font-bold text-brand-green-dark text-sm">Plant {plant}</span>
              <span className="text-xs text-neutral-600">
                Required: <span className="font-semibold tabular-nums">{fmtKg(plantReqKg)}</span> KG
              </span>
              <span className="text-xs text-neutral-600">
                Available: <span className="font-semibold tabular-nums text-blue-700">{fmtKg(plantAvailKg)}</span> KG
              </span>
              {plantCovPct !== null && <CoverageBadge pct={plantCovPct} />}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-500 text-[11px] uppercase tracking-wide">
                    <th className="px-3 py-2.5 text-left sticky left-0 bg-neutral-50 z-10 w-40">Metric</th>
                    {weeks.map((w) => (
                      <th key={w} className="px-3 py-2.5 text-right whitespace-nowrap font-semibold">{wkLabel(w)}</th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Required carcass KG — clickable */}
                  <tr className="border-t border-[var(--border-subtle)] bg-white">
                    <td className="px-3 py-2 text-neutral-600 sticky left-0 bg-white z-10 font-medium whitespace-nowrap">
                      Required (KG)
                      <div className="text-[10px] text-neutral-400 font-normal">click cell for breakdown</div>
                    </td>
                    {weeks.map((w) => {
                      const d = demandMap.get(`${plant}::${w}`);
                      const hasCells = cells.some((c) => c.plant === plant && c.week === w);
                      return (
                        <td key={w} className="px-3 py-2 text-right tabular-nums">
                          {d && hasCells ? (
                            <button
                              onClick={() => setActiveBreakdown({ plant, week: w })}
                              className="tabular-nums font-semibold text-blue-700 hover:underline cursor-pointer"
                            >
                              {fmtKg(d.carcassKg)}
                            </button>
                          ) : d ? (
                            <span className="font-semibold text-neutral-700">{fmtKg(d.carcassKg)}</span>
                          ) : (
                            <span className="text-neutral-200">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-neutral-700">{fmtKg(plantReqKg)}</td>
                  </tr>

                  {/* Required birds — derived from SKU weight-class breakdown, clickable */}
                  <tr className="border-t border-[var(--border-subtle)] bg-neutral-50/30">
                    <td className="px-3 py-2 text-neutral-500 sticky left-0 bg-neutral-50/30 z-10 whitespace-nowrap text-xs">
                      Required birds
                      <span className="ml-1 text-neutral-300 font-normal">(size-adjusted)</span>
                    </td>
                    {weeks.map((w) => {
                      const birds = requiredBirdsMap.get(`${plant}::${w}`);
                      const hasCells = cells.some((c) => c.plant === plant && c.week === w);
                      return (
                        <td key={w} className="px-3 py-2 text-right tabular-nums text-xs">
                          {birds && hasCells ? (
                            <button
                              onClick={() => setActiveBreakdown({ plant, week: w })}
                              className="tabular-nums font-semibold text-brand-green-dark hover:underline cursor-pointer"
                            >
                              {fmtNum(Math.round(birds))}
                            </button>
                          ) : birds ? (
                            <span className="text-neutral-600">{fmtNum(Math.round(birds))}</span>
                          ) : (
                            <span className="text-neutral-200">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-600 text-xs font-semibold">
                      {fmtNum(Math.round(weeks.reduce((s, w) => s + (requiredBirdsMap.get(`${plant}::${w}`) ?? 0), 0)))}
                    </td>
                  </tr>

                  {/* Available from pipeline */}
                  <tr className="border-t border-[var(--border-subtle)] bg-blue-50/30">
                    <td className="px-3 py-2 text-blue-700 font-medium sticky left-0 bg-blue-50/30 z-10 whitespace-nowrap">
                      Pipeline supply (KG)
                    </td>
                    {weeks.map((w) => {
                      const s = supplyMap.get(`${plant}::${w}`);
                      return (
                        <td key={w} className="px-3 py-2 text-right tabular-nums text-blue-700 font-semibold">
                          {s ? fmtKg(s.carcassKg) : <span className="text-neutral-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-blue-700">{fmtKg(plantAvailKg)}</td>
                  </tr>

                  {/* Available birds from pipeline — size-adjusted, clickable */}
                  <tr className="border-t border-[var(--border-subtle)] bg-neutral-50/40">
                    <td className="px-3 py-2 text-neutral-400 sticky left-0 bg-neutral-50/40 z-10 whitespace-nowrap text-xs">
                      Pipeline birds
                      <span className="ml-1 text-neutral-300 font-normal">(size-adjusted)</span>
                      <div className="text-[10px] text-neutral-300 font-normal">click cell for breakdown</div>
                    </td>
                    {weeks.map((w) => {
                      const birds = pipelineBirdsMap.get(`${plant}::${w}`);
                      return (
                        <td key={w} className="px-3 py-2 text-right tabular-nums text-xs">
                          {birds ? (
                            <button
                              onClick={() => setActivePipelineBreakdown({ plant, week: w })}
                              className="tabular-nums font-semibold text-blue-600 hover:underline cursor-pointer"
                            >
                              {fmtNum(Math.round(birds))}
                            </button>
                          ) : (
                            <span className="text-neutral-200">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500 text-xs font-semibold">
                      {fmtNum(Math.round(weeks.reduce((s, w) => s + (pipelineBirdsMap.get(`${plant}::${w}`) ?? 0), 0)))}
                    </td>
                  </tr>

                  {/* Gap KG */}
                  <tr className="border-t border-[var(--border-subtle)] bg-white">
                    <td className="px-3 py-2 text-neutral-400 sticky left-0 bg-white z-10 whitespace-nowrap">
                      Gap (KG)
                    </td>
                    {weeks.map((w) => {
                      const d = demandMap.get(`${plant}::${w}`);
                      const s = supplyMap.get(`${plant}::${w}`);
                      if (!d) return <td key={w} className="px-3 py-2 text-right text-neutral-200">—</td>;
                      const gap = (s?.carcassKg ?? 0) - d.carcassKg;
                      return (
                        <td key={w} className={`px-3 py-2 text-right tabular-nums font-semibold ${gap >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {(gap >= 0 ? "+" : "") + fmtKg(gap)}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2 text-right tabular-nums font-bold ${plantAvailKg >= plantReqKg ? "text-green-700" : "text-red-700"}`}>
                      {(plantAvailKg >= plantReqKg ? "+" : "") + fmtKg(plantAvailKg - plantReqKg)}
                    </td>
                  </tr>

                  {/* Coverage % */}
                  <tr className="border-t border-neutral-100 bg-neutral-50/50">
                    <td className="px-3 py-2 text-neutral-400 sticky left-0 bg-neutral-50/50 z-10 whitespace-nowrap">
                      Coverage
                    </td>
                    {weeks.map((w) => {
                      const d = demandMap.get(`${plant}::${w}`);
                      const s = supplyMap.get(`${plant}::${w}`);
                      const pct = d && d.carcassKg > 0 ? ((s?.carcassKg ?? 0) / d.carcassKg) * 100 : null;
                      return (
                        <td key={w} className="px-3 py-2 text-center">
                          <CoverageBadge pct={pct} />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">
                      <CoverageBadge pct={plantCovPct} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Demand breakdown popup */}
      {activeBreakdown && (
        <BroilerBreakdownPopover
          plant={activeBreakdown.plant}
          week={activeBreakdown.week}
          isoWeekLbl={wkLabel(activeBreakdown.week)}
          cells={cells}
          bomRecords={bomRecords}
          params={params}
          onClose={() => setActiveBreakdown(null)}
        />
      )}

      {/* Pipeline birds by size popup */}
      {activePipelineBreakdown && (() => {
        const s = supplyMap.get(`${activePipelineBreakdown.plant}::${activePipelineBreakdown.week}`);
        return s ? (
          <PipelineBirdsPopover
            plant={activePipelineBreakdown.plant}
            week={activePipelineBreakdown.week}
            isoWeekLbl={wkLabel(activePipelineBreakdown.week)}
            carcassKg={s.carcassKg}
            params={params}
            onClose={() => setActivePipelineBreakdown(null)}
          />
        ) : null;
      })()}
    </div>
  );
}

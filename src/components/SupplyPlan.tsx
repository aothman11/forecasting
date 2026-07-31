"use client";

import { usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import { computeSupplyRequirements, wcYieldFromCarcass, fppYieldFromCarcass, cutsYieldFromCarcass } from "@/lib/supplyRequirements";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/defaults";
import { weekLabel } from "@/lib/demandPlan";
import { SummaryCard } from "./shared/SummaryCard";

function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return Math.round(n).toString();
}

function GapPill({ gapKg, requiredKg }: { gapKg: number; requiredKg: number }) {
  if (requiredKg === 0) return <span className="text-neutral-300 text-xs">—</span>;
  const pct = requiredKg > 0 ? (gapKg / requiredKg) * 100 : 0;
  const isDeficit = gapKg < -requiredKg * 0.02;
  const isTight = !isDeficit && gapKg < requiredKg * 0.05;
  const color = isDeficit
    ? "bg-red-100 text-red-700 border-red-200"
    : isTight
    ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-green-100 text-green-700 border-green-200";
  const sign = gapKg >= 0 ? "+" : "";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-semibold ${color}`}>
      {sign}{pct.toFixed(0)}%
    </span>
  );
}

function YieldInfo({ params }: { params: Parameters }) {
  const wc = (wcYieldFromCarcass(params) * 100).toFixed(1);
  const fpp = (fppYieldFromCarcass(params) * 100).toFixed(1);
  const cuts = (cutsYieldFromCarcass(params) * 100).toFixed(1);
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-brand-green-tint/40 px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-600">
      <span className="font-semibold text-brand-green-dark">Yield assumptions (from pipeline params):</span>
      <span>WC yield from carcass: <strong>{wc}%</strong></span>
      <span>FPP yield from carcass: <strong>{fpp}%</strong></span>
      <span>Cuts yield from carcass: <strong>{cuts}%</strong></span>
    </div>
  );
}

import type { Parameters } from "@/lib/types";

export function SupplyPlan() {
  const { result, params } = usePipeline();
  const demandProducts = usePlanStore((s) => s.demandProducts);
  const demandQty = usePlanStore((s) => s.demandQty);
  const weeks = Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1);
  const rows = computeSupplyRequirements(demandProducts, demandQty, params, result, weeks);

  const hasDemand = rows.some((r) => r.requiredCarcassKg > 0);

  const totalRequired = rows.reduce((s, r) => s + r.requiredCarcassKg, 0);
  const totalPlanned = rows.reduce((s, r) => s + r.plannedCarcassKg, 0);
  const deficitWeeks = rows.filter((r) => r.carcassGapKg < -r.requiredCarcassKg * 0.02 && r.requiredCarcassKg > 0).length;
  const surplusWeeks = rows.filter((r) => r.carcassGapKg > r.requiredCarcassKg * 0.05 && r.requiredCarcassKg > 0).length;
  const totalRequiredBirds = rows.reduce((s, r) => s + r.requiredHarvestableBirds, 0);
  const totalPlannedBirds = rows.reduce((s, r) => s + r.plannedHarvestableBirds, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Supply Requirements</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Required placements derived from the demand plan — reverse BOM from product demand to carcass to birds.
        </p>
      </div>

      {!hasDemand && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No demand quantities entered yet. Open <strong>Demand Plan</strong> and enter weekly demand to see supply requirements.
        </div>
      )}

      <YieldInfo params={params} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Required Carcass"
          value={`${fmtK(totalRequired)} kg`}
          accent="green"
          icon="⚖️"
        />
        <SummaryCard
          label="Planned Supply"
          value={`${fmtK(totalPlanned)} kg`}
          icon="🏭"
        />
        <SummaryCard
          label="Deficit Weeks"
          value={String(deficitWeeks)}
          accent={deficitWeeks > 0 ? "alert" : "neutral"}
          icon="⚠️"
        />
        <SummaryCard
          label="Surplus Weeks"
          value={String(surplusWeeks)}
          accent="neutral"
          icon="📈"
        />
      </div>

      {/* Bird count summary */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Required Harvestable Birds" value={Math.round(totalRequiredBirds).toLocaleString()} icon="🐔" />
        <SummaryCard label="Planned Harvestable Birds" value={Math.round(totalPlannedBirds).toLocaleString()} icon="🐔" />
      </div>

      {/* Week-by-week table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-brand-green-tint text-brand-green-dark text-[11px] uppercase tracking-wide">
                <th className="sticky left-0 bg-brand-green-tint px-3 py-2 text-left font-semibold">Week</th>
                <th className="px-3 py-2 text-right font-semibold">WC Demand</th>
                <th className="px-3 py-2 text-right font-semibold">FPP Demand</th>
                <th className="px-3 py-2 text-right font-semibold">Cuts Demand</th>
                <th className="px-3 py-2 text-center font-semibold">Binding</th>
                <th className="px-3 py-2 text-right font-semibold">Req. Carcass</th>
                <th className="px-3 py-2 text-right font-semibold">Plan. Carcass</th>
                <th className="px-3 py-2 text-center font-semibold">Gap</th>
                <th className="px-3 py-2 text-right font-semibold">Req. Birds</th>
                <th className="px-3 py-2 text-right font-semibold">Place in Wk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isDeficit = r.carcassGapKg < -r.requiredCarcassKg * 0.02 && r.requiredCarcassKg > 0;
                const isSurplus = r.carcassGapKg > r.requiredCarcassKg * 0.05 && r.requiredCarcassKg > 0;
                const rowBg = isDeficit ? "bg-red-50" : isSurplus ? "" : "";
                return (
                  <tr
                    key={r.week}
                    className={`border-t border-[var(--border-subtle)] ${i % 2 === 0 ? "bg-white" : "bg-neutral-50/50"} ${rowBg} hover:bg-brand-green-tint/30 transition-colors`}
                  >
                    <td className="sticky left-0 bg-inherit px-3 py-2 font-semibold text-brand-green-dark">{weekLabel(r.week, params.planStartDate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                      {r.wcDemandTons > 0 ? `${r.wcDemandTons.toFixed(1)} t` : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                      {r.fppDemandTons > 0 ? `${r.fppDemandTons.toFixed(1)} t` : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                      {r.cutsDemandTons > 0 ? `${r.cutsDemandTons.toFixed(1)} t` : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.bindingCategory ? (
                        <span className="text-[10px] font-semibold text-brand-green-dark bg-brand-green-tint px-1.5 py-0.5 rounded">
                          {PRODUCT_CATEGORY_LABELS[r.bindingCategory]}
                        </span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {r.requiredCarcassKg > 0 ? `${fmtK(r.requiredCarcassKg)} kg` : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                      {r.plannedCarcassKg > 0 ? `${fmtK(r.plannedCarcassKg)} kg` : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <GapPill gapKg={r.carcassGapKg} requiredKg={r.requiredCarcassKg} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                      {r.requiredHarvestableBirds > 0 ? fmtK(r.requiredHarvestableBirds) : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.placementWeek > 0 ? (
                        <span className="font-medium text-brand-green-dark">Wk {r.placementWeek}</span>
                      ) : (
                        <span className="text-neutral-400 text-[11px]">pre-plan</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block" />
          Deficit (&gt;2% below required)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200 inline-block" />
          Tight (within 5% of required)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-100 border border-green-200 inline-block" />
          Surplus (&gt;5% above required)
        </span>
        <span className="ml-auto italic">
          &ldquo;Place in Wk&rdquo; = harvest week minus {Math.ceil(params.cycleLengthDays / 7)}-week grow-out offset
        </span>
      </div>
    </div>
  );
}

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
  const harvestDeferrals = usePlanStore((s) => s.harvestDeferrals);
  const setHarvestDeferral = usePlanStore((s) => s.setHarvestDeferral);
  const clearHarvestDeferrals = usePlanStore((s) => s.clearHarvestDeferrals);
  const weeks = Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1);
  const rows = computeSupplyRequirements(demandProducts, demandQty, params, result, weeks);

  // Deferral overlay: birds deferred from week W arrive in week W+1
  const adjustedRows = rows.map((r, i) => {
    const outgoing = harvestDeferrals[r.week] ?? 0;
    const incoming = i > 0 ? (harvestDeferrals[rows[i - 1].week] ?? 0) : 0;
    const adjustedCarcassKg = r.plannedCarcassKg + (incoming - outgoing) * params.avgCarcassWeightKg;
    const adjustedGapKg = adjustedCarcassKg - r.requiredCarcassKg;
    return { ...r, outgoing, incoming, adjustedCarcassKg, adjustedGapKg };
  });

  const hasDeferrals = Object.keys(harvestDeferrals).length > 0;
  const totalDeferredBirds = Object.values(harvestDeferrals).reduce((s, v) => s + v, 0);
  const deferralWeekCount = Object.values(harvestDeferrals).filter((v) => v > 0).length;

  // Greedy auto-suggest: for each surplus week, defer birds to the adjacent deficit week
  const suggestDeferrals = () => {
    clearHarvestDeferrals();
    const adjustedSupply = rows.map((r) => r.plannedCarcassKg);
    for (let i = 0; i < rows.length - 1; i++) {
      const surplusKg = adjustedSupply[i] - rows[i].requiredCarcassKg;
      if (surplusKg <= 0) continue;
      const nextDeficitKg = rows[i + 1].requiredCarcassKg - adjustedSupply[i + 1];
      if (nextDeficitKg <= 0) continue;
      const deferKg = Math.min(surplusKg, nextDeficitKg);
      const deferBirds = Math.round(deferKg / params.avgCarcassWeightKg);
      if (deferBirds > 0) {
        setHarvestDeferral(rows[i].week, deferBirds);
        adjustedSupply[i] -= deferBirds * params.avgCarcassWeightKg;
        adjustedSupply[i + 1] += deferBirds * params.avgCarcassWeightKg;
      }
    }
  };

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

      {/* F-11: warn when early harvest weeks require placements before the plan start.
          placementWeek ≤ 0 means the grow-out cycle would have started before Week 1;
          those birds cannot come from this plan — the demand can only be met from an
          opening flock that was placed in the prior planning period. */}
      {(() => {
        const skipped = rows.filter((r) => r.placementWeek <= 0 && r.requiredCarcassKg > 0);
        if (skipped.length === 0) return null;
        return (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <span className="font-semibold">Opening-flock weeks ({skipped.length}):</span>{" "}
            demand for{" "}
            {skipped
              .map((r) => weekLabel(r.week, params.planStartDate))
              .join(", ")}{" "}
            requires chicks placed before the plan start (placement week{" "}
            {skipped.map((r) => r.placementWeek).join(", ")}). Supply for these weeks must come
            from an existing flock — they are not covered by this plan&apos;s placement schedule.
          </div>
        );
      })()}

      <YieldInfo params={params} />

      {/* Execution adjustment banner */}
      {hasDeferrals ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-amber-800">
            <span className="text-base">↪</span>
            <span className="font-semibold">Harvest Deferral active</span>
            <span className="text-amber-600">·</span>
            <span className="text-amber-700">
              {deferralWeekCount} {deferralWeekCount === 1 ? "week" : "weeks"} · {Math.round(totalDeferredBirds).toLocaleString()} birds shifted · simulation only, base plan unchanged
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={suggestDeferrals}
              className="text-xs font-medium px-2.5 py-1 rounded border border-amber-400 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              ↻ Re-suggest
            </button>
            <button
              onClick={() => clearHarvestDeferrals()}
              className="text-xs font-medium px-2.5 py-1 rounded border border-amber-400 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              Clear All
            </button>
          </div>
        </div>
      ) : deficitWeeks > 0 && hasDemand ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-amber-700">
            <span className="text-base">↪</span>
            <span>
              <strong>{deficitWeeks} deficit {deficitWeeks === 1 ? "week" : "weeks"}</strong> detected — use Harvest Deferral to shift surplus birds from one week to cover the next.
            </span>
          </div>
          <button
            onClick={suggestDeferrals}
            className="text-xs font-semibold px-3 py-1.5 rounded border border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors whitespace-nowrap"
          >
            ✦ Suggest Deferrals
          </button>
        </div>
      ) : null}

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
                <th className="px-3 py-2 text-center font-semibold border-l border-amber-200 bg-amber-50/60 text-amber-700">Defer → (birds)</th>
                <th className="px-3 py-2 text-right font-semibold bg-amber-50/60 text-amber-700">Adj. Carcass</th>
                <th className="px-3 py-2 text-center font-semibold bg-amber-50/60 text-amber-700">Adj. Gap</th>
                <th className="px-3 py-2 text-right font-semibold">Req. Birds</th>
                <th className="px-3 py-2 text-right font-semibold">Place in Wk</th>
              </tr>
            </thead>
            <tbody>
              {adjustedRows.map((r, i) => {
                const isDeficit = r.carcassGapKg < -r.requiredCarcassKg * 0.02 && r.requiredCarcassKg > 0;
                const rowBg = isDeficit ? "bg-red-50" : "";
                const isLastWeek = i === adjustedRows.length - 1;
                const hasOutgoing = r.outgoing > 0;
                const hasIncoming = r.incoming > 0;
                return (
                  <tr
                    key={r.week}
                    className={`border-t border-[var(--border-subtle)] ${i % 2 === 0 ? "bg-white" : "bg-neutral-50/50"} ${rowBg} hover:bg-brand-green-tint/30 transition-colors`}
                  >
                    <td className="sticky left-0 bg-inherit px-3 py-2 font-semibold text-brand-green-dark">{weekLabel(r.week, params.planStartDate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                      {r.wcDemandTons > 0 ? `${fmtK(r.wcDemandTons * 1000)} kg` : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                      {r.fppDemandTons > 0 ? `${fmtK(r.fppDemandTons * 1000)} kg` : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                      {r.cutsDemandTons > 0 ? `${fmtK(r.cutsDemandTons * 1000)} kg` : <span className="text-neutral-300">—</span>}
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
                    {/* Deferral input */}
                    <td className="px-2 py-1.5 text-center border-l border-amber-100 bg-amber-50/30">
                      {isLastWeek ? (
                        <span className="text-neutral-300 text-[11px]">—</span>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          {hasIncoming && (
                            <span className="text-[10px] text-amber-600 font-semibold" title={`+${Math.round(r.incoming).toLocaleString()} birds arriving from previous week`}>
                              +{fmtK(r.incoming)}↓
                            </span>
                          )}
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={r.outgoing === 0 ? "" : r.outgoing}
                            placeholder="0"
                            onChange={(e) => {
                              const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                              setHarvestDeferral(r.week, v);
                            }}
                            className={`w-20 text-right border rounded px-1.5 py-0.5 tabular-nums focus:outline-none text-[11px] transition-colors ${
                              hasOutgoing
                                ? "border-amber-400 bg-amber-50 text-amber-800 focus:border-amber-500"
                                : "border-[var(--border-subtle)] focus:border-amber-400"
                            }`}
                          />
                        </div>
                      )}
                    </td>
                    {/* Adjusted carcass */}
                    <td className="px-3 py-2 text-right tabular-nums bg-amber-50/30">
                      {r.requiredCarcassKg > 0 || r.adjustedCarcassKg > 0 ? (
                        <span className={`font-medium ${(hasOutgoing || hasIncoming) ? "text-amber-700" : "text-neutral-400"}`}>
                          {fmtK(Math.max(0, r.adjustedCarcassKg))} kg
                        </span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    {/* Adjusted gap */}
                    <td className="px-3 py-2 text-center bg-amber-50/30">
                      {(hasOutgoing || hasIncoming) ? (
                        <GapPill gapKg={r.adjustedGapKg} requiredKg={r.requiredCarcassKg} />
                      ) : (
                        <span className="text-neutral-300 text-[11px]">—</span>
                      )}
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
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-50 border border-amber-200 inline-block" />
          Deferral simulation (Adj. columns)
        </span>
        <span className="ml-auto italic">
          &ldquo;Place in Wk&rdquo; = harvest week minus {Math.ceil(params.cycleLengthDays / 7)}-week grow-out offset
        </span>
      </div>

      {/* Deferral note */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-neutral-50 px-4 py-2.5 text-[11px] text-neutral-500">
        <span className="font-semibold text-neutral-600">Harvest Deferral:</span> enter birds to shift from Week N to Week N+1 in the &ldquo;Defer →&rdquo; column. Affects <em>Adj. Carcass</em> and <em>Adj. Gap</em> as a simulation overlay — the base plan and pipeline are not modified.
      </div>
    </div>
  );
}

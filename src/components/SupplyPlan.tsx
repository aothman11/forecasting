"use client";

import { useState } from "react";
import { usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import { computeSupplyRequirements, wcYieldFromCarcass, fppYieldFromCarcass, cutsYieldFromCarcass } from "@/lib/supplyRequirements";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/defaults";
import { isFridayDate } from "@/lib/calculations";
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
  const placementDays = usePlanStore((s) => s.placementDays);
  const applyDemandDrivenPlacement = usePlanStore((s) => s.applyDemandDrivenPlacement);
  const setSelectedStep = usePlanStore((s) => s.setSelectedStep);
  const setSupplyOpen = usePlanStore((s) => s.setSupplyOpen);

  const [applied, setApplied] = useState(false);

  const weeks = Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1);
  const rows = computeSupplyRequirements(demandProducts, demandQty, params, result, weeks);

  const hasDemand = rows.some((r) => r.requiredCarcassKg > 0);

  const totalRequired = rows.reduce((s, r) => s + r.requiredCarcassKg, 0);
  const totalPlanned = rows.reduce((s, r) => s + r.plannedCarcassKg, 0);
  const deficitWeeks = rows.filter((r) => r.carcassGapKg < -r.requiredCarcassKg * 0.02 && r.requiredCarcassKg > 0).length;
  const surplusWeeks = rows.filter((r) => r.carcassGapKg > r.requiredCarcassKg * 0.05 && r.requiredCarcassKg > 0).length;
  const totalRequiredBirds = rows.reduce((s, r) => s + r.requiredHarvestableBirds, 0);
  const totalPlannedBirds = rows.reduce((s, r) => s + r.plannedHarvestableBirds, 0);

  // Build placement week preview rows for Module 4 panel
  const workDaysMap = new Map<number, number>();
  const currentHousesMap = new Map<number, number>();
  for (const day of placementDays) {
    const week = Math.floor(day.dayIndex / 7) + 1;
    const isFri = params.fridayOff && isFridayDate(day.date);
    if (!isFri) {
      workDaysMap.set(week, (workDaysMap.get(week) ?? 0) + 1);
      currentHousesMap.set(week, day.farmsPlacing);
    }
  }
  const chicksMap = new Map<number, number>();
  for (const row of rows) {
    if (row.placementWeek > 0 && row.requiredChicksPlaced > 0) {
      chicksMap.set(row.placementWeek, (chicksMap.get(row.placementWeek) ?? 0) + row.requiredChicksPlaced);
    }
  }
  const placementWeeks = Array.from(new Set([...chicksMap.keys()])).sort((a, b) => a - b);
  const placementPreview = placementWeeks.map((pw) => {
    const chicks = chicksMap.get(pw) ?? 0;
    const workDays = workDaysMap.get(pw) ?? params.workingDaysPerWeek;
    const currentHouses = currentHousesMap.get(pw) ?? 0;
    const requiredHouses = Math.ceil(chicks / workDays / params.chicksPerHouse);
    const delta = requiredHouses - currentHouses;
    return { week: pw, chicks, workDays, currentHouses, requiredHouses, delta };
  });

  const prePlanWeeks = rows.filter((r) => r.placementWeek <= 0 && r.requiredChicksPlaced > 0).length;
  const overCapacityWeeks = placementPreview.filter((p) => p.requiredHouses > params.houseCount).length;

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
                    <td className="sticky left-0 bg-inherit px-3 py-2 font-semibold text-brand-green-dark">W{r.week}</td>
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

      {/* Module 4 — Apply to Placement Plan */}
      {hasDemand && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-gradient-to-r from-brand-green-tint/60 to-white flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-sm text-brand-green-dark">Apply to Placement Plan</h2>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Writes required houses/day back into the placement calendar, derived from demand.
              </p>
            </div>
            {applied && (
              <span className="text-xs font-medium text-green-700 bg-green-100 border border-green-200 px-2.5 py-1 rounded-full">
                ✓ Applied
              </span>
            )}
          </div>

          <div className="p-4 space-y-3">
            {prePlanWeeks > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <strong>{prePlanWeeks} harvest week{prePlanWeeks > 1 ? "s" : ""}</strong> require placements before the plan horizon starts (placement week ≤ 0). These are excluded from the apply action — place them manually.
              </div>
            )}
            {overCapacityWeeks > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <strong>{overCapacityWeeks} placement week{overCapacityWeeks > 1 ? "s" : ""}</strong> require more houses/day than your house count ({params.houseCount.toLocaleString()} houses). Consider raising the house count in Assumptions or reducing demand.
              </div>
            )}

            {placementPreview.length === 0 ? (
              <p className="text-xs text-neutral-400 italic">No actionable placement weeks — enter demand quantities first.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 text-neutral-500 text-[11px] uppercase tracking-wide border-b border-[var(--border-subtle)]">
                      <th className="px-3 py-2 text-left font-semibold">Placement Wk</th>
                      <th className="px-3 py-2 text-right font-semibold">Chicks Required</th>
                      <th className="px-3 py-2 text-right font-semibold">Work Days</th>
                      <th className="px-3 py-2 text-right font-semibold">Current Houses/Day</th>
                      <th className="px-3 py-2 text-right font-semibold">Required Houses/Day</th>
                      <th className="px-3 py-2 text-center font-semibold">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {placementPreview.map((p, i) => {
                      const isOver = p.requiredHouses > params.houseCount;
                      return (
                        <tr
                          key={p.week}
                          className={`border-t border-[var(--border-subtle)] ${i % 2 === 0 ? "bg-white" : "bg-neutral-50/50"} ${isOver ? "bg-red-50" : ""}`}
                        >
                          <td className="px-3 py-2 font-semibold text-brand-green-dark">Wk {p.week}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-neutral-700">{fmtK(p.chicks)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-neutral-700">{p.workDays}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-neutral-600">{p.currentHouses}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-semibold ${isOver ? "text-red-700" : "text-brand-green-dark"}`}>
                            {p.requiredHouses}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {p.delta === 0 ? (
                              <span className="text-neutral-400 text-[11px]">—</span>
                            ) : (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold border ${
                                p.delta > 0
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}>
                                {p.delta > 0 ? "+" : ""}{p.delta}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-neutral-400">
                Houses/day = ⌈chicks ÷ work-days ÷ {params.chicksPerHouse.toLocaleString()} chicks/house⌉.{" "}
                Fridays {params.fridayOff ? "excluded" : "included"}.
              </p>
              <div className="flex items-center gap-3">
                {applied && (
                  <button
                    onClick={() => { setSupplyOpen(false); setSelectedStep(1); }}
                    className="text-xs font-medium text-brand-green-dark underline underline-offset-2 hover:no-underline"
                  >
                    Go to Placement Plan →
                  </button>
                )}
                <button
                  disabled={placementPreview.length === 0}
                  onClick={() => {
                    applyDemandDrivenPlacement(rows);
                    setApplied(true);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-green hover:bg-brand-green-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {applied ? "Re-apply to Placement Plan" : "Apply to Placement Plan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

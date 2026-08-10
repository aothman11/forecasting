"use client";

import { useState } from "react";
import { usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import { computeSupplyRequirements } from "@/lib/supplyRequirements";
import { isFridayDate } from "@/lib/calculations";
import { weekLabel } from "@/lib/demandPlan";

function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return Math.round(n).toString();
}

export function DemandDrivenPlacement() {
  const { result, params } = usePipeline();
  const demandProducts = usePlanStore((s) => s.demandProducts);
  const demandQty = usePlanStore((s) => s.demandQty);
  const placementDays = usePlanStore((s) => s.placementDays);
  const applyDemandDrivenPlacement = usePlanStore((s) => s.applyDemandDrivenPlacement);
  const setSelectedStep = usePlanStore((s) => s.setSelectedStep);
  const setDdpOpen = usePlanStore((s) => s.setDdpOpen);

  const [applied, setApplied] = useState(false);

  const weeks = Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1);
  const rows = computeSupplyRequirements(demandProducts, demandQty, params, result, weeks);
  const hasDemand = rows.some((r) => r.requiredChicksPlaced > 0);

  // Count working days and current houses/day per week from existing calendar
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

  // Aggregate chicks required per placement week
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

  const totalRequiredChicks = rows.reduce((s, r) => s + r.requiredChicksPlaced, 0);
  const totalCurrentChicks = placementDays.reduce((s, d) => s + d.farmsPlacing * d.chicksPerHouse, 0);
  const deltaChicks = totalRequiredChicks - totalCurrentChicks;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold section-title">Demand-Driven Placement</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Translates demand-derived chick requirements into a day-by-day placement calendar — closing the COP loop.
        </p>
      </div>

      {!hasDemand && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No demand quantities entered yet. Open <strong>Demand Plan</strong> first, then <strong>Supply Requirements</strong> to confirm chick requirements, then return here to apply.
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-2.5 shadow-sm">
          <div className="text-[11px] text-neutral-500 mb-0.5">Required Chicks</div>
          <div className="text-lg font-bold text-brand-green-dark">{fmtK(totalRequiredChicks)}</div>
          <div className="text-[11px] text-neutral-400">from demand plan</div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-2.5 shadow-sm">
          <div className="text-[11px] text-neutral-500 mb-0.5">Current Plan Chicks</div>
          <div className="text-lg font-bold text-neutral-700">{fmtK(totalCurrentChicks)}</div>
          <div className="text-[11px] text-neutral-400">in placement calendar</div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-2.5 shadow-sm">
          <div className="text-[11px] text-neutral-500 mb-0.5">Net Delta</div>
          <div className={`text-lg font-bold ${deltaChicks > 0 ? "text-blue-600" : deltaChicks < 0 ? "text-amber-600" : "text-green-600"}`}>
            {deltaChicks > 0 ? "+" : ""}{fmtK(deltaChicks)}
          </div>
          <div className="text-[11px] text-neutral-400">chicks to add/remove</div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-2.5 shadow-sm">
          <div className="text-[11px] text-neutral-500 mb-0.5">Actionable Weeks</div>
          <div className="text-lg font-bold text-neutral-700">{placementPreview.length}</div>
          <div className="text-[11px] text-neutral-400">{prePlanWeeks > 0 ? `+${prePlanWeeks} pre-plan` : "all within horizon"}</div>
        </div>
      </div>

      {/* Warnings */}
      {prePlanWeeks > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{prePlanWeeks} harvest week{prePlanWeeks > 1 ? "s" : ""}</strong> require placements before the plan horizon starts (placement week ≤ 0). These are excluded from the apply action — place them manually in the Placement Plan.
        </div>
      )}
      {overCapacityWeeks > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>{overCapacityWeeks} placement week{overCapacityWeeks > 1 ? "s" : ""}</strong> require more houses/day than your house count ({params.houseCount.toLocaleString()}). Raise the house count in Assumptions or reduce demand.
        </div>
      )}

      {/* Preview table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-gradient-to-r from-brand-green-tint/60 to-white flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm text-brand-green-dark">Placement Week Preview</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              What the calendar will look like after applying — current vs required houses/day per week.
            </p>
          </div>
          {applied && (
            <span className="text-xs font-medium text-green-700 bg-green-100 border border-green-200 px-2.5 py-1 rounded-full">
              ✓ Applied to calendar
            </span>
          )}
        </div>

        <div className="p-4 space-y-3">
          {placementPreview.length === 0 ? (
            <p className="text-sm text-neutral-400 italic py-4 text-center">
              No actionable placement weeks — enter demand quantities in the Demand Plan first.
            </p>
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
                        className={`border-t border-[var(--border-subtle)] ${isOver ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-neutral-50/50"} hover:bg-brand-green-tint/20 transition-colors`}
                      >
                        <td className="px-3 py-2 font-semibold text-brand-green-dark">{weekLabel(p.week, params.planStartDate)}</td>
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

          <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
            <p className="text-[11px] text-neutral-400">
              Houses/day = ⌈chicks ÷ work-days ÷ {params.chicksPerHouse.toLocaleString()} chicks/house⌉.
              Fridays {params.fridayOff ? "excluded" : "included"}.
            </p>
            <div className="flex items-center gap-3">
              {applied && (
                <button
                  onClick={() => { setDdpOpen(false); setSelectedStep(1); }}
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

      {/* How it works */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-neutral-50 px-4 py-3 text-xs text-neutral-500 space-y-1">
        <div className="font-semibold text-neutral-600 mb-1">How it works</div>
        <div>1. Demand Plan → Supply Requirements → required chicks placed per harvest week</div>
        <div>2. Harvest week shifted back {Math.ceil(params.cycleLengthDays / 7)} weeks (grow-out offset) → placement week</div>
        <div>3. Required chicks ÷ working days ÷ {params.chicksPerHouse.toLocaleString()} chicks/house = houses/day</div>
        <div>4. Each placement day in that week is updated with the new houses/day value</div>
      </div>
    </div>
  );
}

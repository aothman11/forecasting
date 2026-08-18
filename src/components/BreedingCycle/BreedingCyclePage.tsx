"use client";
/**
 * BreedingCyclePage — top-level shell for the Breeding Cycle planning module.
 *
 * Step-by-step sub-navigation:
 *   Overview        → SVG pyramid flow + gap summary cards
 *   Demand Chain    → Backward biological chain (BiologicalChainPage embedded)
 *   PS Supply       → PS cohort production (Cobb + Ross) vs broiler DOC demand
 *   Schedule        → Procurement actions: Ross POs, GP orders, transfers, depops
 */

import React, { useMemo } from "react";
import { usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import type { BreedingCycleView } from "@/lib/breedingCycleTypes";
import { computeBreedingCycle } from "@/lib/breedingCycleEngine";
import { PyramidOverview } from "./views/PyramidOverview";
import { DemandChainView } from "./views/DemandChainView";
import { PsSupplyView } from "./views/PsSupplyView";
import { ScheduleView } from "./views/ScheduleView";
import { ScenarioView } from "./views/ScenarioView";

// ─── Sub-nav tabs ────────────────────────────────────────────────────────────

const VIEWS: { key: BreedingCycleView; label: string; icon: string; desc: string }[] = [
  { key: "overview",      label: "Pyramid Overview", icon: "🔺", desc: "Full supply chain flow + gap status" },
  { key: "demand-chain",  label: "Demand Chain",     icon: "🔗", desc: "Backward chain from catching plan" },
  { key: "ps-supply",     label: "PS Supply",        icon: "🐔", desc: "PS cohort production vs demand" },
  { key: "schedule",      label: "Schedule",         icon: "📅", desc: "Ross POs · transfers · depops" },
  { key: "scenarios",     label: "Scenarios",        icon: "⚖️",  desc: "Backward-chain what-if comparison" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function BreedingCyclePage() {
  const view            = usePlanStore((s) => s.breedingCycleView);
  const setView         = usePlanStore((s) => s.setBrCycleView);
  const breedingParams  = usePlanStore((s) => s.breedingParams);
  const bioChainGpFlocks = usePlanStore((s) => s.bioChainGpFlocks);
  const bioChainAssumptions = usePlanStore((s) => s.bioChainAssumptions);
  const rossPsOrders    = usePlanStore((s) => s.rossPsOrders);
  const bpOverrides     = usePlanStore((s) => s.bpOverrides);

  // Get pipeline result (provides weekly harvest birds = DOC demand signal)
  const { result } = usePipeline();

  // Build catching plan: week → harvestable birds (same as BiologicalChainPage)
  const catchingPlan = useMemo(() => {
    const map = new Map<number, number>();
    for (const lb of result.liveBird) {
      if (lb.harvestableBirds > 0) {
        map.set(lb.week, Math.round(lb.harvestableBirds));
      }
    }
    return map;
  }, [result.liveBird]);

  // Derive plan start date from breedingParams (or bioChain assumptions)
  const planStartDate = breedingParams.planStartDate;
  const horizonWeeks  = Math.max(breedingParams.planHorizonWeeks, 52);

  // Run the full forward production engine
  const cycleResult = useMemo(() => {
    return computeBreedingCycle(
      breedingParams,
      bioChainGpFlocks,
      bioChainAssumptions,
      rossPsOrders,
      catchingPlan,
      planStartDate,
      horizonWeeks,
      new Date().toISOString().slice(0, 10),
    );
  }, [breedingParams, bioChainGpFlocks, bioChainAssumptions, rossPsOrders, catchingPlan, planStartDate, horizonWeeks]);

  // KPI pills for the header
  const overdueCount  = cycleResult.procurementActions.filter((a) => a.urgency === "overdue").length;
  const dueSoonCount  = cycleResult.procurementActions.filter((a) => a.urgency === "due-soon").length;

  return (
    <div className="flex flex-col gap-0 min-h-0">
      {/* ── Sub-nav ── */}
      <div className="bg-white border-b border-[var(--border-subtle)] px-6 py-0 flex items-center gap-0">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            title={v.desc}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${view === v.key
                ? "border-brand-green text-brand-green-dark"
                : "border-transparent text-neutral-500 hover:text-neutral-800 hover:border-neutral-300"}
            `}
          >
            <span>{v.icon}</span>
            <span>{v.label}</span>
            {v.key === "schedule" && (overdueCount > 0 || dueSoonCount > 0) && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: overdueCount > 0 ? "rgba(210,73,24,0.15)" : "rgba(180,83,9,0.15)",
                  color: overdueCount > 0 ? "#d24918" : "#92400e",
                }}
              >
                {overdueCount > 0 ? `${overdueCount} overdue` : `${dueSoonCount} due soon`}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Active view ── */}
      <div className="flex-1 min-h-0">
        {view === "overview"     && <PyramidOverview     cycleResult={cycleResult} horizonWeeks={horizonWeeks} planStartDate={planStartDate} breedingParams={breedingParams} bioChainAssumptions={bioChainAssumptions} bioChainGpFlocks={bioChainGpFlocks} />}
        {view === "demand-chain" && <DemandChainView />}
        {view === "ps-supply"    && <PsSupplyView        cycleResult={cycleResult} horizonWeeks={horizonWeeks} planStartDate={planStartDate} />}
        {view === "schedule"     && <ScheduleView        actions={cycleResult.procurementActions} today={new Date().toISOString().slice(0, 10)} />}
        {view === "scenarios"    && <ScenarioView />}
      </div>
    </div>
  );
}

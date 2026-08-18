"use client";
/**
 * BiologicalChainPage — top-level component for the Biological Chain module.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┬──────────────────────┐
 *   │  GP Flock Fleet Register                │  AssumptionsPanel    │
 *   │  Supply vs Demand Gap table             │  (right sidebar,     │
 *   │  ChainFlowDiagram (full width)          │   72 wide)           │
 *   │  8 collapsible StageTable rows          │                      │
 *   └─────────────────────────────────────────┴──────────────────────┘
 *
 * Core principle:
 *   • Backward chain = "what you NEED" (driven by catching plan).
 *   • Forward flock calculation = "what your actual flocks WILL PRODUCE".
 *   • Gap table = supply − demand per week.
 */

import React, { useMemo } from "react";
import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";
import { computeBioChain, computeGpFlockProduction, isoForWeek } from "@/lib/biologicalChain/calculations";
import type { CatchingPlanWeek, GpEggGapRow } from "@/lib/biologicalChain/types";
import type { ColDef } from "./StageTable";

import { ChainFlowDiagram } from "./ChainFlowDiagram";
import { AssumptionsPanel } from "./AssumptionsPanel";
import { StageTable, fmtN, fmtDate } from "./StageTable";
import { GpFlockRegister } from "./GpFlockRegister";

// ─── Formatters ────────────────────────────────────────────────────────────────

const N = new Intl.NumberFormat("en-US");
const fmtGap = (v: unknown) => {
  if (typeof v !== "number") return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${N.format(Math.round(v))}`;
};

// ─── Column definitions for each stage ────────────────────────────────────────

const catchingCols: ColDef[] = [
  { key: "week",        header: "Week" },
  { key: "weekStart",   header: "Week Start",    fmt: fmtDate },
  { key: "birds",       header: "Birds",          right: true, highlight: true, fmt: fmtN },
  { key: "liveWeightKg",header: "Live Wt (kg)",   right: true, fmt: fmtN },
];

const awpBroilerCols: ColDef[] = [
  { key: "week",         header: "DOC Week" },
  { key: "weekStart",    header: "Week Start",    fmt: fmtDate },
  { key: "docPlaced",    header: "DOC Placed",    right: true, highlight: true, fmt: fmtN },
  { key: "catchingWeek", header: "→ Catching Wk", right: true },
];

const awpHatcheryCols: ColDef[] = [
  { key: "week",      header: "Week" },
  { key: "weekStart", header: "Week Start",  fmt: fmtDate },
  { key: "eggsSet",   header: "Eggs Set",    right: true, highlight: true, fmt: fmtN },
  { key: "docOutput", header: "DOC Out",     right: true, fmt: fmtN },
];

const awpPsLayingCols: ColDef[] = [
  { key: "week",         header: "Week" },
  { key: "weekStart",    header: "Week Start",     fmt: fmtDate },
  { key: "activeHens",   header: "Active Hens",    right: true, highlight: true, fmt: fmtN },
  { key: "eggsRequired", header: "Eggs Required",  right: true, fmt: fmtN },
];

const awpPsRearingCols: ColDef[] = [
  { key: "week",            header: "Rearing Week" },
  { key: "weekStart",       header: "Week Start",       fmt: fmtDate },
  { key: "docPlaced",       header: "DOC Placed",       right: true, highlight: true, fmt: fmtN },
  { key: "pulletsToLaying", header: "→ Pullets to Lay",  right: true, fmt: fmtN },
];

const gpHatcheryCols: ColDef[] = [
  { key: "week",             header: "Hatch Week" },
  { key: "weekStart",        header: "Week Start",        fmt: fmtDate },
  { key: "gpEggsSet",        header: "GP Eggs Set",       right: true, highlight: true, fmt: fmtN },
  { key: "psDOCForAwp",      header: "PS DOC → AWP",      right: true, fmt: fmtN },
  { key: "gpSelfReplaceDOC", header: "Self-Replace DOC",  right: true, fmt: fmtN },
];

const gpLayingCols: ColDef[] = [
  { key: "week",         header: "Week" },
  { key: "weekStart",    header: "Week Start",    fmt: fmtDate },
  { key: "activeHens",   header: "Active Hens (Demand)",  right: true, highlight: true, fmt: fmtN },
  { key: "eggsProduced", header: "GP Eggs (Demand)",       right: true, fmt: fmtN },
];

const gpRearingCols: ColDef[] = [
  { key: "week",            header: "Rearing Week" },
  { key: "weekStart",       header: "Week Start",         fmt: fmtDate },
  { key: "docPlaced",       header: "GP DOC Placed",      right: true, highlight: true, fmt: fmtN },
  { key: "pulletsToLaying", header: "→ Pullets to Lay",   right: true, fmt: fmtN },
];

// ─── Gap table column definitions ─────────────────────────────────────────────

const gapCols: ColDef[] = [
  { key: "week",            header: "Week" },
  { key: "weekStart",       header: "Week Start",         fmt: fmtDate },
  { key: "activeFlockCount",header: "Active Flocks",      right: true, fmt: fmtN },
  { key: "gpEggsSupply",    header: "GP Eggs Supply ▲",   right: true, highlight: true, fmt: fmtN },
  { key: "gpEggsDemand",    header: "GP Eggs Demand ▼",   right: true, fmt: fmtN },
  { key: "gap",             header: "Gap (Supply−Demand)", right: true, fmt: fmtGap },
];

// ─── Main component ────────────────────────────────────────────────────────────

export function BiologicalChainPage() {
  const { result, params } = usePipeline();
  const bioChainAssumptions   = usePlanStore((s) => s.bioChainAssumptions);
  const setBioChainAssumptions = usePlanStore((s) => s.setBioChainAssumptions);
  const bioChainGpFlocks       = usePlanStore((s) => s.bioChainGpFlocks);
  const addBioChainGpFlock     = usePlanStore((s) => s.addBioChainGpFlock);
  const updateBioChainGpFlock  = usePlanStore((s) => s.updateBioChainGpFlock);
  const removeBioChainGpFlock  = usePlanStore((s) => s.removeBioChainGpFlock);
  const resetBioChainGpFlocks  = usePlanStore((s) => s.resetBioChainGpFlocks);

  // ── Convert LiveBirdWeek[] → CatchingPlanWeek[] ───────────────────────────
  const catchingPlan: CatchingPlanWeek[] = useMemo(
    () =>
      result.liveBird.map((lb) => ({
        week:         lb.week,
        weekStart:    lb.harvestDateStart,
        birds:        Math.round(lb.harvestableBirds),
        liveWeightKg: Math.round(lb.totalLiveWeightKg ?? 0),
        byPlant:      {},
      })),
    [result.liveBird],
  );

  // ── Anchor week for date calculations ─────────────────────────────────────
  // Use week 1 and planStartDate as the anchor.
  const anchorWeek = 1;
  const anchorDate = params.planStartDate;

  // ── Run the full backward chain (demand) ──────────────────────────────────
  const chain = useMemo(
    () => computeBioChain(catchingPlan, bioChainAssumptions),
    [catchingPlan, bioChainAssumptions],
  );

  // ── Compute the week range that covers flocks + catching plan ─────────────
  const weekRange: number[] = useMemo(() => {
    const a = bioChainAssumptions;
    const layEndAge = a.gpLayEndAgeWeeks;

    // Earliest week any flock might be placed
    const minFlockWeek = bioChainGpFlocks.length > 0
      ? Math.min(...bioChainGpFlocks.map((f) => f.placementWeek))
      : 1;
    // Latest week any flock is still laying
    const maxFlockWeek = bioChainGpFlocks.length > 0
      ? Math.max(...bioChainGpFlocks.map((f) => f.placementWeek + layEndAge))
      : 1;

    const planStart = catchingPlan.length > 0 ? catchingPlan[0].week : 1;
    const planEnd   = catchingPlan.length > 0 ? catchingPlan[catchingPlan.length - 1].week : 1;

    const from = Math.min(minFlockWeek, planStart);
    const to   = Math.max(maxFlockWeek, planEnd);

    const range: number[] = [];
    for (let w = from; w <= to; w++) range.push(w);
    return range;
  }, [bioChainGpFlocks, bioChainAssumptions, catchingPlan]);

  // ── Forward flock supply calculation ──────────────────────────────────────
  const { supplyByWeek, flockWeekRows } = useMemo(
    () =>
      computeGpFlockProduction(
        bioChainGpFlocks,
        bioChainAssumptions,
        weekRange,
        anchorWeek,
        anchorDate,
      ),
    [bioChainGpFlocks, bioChainAssumptions, weekRange, anchorDate],
  );

  // ── Build GP Egg Gap rows (supply vs demand) ───────────────────────────────
  const gapRows: GpEggGapRow[] = useMemo(() => {
    // Build a map of demand from the backward chain (gpLaying stage)
    const demandByWeek = new Map<number, number>();
    for (const row of chain.gpLaying) {
      demandByWeek.set(row.week, row.eggsProduced);
    }

    // Weeks where either supply or demand is non-zero
    const relevantWeeks = new Set([
      ...supplyByWeek.keys(),
      ...demandByWeek.keys(),
    ]);

    return [...relevantWeeks]
      .sort((a, b) => a - b)
      .map((w) => {
        const supply  = supplyByWeek.get(w) ?? 0;
        const demand  = demandByWeek.get(w) ?? 0;
        const gap     = supply - demand;

        // Count active laying flocks this week
        const a = bioChainAssumptions;
        const activeCount = bioChainGpFlocks.filter((f) => {
          const age = w - f.placementWeek;
          return age >= a.gpRearingWeeks && age < a.gpLayEndAgeWeeks;
        }).length;

        return {
          week:             w,
          weekStart:        isoForWeek(w, anchorWeek, anchorDate),
          activeFlockCount: activeCount,
          gpEggsSupply:     Math.round(supply),
          gpEggsDemand:     Math.round(demand),
          gap:              Math.round(gap),
        };
      });
  }, [supplyByWeek, chain.gpLaying, bioChainGpFlocks, bioChainAssumptions, anchorDate]);

  // ── Gap table with colored gap column ─────────────────────────────────────
  // We create a custom gap table that color-codes the gap column.
  // We reuse gapCols but render the gap col manually below.

  // ── Fleet summary stats ────────────────────────────────────────────────────
  const totalGpEggsSupply  = gapRows.reduce((s, r) => s + r.gpEggsSupply, 0);
  const totalGpEggsDemand  = gapRows.reduce((s, r) => s + r.gpEggsDemand, 0);
  const shortageWeeks      = gapRows.filter((r) => r.gpEggsDemand > 0 && r.gap < 0).length;
  const surplusWeeks       = gapRows.filter((r) => r.gpEggsDemand > 0 && r.gap > 0).length;

  return (
    <div className="flex h-full min-h-0">
      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="p-6 space-y-6">


          {/* ── Flow diagram ── */}
          <section>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="text-sm font-semibold text-neutral-800">Supply Chain Flow</h2>
              <span className="text-xs text-neutral-400">Lead times update live from assumptions panel →</span>
            </div>
            <div className="bg-white border border-[var(--border-subtle)] rounded-xl p-4">
              <ChainFlowDiagram assumptions={bioChainAssumptions} />
            </div>
          </section>

          {/* ── Stage tables (backward chain detail) ── */}
          <section>
            <div className="mb-2">
              <h2 className="text-sm font-semibold text-neutral-800">Backward Chain — Stage Detail</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Demand-driven: what each stage MUST deliver to meet the catching plan.
                Negative weeks = actions needed before plan start date.
              </p>
            </div>

            <StageTable stageKey="catching"     title="Catching Plan (input)"              company="AWP" rows={chain.catchingPlan}  cols={catchingCols}     defaultOpen />
            <StageTable stageKey="awp-broiler"  title="AWP Broiler — DOC Placement"        company="AWP" rows={chain.awpBroiler}    cols={awpBroilerCols}   />
            <StageTable stageKey="awp-hatchery" title="AWP Hatchery — Eggs Set & DOC"      company="AWP" rows={chain.awpHatchery}   cols={awpHatcheryCols}  />
            <StageTable stageKey="awp-ps-lay"   title="AWP PS Laying — Active Hens"        company="AWP" rows={chain.awpPsLaying}   cols={awpPsLayingCols}  />
            <StageTable stageKey="awp-ps-rear"  title="AWP PS Rearing — DOC Placement"     company="AWP" rows={chain.awpPsRearing}  cols={awpPsRearingCols} />
            <StageTable stageKey="gp-hatchery"  title="GP Hatchery — PS DOC Production"    company="GP"  rows={chain.gpHatchery}    cols={gpHatcheryCols}   />
            <StageTable stageKey="gp-laying"    title="GP Laying — Hens & Eggs (Demand)"   company="GP"  rows={chain.gpLaying}      cols={gpLayingCols}     />
            <StageTable stageKey="gp-rearing"   title="GP Rearing — DOC Placement"         company="GP"  rows={chain.gpRearing}     cols={gpRearingCols}    />
          </section>
        </div>
      </div>

      {/* ── Assumptions panel ── */}
      <AssumptionsPanel
        assumptions={bioChainAssumptions}
        onChange={setBioChainAssumptions}
      />
    </div>
  );
}

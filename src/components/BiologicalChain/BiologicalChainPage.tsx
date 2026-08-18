"use client";
/**
 * BiologicalChainPage — top-level component for the Biological Chain module.
 *
 * Layout:
 *   ┌────────────────────────────────────┬──────────────────────┐
 *   │  ChainFlowDiagram (full width)     │  AssumptionsPanel    │
 *   ├────────────────────────────────────┤  (right sidebar,     │
 *   │  8 collapsible StageTable rows     │   72 wide)           │
 *   └────────────────────────────────────┴──────────────────────┘
 *
 * Data source:
 *   - Catching Plan: derived from usePipeline().result.liveBird
 *   - Assumptions: stored in Zustand (bioChainAssumptions)
 */

import React, { useMemo } from "react";
import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";
import { computeBioChain } from "@/lib/biologicalChain/calculations";
import type { CatchingPlanWeek } from "@/lib/biologicalChain/types";
import type { ColDef } from "./StageTable";

import { ChainFlowDiagram } from "./ChainFlowDiagram";
import { AssumptionsPanel } from "./AssumptionsPanel";
import { StageTable, fmtN, fmtDate } from "./StageTable";

// ─── Column definitions for each stage ────────────────────────────────────────
// ColDef is non-generic (key: string) — no variance issues when passing to StageTable.

const catchingCols: ColDef[] = [
  { key: "week",        header: "Week" },
  { key: "weekStart",   header: "Week Start",   fmt: fmtDate },
  { key: "birds",       header: "Birds",         right: true, highlight: true, fmt: fmtN },
  { key: "liveWeightKg",header: "Live Wt (kg)",  right: true, fmt: fmtN },
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
  { key: "weekStart",    header: "Week Start",    fmt: fmtDate },
  { key: "activeHens",   header: "Active Hens",   right: true, highlight: true, fmt: fmtN },
  { key: "eggsRequired", header: "Eggs Required",  right: true, fmt: fmtN },
];

const awpPsRearingCols: ColDef[] = [
  { key: "week",            header: "Rearing Week" },
  { key: "weekStart",       header: "Week Start",      fmt: fmtDate },
  { key: "docPlaced",       header: "DOC Placed",      right: true, highlight: true, fmt: fmtN },
  { key: "pulletsToLaying", header: "→ Pullets to Lay", right: true, fmt: fmtN },
];

const gpHatcheryCols: ColDef[] = [
  { key: "week",             header: "Hatch Week" },
  { key: "weekStart",        header: "Week Start",       fmt: fmtDate },
  { key: "gpEggsSet",        header: "GP Eggs Set",      right: true, highlight: true, fmt: fmtN },
  { key: "psDOCForAwp",      header: "PS DOC → AWP",     right: true, fmt: fmtN },
  { key: "gpSelfReplaceDOC", header: "Self-Replace DOC", right: true, fmt: fmtN },
];

const gpLayingCols: ColDef[] = [
  { key: "week",         header: "Week" },
  { key: "weekStart",    header: "Week Start",   fmt: fmtDate },
  { key: "activeHens",   header: "Active Hens",  right: true, highlight: true, fmt: fmtN },
  { key: "eggsProduced", header: "GP Eggs",       right: true, fmt: fmtN },
];

const gpRearingCols: ColDef[] = [
  { key: "week",            header: "Rearing Week" },
  { key: "weekStart",       header: "Week Start",        fmt: fmtDate },
  { key: "docPlaced",       header: "GP DOC Placed",     right: true, highlight: true, fmt: fmtN },
  { key: "pulletsToLaying", header: "→ Pullets to Lay",  right: true, fmt: fmtN },
];

// ─── Main component ────────────────────────────────────────────────────────────

export function BiologicalChainPage() {
  const { result, params } = usePipeline();
  const bioChainAssumptions = usePlanStore((s) => s.bioChainAssumptions);
  const setBioChainAssumptions = usePlanStore((s) => s.setBioChainAssumptions);

  // Convert LiveBirdWeek[] → CatchingPlanWeek[]
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

  // Run the full backward chain computation
  const chain = useMemo(
    () => computeBioChain(catchingPlan, bioChainAssumptions),
    [catchingPlan, bioChainAssumptions],
  );

  return (
    <div className="flex h-full min-h-0">
      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="p-6 space-y-6">

          {/* Flow diagram */}
          <section>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="text-sm font-semibold text-neutral-800">Supply Chain Flow</h2>
              <span className="text-xs text-neutral-400">Lead times update live from assumptions panel →</span>
            </div>
            <div className="bg-white border border-[var(--border-subtle)] rounded-xl p-4">
              <ChainFlowDiagram assumptions={bioChainAssumptions} />
            </div>
          </section>

          {/* Catching Plan (read-only) */}
          <section>
            <div className="mb-2">
              <h2 className="text-sm font-semibold text-neutral-800">Stage Tables</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                All weeks before Week 1 are historical (pre-plan). Negative weeks = actions needed before plan start date.
              </p>
            </div>

            <StageTable stageKey="catching"     title="Catching Plan (input)"            company="AWP" rows={chain.catchingPlan}  cols={catchingCols}     defaultOpen />
            <StageTable stageKey="awp-broiler"  title="AWP Broiler — DOC Placement"      company="AWP" rows={chain.awpBroiler}   cols={awpBroilerCols}   />
            <StageTable stageKey="awp-hatchery" title="AWP Hatchery — Eggs Set & DOC"    company="AWP" rows={chain.awpHatchery}  cols={awpHatcheryCols}  />
            <StageTable stageKey="awp-ps-lay"   title="AWP PS Laying — Active Hens"      company="AWP" rows={chain.awpPsLaying}  cols={awpPsLayingCols}  />
            <StageTable stageKey="awp-ps-rear"  title="AWP PS Rearing — DOC Placement"   company="AWP" rows={chain.awpPsRearing} cols={awpPsRearingCols} />
            <StageTable stageKey="gp-hatchery"  title="GP Hatchery — PS DOC Production"  company="GP"  rows={chain.gpHatchery}   cols={gpHatcheryCols}   />
            <StageTable stageKey="gp-laying"    title="GP Laying — Active Hens"          company="GP"  rows={chain.gpLaying}     cols={gpLayingCols}     />
            <StageTable stageKey="gp-rearing"   title="GP Rearing — DOC Placement"       company="GP"  rows={chain.gpRearing}    cols={gpRearingCols}    />
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

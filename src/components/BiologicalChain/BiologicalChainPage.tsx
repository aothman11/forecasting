"use client";
/**
 * BiologicalChainPage — top-level component for the Biological Chain module.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┬──────────────────────┐
 *   │  ChainFlowDiagram (full width)          │  AssumptionsPanel    │
 *   │  8 collapsible StageTable rows          │  (right sidebar,     │
 *   │    → GP Rearing, GP Laying, GP Hatchery │   72 wide)           │
 *   │      have inline editable cells         │                      │
 *   └─────────────────────────────────────────┴──────────────────────┘
 *
 * Core principle:
 *   • Backward chain = "what you NEED" (driven by catching plan).
 *   • Inline overrides let planners adjust individual week values;
 *     derived columns recompute from the override automatically.
 */

import React, { useMemo, useCallback } from "react";
import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";
import { computeBioChain } from "@/lib/biologicalChain/calculations";
import type {
  BioChainAssumptions,
  CatchingPlanWeek,
  AwpPsRearingWeek,
  AwpPsLayingWeek,
  AwpHatcheryWeek,
  GpHatcheryWeek,
  GpLayingWeek,
  GpRearingWeek,
} from "@/lib/biologicalChain/types";
import type { ColDef } from "./StageTable";

import { ChainFlowDiagram } from "./ChainFlowDiagram";
import { AssumptionsPanel } from "./AssumptionsPanel";
import { StageTable, fmtN, fmtDate } from "./StageTable";

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Week label — matches production/demand plan convention:
 *   positive week → "Wk 1", "Wk 2" …  (within planning horizon)
 *   zero / negative → "Pre 12" …        (weeks before plan start)
 */
const fmtWeek = (v: unknown) => {
  if (typeof v !== "number") return String(v ?? "");
  if (v > 0) return `Wk ${v}`;
  return `Pre ${Math.abs(v) || 0}`;
};

// ─── Column definitions for each stage ────────────────────────────────────────

const catchingCols: ColDef[] = [
  { key: "week",        header: "Week",           fmt: fmtWeek },
  { key: "weekStart",   header: "Week Of",        fmt: fmtDate },
  { key: "birds",       header: "Birds",          right: true, highlight: true, fmt: fmtN },
  { key: "liveWeightKg",header: "Live Wt (kg)",   right: true, fmt: fmtN },
];

const awpBroilerCols: ColDef[] = [
  { key: "week",         header: "DOC Week",       fmt: fmtWeek },
  { key: "weekStart",    header: "Week Of",        fmt: fmtDate },
  { key: "docPlaced",    header: "DOC Placed",     right: true, highlight: true, fmt: fmtN },
  { key: "catchingWeek", header: "→ Catching Wk",  right: true, fmt: fmtWeek },
];

const awpHatcheryCols: ColDef[] = [
  { key: "week",      header: "Week",         fmt: fmtWeek },
  { key: "weekStart", header: "Week Of",      fmt: fmtDate },
  { key: "eggsSet",   header: "Eggs Set",     right: true, highlight: true, editable: true, fmt: fmtN },
  { key: "docOutput", header: "DOC Out",      right: true, fmt: fmtN },
];

const awpPsLayingCols: ColDef[] = [
  { key: "week",         header: "Week",            fmt: fmtWeek },
  { key: "weekStart",    header: "Week Of",         fmt: fmtDate },
  { key: "activeHens",   header: "Active Hens",     right: true, highlight: true, editable: true, fmt: fmtN },
  { key: "eggsRequired", header: "Eggs Required",   right: true, fmt: fmtN },
];

const awpPsRearingCols: ColDef[] = [
  { key: "week",            header: "Rearing Week",     fmt: fmtWeek },
  { key: "weekStart",       header: "Week Of",          fmt: fmtDate },
  { key: "docPlaced",       header: "DOC Placed",       right: true, highlight: true, editable: true, fmt: fmtN },
  { key: "pulletsToLaying", header: "→ Pullets to Lay", right: true, fmt: fmtN },
];

const gpHatcheryCols: ColDef[] = [
  { key: "week",             header: "Hatch Week",        fmt: fmtWeek },
  { key: "weekStart",        header: "Week Of",           fmt: fmtDate },
  { key: "gpEggsSet",        header: "GP Eggs Set",       right: true, highlight: true, editable: true, fmt: fmtN },
  { key: "psDOCForAwp",      header: "PS DOC → AWP",      right: true, fmt: fmtN },
  { key: "gpSelfReplaceDOC", header: "Self-Replace DOC",  right: true, fmt: fmtN },
];

const gpLayingCols: ColDef[] = [
  { key: "week",         header: "Week",                  fmt: fmtWeek },
  { key: "weekStart",    header: "Week Of",               fmt: fmtDate },
  { key: "activeHens",   header: "Active Hens (Demand)",  right: true, highlight: true, editable: true, fmt: fmtN },
  { key: "eggsProduced", header: "GP Eggs (Demand)",       right: true, fmt: fmtN },
];

const gpRearingCols: ColDef[] = [
  { key: "week",            header: "Rearing Week",       fmt: fmtWeek },
  { key: "weekStart",       header: "Week Of",            fmt: fmtDate },
  { key: "docPlaced",       header: "GP DOC Placed",      right: true, highlight: true, editable: true, fmt: fmtN },
  { key: "pulletsToLaying", header: "→ Pullets to Lay",   right: true, fmt: fmtN },
];

// ─── Override derivation helpers ──────────────────────────────────────────────

/** Recompute derived columns for AWP Hatchery when eggsSet is overridden. */
function deriveAwpHatchery(
  row: AwpHatcheryWeek,
  field: string,
  value: number,
  a: BioChainAssumptions,
): Partial<AwpHatcheryWeek> {
  if (field === "eggsSet") {
    return { docOutput: Math.round(value * a.hatchabilityPs) };
  }
  return {};
}

/** Recompute derived columns for AWP PS Laying when activeHens is overridden. */
function deriveAwpPsLaying(
  row: AwpPsLayingWeek,
  field: string,
  value: number,
  a: BioChainAssumptions,
): Partial<AwpPsLayingWeek> {
  if (field === "activeHens") {
    return { eggsRequired: Math.round(value * a.henDayProduction * 7) };
  }
  return {};
}

/** Recompute derived columns for AWP PS Rearing when docPlaced is overridden. */
function deriveAwpPsRearing(
  row: AwpPsRearingWeek,
  field: string,
  value: number,
  a: BioChainAssumptions,
): Partial<AwpPsRearingWeek> {
  if (field === "docPlaced") {
    return { pulletsToLaying: Math.round(value * (1 - a.psRearingMortality)) };
  }
  return {};
}

/** Recompute derived columns for GP Hatchery when gpEggsSet is overridden. */
function deriveGpHatchery(
  row: GpHatcheryWeek,
  field: string,
  value: number,
  a: BioChainAssumptions,
): Partial<GpHatcheryWeek> {
  if (field === "gpEggsSet") {
    const totalHatched = value * a.hatchabilityGp;
    return {
      psDOCForAwp:      Math.round(totalHatched * (1 - a.gpSelfreplacementRatio)),
      gpSelfReplaceDOC: Math.round(totalHatched * a.gpSelfreplacementRatio),
    };
  }
  return {};
}

/** Recompute derived columns for GP Laying when activeHens is overridden. */
function deriveGpLaying(
  row: GpLayingWeek,
  field: string,
  value: number,
  a: BioChainAssumptions,
): Partial<GpLayingWeek> {
  if (field === "activeHens") {
    return { eggsProduced: Math.round(value * a.gpHenDayProduction * 7) };
  }
  return {};
}

/** Recompute derived columns for GP Rearing when docPlaced is overridden. */
function deriveGpRearing(
  row: GpRearingWeek,
  field: string,
  value: number,
  a: BioChainAssumptions,
): Partial<GpRearingWeek> {
  if (field === "docPlaced") {
    return { pulletsToLaying: Math.round(value * (1 - a.gpRearingMortality)) };
  }
  return {};
}

/**
 * Apply overrides to one stage's rows, recomputing derived columns.
 * Rows are matched by `weekStart` (ISO date) — the same key convention as
 * dailyPlannedQtyOverrides and production-plan week dates.
 */
function applyStageOverrides<T extends { weekStart: string }>(
  rows: T[],
  stageKey: string,
  allOverrides: Record<string, number>,
  deriver: (row: T, field: string, value: number, a: BioChainAssumptions) => Partial<T>,
  assumptions: BioChainAssumptions,
): T[] {
  // Build a map of weekDate → {field → value} for quick lookup
  const dateMap = new Map<string, Record<string, number>>();
  for (const [key, value] of Object.entries(allOverrides)) {
    const parts = key.split("::");
    if (parts[0] !== stageKey || parts.length < 3) continue;
    const weekDate = parts[1];          // ISO yyyy-mm-dd
    const field    = parts.slice(2).join("::"); // field name (no "::" in field names but defensive)
    if (!dateMap.has(weekDate)) dateMap.set(weekDate, {});
    dateMap.get(weekDate)![field] = value;
  }
  if (dateMap.size === 0) return rows;

  return rows.map((row) => {
    const fields = dateMap.get(row.weekStart);
    if (!fields) return row;
    let patched: T = { ...row };
    for (const [field, value] of Object.entries(fields)) {
      patched = { ...patched, [field]: value, ...deriver(patched, field, value, assumptions) };
    }
    return patched;
  });
}

/** Build an overrides lookup for StageTable: `"${weekDate}::${field}"` → value. */
function stageOverrideMap(stageKey: string, allOverrides: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(allOverrides)) {
    const parts = key.split("::");
    if (parts[0] !== stageKey || parts.length < 3) continue;
    // Re-join as weekDate::field (weekDate is parts[1], field is parts[2])
    out[`${parts[1]}::${parts[2]}`] = value;
  }
  return out;
}

// ─── Main component ────────────────────────────────────────────────────────────

export function BiologicalChainPage() {
  const { result, params } = usePipeline();
  const bioChainAssumptions    = usePlanStore((s) => s.bioChainAssumptions);
  const setBioChainAssumptions = usePlanStore((s) => s.setBioChainAssumptions);
  const bioChainGpFlocks       = usePlanStore((s) => s.bioChainGpFlocks);
  const bioChainCellOverrides       = usePlanStore((s) => s.bioChainCellOverrides);
  const setBioChainCellOverride     = usePlanStore((s) => s.setBioChainCellOverride);
  const clearBioChainCellOverride   = usePlanStore((s) => s.clearBioChainCellOverride);
  const clearAllBioChainCellOverrides = usePlanStore((s) => s.clearAllBioChainCellOverrides);

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
  const anchorWeek = 1;
  const anchorDate = params.planStartDate;

  // ── Run the full backward chain (demand) ──────────────────────────────────
  const chain = useMemo(
    () => computeBioChain(catchingPlan, bioChainAssumptions),
    [catchingPlan, bioChainAssumptions],
  );

  // ── Apply cell overrides to each stage (derived columns recompute) ────────
  const chainWithOverrides = useMemo(() => {
    const a = bioChainAssumptions;
    return {
      ...chain,
      awpHatchery:  applyStageOverrides(chain.awpHatchery,  "awp-hatchery", bioChainCellOverrides, deriveAwpHatchery,  a),
      awpPsLaying:  applyStageOverrides(chain.awpPsLaying,  "awp-ps-lay",   bioChainCellOverrides, deriveAwpPsLaying,  a),
      awpPsRearing: applyStageOverrides(chain.awpPsRearing, "awp-ps-rear",  bioChainCellOverrides, deriveAwpPsRearing, a),
      gpHatchery:   applyStageOverrides(chain.gpHatchery,   "gp-hatchery",  bioChainCellOverrides, deriveGpHatchery,   a),
      gpLaying:     applyStageOverrides(chain.gpLaying,     "gp-laying",    bioChainCellOverrides, deriveGpLaying,     a),
      gpRearing:    applyStageOverrides(chain.gpRearing,    "gp-rearing",   bioChainCellOverrides, deriveGpRearing,    a),
    };
  }, [chain, bioChainCellOverrides, bioChainAssumptions]);

  // ── Override maps per stage (for StageTable "which cells are overridden") ─
  const overridesByStage = useMemo(() => ({
    "awp-hatchery":  stageOverrideMap("awp-hatchery",  bioChainCellOverrides),
    "awp-ps-lay":    stageOverrideMap("awp-ps-lay",    bioChainCellOverrides),
    "awp-ps-rear":   stageOverrideMap("awp-ps-rear",   bioChainCellOverrides),
    "gp-hatchery":   stageOverrideMap("gp-hatchery",   bioChainCellOverrides),
    "gp-laying":     stageOverrideMap("gp-laying",     bioChainCellOverrides),
    "gp-rearing":    stageOverrideMap("gp-rearing",    bioChainCellOverrides),
  }), [bioChainCellOverrides]);

  // ── Stable callbacks for each stage ───────────────────────────────────────
  // weekDate = ISO yyyy-mm-dd (from row.weekStart), same convention as production plan
  const makeEditHandler = useCallback(
    (stageKey: string) => (weekDate: string, field: string, value: number) =>
      setBioChainCellOverride(stageKey, weekDate, field, value),
    [setBioChainCellOverride],
  );
  const makeResetHandler = useCallback(
    (stageKey: string) => (weekDate: string, field: string) =>
      clearBioChainCellOverride(stageKey, weekDate, field),
    [clearBioChainCellOverride],
  );

  const totalOverrides = Object.keys(bioChainCellOverrides).length;

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
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-800">Backward Chain — Stage Detail</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Demand-driven: what each stage MUST deliver to meet the catching plan.
                  Highlighted cells are editable — derived columns update automatically.
                </p>
              </div>
              {totalOverrides > 0 && (
                <button
                  onClick={clearAllBioChainCellOverrides}
                  className="text-xs text-amber-600 hover:text-amber-800 border border-amber-300 hover:border-amber-500 rounded-md px-2.5 py-1 transition-colors shrink-0 ml-4"
                >
                  ↺ Reset all {totalOverrides} override{totalOverrides !== 1 ? "s" : ""}
                </button>
              )}
            </div>

            <StageTable stageKey="catching"     title="Catching Plan (input)"              company="AWP" rows={chainWithOverrides.catchingPlan}  cols={catchingCols}     defaultOpen />
            <StageTable stageKey="awp-broiler"  title="AWP Broiler — DOC Placement"        company="AWP" rows={chainWithOverrides.awpBroiler}    cols={awpBroilerCols}   />
            <StageTable
              stageKey="awp-hatchery"
              title="AWP Hatchery — Eggs Set & DOC"
              company="AWP"
              rows={chainWithOverrides.awpHatchery}
              cols={awpHatcheryCols}
              overrides={overridesByStage["awp-hatchery"]}
              onCellEdit={makeEditHandler("awp-hatchery")}
              onCellReset={makeResetHandler("awp-hatchery")}
            />
            <StageTable
              stageKey="awp-ps-lay"
              title="AWP PS Laying — Active Hens"
              company="AWP"
              rows={chainWithOverrides.awpPsLaying}
              cols={awpPsLayingCols}
              overrides={overridesByStage["awp-ps-lay"]}
              onCellEdit={makeEditHandler("awp-ps-lay")}
              onCellReset={makeResetHandler("awp-ps-lay")}
            />
            <StageTable
              stageKey="awp-ps-rear"
              title="AWP PS Rearing — DOC Placement"
              company="AWP"
              rows={chainWithOverrides.awpPsRearing}
              cols={awpPsRearingCols}
              overrides={overridesByStage["awp-ps-rear"]}
              onCellEdit={makeEditHandler("awp-ps-rear")}
              onCellReset={makeResetHandler("awp-ps-rear")}
            />
            <StageTable
              stageKey="gp-hatchery"
              title="GP Hatchery — PS DOC Production"
              company="GP"
              rows={chainWithOverrides.gpHatchery}
              cols={gpHatcheryCols}
              overrides={overridesByStage["gp-hatchery"]}
              onCellEdit={makeEditHandler("gp-hatchery")}
              onCellReset={makeResetHandler("gp-hatchery")}
            />
            <StageTable
              stageKey="gp-laying"
              title="GP Laying — Hens & Eggs (Demand)"
              company="GP"
              rows={chainWithOverrides.gpLaying}
              cols={gpLayingCols}
              overrides={overridesByStage["gp-laying"]}
              onCellEdit={makeEditHandler("gp-laying")}
              onCellReset={makeResetHandler("gp-laying")}
            />
            <StageTable
              stageKey="gp-rearing"
              title="GP Rearing — DOC Placement"
              company="GP"
              rows={chainWithOverrides.gpRearing}
              cols={gpRearingCols}
              overrides={overridesByStage["gp-rearing"]}
              onCellEdit={makeEditHandler("gp-rearing")}
              onCellReset={makeResetHandler("gp-rearing")}
            />
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

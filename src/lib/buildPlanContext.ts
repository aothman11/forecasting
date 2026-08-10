import type { SummaryMetrics } from "./calculations";
import type { PipelineResult } from "./types";

/**
 * Serialises the current plan state into a compact text block that the AI
 * assistant uses as its system-prompt context.  Read-only — never mutates state.
 */
export function buildPlanContext(m: SummaryMetrics, result: PipelineResult): string {
  const fmt = (n: number, decimals = 0) =>
    n.toLocaleString("en-US", { maximumFractionDigits: decimals });

  const totalSaleableKg =
    m.totalWcFreshKg + m.totalWcFrozenKg + m.totalCutsKg + m.totalFppKg;

  // Per-week capacity and utilisation summary (first 12 weeks max)
  const weekRows = result.liveBird
    .slice(0, 12)
    .map((w, i) => {
      const flag = w.exceedsCapacity ? " ⚠ OVER CAPACITY" : "";
      return `  Week ${i + 1}: ${fmt(w.harvestableBirds)} birds harvested, ${w.utilizationPct.toFixed(1)}% utilisation${flag}`;
    })
    .join("\n");

  return `
=== AWP COP — Current Plan Snapshot ===

SUPPLY (plan horizon totals)
  Chicks placed:        ${fmt(m.totalChicksPlaced)}
  Harvestable birds:    ${fmt(m.totalHarvestableBirds)}
  Total carcass:        ${fmt(m.totalCarcassKg)} kg
  WC Fresh:             ${fmt(m.totalWcFreshKg)} kg  (${m.avgFreshSharePct.toFixed(1)}% of WC)
  WC Frozen:            ${fmt(m.totalWcFrozenKg)} kg  (${m.avgFrozenSharePct.toFixed(1)}% of WC)
  Net cuts (saleable):  ${fmt(m.totalCutsKg)} kg
  FPP produced:         ${fmt(m.totalFppKg)} kg
  Total saleable output:${fmt(totalSaleableKg)} kg

CAPACITY
  Avg plant utilisation:   ${m.avgUtilizationPct.toFixed(1)}%
  Weeks over capacity:     ${m.weeksWithCapacityBreach}

WEEK-BY-WEEK HARVEST (first 12 weeks)
${weekRows || "  (no harvest data yet)"}

TERMINOLOGY FOR THIS APP
  - Grade pools: 930 = A-Grade Fresh WC, 931 = A-Grade Frozen WC, 932 = B-Grade/Cuts, 933 = FPP
  - sopCoverageP = saleable supply ÷ demand (should be ≥ 100%)
  - Carcass kg = post-dressing weight before family allocation
  - FPP = Further Processed Products (nuggets, burgers, strips, etc.)
`.trim();
}

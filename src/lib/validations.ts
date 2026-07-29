import type { Parameters, PipelineResult, ValidationIssue } from "./types";
import { activeCutKeys, carcassSizeDistributionSum, cutYieldSum, fullCycleDays } from "./calculations";

const PCT_TOLERANCE = 0.005; // 0.5 percentage points for exact-100 checks
const CUT_TOLERANCE = 0.02; // ±2% for cut plan yields

function pctSum(...vals: number[]): number {
  return vals.reduce((s, v) => s + v, 0);
}

export function validatePipeline(params: Parameters, result: PipelineResult): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Rule 1: cumulative house placements vs. total houses across expected rotations
  const rotationWeeks = Math.max(1, Math.round(fullCycleDays(params) / 7));
  const expectedRotations = params.planningHorizonWeeks / rotationWeeks;
  const cumulativeHouses = result.placement.reduce((s, r) => s + r.farmsPlacing, 0);
  const maxAllowed = params.houseCount * expectedRotations;
  if (cumulativeHouses > maxAllowed * 1.02) {
    issues.push({
      level: "warning",
      step: "Placement Plan",
      message: `Cumulative house placements (${Math.round(
        cumulativeHouses
      )}) exceed the expected ${params.houseCount} houses × ${expectedRotations.toFixed(
        1
      )} rotations (~${Math.round(maxAllowed)}) over the ${params.planningHorizonWeeks}-week horizon.`,
    });
  }

  // Rule 2: grade split sums to 100%
  const gradeSum = pctSum(params.gradeSplit.A, params.gradeSplit.B, params.gradeSplit.C);
  if (Math.abs(gradeSum - 1) > PCT_TOLERANCE) {
    issues.push({
      level: "error",
      step: "Carcass Yield & Grade Split",
      message: `Grade split percentages sum to ${(gradeSum * 100).toFixed(1)}%, not 100%.`,
    });
  }

  // Rule 3: product family allocation per grade sums to 100%
  (["A", "B", "C"] as const).forEach((grade) => {
    const row = params.familyAllocation[grade];
    const sum = pctSum(row.wcFresh, row.wcFrozen, row.fpp);
    if (Math.abs(sum - 1) > PCT_TOLERANCE) {
      issues.push({
        level: "error",
        step: "Product Family Allocation",
        message: `Grade ${grade} allocation sums to ${(sum * 100).toFixed(1)}%, not 100%.`,
      });
    }
  });

  // Rule 4: cut plan yields sum to ~100% (±2%)
  const cutSum = cutYieldSum(params);
  if (Math.abs(cutSum - 1) > CUT_TOLERANCE) {
    const mode = params.legSplitMode ? "drumstick + thigh split" : "whole leg";
    issues.push({
      level: "warning",
      step: "FPP Cut Plan",
      message: `Cut yields (${mode} mode) sum to ${(cutSum * 100).toFixed(
        1
      )}%, outside the ±2% tolerance around 100%.`,
    });
  }

  // Rule 4b: carcass size distribution must sum to ~100% (±1%)
  const sizeSum = carcassSizeDistributionSum(params);
  if (Math.abs(sizeSum - 1) > 0.01) {
    issues.push({
      level: "warning",
      step: "Carcass Size Distribution",
      message: `Carcass size distribution sums to ${(sizeSum * 100).toFixed(2)}%, not 100%.`,
    });
  }

  // Rule 5: weekly harvest cannot exceed total plant capacity — error
  result.liveBird.forEach((lb) => {
    if (lb.exceedsCapacity) {
      issues.push({
        level: "error",
        step: "Live Bird Forecast",
        message: `Week ${lb.week}: harvestable birds (${Math.round(
          lb.harvestableBirds
        ).toLocaleString()}) exceed total plant capacity (${lb.totalPlantCapacity.toLocaleString()}).`,
      });
    }
  });

  // Rule 6: plant daily processing cannot exceed individual plant capacity — error
  result.plants.forEach((p) => {
    if (p.capacityBreach) {
      issues.push({
        level: "error",
        step: "Processing Plan by Plant",
        message: `Week ${p.week}, ${p.plant}: daily birds (${Math.round(
          p.dailyBirds
        ).toLocaleString()}) exceed plant capacity (${p.plantCapacity.toLocaleString()}).`,
      });
    }
  });

  return issues;
}

export function isCutModeValid(params: Parameters): boolean {
  return Math.abs(cutYieldSum(params) - 1) <= CUT_TOLERANCE;
}

export { activeCutKeys };

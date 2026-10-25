"use client";

import { useMemo } from "react";
import { usePlanStore } from "@/lib/store";
import { deriveFamilyAllocation } from "@/lib/deriveFamilyAllocation";
import type { FamilyAllocation } from "@/lib/types";

function sameAllocation(a: FamilyAllocation, b: FamilyAllocation): boolean {
  return (["A", "B", "C"] as const).every((g) =>
    (["wcFresh", "wcFrozen", "cuts"] as const).every((k) => Math.abs(a[g][k] - b[g][k]) < 0.0005)
  );
}

const pctOf = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Shows whether the Fresh / Frozen / Cuts allocation comes from the sales plan or was typed by hand. */
export function FamilyAllocationSource() {
  const params = usePlanStore((s) => s.params);
  const demandProducts = usePlanStore((s) => s.demandProducts);
  const demandQty = usePlanStore((s) => s.demandQty);
  const applySalesPlanAllocation = usePlanStore((s) => s.applySalesPlanAllocation);

  const derived = useMemo(
    () => deriveFamilyAllocation(demandProducts, demandQty, params),
    [demandProducts, demandQty, params]
  );

  const fromSalesPlan = params.familyAllocationSource === "salesPlan";
  const outOfDate = fromSalesPlan && derived.hasData && !sameAllocation(derived.allocation, params.familyAllocation);
  const { mix } = derived;

  return (
    <div className="text-[11px] space-y-1.5 mb-2">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded px-1.5 py-0.5 font-medium border ${
            fromSalesPlan
              ? "bg-brand-green-tint text-brand-green-dark border-brand-green"
              : "bg-neutral-50 text-neutral-600 border-[var(--border-subtle)]"
          }`}
        >
          {fromSalesPlan ? "From sales plan" : "Manual"}
        </span>
        {derived.hasData && (!fromSalesPlan || outOfDate) && (
          <button
            type="button"
            onClick={applySalesPlanAllocation}
            className="font-medium px-2 py-0.5 rounded-md border border-brand-green text-brand-green-dark hover:bg-brand-green hover:text-white transition-colors"
          >
            {fromSalesPlan ? "Refresh from sales plan" : "Use sales plan"}
          </button>
        )}
      </div>

      {derived.hasData ? (
        <div className="text-neutral-500">
          Sales plan ({params.planningHorizonWeeks} wks): WC Fresh {pctOf(mix.wcFreshTons, mix.totalTons)}% · WC
          Frozen {pctOf(mix.wcFrozenTons, mix.totalTons)}% · Cuts {pctOf(mix.cutsTons, mix.totalTons)}% · FPP{" "}
          {pctOf(mix.fppTons, mix.totalTons)}%
        </div>
      ) : (
        <div className="text-neutral-400">No sales plan data in the horizon yet — using the values below.</div>
      )}

      {outOfDate && (
        <div className="text-amber-700">Demand or yields changed since these were derived.</div>
      )}

      {derived.hasData && derived.bindingGrade && (
        <div className="text-amber-700">
          Grade {derived.bindingGrade} whole-chicken demand needs more Grade {derived.bindingGrade} birds than the{" "}
          {Math.round(params.gradeSplit[derived.bindingGrade] * 100)}% grade split gives — cuts from Grade{" "}
          {derived.bindingGrade} set to 0% and extra carcass is planned.
        </div>
      )}
    </div>
  );
}

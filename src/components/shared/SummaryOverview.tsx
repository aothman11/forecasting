import { computeSummaryMetrics } from "@/lib/calculations";
import type { PipelineResult } from "@/lib/types";
import { SummaryCard } from "./SummaryCard";
import { CapacityChart } from "../charts/CapacityChart";
import { GradeChart } from "../charts/GradeChart";
import { FamilyDonut } from "../charts/FamilyDonut";

export function SummaryOverview({ result, planStartDate }: { result: PipelineResult; planStartDate: string }) {
  const m = computeSummaryMetrics(result);

  return (
    <div className="bg-white p-6" style={{ width: 900 }}>
      <div className="text-xl font-bold text-brand-green mb-1">AWP Production Forecast — Summary</div>
      <div className="text-xs text-neutral-500 mb-4">
        {result.placement.length}-week planning horizon · generated {new Date().toLocaleDateString()}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <SummaryCard label="Total Chicks Placed" value={Math.round(m.totalChicksPlaced).toLocaleString()} accent="green" />
        <SummaryCard label="Total Harvestable Birds" value={Math.round(m.totalHarvestableBirds).toLocaleString()} accent="green" />
        <SummaryCard label="Total Carcass" value={`${Math.round(m.totalCarcassKg).toLocaleString()} kg`} accent="gold" />
        <SummaryCard
          label="Weeks Over Capacity"
          value={String(m.weeksWithCapacityBreach)}
          accent={m.weeksWithCapacityBreach > 0 ? "alert" : "neutral"}
        />
        <SummaryCard label="WC Fresh" value={`${Math.round(m.totalWcFreshKg).toLocaleString()} kg`} />
        <SummaryCard label="WC Frozen" value={`${Math.round(m.totalWcFrozenKg).toLocaleString()} kg`} />
        <SummaryCard label="FPP" value={`${Math.round(m.totalFppKg).toLocaleString()} kg`} />
        <SummaryCard label="Avg Plant Utilization" value={`${m.avgUtilizationPct.toFixed(1)}%`} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-neutral-500 mb-1">Harvestable Birds vs Capacity</div>
          <CapacityChart data={result.liveBird} planStartDate={planStartDate} />
        </div>
        <div>
          <div className="text-xs font-semibold text-neutral-500 mb-1">Grade Distribution</div>
          <GradeChart data={result.carcass} />
        </div>
      </div>
      <div className="mt-4" style={{ width: 420 }}>
        <div className="text-xs font-semibold text-neutral-500 mb-1">Product Family Split</div>
        <FamilyDonut data={result.family} />
      </div>
    </div>
  );
}

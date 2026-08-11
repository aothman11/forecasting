"use client";

import { STEPS, usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import { Sidebar } from "@/components/Sidebar";
import { StepJourney } from "@/components/StepJourney";
import { ParameterPanel } from "@/components/ParameterPanel";
import { ScenarioCompare } from "@/components/ScenarioCompare";
import { DemandForecast } from "@/components/DemandForecast";
import { SupplyPlan } from "@/components/SupplyPlan";
import { ReconciliationDashboard } from "@/components/ReconciliationDashboard";
import { DemandDrivenPlacement } from "@/components/DemandDrivenPlacement";
import { SOPReport } from "@/components/SOPReport";
import { HomeDashboard } from "@/components/HomeDashboard";
import { ProductBOM } from "@/components/ProductBOM";
import { ProcessingPlanDemand } from "@/components/ProcessingPlanDemand";
import { BroilerIntakePlan } from "@/components/BroilerIntakePlan";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { ValidationBanner } from "@/components/shared/ValidationBanner";
import { SummaryOverview } from "@/components/shared/SummaryOverview";
import { SummaryCard } from "@/components/shared/SummaryCard";
import { computeSummaryMetrics } from "@/lib/calculations";
import { PlacementPlan } from "@/components/steps/PlacementPlan";
import { LiveBirdForecast } from "@/components/steps/LiveBirdForecast";
import { CarcassYield } from "@/components/steps/CarcassYield";
import { ProductFamily } from "@/components/steps/ProductFamily";
import { CutPlan } from "@/components/steps/CutPlan";
import { ProcessingPlan } from "@/components/steps/ProcessingPlan";
import { FarmQuotaDistribution } from "@/components/steps/FarmQuotaDistribution";
import { PlanningAssistant } from "@/components/PlanningAssistant";
import { CutBalancePanel } from "@/components/CutBalancePanel";
import { buildPlanContext } from "@/lib/buildPlanContext";

function StepContent({ step }: { step: number }) {
  switch (step) {
    case 1:
      return <PlacementPlan />;
    case 2:
      return <LiveBirdForecast />;
    case 3:
      return <CarcassYield />;
    case 4:
      return <ProductFamily />;
    case 5:
      return <CutPlan />;
    case 6:
      return <ProcessingPlan />;
    case 7:
      return <FarmQuotaDistribution />;
    default:
      return null;
  }
}

export default function Home() {
  const selectedStep = usePlanStore((s) => s.selectedStep);
  const compareOpen = usePlanStore((s) => s.compareOpen);
  const demandOpen = usePlanStore((s) => s.demandOpen);
  const supplyOpen = usePlanStore((s) => s.supplyOpen);
  const reconcileOpen = usePlanStore((s) => s.reconcileOpen);
  const ddpOpen = usePlanStore((s) => s.ddpOpen);
  const reportOpen = usePlanStore((s) => s.reportOpen);
  const homeOpen = usePlanStore((s) => s.homeOpen);
  const bomOpen = usePlanStore((s) => s.bomOpen);
  const processingPlanOpen = usePlanStore((s) => s.processingPlanOpen);
  const broilerIntakeOpen = usePlanStore((s) => s.broilerIntakeOpen);
  const cutBalanceOpen = usePlanStore((s) => s.cutBalanceOpen);
  const assumptionsOpen = usePlanStore((s) => s.assumptionsOpen);
  const toggleAssumptions = usePlanStore((s) => s.toggleAssumptions);
  const { result, params, issues } = usePipeline();

  const currentLabel = STEPS.find((s) => s.id === selectedStep)?.label ?? "";
  const m = computeSummaryMetrics(result);

  return (
    <>
      {/* Desktop / tablet workbench */}
      <div className="hidden md:flex h-screen w-full">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-[var(--border-subtle)] bg-white flex items-center justify-between px-6 shrink-0">
            <div className="text-sm font-semibold text-neutral-700">
              {homeOpen ? "Home" : compareOpen ? "Scenario Comparison" : demandOpen ? "Demand Plan" : supplyOpen ? "Supply Requirements" : reconcileOpen ? "Reconciliation" : ddpOpen ? "Demand-Driven Placement" : reportOpen ? "COP Report" : bomOpen ? "Product BOM" : processingPlanOpen ? "Processing Plan" : broilerIntakeOpen ? "Broiler Intake Plan" : cutBalanceOpen ? "Co-Product Balance" : currentLabel}
            </div>
            <div className="flex items-center gap-3">
              <ExportButtons />
              <button
                onClick={toggleAssumptions}
                className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                  assumptionsOpen
                    ? "border-brand-green text-brand-green-dark bg-brand-green-tint"
                    : "border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green"
                }`}
              >
                Assumptions
              </button>
            </div>
          </header>

          <ValidationBanner issues={issues} />

          <main className="workbench-bg flex-1 overflow-y-auto p-6">
            {homeOpen ? (
              <HomeDashboard />
            ) : compareOpen ? (
              <ScenarioCompare />
            ) : demandOpen ? (
              <DemandForecast />
            ) : supplyOpen ? (
              <SupplyPlan />
            ) : reconcileOpen ? (
              <ReconciliationDashboard />
            ) : ddpOpen ? (
              <DemandDrivenPlacement />
            ) : reportOpen ? (
              <SOPReport />
            ) : bomOpen ? (
              <ProductBOM />
            ) : processingPlanOpen ? (
              <ProcessingPlanDemand />
            ) : broilerIntakeOpen ? (
              <BroilerIntakePlan />
            ) : cutBalanceOpen ? (
              <CutBalancePanel result={result} />
            ) : (
              <StepContent step={selectedStep} />
            )}
          </main>
        </div>

        <ParameterPanel />
      </div>

      {/* Mobile fallback */}
      <div className="md:hidden min-h-screen bg-[var(--background)] p-4">
        <div className="text-lg font-bold text-brand-green mb-1">AWP COP</div>
        <div className="text-xs text-neutral-500 mb-4">
          This planning workbench is built for wide, spreadsheet-style tables. Use a desktop or tablet
          (768px+) for the full 6-step workflow. Here&apos;s a read-only summary of the current plan.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard label="Total Chicks Placed" value={Math.round(m.totalChicksPlaced).toLocaleString()} accent="green" />
          <SummaryCard label="Harvestable Birds" value={Math.round(m.totalHarvestableBirds).toLocaleString()} />
          <SummaryCard label="Total Carcass" value={`${Math.round(m.totalCarcassKg).toLocaleString()} kg`} accent="gold" />
          <SummaryCard label="FPP" value={`${Math.round(m.totalFppKg).toLocaleString()} kg`} />
          <SummaryCard label="Avg Utilization" value={`${m.avgUtilizationPct.toFixed(1)}%`} />
          <SummaryCard
            label="Weeks Over Capacity"
            value={String(m.weeksWithCapacityBreach)}
            accent={m.weeksWithCapacityBreach > 0 ? "alert" : "neutral"}
          />
        </div>
      </div>

      {/* AI planning assistant — floating bottom-right */}
      <PlanningAssistant planContext={buildPlanContext(m, result)} />

      {/* Off-screen render target used for PDF export */}
      <div style={{ position: "fixed", top: 0, left: -10000 }}>
        <div id="pdf-summary-export">
          <SummaryOverview result={result} planStartDate={params.planStartDate} />
        </div>
      </div>
    </>
  );
}

"use client";

import Image from "next/image";
import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";
import { activeCutKeys, computeDemandComparison, computeSummaryMetrics } from "@/lib/calculations";
import { CUT_LABELS, PLANT_LABELS } from "@/lib/defaults";
import { SummaryCard } from "./shared/SummaryCard";
import { CapacityChart } from "./charts/CapacityChart";
import { GradeChart } from "./charts/GradeChart";
import { FamilyDonut } from "./charts/FamilyDonut";
import { DemandComparisonChart } from "./charts/DemandComparisonChart";
import type { PlantKey } from "@/lib/types";

function kg(n: number) {
  return Math.round(n).toLocaleString();
}

interface DashCardProps {
  icon: string;
  title: string;
  description: string;
  onOpen: () => void;
  children?: React.ReactNode;
}

function DashCard({ icon, title, description, onOpen, children }: DashCardProps) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-green-tint text-base shrink-0">
            {icon}
          </span>
          <div>
            <div className="text-sm font-semibold text-brand-green-dark section-title">{title}</div>
            <div className="text-[11px] text-neutral-400">{description}</div>
          </div>
        </div>
        <button
          onClick={onOpen}
          className="text-[11px] font-medium text-brand-green hover:text-brand-green-dark whitespace-nowrap shrink-0"
        >
          Open →
        </button>
      </div>
      {children}
    </div>
  );
}

function UtilizationBar({ label, pct }: { label: string; pct: number }) {
  const over = pct > 100;
  return (
    <div className="mb-1.5">
      <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-0.5">
        <span>{label}</span>
        <span className={over ? "text-brand-alert font-semibold" : "text-neutral-600"}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${over ? "bg-brand-alert" : "bg-brand-green"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

export function HomeDashboard() {
  const { result, params } = usePipeline();
  const demand = usePlanStore((s) => s.demand);
  const setSelectedStep = usePlanStore((s) => s.setSelectedStep);
  const setDemandOpen = usePlanStore((s) => s.setDemandOpen);
  const setHomeOpen = usePlanStore((s) => s.setHomeOpen);

  const openStep = (step: number) => {
    setHomeOpen(false);
    setDemandOpen(false);
    setSelectedStep(step);
  };
  const openDemand = () => {
    setHomeOpen(false);
    setDemandOpen(true);
  };

  const m = computeSummaryMetrics(result);
  const comparison = computeDemandComparison(demand, result.family);
  const demandTotal = comparison.reduce((s, r) => s + r.demandKg, 0);
  const productionTotal = comparison.reduce((s, r) => s + r.productionKg, 0);
  const overallFillRate = demandTotal > 0 ? (productionTotal / demandTotal) * 100 : 100;

  const runningChicks = result.placement.reduce((s, r) => s + r.totalChicksPlaced, 0);
  const totalHouses = result.placement.reduce((s, r) => s + r.farmsPlacing, 0);

  const cutKeys = activeCutKeys(params.legSplitMode);
  const cutTotals = cutKeys
    .map((k) => ({ key: k, total: result.cuts.reduce((s, r) => s + r.cuts[k], 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const plantKeys: PlantKey[] = ["plant1", "plant2", "plant3"];
  const plantUtilization = plantKeys.map((p) => {
    const weeks = result.plants.filter((w) => w.plant === p);
    const avg = weeks.length > 0 ? weeks.reduce((s, w) => s + (w.plantCapacity > 0 ? w.dailyBirds / w.plantCapacity : 0), 0) / weeks.length : 0;
    return { plant: p, pct: avg * 100 };
  });

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-br from-brand-green-tint via-white to-white shadow-sm px-6 py-6 flex items-center justify-between gap-6 flex-wrap">
        <Image src="/alwatania-logo-white.png" alt="Al-Watania Poultry" width={160} height={80} className="h-14 w-auto" priority />
        <div className="text-center flex-1 min-w-[260px]">
          <div className="text-2xl font-bold text-brand-green section-title">AWP Production Forecast</div>
          <div className="text-sm text-neutral-500 mt-1">Smarter Planning, Better Production</div>
          <div className="text-xs text-neutral-400 mt-0.5">
            Forecast placement. Trace the full processing chain. Compare demand to plan.
          </div>
        </div>
        <Image src="/sap-dt-initiative-logo.png" alt="SAP Digital Transformation Initiative" width={180} height={60} className="h-10 w-auto" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <SummaryCard label="Chicks Placed" value={Math.round(runningChicks).toLocaleString()} accent="green" icon="🐣" />
        <SummaryCard label="Harvestable Birds" value={Math.round(m.totalHarvestableBirds).toLocaleString()} icon="🐔" />
        <SummaryCard label="Total Carcass" value={`${kg(m.totalCarcassKg)} kg`} accent="gold" icon="⚖️" />
        <SummaryCard
          label="Total Production"
          value={`${kg(m.totalWcFreshKg + m.totalWcFrozenKg + m.totalFppKg)} kg`}
          icon="📦"
        />
        <SummaryCard label="Demand Fill Rate" value={`${overallFillRate.toFixed(1)}%`} icon="📊" />
        <SummaryCard
          label="Weeks Over Capacity"
          value={String(m.weeksWithCapacityBreach)}
          accent={m.weeksWithCapacityBreach > 0 ? "alert" : "neutral"}
          icon="⚠️"
        />
      </div>

      {/* Dashboards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard icon="🐣" title="1 · Placement Plan" description="Daily house placements" onOpen={() => openStep(1)}>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <SummaryCard label="Chicks Placed" value={Math.round(runningChicks).toLocaleString()} accent="green" />
            <SummaryCard label="House-Placements" value={totalHouses.toLocaleString()} sublabel={`${params.houseCount}/day rate`} />
          </div>
        </DashCard>

        <DashCard icon="🐔" title="2 · Live Bird Forecast" description="Harvest vs. plant capacity" onOpen={() => openStep(2)}>
          <CapacityChart data={result.liveBird} />
        </DashCard>

        <DashCard icon="⚖️" title="3 · Carcass Yield & Grade Split" description="Grade A / B / C distribution" onOpen={() => openStep(3)}>
          <GradeChart data={result.carcass} />
        </DashCard>

        <DashCard icon="📦" title="4 · Product Family Allocation" description="Fresh / Frozen / FPP split" onOpen={() => openStep(4)}>
          <FamilyDonut data={result.family} />
        </DashCard>

        <DashCard icon="🍗" title="5 · FPP Cut Plan" description="Top cuts by volume" onOpen={() => openStep(5)}>
          <div className="mt-2 space-y-2">
            {cutTotals.map((c, i) => (
              <div key={c.key} className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">
                  <span className="text-brand-gold font-semibold mr-1">#{i + 1}</span>
                  {CUT_LABELS[c.key]}
                </span>
                <span className="font-semibold tabular-nums">{kg(c.total)} kg</span>
              </div>
            ))}
          </div>
        </DashCard>

        <DashCard icon="🏭" title="6 · Processing Plan by Plant" description="Avg utilization by plant" onOpen={() => openStep(6)}>
          <div className="mt-2">
            {plantUtilization.map((p) => (
              <UtilizationBar key={p.plant} label={PLANT_LABELS[p.plant]} pct={p.pct} />
            ))}
          </div>
        </DashCard>

        <DashCard icon="📊" title="Demand Forecast" description="Demand vs. production plan" onOpen={openDemand}>
          <DemandComparisonChart data={comparison} />
        </DashCard>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";
import { activeCutKeys, computeSummaryMetrics } from "@/lib/calculations";
import { CHANNEL_KEYS, CHANNEL_LABELS, CUT_LABELS, EGG_TRAYS_PER_CARTON, PLANT_LABELS, PRODUCT_CATEGORY_LABELS } from "@/lib/defaults";
import { categoryTotal, groupWeeksByMonth } from "@/lib/demandPlan";
import { computeSupplyRequirements } from "@/lib/supplyRequirements";
import { SummaryCard } from "./shared/SummaryCard";
import { CapacityChart } from "./charts/CapacityChart";
import { UserGuideModal } from "./UserGuideModal";
import { GradeChart } from "./charts/GradeChart";
import { FamilyDonut } from "./charts/FamilyDonut";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { weekLabel } from "@/lib/demandPlan";
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
  const demandProducts = usePlanStore((s) => s.demandProducts);
  const demandQty = usePlanStore((s) => s.demandQty);
  const setSelectedStep = usePlanStore((s) => s.setSelectedStep);
  const setDemandOpen = usePlanStore((s) => s.setDemandOpen);
  const setSupplyOpen = usePlanStore((s) => s.setSupplyOpen);
  const setReconcileOpen = usePlanStore((s) => s.setReconcileOpen);
  const setDdpOpen = usePlanStore((s) => s.setDdpOpen);
  const setReportOpen = usePlanStore((s) => s.setReportOpen);
  const setHomeOpen = usePlanStore((s) => s.setHomeOpen);

  const [guideOpen, setGuideOpen] = useState(false);

  const openStep = (step: number) => { setHomeOpen(false); setDemandOpen(false); setSelectedStep(step); };
  const openDemand = () => { setHomeOpen(false); setSupplyOpen(false); setDemandOpen(true); };
  const openSupply = () => { setHomeOpen(false); setDemandOpen(false); setSupplyOpen(true); };
  const openReconcile = () => { setHomeOpen(false); setDemandOpen(false); setSupplyOpen(false); setReconcileOpen(true); };
  const openDdp = () => { setHomeOpen(false); setReconcileOpen(false); setDdpOpen(true); };
  const openReport = () => { setHomeOpen(false); setDdpOpen(false); setReportOpen(true); };

  const m = computeSummaryMetrics(result);
  const horizonWeeks = Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1);

  const CARTON_KG: Record<string, number> = { wholeChicken: 15, cuts: 15, fpp: 10 };
  const toCar = (cat: string, qty: number) =>
    cat === "eggs" ? Math.round(qty / EGG_TRAYS_PER_CARTON) : Math.round((qty * 1000) / CARTON_KG[cat]);

  const demandTotalTon = (["wholeChicken", "cuts", "fpp"] as const).reduce(
    (s, cat) => s + categoryTotal(demandProducts, demandQty, cat, "ALL", horizonWeeks),
    0
  );
  const demandTotalCar = (["wholeChicken", "cuts", "fpp", "eggs"] as const).reduce(
    (s, cat) => s + toCar(cat, categoryTotal(demandProducts, demandQty, cat, "ALL", horizonWeeks)),
    0
  );

  // Per-channel CAR totals (all categories), sorted descending for the channel insight card.
  const channelDemand = CHANNEL_KEYS.map((ch) => ({
    ch,
    car: (["wholeChicken", "cuts", "fpp", "eggs"] as const).reduce(
      (s, cat) => s + toCar(cat, categoryTotal(demandProducts, demandQty, cat, ch, horizonWeeks)),
      0
    ),
  })).sort((a, b) => b.car - a.car);
  const channelMax = channelDemand[0]?.car || 1;

  const totalWcDemandTons = categoryTotal(demandProducts, demandQty, "wholeChicken", "ALL", horizonWeeks);
  const totalFppDemandTons = categoryTotal(demandProducts, demandQty, "fpp", "ALL", horizonWeeks);
  const totalCutsDemandTons = categoryTotal(demandProducts, demandQty, "cuts", "ALL", horizonWeeks);
  const totalDemandTons = totalWcDemandTons + totalFppDemandTons + totalCutsDemandTons;
  const totalSupplyTons = (m.totalWcFreshKg + m.totalWcFrozenKg + m.totalFppKg) / 1000;
  const reconcileDeficitWeekList = horizonWeeks.filter((w) => {
    const fam = result.family.find((r) => r.week === w);
    const cuts = result.cuts.find((r) => r.week === w);
    const wc = categoryTotal(demandProducts, demandQty, "wholeChicken", "ALL", [w]);
    const fpp = categoryTotal(demandProducts, demandQty, "fpp", "ALL", [w]);
    const cutsD = categoryTotal(demandProducts, demandQty, "cuts", "ALL", [w]);
    const wcS = fam ? (fam.wcFreshKg + fam.wcFrozenKg) / 1000 : 0;
    const fppS = fam ? fam.fppKg / 1000 : 0;
    const cutsS = cuts ? cuts.totalKg / 1000 : 0;
    return (wc > 0 && wcS - wc < -wc * 0.02) || (fpp > 0 && fppS - fpp < -fpp * 0.02) || (cutsD > 0 && cutsS - cutsD < -cutsD * 0.02);
  });
  const reconcileDeficitWeeks = reconcileDeficitWeekList.length;

  const supplyRows = computeSupplyRequirements(demandProducts, demandQty, params, result, horizonWeeks);
  const supplyDeficitWeeks = supplyRows.filter((r) => r.carcassGapKg < -r.requiredCarcassKg * 0.02 && r.requiredCarcassKg > 0).length;
  const totalRequiredCarcass = supplyRows.reduce((s, r) => s + r.requiredCarcassKg, 0);

  const reconcileTightWeeks = horizonWeeks.filter((w) => {
    if (reconcileDeficitWeekList.includes(w)) return false;
    const fam = result.family.find((r) => r.week === w);
    const cuts = result.cuts.find((r) => r.week === w);
    const wc = categoryTotal(demandProducts, demandQty, "wholeChicken", "ALL", [w]);
    const fpp = categoryTotal(demandProducts, demandQty, "fpp", "ALL", [w]);
    const cutsD = categoryTotal(demandProducts, demandQty, "cuts", "ALL", [w]);
    const wcS = fam ? (fam.wcFreshKg + fam.wcFrozenKg) / 1000 : 0;
    const fppS = fam ? fam.fppKg / 1000 : 0;
    const cutsS = cuts ? cuts.totalKg / 1000 : 0;
    return (wc > 0 && wcS - wc < wc * 0.10) || (fpp > 0 && fppS - fpp < fpp * 0.10) || (cutsD > 0 && cutsS - cutsD < cutsD * 0.10);
  }).length;
  const sopCoverageP = totalDemandTons > 0 ? Math.min((totalSupplyTons / totalDemandTons) * 100, 999) : 0;
  const sopStatus: "on-track" | "review" | "critical" =
    reconcileDeficitWeeks === 0 && m.weeksWithCapacityBreach === 0
      ? "on-track"
      : reconcileDeficitWeeks <= 2
      ? "review"
      : "critical";
  const nearestAlertWeeks = reconcileDeficitWeekList.slice(0, 3).map((w) => weekLabel(w, params.planStartDate));

  // ── Monthly breakdown ──────────────────────────────────────────────────────
  const monthGroups = groupWeeksByMonth(horizonWeeks, params.planStartDate);

  const monthlyRows = monthGroups.map(({ monthLabel, weeks: mw }) => {
    const chicksPlaced = mw.reduce((s, w) => {
      const r = result.placement.find((p) => p.week === w);
      return s + (r?.totalChicksPlaced ?? 0);
    }, 0);
    const slaughteredBirds = mw.reduce((s, w) => {
      const r = result.liveBird.find((p) => p.week === w);
      return s + (r?.slaughteredBirds ?? 0);
    }, 0);
    const carcassKg = mw.reduce((s, w) => {
      const r = result.carcass.find((p) => p.week === w);
      return s + (r?.carcassWeightKg ?? 0);
    }, 0);
    const productionKg = mw.reduce((s, w) => {
      const r = result.family.find((p) => p.week === w);
      return s + (r ? r.wcFreshKg + r.wcFrozenKg + r.fppKg : 0);
    }, 0);
    const demandCar = (["wholeChicken", "cuts", "fpp", "eggs"] as const).reduce(
      (s, cat) => s + toCar(cat, categoryTotal(demandProducts, demandQty, cat, "ALL", mw)),
      0
    );
    const requiredCarcassKg = supplyRows
      .filter((r) => mw.includes(r.week))
      .reduce((s, r) => s + r.requiredCarcassKg, 0);
    const requiredChicksPlaced = supplyRows
      .filter((r) => r.placementWeek > 0 && mw.includes(r.placementWeek))
      .reduce((s, r) => s + r.requiredChicksPlaced, 0);
    const demandTons = (["wholeChicken", "cuts", "fpp"] as const).reduce(
      (s, cat) => s + categoryTotal(demandProducts, demandQty, cat, "ALL", mw),
      0
    );
    return { monthLabel, chicksPlaced, slaughteredBirds, carcassKg, productionKg, demandCar, requiredCarcassKg, requiredChicksPlaced, demandTons };
  });

  const runningChicks = result.placement.reduce((s, r) => s + r.totalChicksPlaced, 0);
  const totalHouses = result.placement.reduce((s, r) => s + r.farmsPlacing, 0);
  const activeWeeks = result.placement.filter((r) => r.totalChicksPlaced > 0).length;
  const peakPlacementRow = result.placement.reduce((best, r) => r.totalChicksPlaced > best.totalChicksPlaced ? r : best, result.placement[0]);
  const placementChartData = result.placement.map((r) => ({
    week: weekLabel(r.week, params.planStartDate),
    chicks: Math.round(r.totalChicksPlaced),
  }));

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

  const monthlyTopCuts = cutTotals.map(({ key, total }) => ({
    key,
    label: CUT_LABELS[key],
    total,
    byMonth: monthGroups.map(({ monthLabel, weeks: mw }) => ({
      monthLabel,
      kgVal: mw.reduce((s, w) => {
        const row = result.cuts.find((r) => r.week === w);
        return s + (row?.cuts[key] ?? 0);
      }, 0),
    })),
  }));

  const monthlyPlantUtil = plantKeys.map((p) => ({
    plant: p,
    byMonth: monthGroups.map(({ monthLabel, weeks: mw }) => {
      const wks = result.plants.filter((w) => w.plant === p && mw.includes(w.week));
      const pct = wks.length > 0
        ? (wks.reduce((s, w) => s + (w.plantCapacity > 0 ? w.dailyBirds / w.plantCapacity : 0), 0) / wks.length) * 100
        : 0;
      return { monthLabel, pct };
    }),
  }));

  return (
    <>
    <div className="space-y-5">
      {/* Hero */}
      <div
        className="relative rounded-2xl overflow-hidden shadow-md border border-[var(--border-subtle)]"
        style={{ backgroundColor: "#fff", backgroundImage: "url('/hero-bg6.svg')", backgroundSize: "100% 100%", backgroundPosition: "center center", minHeight: 100 }}
      >
        {/* gradient: white at top for text → transparent at bottom to reveal green waves */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/20 to-transparent pointer-events-none" />

        {/* Centre text */}
        <div className="relative z-10 w-full flex flex-col items-center justify-center py-5 px-6 text-center">
          <div
            className="text-[10px] font-semibold tracking-[0.25em] uppercase text-brand-green-dark/80 mb-0.5"
            style={{ letterSpacing: "0.3em" }}
          >
            Al-Watania Poultry
          </div>
          <div
            className="font-serif leading-tight"
            style={{
              fontSize: "clamp(1.1rem, 2.5vw, 1.6rem)",
              fontWeight: 700,
              color: "#1a3d1a",
              textShadow: "0 1px 4px rgba(255,255,255,0.6)",
              letterSpacing: "-0.01em",
            }}
          >
            Sales and Operations Planning
          </div>
          <div
            className="mt-1 text-[11px] font-medium tracking-widest uppercase"
            style={{ color: "#2d6a2d", letterSpacing: "0.18em" }}
          >
            Smarter Planning · Better Production
          </div>
          <button
            onClick={() => setGuideOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-white/70 border border-brand-green/30 text-brand-green-dark hover:bg-white hover:border-brand-green/60 transition-colors shadow-sm"
          >
            📖 User Guide
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SummaryCard label="Chicks Placed" value={Math.round(runningChicks).toLocaleString()} accent="green" icon="🐣" />
        <SummaryCard label="Slaughtered Birds" value={Math.round(result.liveBird.reduce((s, r) => s + r.slaughteredBirds, 0)).toLocaleString()} icon="🐔" />
        <SummaryCard label="Total Carcass" value={`${kg(m.totalCarcassKg)} kg`} accent="gold" icon="⚖️" />
        <SummaryCard
          label="Total Production"
          value={`${kg(m.totalWcFreshKg + m.totalWcFrozenKg + m.totalFppKg)} kg`}
          icon="📦"
        />
        <SummaryCard label="Total Demand" value={`${Math.round(demandTotalTon * 1000).toLocaleString()} kg`} icon="📊" />
        <SummaryCard
          label="Weeks Over Capacity"
          value={String(m.weeksWithCapacityBreach)}
          accent={m.weeksWithCapacityBreach > 0 ? "alert" : "neutral"}
          icon="⚠️"
        />
      </div>

      {/* ── Monthly Breakdown ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-brand-green-dark">Monthly Overview</h2>
          <div className="flex-1 h-px bg-brand-green/20" />
        </div>
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-brand-green-tint border-b border-[var(--border-subtle)]">
                <th className="text-left px-3 py-2 font-semibold text-brand-green-dark whitespace-nowrap">Metric</th>
                {monthlyRows.map(({ monthLabel }) => (
                  <th key={monthLabel} className="text-right px-3 py-2 font-semibold text-brand-green-dark whitespace-nowrap">
                    {monthLabel}
                  </th>
                ))}
                <th className="text-right px-3 py-2 font-semibold text-neutral-400 whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--border-subtle)] hover:bg-neutral-50">
                <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">🐣 Chicks Placed</td>
                {monthlyRows.map(({ monthLabel, chicksPlaced }) => (
                  <td key={monthLabel} className="px-3 py-2 text-right tabular-nums font-medium">
                    {chicksPlaced > 0 ? Math.round(chicksPlaced).toLocaleString() : <span className="text-neutral-300">—</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-green-dark">
                  {Math.round(monthlyRows.reduce((s, r) => s + r.chicksPlaced, 0)).toLocaleString()}
                </td>
              </tr>
              <tr className="border-b border-[var(--border-subtle)] hover:bg-neutral-50">
                <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">🐔 Slaughtered Birds</td>
                {monthlyRows.map(({ monthLabel, slaughteredBirds }) => (
                  <td key={monthLabel} className="px-3 py-2 text-right tabular-nums font-medium">
                    {slaughteredBirds > 0 ? Math.round(slaughteredBirds).toLocaleString() : <span className="text-neutral-300">—</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-green-dark">
                  {Math.round(monthlyRows.reduce((s, r) => s + r.slaughteredBirds, 0)).toLocaleString()}
                </td>
              </tr>
              <tr className="border-b border-[var(--border-subtle)] hover:bg-neutral-50">
                <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">⚖️ Carcass (t)</td>
                {monthlyRows.map(({ monthLabel, carcassKg }) => (
                  <td key={monthLabel} className="px-3 py-2 text-right tabular-nums font-medium">
                    {carcassKg > 0 ? (carcassKg / 1000).toFixed(0) : <span className="text-neutral-300">—</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-green-dark">
                  {(monthlyRows.reduce((s, r) => s + r.carcassKg, 0) / 1000).toFixed(0)}
                </td>
              </tr>
              <tr className="border-b border-[var(--border-subtle)] hover:bg-neutral-50">
                <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">📦 Production (t)</td>
                {monthlyRows.map(({ monthLabel, productionKg }) => (
                  <td key={monthLabel} className="px-3 py-2 text-right tabular-nums font-medium">
                    {productionKg > 0 ? (productionKg / 1000).toFixed(0) : <span className="text-neutral-300">—</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-green-dark">
                  {(monthlyRows.reduce((s, r) => s + r.productionKg, 0) / 1000).toFixed(0)}
                </td>
              </tr>
              <tr className="hover:bg-neutral-50">
                <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">📊 Demand (CAR)</td>
                {monthlyRows.map(({ monthLabel, demandCar }) => (
                  <td key={monthLabel} className="px-3 py-2 text-right tabular-nums font-medium">
                    {demandCar > 0 ? demandCar.toLocaleString() : <span className="text-neutral-300">—</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-green-dark">
                  {monthlyRows.reduce((s, r) => s + r.demandCar, 0).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── S&OP Modules ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-brand-green-dark">S&amp;OP Modules</h2>
          <div className="flex-1 h-px bg-brand-green/20" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashCard icon="📊" title="M1 · Demand Plan" description="Total demand by category and top channels" onOpen={openDemand}>
            {demandTotalCar > 0 ? (
              <>
                <div className="mt-2 mb-3 flex items-end gap-1.5">
                  <span className="text-xl font-bold text-brand-green-dark tabular-nums">{demandTotalCar.toLocaleString()}</span>
                  <span className="text-xs text-neutral-400 mb-0.5">total cartons</span>
                </div>
                <div className="space-y-1.5 mb-3">
                  {(["wholeChicken", "cuts", "fpp", "eggs"] as const).map((cat) => {
                    const qty = categoryTotal(demandProducts, demandQty, cat, "ALL", horizonWeeks);
                    const car = toCar(cat, qty);
                    if (car === 0) return null;
                    const pct = (car / demandTotalCar) * 100;
                    return (
                      <div key={cat} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-600">{PRODUCT_CATEGORY_LABELS[cat]}</span>
                          <span className="font-semibold tabular-nums">{car.toLocaleString()} CAR</span>
                        </div>
                        <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-green rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-[var(--border-subtle)] pt-2 overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr>
                        <th className="text-left pr-2 py-0.5 font-semibold text-neutral-400 whitespace-nowrap"></th>
                        {monthlyRows.map((r) => (
                          <th key={r.monthLabel} className="text-right px-1 py-0.5 font-semibold text-neutral-400 whitespace-nowrap">
                            {r.monthLabel.split(" ")[0]}
                          </th>
                        ))}
                        <th className="text-right pl-2 py-0.5 font-semibold text-neutral-400">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="pr-2 py-0.5 text-neutral-500 whitespace-nowrap">CAR</td>
                        {monthlyRows.map((r) => (
                          <td key={r.monthLabel} className="px-1 py-0.5 text-right tabular-nums">
                            {r.demandCar > 0 ? r.demandCar.toLocaleString() : <span className="text-neutral-200">—</span>}
                          </td>
                        ))}
                        <td className="pl-2 py-0.5 text-right tabular-nums font-semibold text-brand-green-dark">
                          {demandTotalCar.toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="mt-3 text-[11px] text-neutral-400">No demand entered yet.</div>
            )}
          </DashCard>

          <DashCard icon="🔗" title="M2 · Supply Requirements" description="Required vs planned carcass by month" onOpen={openSupply}>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr>
                    <th className="text-left pr-2 py-0.5 font-semibold text-neutral-400 whitespace-nowrap"></th>
                    {monthlyRows.map((r) => (
                      <th key={r.monthLabel} className="text-right px-1 py-0.5 font-semibold text-neutral-400 whitespace-nowrap">
                        {r.monthLabel.split(" ")[0]}
                      </th>
                    ))}
                    <th className="text-right pl-2 py-0.5 font-semibold text-neutral-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[var(--border-subtle)]">
                    <td className="pr-2 py-1 text-neutral-600 whitespace-nowrap">Req. Carcass (t)</td>
                    {monthlyRows.map((r) => (
                      <td key={r.monthLabel} className="px-1 py-1 text-right tabular-nums">
                        {r.requiredCarcassKg > 0 ? (r.requiredCarcassKg / 1000).toFixed(0) : <span className="text-neutral-300">—</span>}
                      </td>
                    ))}
                    <td className="pl-2 py-1 text-right tabular-nums font-semibold text-neutral-700">
                      {totalRequiredCarcass > 0 ? (totalRequiredCarcass / 1000).toFixed(0) : "—"}
                    </td>
                  </tr>
                  <tr className="border-t border-[var(--border-subtle)]">
                    <td className="pr-2 py-1 text-neutral-600 whitespace-nowrap">Planned (t)</td>
                    {monthlyRows.map((r) => (
                      <td key={r.monthLabel} className={`px-1 py-1 text-right tabular-nums font-medium ${r.requiredCarcassKg > 0 && r.carcassKg < r.requiredCarcassKg ? "text-red-600" : "text-green-700"}`}>
                        {(r.carcassKg / 1000).toFixed(0)}
                      </td>
                    ))}
                    <td className="pl-2 py-1 text-right tabular-nums font-semibold text-brand-green-dark">
                      {(m.totalCarcassKg / 1000).toFixed(0)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {totalRequiredCarcass === 0 && <div className="text-[11px] text-neutral-400 mt-1">Enter demand first.</div>}
            </div>
          </DashCard>

          <DashCard icon="⇌" title="M3 · Reconciliation" description="Monthly demand vs supply (tonnes)" onOpen={openReconcile}>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr>
                    <th className="text-left pr-2 py-0.5 font-semibold text-neutral-400 whitespace-nowrap"></th>
                    {monthlyRows.map((r) => (
                      <th key={r.monthLabel} className="text-right px-1 py-0.5 font-semibold text-neutral-400 whitespace-nowrap">
                        {r.monthLabel.split(" ")[0]}
                      </th>
                    ))}
                    <th className="text-right pl-2 py-0.5 font-semibold text-neutral-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[var(--border-subtle)]">
                    <td className="pr-2 py-1 text-neutral-600 whitespace-nowrap">Demand (t)</td>
                    {monthlyRows.map((r) => (
                      <td key={r.monthLabel} className="px-1 py-1 text-right tabular-nums">
                        {r.demandTons > 0 ? r.demandTons.toFixed(0) : <span className="text-neutral-300">—</span>}
                      </td>
                    ))}
                    <td className="pl-2 py-1 text-right tabular-nums font-semibold text-neutral-700">
                      {totalDemandTons > 0 ? totalDemandTons.toFixed(0) : "—"}
                    </td>
                  </tr>
                  <tr className="border-t border-[var(--border-subtle)]">
                    <td className="pr-2 py-1 text-neutral-600 whitespace-nowrap">Supply (t)</td>
                    {monthlyRows.map((r) => (
                      <td key={r.monthLabel} className={`px-1 py-1 text-right tabular-nums font-medium ${r.demandTons > 0 && r.productionKg / 1000 < r.demandTons * 0.98 ? "text-red-600" : r.demandTons > 0 ? "text-green-700" : "text-neutral-600"}`}>
                        {(r.productionKg / 1000).toFixed(0)}
                      </td>
                    ))}
                    <td className="pl-2 py-1 text-right tabular-nums font-semibold text-brand-green-dark">
                      {totalSupplyTons.toFixed(0)}
                    </td>
                  </tr>
                  <tr className="border-t border-[var(--border-subtle)]">
                    <td className="pr-2 py-1 text-neutral-600 whitespace-nowrap">Gap (t)</td>
                    {monthlyRows.map((r) => {
                      const gap = r.productionKg / 1000 - r.demandTons;
                      return (
                        <td key={r.monthLabel} className={`px-1 py-1 text-right tabular-nums font-semibold ${r.demandTons === 0 ? "text-neutral-300" : gap < 0 ? "text-red-600" : "text-green-700"}`}>
                          {r.demandTons > 0 ? (gap >= 0 ? "+" : "") + gap.toFixed(0) : <span className="text-neutral-200">—</span>}
                        </td>
                      );
                    })}
                    <td className={`pl-2 py-1 text-right tabular-nums font-semibold ${totalDemandTons === 0 ? "text-neutral-400" : totalSupplyTons - totalDemandTons < 0 ? "text-red-600" : "text-green-700"}`}>
                      {totalDemandTons > 0 ? ((totalSupplyTons - totalDemandTons) >= 0 ? "+" : "") + (totalSupplyTons - totalDemandTons).toFixed(0) : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
              {totalDemandTons === 0 && <div className="text-[11px] text-neutral-400 mt-1">Enter demand first.</div>}
            </div>
          </DashCard>

          <DashCard icon="🎯" title="M4 · Demand-Driven Placement" description="Required vs planned chicks by month" onOpen={openDdp}>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr>
                    <th className="text-left pr-2 py-0.5 font-semibold text-neutral-400 whitespace-nowrap"></th>
                    {monthlyRows.map((r) => (
                      <th key={r.monthLabel} className="text-right px-1 py-0.5 font-semibold text-neutral-400 whitespace-nowrap">
                        {r.monthLabel.split(" ")[0]}
                      </th>
                    ))}
                    <th className="text-right pl-2 py-0.5 font-semibold text-neutral-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[var(--border-subtle)]">
                    <td className="pr-2 py-1 text-neutral-600 whitespace-nowrap">Req. Chicks</td>
                    {monthlyRows.map((r) => (
                      <td key={r.monthLabel} className="px-1 py-1 text-right tabular-nums">
                        {r.requiredChicksPlaced > 0 ? (r.requiredChicksPlaced / 1_000_000).toFixed(2) + "M" : <span className="text-neutral-300">—</span>}
                      </td>
                    ))}
                    <td className="pl-2 py-1 text-right tabular-nums font-semibold text-neutral-700">
                      {supplyRows.reduce((s, r) => s + r.requiredChicksPlaced, 0) > 0
                        ? (supplyRows.reduce((s, r) => s + r.requiredChicksPlaced, 0) / 1_000_000).toFixed(2) + "M"
                        : "—"}
                    </td>
                  </tr>
                  <tr className="border-t border-[var(--border-subtle)]">
                    <td className="pr-2 py-1 text-neutral-600 whitespace-nowrap">Placed</td>
                    {monthlyRows.map((r) => (
                      <td key={r.monthLabel} className={`px-1 py-1 text-right tabular-nums font-medium ${r.requiredChicksPlaced > 0 && r.chicksPlaced < r.requiredChicksPlaced * 0.98 ? "text-red-600" : "text-green-700"}`}>
                        {r.chicksPlaced > 0 ? (r.chicksPlaced / 1_000_000).toFixed(2) + "M" : <span className="text-neutral-300">—</span>}
                      </td>
                    ))}
                    <td className="pl-2 py-1 text-right tabular-nums font-semibold text-brand-green-dark">
                      {(runningChicks / 1_000_000).toFixed(2)}M
                    </td>
                  </tr>
                </tbody>
              </table>
              {totalRequiredCarcass === 0 && <div className="text-[11px] text-neutral-400 mt-1">Enter demand first.</div>}
            </div>
          </DashCard>

          <DashCard icon="📋" title="M5 · S&OP Report" description="Plan health for executive review" onOpen={openReport}>
            <div className="mt-2 mb-2.5">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                sopStatus === "on-track" ? "bg-green-100 text-green-800" : sopStatus === "review" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                  sopStatus === "on-track" ? "bg-green-600" : sopStatus === "review" ? "bg-amber-500" : "bg-red-500"
                }`} />
                {sopStatus === "on-track" ? "On Track" : sopStatus === "review" ? "Review Needed" : "Action Required"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className={`rounded-lg px-2.5 py-2 ${reconcileDeficitWeeks > 0 ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500 mb-0.5">Deficit Wks</div>
                <div className={`text-sm font-bold tabular-nums ${reconcileDeficitWeeks > 0 ? "text-red-700" : "text-green-700"}`}>
                  {reconcileDeficitWeeks > 0 ? `${reconcileDeficitWeeks} wk` : "None ✓"}
                </div>
              </div>
              <div className={`rounded-lg px-2.5 py-2 ${reconcileTightWeeks > 0 ? "bg-amber-50 border border-amber-200" : "bg-neutral-50 border border-[var(--border-subtle)]"}`}>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500 mb-0.5">Tight Wks</div>
                <div className={`text-sm font-bold tabular-nums ${reconcileTightWeeks > 0 ? "text-amber-700" : "text-neutral-400"}`}>
                  {reconcileTightWeeks > 0 ? `${reconcileTightWeeks} wk` : "—"}
                </div>
              </div>
              <div className={`rounded-lg px-2.5 py-2 ${m.weeksWithCapacityBreach > 0 ? "bg-red-50 border border-red-200" : "bg-neutral-50 border border-[var(--border-subtle)]"}`}>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500 mb-0.5">Over-Capacity</div>
                <div className={`text-sm font-bold tabular-nums ${m.weeksWithCapacityBreach > 0 ? "text-red-700" : "text-neutral-400"}`}>
                  {m.weeksWithCapacityBreach > 0 ? `${m.weeksWithCapacityBreach} wk` : "None ✓"}
                </div>
              </div>
              <div className={`rounded-lg px-2.5 py-2 ${totalDemandTons > 0 && sopCoverageP < 95 ? "bg-amber-50 border border-amber-200" : "bg-neutral-50 border border-[var(--border-subtle)]"}`}>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500 mb-0.5">Supply Cover</div>
                <div className={`text-sm font-bold tabular-nums ${totalDemandTons === 0 ? "text-neutral-400" : sopCoverageP >= 100 ? "text-green-700" : sopCoverageP >= 95 ? "text-amber-700" : "text-red-700"}`}>
                  {totalDemandTons > 0 ? `${sopCoverageP.toFixed(1)}%` : "—"}
                </div>
              </div>
            </div>
            {nearestAlertWeeks.length > 0 && (
              <div className="mt-2 text-[11px] text-neutral-500">
                <span className="font-semibold text-red-600">Alert: </span>
                {nearestAlertWeeks.join(" · ")}
              </div>
            )}
          </DashCard>

          <DashCard icon="🏪" title="Demand by Channel" description="CAR per channel by month" onOpen={openDemand}>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left py-1 pr-2 font-semibold text-neutral-500 whitespace-nowrap">Channel</th>
                    {monthGroups.map(({ monthLabel }) => (
                      <th key={monthLabel} className="text-right py-1 px-1.5 font-semibold text-neutral-500 whitespace-nowrap">{monthLabel}</th>
                    ))}
                    <th className="text-right py-1 pl-2 font-semibold text-neutral-500 whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {CHANNEL_KEYS.map((ch) => {
                    const monthVals = monthGroups.map(({ weeks: mw }) =>
                      (["wholeChicken", "cuts", "fpp", "eggs"] as const).reduce(
                        (s, cat) => s + toCar(cat, categoryTotal(demandProducts, demandQty, cat, ch, mw)),
                        0
                      )
                    );
                    const rowTotal = monthVals.reduce((s, v) => s + v, 0);
                    return (
                      <tr key={ch} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-neutral-50">
                        <td className="py-1 pr-2 text-neutral-600 whitespace-nowrap">{CHANNEL_LABELS[ch]}</td>
                        {monthVals.map((v, i) => (
                          <td key={i} className="py-1 px-1.5 text-right tabular-nums">
                            {v > 0 ? v.toLocaleString() : <span className="text-neutral-200">—</span>}
                          </td>
                        ))}
                        <td className="py-1 pl-2 text-right tabular-nums font-semibold text-brand-green-dark">
                          {rowTotal > 0 ? rowTotal.toLocaleString() : <span className="text-neutral-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {demandTotalCar === 0 && <div className="text-[11px] text-neutral-400 mt-1">No demand entered yet.</div>}
            </div>
          </DashCard>
        </div>
      </div>

      {/* ── Production Pipeline ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-400">Production Pipeline</h2>
          <div className="flex-1 h-px bg-neutral-200" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashCard icon="🐣" title="1 · Placement Plan" description="Daily house placements" onOpen={() => openStep(1)}>
            {/* Stat row */}
            <div className="grid grid-cols-3 gap-2 mt-2 mb-3">
              <div className="rounded-lg bg-brand-green-tint/60 px-3 py-2">
                <div className="text-[9.5px] font-semibold uppercase tracking-wider text-brand-green-dark/70 mb-0.5">Chicks Placed</div>
                <div className="text-sm font-bold text-brand-green-dark tabular-nums">{Math.round(runningChicks).toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-neutral-50 border border-[var(--border-subtle)] px-3 py-2">
                <div className="text-[9.5px] font-semibold uppercase tracking-wider text-neutral-400 mb-0.5">Active Weeks</div>
                <div className="text-sm font-bold text-neutral-700 tabular-nums">{activeWeeks} <span className="text-[10px] font-normal text-neutral-400">/ {result.placement.length}</span></div>
              </div>
              <div className="rounded-lg bg-neutral-50 border border-[var(--border-subtle)] px-3 py-2">
                <div className="text-[9.5px] font-semibold uppercase tracking-wider text-neutral-400 mb-0.5">Peak Week</div>
                <div className="text-sm font-bold text-neutral-700 tabular-nums truncate">
                  {peakPlacementRow ? weekLabel(peakPlacementRow.week, params.planStartDate) : "—"}
                </div>
              </div>
            </div>
            {/* Mini placement bar chart */}
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={placementChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} width={32} />
                  <Tooltip
                    formatter={(v) => [typeof v === "number" ? v.toLocaleString() : "", "Chicks"]}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="chicks" name="Chicks Placed" radius={[2, 2, 0, 0]}>
                    {placementChartData.map((_, i) => (
                      <Cell key={i} fill={_.chicks === 0 ? "#e5e7eb" : "#047836"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </DashCard>

          <DashCard icon="🐔" title="2 · Live Bird Forecast" description="Harvest vs. plant capacity" onOpen={() => openStep(2)}>
            <CapacityChart data={result.liveBird} planStartDate={params.planStartDate} />
          </DashCard>

          <DashCard icon="⚖️" title="3 · Carcass Yield & Grade Split" description="Grade A / B / C distribution" onOpen={() => openStep(3)}>
            <GradeChart data={result.carcass} planStartDate={params.planStartDate} />
          </DashCard>

          <DashCard icon="📦" title="4 · Product Family Allocation" description="Fresh / Frozen / FPP split" onOpen={() => openStep(4)}>
            <FamilyDonut data={result.family} />
          </DashCard>

          <DashCard icon="🍗" title="5 · FPP Cut Plan" description="Top cuts by month (t)" onOpen={() => openStep(5)}>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr>
                    <th className="text-left pr-2 py-0.5 font-semibold text-neutral-400 whitespace-nowrap">Cut</th>
                    {monthGroups.map(({ monthLabel }) => (
                      <th key={monthLabel} className="text-right px-1 py-0.5 font-semibold text-neutral-400 whitespace-nowrap">
                        {monthLabel.split(" ")[0]}
                      </th>
                    ))}
                    <th className="text-right pl-2 py-0.5 font-semibold text-neutral-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyTopCuts.map((cut, i) => (
                    <tr key={cut.key} className="border-t border-[var(--border-subtle)]">
                      <td className="pr-2 py-1 text-neutral-600 whitespace-nowrap">
                        <span className="text-brand-gold font-semibold mr-1">#{i + 1}</span>
                        {cut.label}
                      </td>
                      {cut.byMonth.map(({ monthLabel, kgVal }) => (
                        <td key={monthLabel} className="px-1 py-1 text-right tabular-nums text-neutral-700">
                          {kgVal > 0 ? (kgVal / 1000).toFixed(0) : <span className="text-neutral-300">—</span>}
                        </td>
                      ))}
                      <td className="pl-2 py-1 text-right tabular-nums font-semibold text-brand-green-dark">
                        {(cut.total / 1000).toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashCard>

          <DashCard icon="🏭" title="6 · Processing Plan by Plant" description="Monthly utilization % by plant" onOpen={() => openStep(6)}>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr>
                    <th className="text-left pr-2 py-0.5 font-semibold text-neutral-400 whitespace-nowrap">Plant</th>
                    {monthGroups.map(({ monthLabel }) => (
                      <th key={monthLabel} className="text-right px-1 py-0.5 font-semibold text-neutral-400 whitespace-nowrap">
                        {monthLabel.split(" ")[0]}
                      </th>
                    ))}
                    <th className="text-right pl-2 py-0.5 font-semibold text-neutral-400">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyPlantUtil.map((p) => (
                    <tr key={p.plant} className="border-t border-[var(--border-subtle)]">
                      <td className="pr-2 py-1 text-neutral-600 whitespace-nowrap">{PLANT_LABELS[p.plant]}</td>
                      {p.byMonth.map(({ monthLabel, pct }) => (
                        <td key={monthLabel} className={`px-1 py-1 text-right tabular-nums font-medium ${pct > 100 ? "text-red-600" : pct > 80 ? "text-amber-600" : pct > 0 ? "text-neutral-700" : "text-neutral-300"}`}>
                          {pct > 0 ? `${pct.toFixed(0)}%` : "—"}
                        </td>
                      ))}
                      <td className="pl-2 py-1 text-right tabular-nums font-semibold text-neutral-700">
                        {plantUtilization.find((u) => u.plant === p.plant)!.pct.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashCard>
        </div>
      </div>
    </div>

      {guideOpen && <UserGuideModal onClose={() => setGuideOpen(false)} />}
    </>
  );
}

"use client";

import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";
import { activeCutKeys, computeSummaryMetrics } from "@/lib/calculations";
import { CHANNEL_KEYS, CHANNEL_LABELS, CUT_LABELS, EGG_TRAYS_PER_CARTON, PLANT_LABELS, PRODUCT_CATEGORY_LABELS } from "@/lib/defaults";
import { categoryTotal } from "@/lib/demandPlan";
import { computeSupplyRequirements } from "@/lib/supplyRequirements";
import { SummaryCard } from "./shared/SummaryCard";
import { CapacityChart } from "./charts/CapacityChart";
import { GradeChart } from "./charts/GradeChart";
import { FamilyDonut } from "./charts/FamilyDonut";
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
  const reconcileDeficitWeeks = horizonWeeks.filter((w) => {
    const fam = result.family.find((r) => r.week === w);
    const cuts = result.cuts.find((r) => r.week === w);
    const wc = categoryTotal(demandProducts, demandQty, "wholeChicken", "ALL", [w]);
    const fpp = categoryTotal(demandProducts, demandQty, "fpp", "ALL", [w]);
    const cutsD = categoryTotal(demandProducts, demandQty, "cuts", "ALL", [w]);
    const wcS = fam ? (fam.wcFreshKg + fam.wcFrozenKg) / 1000 : 0;
    const fppS = fam ? fam.fppKg / 1000 : 0;
    const cutsS = cuts ? cuts.totalKg / 1000 : 0;
    return (wc > 0 && wcS - wc < -wc * 0.02) || (fpp > 0 && fppS - fpp < -fpp * 0.02) || (cutsD > 0 && cutsS - cutsD < -cutsD * 0.02);
  }).length;

  const supplyRows = computeSupplyRequirements(demandProducts, demandQty, params, result, horizonWeeks);
  const supplyDeficitWeeks = supplyRows.filter((r) => r.carcassGapKg < -r.requiredCarcassKg * 0.02 && r.requiredCarcassKg > 0).length;
  const totalRequiredCarcass = supplyRows.reduce((s, r) => s + r.requiredCarcassKg, 0);

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
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SummaryCard label="Chicks Placed" value={Math.round(runningChicks).toLocaleString()} accent="green" icon="🐣" />
        <SummaryCard label="Harvestable Birds" value={Math.round(m.totalHarvestableBirds).toLocaleString()} icon="🐔" />
        <SummaryCard label="Total Carcass" value={`${kg(m.totalCarcassKg)} kg`} accent="gold" icon="⚖️" />
        <SummaryCard
          label="Total Production"
          value={`${kg(m.totalWcFreshKg + m.totalWcFrozenKg + m.totalFppKg)} kg`}
          icon="📦"
        />
        <SummaryCard label="Total Demand" value={`${demandTotalCar.toLocaleString()} CAR`} icon="📊" />
        <SummaryCard
          label="Weeks Over Capacity"
          value={String(m.weeksWithCapacityBreach)}
          accent={m.weeksWithCapacityBreach > 0 ? "alert" : "neutral"}
          icon="⚠️"
        />
      </div>

      {/* ── S&OP Modules ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-brand-green-dark">S&amp;OP Modules</h2>
          <div className="flex-1 h-px bg-brand-green/20" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashCard icon="📊" title="M1 · Demand Plan" description="Weekly demand by product × channel" onOpen={openDemand}>
            <div className="mt-2 space-y-1.5">
              {(["wholeChicken", "cuts", "fpp", "eggs"] as const).map((cat) => {
                const qty = categoryTotal(demandProducts, demandQty, cat, "ALL", horizonWeeks);
                const car = toCar(cat, qty);
                return (
                  <div key={cat} className="flex items-center justify-between text-xs">
                    <span className="text-neutral-600">{PRODUCT_CATEGORY_LABELS[cat]}</span>
                    <span className="font-semibold tabular-nums">
                      {car > 0 ? `${car.toLocaleString()} CAR` : <span className="text-neutral-300">—</span>}
                    </span>
                  </div>
                );
              })}
              {demandTotalTon === 0 && <div className="text-[11px] text-neutral-400 mt-1">No demand entered yet.</div>}
            </div>
          </DashCard>

          <DashCard icon="🔗" title="M2 · Supply Requirements" description="Reverse BOM: demand → carcass → chicks" onOpen={openSupply}>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">Required carcass</span>
                <span className="font-semibold tabular-nums">{totalRequiredCarcass > 0 ? `${Math.round(totalRequiredCarcass / 1000).toLocaleString()} t` : <span className="text-neutral-300">—</span>}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">Planned supply</span>
                <span className="font-semibold tabular-nums">{`${Math.round(m.totalCarcassKg / 1000).toLocaleString()} t`}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">Deficit weeks</span>
                <span className={`font-semibold tabular-nums ${supplyDeficitWeeks > 0 ? "text-red-600" : "text-green-700"}`}>
                  {supplyDeficitWeeks > 0 ? `${supplyDeficitWeeks} wk` : "None"}
                </span>
              </div>
              {totalRequiredCarcass === 0 && <div className="text-[11px] text-neutral-400">Enter demand first.</div>}
            </div>
          </DashCard>

          <DashCard icon="⇌" title="M3 · Reconciliation" description="Demand vs supply gap by category" onOpen={openReconcile}>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">Total demand</span>
                <span className="font-semibold tabular-nums">{totalDemandTons > 0 ? `${totalDemandTons.toFixed(0)} t` : <span className="text-neutral-300">—</span>}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">Total supply</span>
                <span className="font-semibold tabular-nums">{`${totalSupplyTons.toFixed(0)} t`}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">Deficit weeks</span>
                <span className={`font-semibold tabular-nums ${reconcileDeficitWeeks > 0 ? "text-red-600" : "text-green-700"}`}>
                  {reconcileDeficitWeeks > 0 ? `${reconcileDeficitWeeks} wk` : "None"}
                </span>
              </div>
              {totalDemandTons === 0 && <div className="text-[11px] text-neutral-400">Enter demand first.</div>}
            </div>
          </DashCard>

          <DashCard icon="🎯" title="M4 · Demand-Driven Placement" description="Write demand requirements into placement calendar" onOpen={openDdp}>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">Required chicks</span>
                <span className="font-semibold tabular-nums">
                  {supplyRows.reduce((s, r) => s + r.requiredChicksPlaced, 0) > 0
                    ? Math.round(supplyRows.reduce((s, r) => s + r.requiredChicksPlaced, 0)).toLocaleString()
                    : <span className="text-neutral-300">—</span>}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">Actionable weeks</span>
                <span className="font-semibold tabular-nums">
                  {supplyRows.filter((r) => r.placementWeek > 0 && r.requiredChicksPlaced > 0).length}
                </span>
              </div>
              {totalRequiredCarcass === 0 && <div className="text-[11px] text-neutral-400">Enter demand first.</div>}
            </div>
          </DashCard>

          <DashCard icon="📋" title="M5 · S&OP Report" description="Traffic-light weekly review for S&OP meetings" onOpen={openReport}>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">Deficit weeks</span>
                <span className={`font-semibold tabular-nums ${reconcileDeficitWeeks > 0 ? "text-red-600" : "text-green-700"}`}>
                  {reconcileDeficitWeeks > 0 ? `${reconcileDeficitWeeks} wk` : "None"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">Planning horizon</span>
                <span className="font-semibold tabular-nums">{params.planningHorizonWeeks} weeks</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600">Export</span>
                <span className="font-semibold text-brand-green-dark">PDF · Print</span>
              </div>
            </div>
          </DashCard>

          <DashCard icon="🏪" title="Demand by Channel" description="Total CAR per sales channel" onOpen={openDemand}>
            <div className="mt-2 space-y-1.5">
              {channelDemand.map(({ ch, car }) => (
                <div key={ch} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 text-neutral-600 whitespace-nowrap">{CHANNEL_LABELS[ch]}</span>
                  <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
                    <div className="h-full rounded-full bg-brand-green" style={{ width: `${(car / channelMax) * 100}%` }} />
                  </div>
                  <span className="w-20 text-right font-semibold tabular-nums shrink-0">
                    {car > 0 ? `${car.toLocaleString()} CAR` : <span className="text-neutral-300">—</span>}
                  </span>
                </div>
              ))}
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
        </div>
      </div>
    </div>
  );
}

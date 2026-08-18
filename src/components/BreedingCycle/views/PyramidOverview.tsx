"use client";
/**
 * PyramidOverview — SVG breeding chain flow diagram + weekly gap summary cards.
 *
 * Displays the full chain: GP Rearing → GP Laying → GP Hatchery → PS → AWP Hatchery → Broiler
 * Each tier node shows: supply, demand, gap, color-coded status.
 * A week selector lets the planner inspect any week in the horizon.
 */

import React, { useState, useMemo } from "react";
import type { BreedingCycleResult } from "@/lib/breedingCycleTypes";
import { bceWeekStart } from "@/lib/breedingCycleEngine";
import type { BreedingParams } from "@/lib/types";
import type { BioChainAssumptions, BioChainGpFlock } from "@/lib/biologicalChain/types";

const N = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const Nk = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : N.format(v);

interface Props {
  cycleResult: BreedingCycleResult;
  horizonWeeks: number;
  planStartDate: string;
  breedingParams: BreedingParams;
  bioChainAssumptions: BioChainAssumptions;
  bioChainGpFlocks: BioChainGpFlock[];
}

// ─── Status helpers ───────────────────────────────────────────────────────────

type Status = "surplus" | "balanced" | "shortage" | "empty";

function gapStatus(supply: number, demand: number): Status {
  if (demand === 0 && supply === 0) return "empty";
  if (demand === 0) return "surplus";
  const ratio = supply / demand;
  if (ratio >= 1.02) return "surplus";
  if (ratio >= 0.98) return "balanced";
  return "shortage";
}

const STATUS_COLORS: Record<Status, { bg: string; border: string; text: string; badge: string; badgeBg: string }> = {
  surplus:  { bg: "#f0fdf4", border: "#86efac", text: "#15803d", badge: "Surplus",  badgeBg: "#dcfce7" },
  balanced: { bg: "#fefce8", border: "#fde047", text: "#a16207", badge: "Balanced", badgeBg: "#fef9c3" },
  shortage: { bg: "#fff1f2", border: "#fca5a5", text: "#dc2626", badge: "Shortage", badgeBg: "#fee2e2" },
  empty:    { bg: "#f9fafb", border: "#e5e7eb", text: "#9ca3af", badge: "—",        badgeBg: "#f3f4f6" },
};

// ─── Tier box component ───────────────────────────────────────────────────────

function TierBox({
  label, plant, supply, demand, unit, color,
}: {
  label: string;
  plant: string;
  supply: number;
  demand: number;
  unit: string;
  color: string;
}) {
  const gap    = supply - demand;
  const status = gapStatus(supply, demand);
  const sc     = STATUS_COLORS[status];

  return (
    <div
      className="rounded-xl border-2 p-3 w-52 text-xs shadow-sm flex-shrink-0"
      style={{ background: sc.bg, borderColor: sc.border }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(4,120,54,0.12)", color: "#035c29" }}
          >
            {plant}
          </span>
          <span className="font-bold text-neutral-800 text-[11px] truncate">{label}</span>
        </div>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: sc.badgeBg, color: sc.text }}
        >
          {sc.badge}
        </span>
      </div>

      {/* Metrics */}
      <div className="space-y-0.5 tabular-nums">
        <div className="flex justify-between">
          <span className="text-neutral-500">Supply</span>
          <span className="font-semibold" style={{ color }}>{Nk(supply)} {unit}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Demand</span>
          <span className="font-semibold text-neutral-700">{Nk(demand)} {unit}</span>
        </div>
        <div className="flex justify-between pt-0.5 border-t border-neutral-200">
          <span className="text-neutral-500">Gap</span>
          <span className="font-bold" style={{ color: sc.text }}>
            {gap >= 0 ? "+" : ""}{Nk(gap)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Arrow connector ──────────────────────────────────────────────────────────

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-px h-4 bg-neutral-300" />
      <span className="text-[9px] text-neutral-400 font-medium bg-white px-1 border border-neutral-200 rounded my-0.5 whitespace-nowrap">
        {label}
      </span>
      <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
        <path d="M6 8L0 0h12L6 8z" fill="#d1d5db"/>
      </svg>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PyramidOverview({ cycleResult, horizonWeeks, planStartDate, breedingParams, bioChainAssumptions, bioChainGpFlocks }: Props) {
  const [selectedWeek, setSelectedWeek] = useState(1);

  const weekStart = useMemo(() => bceWeekStart(planStartDate, selectedWeek), [planStartDate, selectedWeek]);

  // Data for selected week
  const gpEggs      = cycleResult.gpEggsSupply.get(selectedWeek) ?? 0;
  const gpEggsDemand = 0; // Demand for GP eggs isn't directly in this result — placeholder
  const psData      = cycleResult.psEggsByWeek.get(selectedWeek);
  const psEggs      = psData?.total ?? 0;
  const broilerData = cycleResult.broilerDOCSupply.get(selectedWeek);
  const broilerSupply = broilerData?.total ?? 0;
  const broilerDemand = cycleResult.broilerDOCDemand.get(selectedWeek) ?? 0;
  const cobbDOC     = cycleResult.cobbPsDOCByWeek.get(selectedWeek) ?? 0;

  // GP Rearing (3300): count of GP females currently in rearing at the selected week
  // A GP flock is in rearing if selectedWeek >= placementWeek && selectedWeek < (placementWeek + gpRearingWeeks)
  const gpRearingFemales = useMemo(() => {
    const gpRearWks  = breedingParams.gpRearingWeeks ?? 25;
    const gpRearMort = breedingParams.gpRearingMortality ?? 0.04;
    return bioChainGpFlocks.reduce((sum, f) => {
      const pw = f.placementWeek;
      if (selectedWeek >= pw && selectedWeek < pw + gpRearWks) {
        const weeksIn = selectedWeek - pw;
        const survivalFrac = 1 - (gpRearMort * weeksIn) / Math.max(gpRearWks, 1);
        return sum + f.femaleCount * Math.max(0, survivalFrac);
      }
      return sum;
    }, 0);
  }, [bioChainGpFlocks, selectedWeek, breedingParams.gpRearingWeeks, breedingParams.gpRearingMortality]);

  // PS Rearing (1230): count of PS females currently in rearing at the selected week
  // A cohort is in rearing if selectedWeek >= docArrivalWeek && selectedWeek < layStartWeek
  const psRearingFemales = useMemo(() => {
    const psRearMort = breedingParams.psRearingMortality ?? 0.04;
    const psRearWks  = breedingParams.psRearingWeeks     ?? 25;
    return cycleResult.psCohorts.reduce((sum, c) => {
      if (selectedWeek >= c.docArrivalWeek && selectedWeek < c.layStartWeek) {
        const weeksIn = selectedWeek - c.docArrivalWeek;
        const survivalFrac = 1 - (psRearMort * weeksIn) / Math.max(psRearWks, 1);
        return sum + c.docFemaleCount * Math.max(0, survivalFrac);
      }
      return sum;
    }, 0);
  }, [cycleResult.psCohorts, selectedWeek, breedingParams.psRearingMortality, breedingParams.psRearingWeeks]);

  // Weekly summary across plan horizon
  const weeklyGaps = useMemo(() => {
    const gaps: { week: number; gap: number; demand: number }[] = [];
    for (let w = 1; w <= horizonWeeks; w++) {
      const supply = cycleResult.broilerDOCSupply.get(w)?.total ?? 0;
      const demand = cycleResult.broilerDOCDemand.get(w) ?? 0;
      if (demand > 0 || supply > 0) {
        gaps.push({ week: w, gap: supply - demand, demand });
      }
    }
    return gaps;
  }, [cycleResult, horizonWeeks]);

  const shortageWeeks = weeklyGaps.filter((g) => g.gap < 0).length;
  const surplusWeeks  = weeklyGaps.filter((g) => g.gap > 0 && g.demand > 0).length;
  const totalSupply   = [...cycleResult.broilerDOCSupply.values()].reduce((s, v) => s + v.total, 0);
  const totalDemand   = [...cycleResult.broilerDOCDemand.values()].reduce((s, v) => s + v, 0);
  const activeOrders  = cycleResult.psCohorts.filter((c) => c.breed === "ross").length;

  return (
    <div className="p-6 space-y-6">
      {/* ── Summary KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Broiler DOC Supply", value: Nk(totalSupply), color: "green" as const },
          { label: "Broiler DOC Demand", value: Nk(totalDemand), color: "neutral" as const },
          { label: "Shortage Weeks",     value: String(shortageWeeks), color: shortageWeeks > 0 ? "alert" as const : "neutral" as const },
          { label: "Ross PS Orders",     value: String(activeOrders), color: "gold" as const },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="border border-[var(--border-subtle)] rounded-xl px-4 py-3 bg-white"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">{label}</div>
            <div
              className="text-2xl font-bold tabular-nums"
              style={{ color: color === "green" ? "#047836" : color === "gold" ? "#c49a1a" : color === "alert" ? "#d24918" : "#374151" }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Week selector + pyramid diagram ── */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Pyramid flow */}
        <div className="bg-white border border-[var(--border-subtle)] rounded-xl p-6 flex flex-col items-center">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-xs font-semibold text-neutral-600">Inspect week:</span>
            <input
              type="range"
              min={1}
              max={horizonWeeks}
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="w-40 accent-brand-green"
            />
            <span className="text-xs font-bold text-brand-green tabular-nums w-28">
              W{selectedWeek} · {weekStart}
            </span>
          </div>

          <div className="flex flex-col items-center">
            <TierBox label="GP Rearing"   plant="3300" supply={gpRearingFemales} demand={0} unit="hens" color="#92400e" />
            <Arrow label="rearing → laying" />
            <TierBox label="GP Laying"    plant="3200" supply={gpEggs}    demand={gpEggsDemand} unit="eggs" color="#92400e" />
            <Arrow label={`${bioChainAssumptions.eggCollectionLeadWeeks ?? 1}+${breedingParams.incubationWeeks} wks`} />

            {/* GP Hatchery — hatches GP eggs into Cobb PS DOC */}
            <TierBox label="GP Hatchery"  plant="3100" supply={cobbDOC}   demand={0}  unit="F DOC" color="#92400e" />
            <Arrow label={`${breedingParams.gpProcurementLeadWeeks ?? 52} wks procurement lead`} />

            {/* PS Rearing — Cobb PS DOC grows for ~25 wks before moving to laying */}
            <TierBox label="PS Rearing"   plant="1230" supply={psRearingFemales} demand={0} unit="hens" color="#1d4ed8" />
            <Arrow label={`${breedingParams.psRearingWeeks ?? 25} wks rearing → laying`} />

            {/* PS Laying row — Cobb + Ross side by side */}
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center">
                <div className="text-[9px] font-bold text-blue-700 mb-1 uppercase tracking-wide">Cobb PS</div>
                <TierBox label="PS Laying"  plant="1220" supply={psData?.cobb ?? 0} demand={0}  unit="eggs" color="#1d4ed8" />
              </div>
              {activeOrders > 0 && (
                <div className="flex flex-col items-center">
                  <div className="text-[9px] font-bold text-blue-700 mb-1 uppercase tracking-wide">Ross PS</div>
                  <TierBox label="PS Laying"  plant="1220" supply={psData?.ross ?? 0} demand={0}  unit="eggs" color="#1d4ed8" />
                </div>
              )}
            </div>
            <Arrow label={`egg collect + ${breedingParams.incubationWeeks} wks incubation`} />

            {/* AWP Hatchery — hatches PS eggs into Broiler DOC */}
            <TierBox label="AWP Hatchery"  plant="1210" supply={broilerSupply} demand={broilerDemand} unit="DOC" color="#047836" />
            <Arrow label="grow-out 6 wks" />
            <TierBox label="Broiler Farms" plant="1200" supply={broilerSupply} demand={broilerDemand} unit="birds" color="#047836" />
          </div>
        </div>

        {/* Weekly gap chart (text bars) */}
        <div className="flex-1 bg-white border border-[var(--border-subtle)] rounded-xl p-5 overflow-auto">
          <div className="text-xs font-semibold text-neutral-700 mb-3">
            Broiler DOC — weekly supply vs demand (Wk 1–{horizonWeeks})
          </div>
          <div className="space-y-1 text-[10px]">
            {weeklyGaps.length === 0 ? (
              <div className="text-neutral-400 text-center py-8">No catching plan entered yet — add placement days to see demand.</div>
            ) : (
              weeklyGaps.slice(0, 52).map(({ week, gap, demand }) => {
                const supply = gap + demand;
                const pct = demand > 0 ? Math.min((supply / demand) * 100, 200) : 0;
                return (
                  <div key={week} className={`flex items-center gap-2 rounded px-2 py-0.5 ${week === selectedWeek ? "bg-brand-green-tint" : "hover:bg-neutral-50"} cursor-pointer`}
                    onClick={() => setSelectedWeek(week)}
                  >
                    <span className="w-10 text-neutral-500 shrink-0 tabular-nums">W{week}</span>
                    <div className="flex-1 h-3 bg-neutral-100 rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-all"
                        style={{
                          width: `${pct}%`,
                          background: gap >= 0 ? "#047836" : "#d24918",
                        }}
                      />
                    </div>
                    <span className={`w-16 text-right tabular-nums font-medium shrink-0 ${gap < 0 ? "text-red-600" : "text-green-700"}`}>
                      {gap >= 0 ? "+" : ""}{Nk(gap)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Assumptions reminder ── */}
      <div className="border border-amber-200 rounded-lg px-4 py-3 bg-amber-50 text-xs text-amber-800">
        <span className="font-semibold">⚠ Placeholder parameters in use.</span>
        {" "}GP procurement lead: {breedingParams.gpProcurementLeadWeeks ?? 52} wks · PS rearing: {breedingParams.psRearingWeeks ?? 25} wks ·
        {" "}GP rearing mort: {((breedingParams.gpRearingMortality ?? 0.04) * 100).toFixed(0)}% · AWP cull: {((breedingParams.hatcheryCullPct ?? 0.02) * 100).toFixed(0)}%.
        {" "}Verify these with AWP flock records. Edit under <strong>Assumptions → Breeding Cycle</strong>.
      </div>
    </div>
  );
}

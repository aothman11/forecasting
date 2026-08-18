"use client";
/**
 * ScenarioView — Backward-chain scenario comparison.
 *
 * Demand (catching plan) is held fixed. The user tweaks BioChainAssumptions
 * for the scenario. Both base and scenario run through computeBioChain() so
 * the comparison shows exactly how much MORE upstream procurement is needed
 * (GP DOC, PS DOC, peak flock sizes) under the alternative assumptions.
 *
 * Comparison metrics come from BioChainResult:
 *   gpRearing       → GP DOC orders required per week
 *   gpLaying        → peak GP hen-weeks
 *   awpPsRearing    → PS DOC required per week
 *   awpPsLaying     → peak PS hen-weeks
 *   totalLeadWeeks  → total chain length
 */

import React, { useMemo, useState } from "react";
import { usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import { computeBioChain, totalLeadWeeks } from "@/lib/biologicalChain/calculations";
import type { CatchingPlanWeek } from "@/lib/biologicalChain/types";
import type { BreedingScenario } from "@/lib/breedingCycleTypes";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const N  = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const Nk = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M`
  : v >= 1_000   ? `${(v / 1_000).toFixed(1)}k`
  : N.format(Math.round(v));

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const deltaPct = (base: number, scen: number): string => {
  if (base === 0) return "—";
  const d = ((scen - base) / base) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Slider row ───────────────────────────────────────────────────────────────

function SliderRow({
  label, value, min, max, step, format, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-neutral-600 w-44 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-brand-green h-1.5"
      />
      <span className="text-xs font-semibold tabular-nums text-neutral-800 w-14 text-right">
        {format(value)}
      </span>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, base, scenario, unit, invert,
}: {
  label: string;
  base: number;
  scenario: number;
  unit?: string;
  invert?: boolean; // true = lower is better
}) {
  const delta = scenario - base;
  const worse = invert ? delta > 0 : delta < 0;
  const dColor = delta === 0 ? "#6b7280" : worse ? "#d24918" : "#047836";

  return (
    <div className="bg-white border border-[var(--border-subtle)] rounded-xl px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-2">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[10px] text-neutral-400 mb-0.5">Base</div>
          <div className="text-base font-bold tabular-nums text-neutral-800">{Nk(base)}{unit ? ` ${unit}` : ""}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-neutral-400 mb-0.5">Scenario</div>
          <div className="text-base font-bold tabular-nums text-neutral-800">{Nk(scenario)}{unit ? ` ${unit}` : ""}</div>
        </div>
      </div>
      {delta !== 0 && (
        <div className="mt-2 pt-1.5 border-t border-neutral-100 text-[11px] font-semibold" style={{ color: dColor }}>
          {delta > 0 ? "+" : ""}{Nk(delta)}{unit ? ` ${unit}` : ""} ({deltaPct(base, scenario)})
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScenarioView() {
  const baseAssumptions         = usePlanStore((s) => s.bioChainAssumptions);
  const breedingScenarios       = usePlanStore((s) => s.breedingScenarios);
  const saveBreedingScenario    = usePlanStore((s) => s.saveBreedingScenario);
  const deleteBreedingScenario  = usePlanStore((s) => s.deleteBreedingScenario);
  const { result }              = usePipeline();

  // ── Build catching plan (same as BiologicalChainPage) ───────────────────────
  const catchingPlan: CatchingPlanWeek[] = useMemo(
    () => result.liveBird.map((lb) => ({
      week:         lb.week,
      weekStart:    lb.harvestDateStart,
      birds:        Math.round(lb.harvestableBirds),
      liveWeightKg: Math.round(lb.totalLiveWeightKg ?? 0),
      byPlant:      {},
    })),
    [result.liveBird],
  );

  // ── Scenario sliders (lazy-initialised from base assumptions) ────────────────
  const [psRearWks,  setPsRearWks]  = useState(() => baseAssumptions.psRearingWeeks);
  const [psRearMort, setPsRearMort] = useState(() => baseAssumptions.psRearingMortality);
  const [gpRearWks,  setGpRearWks]  = useState(() => baseAssumptions.gpRearingWeeks);
  const [gpRearMort, setGpRearMort] = useState(() => baseAssumptions.gpRearingMortality);
  const [hatchPs,    setHatchPs]    = useState(() => baseAssumptions.hatchabilityPs);
  const [hatchGp,    setHatchGp]    = useState(() => baseAssumptions.hatchabilityGp);
  const [scenName,   setScenName]   = useState("Scenario A");

  // Reset sliders back to base assumptions
  function resetToBase() {
    setPsRearWks(baseAssumptions.psRearingWeeks);
    setPsRearMort(baseAssumptions.psRearingMortality);
    setGpRearWks(baseAssumptions.gpRearingWeeks);
    setGpRearMort(baseAssumptions.gpRearingMortality);
    setHatchPs(baseAssumptions.hatchabilityPs);
    setHatchGp(baseAssumptions.hatchabilityGp);
  }

  // Load a saved scenario into sliders
  function loadScenario(s: BreedingScenario) {
    setPsRearWks(s.psRearingWeeks);
    setPsRearMort(s.psRearingMortality);
    setGpRearWks(s.gpRearingWeeks);
    setGpRearMort(s.gpRearingMortality);
    setHatchPs(s.hatchabilityPs);
    setHatchGp(s.hatchabilityGp);
    setScenName(s.name + " (copy)");
  }

  // ── Build scenario assumptions ───────────────────────────────────────────────
  const scenarioAssumptions = useMemo(() => ({
    ...baseAssumptions,
    psRearingWeeks:    psRearWks,
    psRearingMortality: psRearMort,
    gpRearingWeeks:    gpRearWks,
    gpRearingMortality: gpRearMort,
    hatchabilityPs:    hatchPs,
    hatchabilityGp:    hatchGp,
  }), [baseAssumptions, psRearWks, psRearMort, gpRearWks, gpRearMort, hatchPs, hatchGp]);

  // ── Run backward chains ──────────────────────────────────────────────────────
  const baseChain     = useMemo(() => computeBioChain(catchingPlan, baseAssumptions),     [catchingPlan, baseAssumptions]);
  const scenarioChain = useMemo(() => computeBioChain(catchingPlan, scenarioAssumptions), [catchingPlan, scenarioAssumptions]);

  // ── Detect if scenario differs from base ─────────────────────────────────────
  const isUnchanged =
    psRearWks  === baseAssumptions.psRearingWeeks    &&
    psRearMort === baseAssumptions.psRearingMortality &&
    gpRearWks  === baseAssumptions.gpRearingWeeks    &&
    gpRearMort === baseAssumptions.gpRearingMortality &&
    hatchPs    === baseAssumptions.hatchabilityPs    &&
    hatchGp    === baseAssumptions.hatchabilityGp;

  // ── KPI aggregates ───────────────────────────────────────────────────────────
  const baseGpDoc     = baseChain.gpRearing.reduce((s, r) => s + r.docPlaced, 0);
  const scenGpDoc     = scenarioChain.gpRearing.reduce((s, r) => s + r.docPlaced, 0);
  const basePsDoc     = baseChain.awpPsRearing.reduce((s, r) => s + r.docPlaced, 0);
  const scenPsDoc     = scenarioChain.awpPsRearing.reduce((s, r) => s + r.docPlaced, 0);
  const basePeakGp    = Math.max(0, ...baseChain.gpLaying.map((r) => r.activeHens));
  const scenPeakGp    = Math.max(0, ...scenarioChain.gpLaying.map((r) => r.activeHens));
  const baseLeadWks   = totalLeadWeeks(baseAssumptions);
  const scenLeadWks   = totalLeadWeeks(scenarioAssumptions);

  // ── Build weekly GP Rearing comparison table ─────────────────────────────────
  const gpRearingRows = useMemo(() => {
    const baseMap = new Map(baseChain.gpRearing.map((r) => [r.week, r]));
    const scenMap = new Map(scenarioChain.gpRearing.map((r) => [r.week, r]));
    const weeks = new Set([...baseMap.keys(), ...scenMap.keys()]);
    return [...weeks]
      .sort((a, b) => a - b)
      .map((w) => {
        const b = baseMap.get(w);
        const s = scenMap.get(w);
        const baseDoc = b?.docPlaced ?? 0;
        const scenDoc = s?.docPlaced ?? 0;
        return {
          week:     w,
          weekStart: b?.weekStart ?? s?.weekStart ?? "—",
          baseDoc,
          scenDoc,
          delta:    scenDoc - baseDoc,
        };
      });
  }, [baseChain.gpRearing, scenarioChain.gpRearing]);

  // ── Save current scenario ────────────────────────────────────────────────────
  function handleSave() {
    const name = scenName.trim() || "Scenario";
    saveBreedingScenario({
      id:                 uid(),
      name,
      createdAt:          new Date().toISOString().slice(0, 10),
      psRearingWeeks:     psRearWks,
      psRearingMortality: psRearMort,
      gpRearingWeeks:     gpRearWks,
      gpRearingMortality: gpRearMort,
      hatchabilityPs:     hatchPs,
      hatchabilityGp:     hatchGp,
    });
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── Intro banner ── */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
        <span className="font-semibold">Backward-chain scenario comparison.</span>
        {" "}Demand (catching plan) is fixed. Adjust assumptions below to see how upstream procurement
        requirements change — how many more GP or PS birds must be ordered, and how the total
        supply-chain lead time shifts.
      </div>

      {/* ── KPI comparison strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total GP DOC to order"  base={baseGpDoc}   scenario={scenGpDoc}   unit="birds" invert />
        <KpiCard label="Peak GP hens in lay"     base={basePeakGp}  scenario={scenPeakGp}  unit="hens"  invert />
        <KpiCard label="Total PS DOC to order"  base={basePsDoc}   scenario={scenPsDoc}   unit="birds" invert />
        <KpiCard label="Total chain lead time"   base={baseLeadWks} scenario={scenLeadWks} unit="wks"   invert />
      </div>

      {/* ── Main content: adjustments + saved scenarios ── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Scenario adjustment panel */}
        <div className="bg-white border border-[var(--border-subtle)] rounded-xl p-5 flex-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-800">Scenario adjustments</h3>
            {!isUnchanged && (
              <button
                onClick={resetToBase}
                className="text-xs text-neutral-400 hover:text-neutral-600 hover:underline"
              >
                Reset to base ↺
              </button>
            )}
          </div>

          <div className="divide-y divide-neutral-100">
            <div className="pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">PS chain</p>
              <SliderRow label="PS rearing weeks"      value={psRearWks}  min={10} max={40} step={1}    format={(v) => `${v} wks`} onChange={setPsRearWks}  />
              <SliderRow label="PS rearing mortality"  value={psRearMort} min={0}  max={0.15} step={0.005} format={pct}            onChange={setPsRearMort} />
              <SliderRow label="PS hatchability (AWP)" value={hatchPs}    min={0.6} max={0.95} step={0.01} format={pct}           onChange={setHatchPs}    />
            </div>
            <div className="pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">GP chain</p>
              <SliderRow label="GP rearing weeks"      value={gpRearWks}  min={15} max={40} step={1}    format={(v) => `${v} wks`} onChange={setGpRearWks}  />
              <SliderRow label="GP rearing mortality"  value={gpRearMort} min={0}  max={0.15} step={0.005} format={pct}            onChange={setGpRearMort} />
              <SliderRow label="GP hatchability"       value={hatchGp}    min={0.6} max={0.95} step={0.01} format={pct}           onChange={setHatchGp}    />
            </div>
          </div>

          {/* Base vs scenario param diff summary */}
          {!isUnchanged && (
            <div className="mt-4 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500 space-y-0.5">
              {psRearWks  !== baseAssumptions.psRearingWeeks    && <div>PS rearing: {baseAssumptions.psRearingWeeks} → <strong>{psRearWks} wks</strong></div>}
              {psRearMort !== baseAssumptions.psRearingMortality && <div>PS mortality: {pct(baseAssumptions.psRearingMortality)} → <strong>{pct(psRearMort)}</strong></div>}
              {hatchPs    !== baseAssumptions.hatchabilityPs    && <div>PS hatchability: {pct(baseAssumptions.hatchabilityPs)} → <strong>{pct(hatchPs)}</strong></div>}
              {gpRearWks  !== baseAssumptions.gpRearingWeeks    && <div>GP rearing: {baseAssumptions.gpRearingWeeks} → <strong>{gpRearWks} wks</strong></div>}
              {gpRearMort !== baseAssumptions.gpRearingMortality && <div>GP mortality: {pct(baseAssumptions.gpRearingMortality)} → <strong>{pct(gpRearMort)}</strong></div>}
              {hatchGp    !== baseAssumptions.hatchabilityGp    && <div>GP hatchability: {pct(baseAssumptions.hatchabilityGp)} → <strong>{pct(hatchGp)}</strong></div>}
            </div>
          )}

          {/* Save */}
          <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center gap-2">
            <input
              type="text"
              value={scenName}
              onChange={(e) => setScenName(e.target.value)}
              placeholder="Scenario name"
              className="flex-1 text-xs border border-[var(--border-subtle)] rounded-md px-2 py-1.5 focus:outline-none focus:border-brand-green"
            />
            <button
              onClick={handleSave}
              disabled={isUnchanged}
              className="text-xs px-3 py-1.5 rounded-md border border-brand-green text-brand-green-dark hover:bg-brand-green-tint disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Save scenario
            </button>
          </div>
        </div>

        {/* Saved scenarios panel */}
        <div className="bg-white border border-[var(--border-subtle)] rounded-xl p-5 w-full lg:w-72 shrink-0">
          <h3 className="text-sm font-semibold text-neutral-800 mb-3">Saved scenarios</h3>
          {breedingScenarios.length === 0 ? (
            <p className="text-xs text-neutral-400 text-center py-6">
              No saved scenarios yet. Adjust parameters and click "Save scenario".
            </p>
          ) : (
            <div className="space-y-2">
              {[...breedingScenarios].reverse().map((s) => (
                <div key={s.id} className="border border-[var(--border-subtle)] rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-neutral-800 leading-tight">{s.name}</span>
                    <button
                      onClick={() => deleteBreedingScenario(s.id)}
                      className="text-[10px] text-neutral-300 hover:text-red-400 shrink-0 mt-0.5"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="text-[10px] text-neutral-400 mb-2">{s.createdAt}</div>
                  <div className="text-[10px] text-neutral-500 space-y-0.5 mb-2">
                    {s.psRearingWeeks !== baseAssumptions.psRearingWeeks && (
                      <div>PS rearing: {s.psRearingWeeks} wks</div>
                    )}
                    {s.psRearingMortality !== baseAssumptions.psRearingMortality && (
                      <div>PS mort: {pct(s.psRearingMortality)}</div>
                    )}
                    {s.gpRearingWeeks !== baseAssumptions.gpRearingWeeks && (
                      <div>GP rearing: {s.gpRearingWeeks} wks</div>
                    )}
                    {s.gpRearingMortality !== baseAssumptions.gpRearingMortality && (
                      <div>GP mort: {pct(s.gpRearingMortality)}</div>
                    )}
                    {s.hatchabilityPs !== baseAssumptions.hatchabilityPs && (
                      <div>PS hatch: {pct(s.hatchabilityPs)}</div>
                    )}
                    {s.hatchabilityGp !== baseAssumptions.hatchabilityGp && (
                      <div>GP hatch: {pct(s.hatchabilityGp)}</div>
                    )}
                  </div>
                  <button
                    onClick={() => loadScenario(s)}
                    className="text-[10px] text-brand-green hover:underline"
                  >
                    Load into sliders ↗
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Weekly GP Rearing DOC comparison table ── */}
      <section className="bg-white border border-[var(--border-subtle)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-800">GP Rearing — DOC placement required per week</h3>
          <span className="text-[10px] text-neutral-400">Weeks where more birds must be ordered under the scenario</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: "var(--brand-green-tint)" }}>
                {["Week", "Date", "Base GP DOC", "Scenario GP DOC", "Δ Birds", "Δ %"].map((h) => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-neutral-700 border-b border-green-200 whitespace-nowrap text-[11px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gpRearingRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                    No catching plan data — add placement days to see GP procurement requirements.
                  </td>
                </tr>
              ) : (
                gpRearingRows.map((r) => {
                  const isWorse  = r.delta > 0;
                  const isBetter = r.delta < 0;
                  const rowBg    = isWorse ? "#fff1f2" : isBetter ? "#f0fdf4" : "white";
                  const dColor   = isWorse ? "#d24918" : isBetter ? "#047836" : "#6b7280";
                  return (
                    <tr key={r.week} className="border-b border-neutral-100 last:border-0" style={{ background: rowBg }}>
                      <td className="px-3 py-1.5 font-medium text-neutral-700">
                        {r.week < 1 ? `W${r.week} (pre-plan)` : `W${r.week}`}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{r.weekStart}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-700">{r.baseDoc > 0 ? Nk(r.baseDoc) : "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-neutral-800">{r.scenDoc > 0 ? Nk(r.scenDoc) : "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold" style={{ color: dColor }}>
                        {r.delta === 0 ? "—" : `${r.delta > 0 ? "+" : ""}${Nk(r.delta)}`}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: dColor }}>
                        {r.baseDoc === 0 ? "—" : deltaPct(r.baseDoc, r.scenDoc)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-[var(--border-subtle)] text-[10px] text-neutral-400 flex gap-4">
          <span className="flex items-center gap-1"><span style={{display:"inline-block",width:8,height:8,background:"#fff1f2",border:"1px solid #fca5a5",borderRadius:2}}></span> More birds needed under scenario</span>
          <span className="flex items-center gap-1"><span style={{display:"inline-block",width:8,height:8,background:"#f0fdf4",border:"1px solid #86efac",borderRadius:2}}></span> Fewer birds needed under scenario</span>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { usePlanStore } from "@/lib/store";
import { CUT_LABELS, CHANNEL_KEYS } from "@/lib/defaults";
import { weekLabel } from "@/lib/demandPlan";
import type { CutKey, CutPlanWeek } from "@/lib/types";
import type { PipelineResult } from "@/lib/types";

// ── helpers ──────────────────────────────────────────────────────────────────

const CUT_KEYS: CutKey[] = [
  "breastBoneIn",
  "breastBoneless",
  "wholeLeg",
  "drumstick",
  "thighBoneIn",
  "wings",
  "backNeck",
  "giblets",
  "trimMince",
];

/** Heuristic: map a cuts-product name to the most likely CutKey. */
function autoMapCutKey(name: string): CutKey | "ignore" {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  if (n.includes("breastbonein") || (n.includes("breast") && n.includes("bonein"))) return "breastBoneIn";
  if (n.includes("breastboneless") || (n.includes("breast") && n.includes("boneless"))) return "breastBoneless";
  if (n.includes("breast")) return "breastBoneless";
  if (n.includes("wholeleg") || (n.includes("whole") && n.includes("leg"))) return "wholeLeg";
  if (n.includes("drumstick") || n.includes("drum")) return "drumstick";
  if (n.includes("thigh")) return "thighBoneIn";
  if (n.includes("wing")) return "wings";
  if (n.includes("back") || n.includes("neck")) return "backNeck";
  if (n.includes("giblet") || n.includes("offal")) return "giblets";
  if (n.includes("trim") || n.includes("mince")) return "trimMince";
  return "ignore";
}

function fmtT(kg: number) {
  return `${(kg / 1000).toFixed(1)} t`;
}

function surplusColor(surplus: number, supply: number) {
  if (supply === 0) return "text-neutral-300 bg-neutral-50";
  const pct = surplus / supply;
  if (surplus < 0) return "text-red-700 bg-red-50 font-semibold";          // deficit
  if (pct > 0.5) return "text-amber-700 bg-amber-50";                       // large unplanned surplus
  if (pct > 0) return "text-emerald-700 bg-emerald-50";                     // healthy surplus
  return "text-neutral-500 bg-white";                                        // balanced (≈0)
}

// ── component ─────────────────────────────────────────────────────────────────

export function CutBalancePanel({ result }: { result: PipelineResult }) {
  const params = usePlanStore((s) => s.params);
  const demandProducts = usePlanStore((s) => s.demandProducts);
  const demandQty = usePlanStore((s) => s.demandQty);
  const cutProductMapping = usePlanStore((s) => s.cutProductMapping);
  const setCutProductMapping = usePlanStore((s) => s.setCutProductMapping);

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  // Only "cuts" category products
  const cutProducts = useMemo(
    () => demandProducts.filter((p) => p.category === "cuts"),
    [demandProducts]
  );

  // Effective mapping: stored override → fallback to auto-detect
  const effectiveMapping = useMemo<Record<string, CutKey | "ignore">>(() => {
    const m: Record<string, CutKey | "ignore"> = {};
    for (const p of cutProducts) {
      m[p.id] = cutProductMapping[p.id] ?? autoMapCutKey(p.name);
    }
    return m;
  }, [cutProducts, cutProductMapping]);

  const horizonWeeks = Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1);

  // ── core calculation ──────────────────────────────────────────────────────
  // supply: from pipeline (already in kg)
  // demand: from demand plan (tons) × 1000 → kg, summed across all channels

  const balanceByWeek = useMemo(() => {
    return horizonWeeks.map((w) => {
      const cutWeek: CutPlanWeek | undefined = result.cuts[w - 1];
      const supplyKg: Record<CutKey, number> = {} as Record<CutKey, number>;
      const demandKg: Record<CutKey, number> = {} as Record<CutKey, number>;

      for (const ck of CUT_KEYS) {
        supplyKg[ck] = cutWeek ? (cutWeek.cuts[ck] ?? 0) : 0;
        demandKg[ck] = 0;
      }

      // Sum demand for each cut type across all channels
      for (const p of cutProducts) {
        const mappedKey = effectiveMapping[p.id];
        if (!mappedKey || mappedKey === "ignore") continue;
        for (const ch of CHANNEL_KEYS) {
          const qty = demandQty[`${p.id}::${ch}::${w}`] ?? 0;
          demandKg[mappedKey] += qty * 1000; // tons → kg
        }
      }

      const surplusKg: Record<CutKey, number> = {} as Record<CutKey, number>;
      for (const ck of CUT_KEYS) {
        surplusKg[ck] = supplyKg[ck] - demandKg[ck];
      }

      return { week: w, supplyKg, demandKg, surplusKg };
    });
  }, [horizonWeeks, result.cuts, cutProducts, effectiveMapping, demandQty]);

  // ── totals across all weeks ───────────────────────────────────────────────
  const totals = useMemo(() => {
    const totalSupply: Record<CutKey, number> = {} as Record<CutKey, number>;
    const totalDemand: Record<CutKey, number> = {} as Record<CutKey, number>;
    const totalSurplus: Record<CutKey, number> = {} as Record<CutKey, number>;
    for (const ck of CUT_KEYS) {
      totalSupply[ck] = 0; totalDemand[ck] = 0; totalSurplus[ck] = 0;
    }
    for (const bw of balanceByWeek) {
      for (const ck of CUT_KEYS) {
        totalSupply[ck] += bw.supplyKg[ck];
        totalDemand[ck] += bw.demandKg[ck];
        totalSurplus[ck] += bw.surplusKg[ck];
      }
    }
    return { totalSupply, totalDemand, totalSurplus };
  }, [balanceByWeek]);

  const grandSupply = CUT_KEYS.reduce((s, k) => s + totals.totalSupply[k], 0);
  const grandDemand = CUT_KEYS.reduce((s, k) => s + totals.totalDemand[k], 0);
  const grandSurplus = grandSupply - grandDemand;
  const coveredPct = grandSupply > 0 ? (grandDemand / grandSupply) * 100 : 0;

  const unmappedProducts = cutProducts.filter((p) => effectiveMapping[p.id] === "ignore");
  const mappedProducts = cutProducts.filter((p) => effectiveMapping[p.id] !== "ignore");

  // Cut types with no demand coverage at all
  const orphanCuts = CUT_KEYS.filter((ck) => totals.totalDemand[ck] === 0 && totals.totalSupply[ck] > 0);

  // Week detail view data
  const weekDetail = selectedWeek !== null ? balanceByWeek[selectedWeek - 1] : null;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-[1400px]">

      {/* Page header */}
      <div>
        <h2 className="text-base font-semibold text-neutral-800">Co-Product Balance</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          When sales demand drives breast production, every bird also yields legs, thighs, wings, and other cuts.
          This view shows how much of each co-product the current demand plan absorbs — and how much remains as surplus.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Cut Supply", value: fmtT(grandSupply), sub: "from pipeline", accent: "border-l-blue-400 text-blue-700" },
          { label: "Total Cut Demand", value: fmtT(grandDemand), sub: "from demand plan", accent: "border-l-brand-green text-brand-green-dark" },
          { label: "Net Surplus", value: fmtT(grandSurplus), sub: grandSurplus < 0 ? "⚠ deficit" : "unallocated", accent: grandSurplus < 0 ? "border-l-red-400 text-red-700" : "border-l-amber-400 text-amber-700" },
          { label: "Demand Coverage", value: `${coveredPct.toFixed(1)}%`, sub: `${mappedProducts.length} of ${cutProducts.length} products mapped`, accent: coveredPct > 80 ? "border-l-brand-green text-brand-green-dark" : "border-l-amber-400 text-amber-700" },
        ].map((c) => (
          <div key={c.label} className={`bg-white border border-[var(--border-subtle)] border-l-4 ${c.accent.split(" ")[0]} rounded-xl px-4 py-3`}>
            <div className="text-[11px] text-neutral-500 uppercase tracking-wide font-medium">{c.label}</div>
            <div className={`text-xl font-bold mt-1 ${c.accent.split(" ")[1]}`}>{c.value}</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Orphan cuts alert */}
      {orphanCuts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <span className="font-semibold">⚠ {orphanCuts.length} cut type{orphanCuts.length !== 1 ? "s" : ""} have no demand coverage:</span>{" "}
          {orphanCuts.map((ck) => CUT_LABELS[ck]).join(", ")}.{" "}
          These will become 100% surplus — consider adding demand products or redirecting to FPP.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Left: product mapping */}
        <div className="bg-white border border-[var(--border-subtle)] rounded-xl p-4 space-y-3">
          <div>
            <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Product → Cut Mapping</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              Map each cuts demand product to the cut type it represents. Auto-suggested from product names.
            </div>
          </div>

          {cutProducts.length === 0 ? (
            <div className="text-xs text-neutral-400 py-4 text-center">
              No products in the Cuts category yet. Add them via Demand Plan → Add Product.
            </div>
          ) : (
            <div className="space-y-1.5">
              {cutProducts.map((p) => {
                const current = effectiveMapping[p.id] ?? "ignore";
                const isAuto = cutProductMapping[p.id] === undefined;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-neutral-700 font-medium" title={p.name}>{p.name}</div>
                      {isAuto && <div className="text-[10px] text-neutral-400">auto-detected</div>}
                    </div>
                    <select
                      value={current}
                      onChange={(e) => {
                        setCutProductMapping({ ...cutProductMapping, [p.id]: e.target.value as CutKey | "ignore" });
                      }}
                      className={`border rounded px-1.5 py-0.5 text-xs shrink-0 max-w-[160px] ${
                        current !== "ignore"
                          ? "border-brand-green text-brand-green-dark"
                          : "border-[var(--border-subtle)] text-neutral-400"
                      }`}
                    >
                      <option value="ignore">— Ignore —</option>
                      {CUT_KEYS.map((ck) => (
                        <option key={ck} value={ck}>{CUT_LABELS[ck]}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          {cutProducts.length > 0 && (
            <button
              onClick={() => {
                const reset: Record<string, CutKey | "ignore"> = {};
                for (const p of cutProducts) {
                  reset[p.id] = autoMapCutKey(p.name);
                }
                setCutProductMapping({ ...cutProductMapping, ...reset });
              }}
              className="text-[11px] text-neutral-400 hover:text-brand-green underline"
            >
              Re-run auto-detect for all
            </button>
          )}
        </div>

        {/* Right: per-cut totals table */}
        <div className="xl:col-span-2 bg-white border border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
              Full-Horizon Summary (all {horizonWeeks.length} weeks)
            </div>
            <div className="text-[11px] text-neutral-400">Click a row to drill into weekly detail →</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="bg-[var(--brand-green-tint)] text-[10px] uppercase tracking-wide text-brand-green-dark">
                  <th className="text-left px-3 py-2">Cut Type</th>
                  <th className="text-right px-3 py-2">Supply (t)</th>
                  <th className="text-right px-3 py-2">Demand (t)</th>
                  <th className="text-right px-3 py-2">Surplus (t)</th>
                  <th className="text-right px-3 py-2">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {CUT_KEYS.map((ck) => {
                  const sup = totals.totalSupply[ck];
                  const dem = totals.totalDemand[ck];
                  const sur = totals.totalSurplus[ck];
                  const cov = sup > 0 ? (dem / sup) * 100 : 0;
                  const isOrphan = dem === 0 && sup > 0;
                  return (
                    <tr
                      key={ck}
                      className="border-t border-[var(--border-subtle)] hover:bg-neutral-50 cursor-pointer"
                      onClick={() => setSelectedWeek(selectedWeek === null ? 1 : null)}
                    >
                      <td className="px-3 py-2 font-medium text-neutral-700">
                        {CUT_LABELS[ck]}
                        {isOrphan && <span className="ml-1.5 text-[10px] text-amber-600 font-normal">no demand</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-neutral-600">{(sup / 1000).toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-neutral-600">{(dem / 1000).toFixed(1)}</td>
                      <td className={`px-3 py-2 text-right ${sur < 0 ? "text-red-700 font-semibold" : sur > 0 ? "text-amber-700" : "text-neutral-400"}`}>
                        {sur >= 0 ? "+" : ""}{(sur / 1000).toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {sup > 0 ? (
                          <span className={`inline-flex items-center gap-1`}>
                            <span className={`w-12 h-1.5 rounded-full bg-neutral-100 inline-block align-middle`}>
                              <span
                                className={`h-1.5 rounded-full inline-block ${cov >= 80 ? "bg-brand-green" : cov >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                                style={{ width: `${Math.min(cov, 100)}%` }}
                              />
                            </span>
                            <span className={cov >= 80 ? "text-brand-green-dark" : cov >= 40 ? "text-amber-700" : "text-red-700"}>
                              {cov.toFixed(0)}%
                            </span>
                          </span>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* Grand total row */}
                <tr className="border-t-2 border-[var(--border-subtle)] bg-neutral-50 font-semibold">
                  <td className="px-3 py-2 text-neutral-700">Total Cuts</td>
                  <td className="px-3 py-2 text-right text-neutral-700">{(grandSupply / 1000).toFixed(1)}</td>
                  <td className="px-3 py-2 text-right text-neutral-700">{(grandDemand / 1000).toFixed(1)}</td>
                  <td className={`px-3 py-2 text-right ${grandSurplus < 0 ? "text-red-700" : "text-amber-700"}`}>
                    {grandSurplus >= 0 ? "+" : ""}{(grandSurplus / 1000).toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-700">{coveredPct.toFixed(0)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Weekly heat-map table */}
      <div className="bg-white border border-[var(--border-subtle)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
            Weekly Surplus / Deficit  <span className="text-[11px] font-normal text-neutral-400 ml-1">(tonnes · green = surplus, red = deficit, amber = large unmet surplus)</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-3 h-3 rounded-sm bg-emerald-100 inline-block border border-emerald-300" /> Surplus
            <span className="w-3 h-3 rounded-sm bg-amber-100 inline-block border border-amber-300 ml-2" /> High surplus
            <span className="w-3 h-3 rounded-sm bg-red-100 inline-block border border-red-300 ml-2" /> Deficit
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="text-[11px] tabular-nums min-w-max">
            <thead>
              <tr className="bg-[var(--brand-green-tint)] text-[10px] uppercase tracking-wide text-brand-green-dark sticky top-0">
                <th className="text-left px-3 py-2 sticky left-0 bg-[var(--brand-green-tint)] z-10 min-w-[140px]">Cut Type</th>
                {horizonWeeks.map((w) => (
                  <th key={w} className="px-2 py-2 text-center min-w-[54px] font-medium whitespace-nowrap">
                    {weekLabel(w, params.planStartDate).replace(/\.\d{4}$/, "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CUT_KEYS.map((ck) => (
                <tr key={ck} className="border-t border-[var(--border-subtle)]">
                  <td className="px-3 py-1.5 font-medium text-neutral-700 sticky left-0 bg-white z-10">{CUT_LABELS[ck]}</td>
                  {balanceByWeek.map(({ week, supplyKg, surplusKg }) => {
                    const sur = surplusKg[ck];
                    const sup = supplyKg[ck];
                    const colorCls = surplusColor(sur, sup);
                    return (
                      <td
                        key={week}
                        className={`px-1.5 py-1.5 text-center ${colorCls} cursor-pointer hover:ring-1 hover:ring-brand-green`}
                        title={`Wk ${week}: supply ${fmtT(sup)}, surplus ${fmtT(sur)}`}
                        onClick={() => setSelectedWeek(selectedWeek === week ? null : week)}
                      >
                        {sup > 0 ? (sur >= 0 ? "+" : "") + (sur / 1000).toFixed(1) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Week drill-down */}
      {selectedWeek !== null && weekDetail && (
        <div className="bg-white border border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
              Week {selectedWeek} Detail — {weekLabel(selectedWeek, params.planStartDate)}
            </div>
            <button onClick={() => setSelectedWeek(null)} className="text-neutral-400 hover:text-neutral-700 text-sm">✕</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-500">
                  <th className="text-left px-3 py-2">Cut Type</th>
                  <th className="text-right px-3 py-2">Supply (kg)</th>
                  <th className="text-right px-3 py-2">Demand (kg)</th>
                  <th className="text-right px-3 py-2">Surplus (kg)</th>
                  <th className="text-right px-3 py-2">Surplus (t)</th>
                  <th className="text-right px-3 py-2">% of supply</th>
                </tr>
              </thead>
              <tbody>
                {CUT_KEYS.map((ck) => {
                  const sup = weekDetail.supplyKg[ck];
                  const dem = weekDetail.demandKg[ck];
                  const sur = weekDetail.surplusKg[ck];
                  const pct = sup > 0 ? (sur / sup) * 100 : 0;
                  return (
                    <tr key={ck} className="border-t border-[var(--border-subtle)]">
                      <td className="px-3 py-2 font-medium text-neutral-700">{CUT_LABELS[ck]}</td>
                      <td className="px-3 py-2 text-right text-neutral-600">{Math.round(sup).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-neutral-600">{Math.round(dem).toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right font-medium ${sur < 0 ? "text-red-700" : sur > 0 ? "text-amber-700" : "text-neutral-400"}`}>
                        {sur >= 0 ? "+" : ""}{Math.round(sur).toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${sur < 0 ? "text-red-700" : sur > 0 ? "text-amber-700" : "text-neutral-400"}`}>
                        {sur >= 0 ? "+" : ""}{(sur / 1000).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {sup > 0 ? (
                          <span className={pct > 50 ? "text-amber-700" : pct > 0 ? "text-emerald-700" : pct < 0 ? "text-red-700" : "text-neutral-400"}>
                            {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Week navigation */}
          <div className="px-4 py-2 border-t border-[var(--border-subtle)] flex items-center gap-2">
            <button
              disabled={selectedWeek <= 1}
              onClick={() => setSelectedWeek((w) => (w ?? 1) - 1)}
              className="text-xs px-2 py-1 rounded border border-[var(--border-subtle)] disabled:opacity-30 hover:border-brand-green hover:text-brand-green"
            >← Prev</button>
            <span className="text-xs text-neutral-400">Week {selectedWeek} of {horizonWeeks.length}</span>
            <button
              disabled={selectedWeek >= horizonWeeks.length}
              onClick={() => setSelectedWeek((w) => (w ?? 1) + 1)}
              className="text-xs px-2 py-1 rounded border border-[var(--border-subtle)] disabled:opacity-30 hover:border-brand-green hover:text-brand-green"
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

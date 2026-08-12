"use client";

import { useMemo, useState } from "react";
import { usePlanStore } from "@/lib/store";
import { CUT_LABELS, CHANNEL_KEYS } from "@/lib/defaults";
import { weekLabel } from "@/lib/demandPlan";
import type { CutKey } from "@/lib/types";

// ── constants ────────────────────────────────────────────────────────────────

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

// ── auto-mapping heuristic ────────────────────────────────────────────────────

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

// ── core calculation ──────────────────────────────────────────────────────────

/**
 * Demand-driven co-product balance for one week.
 *
 * Logic:
 *   1. Calculate kg demanded for each cut type (sum across channels × mapped products).
 *   2. Convert each cut's demand to "birds required" using its yield fraction and
 *      average carcass weight.
 *   3. The cut that requires the MOST birds is the "driver" — it sets how many birds
 *      are slaughtered.
 *   4. Slaughtering those birds produces ALL cuts in their fixed yield ratios.
 *   5. Surplus = produced − demanded, per cut. Cuts with no demand are 100% surplus.
 */
function computeWeekBalance(
  week: number,
  cutProducts: { id: string; name: string }[],
  effectiveMapping: Record<string, CutKey | "ignore">,
  demandQty: Record<string, number>,
  cutYields: Record<CutKey, number>,
  avgCarcassWeightKg: number,
) {
  // Step 1 — demand per cut key (kg)
  const demandKg = Object.fromEntries(CUT_KEYS.map((k) => [k, 0])) as Record<CutKey, number>;
  for (const p of cutProducts) {
    const ck = effectiveMapping[p.id];
    if (!ck || ck === "ignore") continue;
    for (const ch of CHANNEL_KEYS) {
      const qty = demandQty[`${p.id}::${ch}::${week}`] ?? 0;
      demandKg[ck] += qty * 1000; // tons → kg
    }
  }

  // Step 2 — birds needed per cut to fulfil its demand
  const birdsNeeded = Object.fromEntries(CUT_KEYS.map((k) => [k, 0])) as Record<CutKey, number>;
  for (const ck of CUT_KEYS) {
    const yieldKgPerBird = (cutYields[ck] ?? 0) * avgCarcassWeightKg;
    birdsNeeded[ck] = yieldKgPerBird > 0 && demandKg[ck] > 0
      ? demandKg[ck] / yieldKgPerBird
      : 0;
  }

  // Step 3 — driver cut: the cut demanding the most birds
  let driverBirds = 0;
  let driverCut: CutKey | null = null;
  for (const ck of CUT_KEYS) {
    if (birdsNeeded[ck] > driverBirds) {
      driverBirds = birdsNeeded[ck];
      driverCut = ck;
    }
  }

  // Step 4 — produced and surplus for every cut
  const producedKg = Object.fromEntries(CUT_KEYS.map((k) => [k, 0])) as Record<CutKey, number>;
  const surplusKg = Object.fromEntries(CUT_KEYS.map((k) => [k, 0])) as Record<CutKey, number>;
  for (const ck of CUT_KEYS) {
    producedKg[ck] = driverBirds * (cutYields[ck] ?? 0) * avgCarcassWeightKg;
    surplusKg[ck] = producedKg[ck] - demandKg[ck];
  }

  return { week, demandKg, birdsNeeded, driverBirds, driverCut, producedKg, surplusKg };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtT(kg: number) { return (kg / 1000).toFixed(1); }
function fmtK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : Math.round(n).toLocaleString(); }

function surplusClass(surplus: number, produced: number) {
  if (produced === 0) return "text-neutral-300 bg-neutral-50";
  if (surplus <= 0) return "text-neutral-400 bg-white";           // fully absorbed by demand
  const pct = surplus / produced;
  if (pct >= 0.7) return "text-red-700 bg-red-50 font-semibold"; // large unplanned surplus
  if (pct >= 0.3) return "text-amber-700 bg-amber-50";
  return "text-emerald-700 bg-emerald-50";                        // small manageable surplus
}

// ── component ─────────────────────────────────────────────────────────────────

export function CutBalancePanel() {
  const params = usePlanStore((s) => s.params);
  const demandProducts = usePlanStore((s) => s.demandProducts);
  const demandQty = usePlanStore((s) => s.demandQty);
  const cutProductMapping = usePlanStore((s) => s.cutProductMapping);
  const setCutProductMapping = usePlanStore((s) => s.setCutProductMapping);

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const cutProducts = useMemo(
    () => demandProducts.filter((p) => p.category === "cuts"),
    [demandProducts]
  );

  const effectiveMapping = useMemo<Record<string, CutKey | "ignore">>(() => {
    const m: Record<string, CutKey | "ignore"> = {};
    for (const p of cutProducts) {
      m[p.id] = cutProductMapping[p.id] ?? autoMapCutKey(p.name);
    }
    return m;
  }, [cutProducts, cutProductMapping]);

  const horizonWeeks = useMemo(
    () => Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1),
    [params.planningHorizonWeeks]
  );

  // ── balance per week ──────────────────────────────────────────────────────
  const weeklyBalance = useMemo(() =>
    horizonWeeks.map((w) =>
      computeWeekBalance(
        w,
        cutProducts,
        effectiveMapping,
        demandQty,
        params.cutYields,
        params.avgCarcassWeightKg,
      )
    ),
    [horizonWeeks, cutProducts, effectiveMapping, demandQty, params.cutYields, params.avgCarcassWeightKg]
  );

  // ── horizon totals ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const demand = Object.fromEntries(CUT_KEYS.map((k) => [k, 0])) as Record<CutKey, number>;
    const produced = Object.fromEntries(CUT_KEYS.map((k) => [k, 0])) as Record<CutKey, number>;
    const surplus = Object.fromEntries(CUT_KEYS.map((k) => [k, 0])) as Record<CutKey, number>;
    for (const wb of weeklyBalance) {
      for (const ck of CUT_KEYS) {
        demand[ck] += wb.demandKg[ck];
        produced[ck] += wb.producedKg[ck];
        surplus[ck] += wb.surplusKg[ck];
      }
    }
    return { demand, produced, surplus };
  }, [weeklyBalance]);

  const totalProduced = CUT_KEYS.reduce((s, k) => s + totals.produced[k], 0);
  const totalSurplus = CUT_KEYS.reduce((s, k) => s + totals.surplus[k], 0);
  const totalDemand = CUT_KEYS.reduce((s, k) => s + totals.demand[k], 0);

  // Most common driver cut across all weeks
  const driverCounts = new Map<CutKey, number>();
  for (const wb of weeklyBalance) {
    if (wb.driverCut) driverCounts.set(wb.driverCut, (driverCounts.get(wb.driverCut) ?? 0) + 1);
  }
  const topDriver = [...driverCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const noDemandWeeks = weeklyBalance.filter((wb) => wb.driverBirds === 0).length;
  const hasDemand = totalDemand > 0;

  const weekDetail = selectedWeek !== null ? weeklyBalance[selectedWeek - 1] : null;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-[1400px]">

      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-neutral-800">Whole Carcass Balance</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Demand for any cut (e.g. breast) determines how many birds are slaughtered.
          Those birds produce <em>all</em> other cuts regardless of demand — this view shows
          what becomes surplus as a result.
        </p>
      </div>

      {/* No demand state */}
      {!hasDemand && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-center space-y-2">
          <div className="text-2xl">🔪</div>
          <div className="text-sm font-semibold text-amber-800">No cuts demand entered yet</div>
          <div className="text-xs text-amber-700">
            Go to <strong>Demand Plan (M1)</strong> and enter quantities for your cuts products.
            Once breast, leg, or any other cut has demand, this panel will calculate the resulting co-product surplus.
          </div>
        </div>
      )}

      {hasDemand && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-[var(--border-subtle)] border-l-4 border-l-blue-400 rounded-xl px-4 py-3">
              <div className="text-[11px] text-neutral-500 uppercase tracking-wide font-medium">Production Driver</div>
              <div className="text-base font-bold mt-1 text-blue-700">
                {topDriver ? CUT_LABELS[topDriver] : "—"}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">requires the most birds</div>
            </div>
            <div className="bg-white border border-[var(--border-subtle)] border-l-4 border-l-brand-green rounded-xl px-4 py-3">
              <div className="text-[11px] text-neutral-500 uppercase tracking-wide font-medium">Total Cuts Produced</div>
              <div className="text-xl font-bold mt-1 text-brand-green-dark">{fmtT(totalProduced)} t</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">from demand-implied birds</div>
            </div>
            <div className="bg-white border border-[var(--border-subtle)] border-l-4 border-l-amber-400 rounded-xl px-4 py-3">
              <div className="text-[11px] text-neutral-500 uppercase tracking-wide font-medium">Total Surplus</div>
              <div className="text-xl font-bold mt-1 text-amber-700">{fmtT(totalSurplus)} t</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">co-products without demand</div>
            </div>
            <div className="bg-white border border-[var(--border-subtle)] border-l-4 border-l-neutral-300 rounded-xl px-4 py-3">
              <div className="text-[11px] text-neutral-500 uppercase tracking-wide font-medium">Weeks with No Demand</div>
              <div className={`text-xl font-bold mt-1 ${noDemandWeeks > 0 ? "text-red-600" : "text-neutral-400"}`}>
                {noDemandWeeks} / {horizonWeeks.length}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">no cuts demanded</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

            {/* Product mapping */}
            <div className="bg-white border border-[var(--border-subtle)] rounded-xl p-4 space-y-3">
              <div>
                <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Product → Cut Type</div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Map each demand product to the cut it represents. Auto-suggested from product names.
                </div>
              </div>
              {cutProducts.length === 0 ? (
                <div className="text-xs text-neutral-400 py-4 text-center">
                  No products in the Cuts category. Add them in Demand Plan → Add Product.
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
                          onChange={(e) => setCutProductMapping({ ...cutProductMapping, [p.id]: e.target.value as CutKey | "ignore" })}
                          className={`border rounded px-1.5 py-0.5 text-xs shrink-0 max-w-[160px] ${current !== "ignore" ? "border-brand-green text-brand-green-dark" : "border-[var(--border-subtle)] text-neutral-400"}`}
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
                    for (const p of cutProducts) reset[p.id] = autoMapCutKey(p.name);
                    setCutProductMapping({ ...cutProductMapping, ...reset });
                  }}
                  className="text-[11px] text-neutral-400 hover:text-brand-green underline"
                >
                  Re-run auto-detect
                </button>
              )}
            </div>

            {/* Full-horizon table */}
            <div className="xl:col-span-2 bg-white border border-[var(--border-subtle)] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                  Full-Horizon Co-Product Balance
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Production is sized to meet the most demanding cut each week. All other cuts are co-products.
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="bg-[var(--brand-green-tint)] text-[10px] uppercase tracking-wide text-brand-green-dark">
                      <th className="text-left px-3 py-2">Cut Type</th>
                      <th className="text-right px-3 py-2">Demanded (t)</th>
                      <th className="text-right px-3 py-2">Produced (t)</th>
                      <th className="text-right px-3 py-2">Surplus (t)</th>
                      <th className="text-right px-3 py-2">% Surplus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CUT_KEYS.map((ck) => {
                      const dem = totals.demand[ck];
                      const pro = totals.produced[ck];
                      const sur = totals.surplus[ck];
                      const pct = pro > 0 ? (sur / pro) * 100 : 0;
                      const isDriver = ck === topDriver;
                      const noDem = dem === 0 && pro > 0;
                      return (
                        <tr key={ck} className="border-t border-[var(--border-subtle)] hover:bg-neutral-50">
                          <td className="px-3 py-2 font-medium text-neutral-700">
                            <span>{CUT_LABELS[ck]}</span>
                            {isDriver && (
                              <span className="ml-2 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">
                                driver
                              </span>
                            )}
                            {noDem && (
                              <span className="ml-1.5 text-[10px] text-red-600 font-normal">100% surplus</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-600">{fmtT(dem)}</td>
                          <td className="px-3 py-2 text-right text-neutral-600">{fmtT(pro)}</td>
                          <td className={`px-3 py-2 text-right font-medium ${sur > 0 ? "text-amber-700" : "text-neutral-400"}`}>
                            {sur > 0 ? `+${fmtT(sur)}` : fmtT(sur)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {pro > 0 ? (
                              <span className={pct >= 60 ? "text-red-700 font-semibold" : pct >= 20 ? "text-amber-700" : "text-emerald-700"}>
                                {pct.toFixed(0)}%
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-neutral-200 bg-neutral-50 font-semibold text-xs">
                      <td className="px-3 py-2 text-neutral-700">Total</td>
                      <td className="px-3 py-2 text-right text-neutral-700">{fmtT(totalDemand)}</td>
                      <td className="px-3 py-2 text-right text-neutral-700">{fmtT(totalProduced)}</td>
                      <td className="px-3 py-2 text-right text-amber-700">+{fmtT(totalSurplus)}</td>
                      <td className="px-3 py-2 text-right text-neutral-600">
                        {totalProduced > 0 ? `${((totalSurplus / totalProduced) * 100).toFixed(0)}%` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Weekly heat-map */}
          <div className="bg-white border border-[var(--border-subtle)] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                  Weekly Surplus Heat-map
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Values in tonnes. Click a week column header to see the full breakdown for that week.
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-neutral-500">
                <span><span className="inline-block w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300 mr-1" />Small</span>
                <span><span className="inline-block w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 mr-1" />Medium</span>
                <span><span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-300 mr-1" />Large</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="text-[11px] tabular-nums min-w-max">
                <thead>
                  <tr className="bg-[var(--brand-green-tint)] text-[10px] uppercase tracking-wide text-brand-green-dark">
                    <th className="text-left px-3 py-2 sticky left-0 bg-[var(--brand-green-tint)] z-10 min-w-[148px]">Cut Type</th>
                    {weeklyBalance.map(({ week, driverCut: dc }) => (
                      <th
                        key={week}
                        className="px-2 py-2 text-center min-w-[58px] cursor-pointer hover:bg-brand-green hover:text-white transition-colors whitespace-nowrap"
                        onClick={() => setSelectedWeek(selectedWeek === week ? null : week)}
                        title={`Click to see week ${week} breakdown${dc ? ` — driver: ${CUT_LABELS[dc]}` : ""}`}
                      >
                        {weekLabel(week, params.planStartDate).replace(/\.\d{4}$/, "")}
                      </th>
                    ))}
                  </tr>
                  {/* Driver cut row */}
                  <tr className="bg-blue-50 text-[10px] text-blue-600 border-b border-blue-100">
                    <td className="px-3 py-1 sticky left-0 bg-blue-50 z-10 font-medium">Driver cut</td>
                    {weeklyBalance.map(({ week, driverCut: dc }) => (
                      <td key={week} className="px-1 py-1 text-center truncate max-w-[58px]" title={dc ? CUT_LABELS[dc] : "—"}>
                        {dc ? CUT_LABELS[dc].split(" ")[0] : "—"}
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CUT_KEYS.map((ck) => (
                    <tr key={ck} className="border-t border-[var(--border-subtle)]">
                      <td className="px-3 py-1.5 font-medium text-neutral-700 sticky left-0 bg-white z-10">
                        {CUT_LABELS[ck]}
                      </td>
                      {weeklyBalance.map(({ week, surplusKg, producedKg }) => {
                        const sur = surplusKg[ck];
                        const pro = producedKg[ck];
                        const cls = surplusClass(sur, pro);
                        return (
                          <td
                            key={week}
                            className={`px-1.5 py-1.5 text-center ${cls} cursor-pointer hover:ring-1 hover:ring-brand-green`}
                            title={`Wk ${week} ${CUT_LABELS[ck]}: produced ${fmtT(pro)} t, surplus ${fmtT(sur)} t`}
                            onClick={() => setSelectedWeek(selectedWeek === week ? null : week)}
                          >
                            {pro > 0 ? (sur > 0 ? `+${fmtT(sur)}` : fmtT(sur)) : "—"}
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
                <div>
                  <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                    Week {selectedWeek} — {weekLabel(selectedWeek, params.planStartDate)}
                  </div>
                  {weekDetail.driverCut && (
                    <div className="text-[11px] text-blue-600 mt-0.5">
                      Driver: <strong>{CUT_LABELS[weekDetail.driverCut]}</strong> — requires {fmtK(weekDetail.driverBirds)} birds
                    </div>
                  )}
                  {weekDetail.driverBirds === 0 && (
                    <div className="text-[11px] text-neutral-400 mt-0.5">No cuts demand this week — no birds implied.</div>
                  )}
                </div>
                <button onClick={() => setSelectedWeek(null)} className="text-neutral-400 hover:text-neutral-700 text-sm">✕</button>
              </div>
              {weekDetail.driverBirds > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs tabular-nums">
                    <thead>
                      <tr className="bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-500">
                        <th className="text-left px-3 py-2">Cut Type</th>
                        <th className="text-right px-3 py-2">Birds needed</th>
                        <th className="text-right px-3 py-2">Demanded (kg)</th>
                        <th className="text-right px-3 py-2">Produced (kg)</th>
                        <th className="text-right px-3 py-2">Surplus (kg)</th>
                        <th className="text-right px-3 py-2">Surplus (t)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CUT_KEYS.map((ck) => {
                        const dem = weekDetail.demandKg[ck];
                        const pro = weekDetail.producedKg[ck];
                        const sur = weekDetail.surplusKg[ck];
                        const birds = weekDetail.birdsNeeded[ck];
                        const isDriver = ck === weekDetail.driverCut;
                        return (
                          <tr key={ck} className={`border-t border-[var(--border-subtle)] ${isDriver ? "bg-blue-50/50" : ""}`}>
                            <td className="px-3 py-2 font-medium text-neutral-700">
                              {CUT_LABELS[ck]}
                              {isDriver && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">driver</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-neutral-500">{birds > 0 ? fmtK(birds) : "—"}</td>
                            <td className="px-3 py-2 text-right text-neutral-600">{dem > 0 ? Math.round(dem).toLocaleString() : "—"}</td>
                            <td className="px-3 py-2 text-right text-neutral-600">{pro > 0 ? Math.round(pro).toLocaleString() : "—"}</td>
                            <td className={`px-3 py-2 text-right font-medium ${sur > 0 ? "text-amber-700" : "text-neutral-400"}`}>
                              {pro > 0 ? (sur > 0 ? `+${Math.round(sur).toLocaleString()}` : Math.round(sur).toLocaleString()) : "—"}
                            </td>
                            <td className={`px-3 py-2 text-right font-medium ${sur > 0 ? "text-amber-700" : "text-neutral-400"}`}>
                              {pro > 0 ? (sur > 0 ? `+${fmtT(sur)}` : fmtT(sur)) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
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
        </>
      )}
    </div>
  );
}

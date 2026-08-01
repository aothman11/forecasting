"use client";

import { usePlanStore } from "@/lib/store";
import { usePipeline } from "@/lib/usePipeline";
import { categoryTotal, weekLabel } from "@/lib/demandPlan";
import { computeSupplyRequirements } from "@/lib/supplyRequirements";
import { exportSummaryToPDF } from "@/lib/export";
import { useState } from "react";
import { format, addDays } from "date-fns";

function horizonRange(planStartDate: string, horizonWeeks: number): string {
  const start = new Date(planStartDate);
  const end = addDays(start, horizonWeeks * 7 - 1);
  const s = format(start, "MMM yyyy");
  const e = format(end, "MMM yyyy");
  return s === e ? s : `${s} – ${e}`;
}
import type { SOPReportRow } from "@/lib/export";

type RAG = "green" | "amber" | "red" | "na";

function rag(demandTons: number, supplyTons: number): RAG {
  if (demandTons <= 0) return "na";
  const ratio = supplyTons / demandTons;
  if (ratio >= 1.05) return "green";
  if (ratio >= 0.98) return "amber";
  return "red";
}

function worstRag(rags: RAG[]): RAG {
  const active = rags.filter((r) => r !== "na");
  if (active.length === 0) return "na";
  if (active.includes("red")) return "red";
  if (active.includes("amber")) return "amber";
  return "green";
}

function RagDot({ status }: { status: RAG }) {
  const colors: Record<RAG, string> = {
    green: "bg-green-500",
    amber: "bg-amber-400",
    red: "bg-red-500",
    na: "bg-neutral-300",
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${colors[status]}`} />;
}

function RagPill({ status }: { status: RAG }) {
  const styles: Record<RAG, string> = {
    green: "bg-green-100 text-green-700 border-green-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    red: "bg-red-100 text-red-700 border-red-200",
    na: "bg-neutral-100 text-neutral-400 border-neutral-200",
  };
  const labels: Record<RAG, string> = {
    green: "OK",
    amber: "TIGHT",
    red: "DEFICIT",
    na: "—",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-bold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function CoverageBar({ demand, supply }: { demand: number; supply: number }) {
  if (demand <= 0) return <div className="text-[11px] text-neutral-300">No demand</div>;
  const pct = Math.min((supply / demand) * 100, 120);
  const status = rag(demand, supply);
  const barColor = status === "green" ? "bg-green-500" : status === "amber" ? "bg-amber-400" : "bg-red-500";
  const coveragePct = ((supply / demand) * 100).toFixed(1);
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-neutral-500">{supply.toFixed(0)} t / {demand.toFixed(0)} t</span>
        <span className={`font-semibold ${status === "red" ? "text-red-600" : status === "amber" ? "text-amber-600" : "text-green-700"}`}>
          {coveragePct}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SOPReport() {
  const { result, params } = usePipeline();
  const demandProducts = usePlanStore((s) => s.demandProducts);
  const demandQty = usePlanStore((s) => s.demandQty);

  const weeks = Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1);
  const supplyRows = computeSupplyRequirements(demandProducts, demandQty, params, result, weeks);

  // Build per-week S&OP rows
  const sopRows: SOPReportRow[] = weeks.map((w) => {
    const fam = result.family.find((r) => r.week === w);
    const cuts = result.cuts.find((r) => r.week === w);
    const supRow = supplyRows.find((r) => r.week === w);

    const wcD = categoryTotal(demandProducts, demandQty, "wholeChicken", "ALL", [w]);
    const fppD = categoryTotal(demandProducts, demandQty, "fpp", "ALL", [w]);
    const cutsD = categoryTotal(demandProducts, demandQty, "cuts", "ALL", [w]);

    const wcS = fam ? (fam.wcFreshKg + fam.wcFrozenKg) / 1000 : 0;
    const fppS = fam ? fam.fppKg / 1000 : 0;
    const cutsS = cuts ? cuts.totalKg / 1000 : 0;

    const wcR = rag(wcD, wcS);
    const fppR = rag(fppD, fppS);
    const cutsR = rag(cutsD, cutsS);
    const overall = worstRag([wcR, fppR, cutsR]);

    return {
      week: w,
      wcDemandTons: wcD,
      wcSupplyTons: wcS,
      fppDemandTons: fppD,
      fppSupplyTons: fppS,
      cutsDemandTons: cutsD,
      cutsSupplyTons: cutsS,
      placementWeek: supRow?.placementWeek ?? 0,
      overallStatus: overall,
    };
  });

  // Totals
  const totalWcD = sopRows.reduce((s, r) => s + r.wcDemandTons, 0);
  const totalWcS = sopRows.reduce((s, r) => s + r.wcSupplyTons, 0);
  const totalFppD = sopRows.reduce((s, r) => s + r.fppDemandTons, 0);
  const totalFppS = sopRows.reduce((s, r) => s + r.fppSupplyTons, 0);
  const totalCutsD = sopRows.reduce((s, r) => s + r.cutsDemandTons, 0);
  const totalCutsS = sopRows.reduce((s, r) => s + r.cutsSupplyTons, 0);

  const deficitWeeks = sopRows.filter((r) => r.overallStatus === "red");
  const tightWeeks = sopRows.filter((r) => r.overallStatus === "amber");
  const prePlanWeeks = sopRows.filter((r) => r.placementWeek <= 0 && (r.wcDemandTons + r.fppDemandTons + r.cutsDemandTons) > 0);
  const hasDemand = totalWcD + totalFppD + totalCutsD > 0;

  const [pdfBusy, setPdfBusy] = useState(false);
  const generatedDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div id="sop-report-pdf" className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold section-title">S&amp;OP Executive Report</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Weekly review — {horizonRange(params.planStartDate, params.planningHorizonWeeks)} ({params.planningHorizonWeeks / 4} months)
            <span className="ml-2 text-neutral-400 text-xs">Generated {generatedDate}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={async () => {
              setPdfBusy(true);
              try {
                await exportSummaryToPDF("sop-report-pdf", "awp-sop-report.pdf");
              } finally {
                setPdfBusy(false);
              }
            }}
            disabled={pdfBusy}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green transition-colors disabled:opacity-50"
          >
            {pdfBusy ? "Generating…" : "Export PDF"}
          </button>
          <button
            onClick={() => window.print()}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-brand-green text-brand-green hover:bg-brand-green hover:text-white transition-colors"
          >
            🖨 Print
          </button>
        </div>
      </div>

      {!hasDemand && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No demand quantities entered yet. Open <strong>Demand Plan</strong> and enter weekly demand to generate this report.
        </div>
      )}

      {/* Traffic-light category summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(
          [
            { label: "Whole Chicken", icon: "🐔", d: totalWcD, s: totalWcS },
            { label: "FPP", icon: "🍗", d: totalFppD, s: totalFppS },
            { label: "Cuts", icon: "🔪", d: totalCutsD, s: totalCutsS },
          ] as const
        ).map(({ label, icon, d, s }) => {
          const status = rag(d, s);
          const borderColor =
            status === "green" ? "border-green-300" : status === "amber" ? "border-amber-300" : status === "red" ? "border-red-300" : "border-[var(--border-subtle)]";
          const bgColor =
            status === "green" ? "bg-green-50/60" : status === "amber" ? "bg-amber-50/60" : status === "red" ? "bg-red-50/60" : "bg-white";
          return (
            <div key={label} className={`rounded-xl border ${borderColor} ${bgColor} p-4 shadow-sm`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{icon}</span>
                  <span className="font-semibold text-sm text-neutral-800">{label}</span>
                </div>
                <RagPill status={status} />
              </div>
              <CoverageBar demand={d} supply={s} />
            </div>
          );
        })}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-2.5 text-center shadow-sm">
          <div className="text-[11px] text-neutral-500 mb-0.5">Deficit Weeks</div>
          <div className={`text-xl font-bold ${deficitWeeks.length > 0 ? "text-red-600" : "text-green-600"}`}>
            {deficitWeeks.length}
          </div>
          {deficitWeeks.length > 0 && (
            <div className="text-[10px] text-red-500 mt-0.5">{deficitWeeks.map((r) => weekLabel(r.week, params.planStartDate)).join(", ")}</div>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-2.5 text-center shadow-sm">
          <div className="text-[11px] text-neutral-500 mb-0.5">Tight Weeks</div>
          <div className={`text-xl font-bold ${tightWeeks.length > 0 ? "text-amber-600" : "text-green-600"}`}>
            {tightWeeks.length}
          </div>
          {tightWeeks.length > 0 && (
            <div className="text-[10px] text-amber-500 mt-0.5">{tightWeeks.map((r) => weekLabel(r.week, params.planStartDate)).join(", ")}</div>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-2.5 text-center shadow-sm">
          <div className="text-[11px] text-neutral-500 mb-0.5">Pre-plan Weeks</div>
          <div className={`text-xl font-bold ${prePlanWeeks.length > 0 ? "text-amber-600" : "text-neutral-400"}`}>
            {prePlanWeeks.length}
          </div>
          {prePlanWeeks.length > 0 && (
            <div className="text-[10px] text-amber-500 mt-0.5">manual placement needed</div>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-2.5 text-center shadow-sm">
          <div className="text-[11px] text-neutral-500 mb-0.5">OK Weeks</div>
          <div className="text-xl font-bold text-green-600">
            {sopRows.filter((r) => r.overallStatus === "green").length}
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">{horizonRange(params.planStartDate, params.planningHorizonWeeks)}</div>
        </div>
      </div>

      {/* Week-by-week S&OP table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-neutral-50 flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Weekly S&amp;OP Review</span>
          <div className="flex items-center gap-3 text-[11px] text-neutral-400">
            <span className="flex items-center gap-1"><RagDot status="green" /> OK ≥105%</span>
            <span className="flex items-center gap-1"><RagDot status="amber" /> Tight 98–105%</span>
            <span className="flex items-center gap-1"><RagDot status="red" /> Deficit &lt;98%</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-brand-green-tint text-brand-green-dark text-[11px] uppercase tracking-wide">
                <th className="sticky left-0 bg-brand-green-tint px-3 py-2 text-left font-semibold">Wk</th>
                {/* WC group */}
                <th className="px-2 py-2 text-right font-semibold border-l border-brand-green/20">WC Dem (t)</th>
                <th className="px-2 py-2 text-right font-semibold">WC Sup (t)</th>
                <th className="px-2 py-2 text-center font-semibold">WC</th>
                {/* FPP group */}
                <th className="px-2 py-2 text-right font-semibold border-l border-brand-green/20">FPP Dem (t)</th>
                <th className="px-2 py-2 text-right font-semibold">FPP Sup (t)</th>
                <th className="px-2 py-2 text-center font-semibold">FPP</th>
                {/* Cuts group */}
                <th className="px-2 py-2 text-right font-semibold border-l border-brand-green/20">Cuts Dem (t)</th>
                <th className="px-2 py-2 text-right font-semibold">Cuts Sup (t)</th>
                <th className="px-2 py-2 text-center font-semibold">Cuts</th>
                {/* Meta */}
                <th className="px-2 py-2 text-right font-semibold border-l border-brand-green/20">Place Wk</th>
                <th className="px-2 py-2 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {sopRows.map((r, i) => {
                const wcR = rag(r.wcDemandTons, r.wcSupplyTons);
                const fppR = rag(r.fppDemandTons, r.fppSupplyTons);
                const cutsR = rag(r.cutsDemandTons, r.cutsSupplyTons);
                const rowBg = r.overallStatus === "red" ? "bg-red-50" : r.overallStatus === "amber" ? "bg-amber-50/40" : i % 2 === 0 ? "bg-white" : "bg-neutral-50/50";
                return (
                  <tr key={r.week} className={`border-t border-[var(--border-subtle)] ${rowBg} hover:bg-brand-green-tint/20 transition-colors`}>
                    <td className="sticky left-0 bg-inherit px-3 py-2 font-bold text-brand-green-dark">{weekLabel(r.week, params.planStartDate)}</td>
                    {/* WC */}
                    <td className="px-2 py-2 text-right tabular-nums border-l border-[var(--border-subtle)]">
                      {r.wcDemandTons > 0 ? r.wcDemandTons.toFixed(1) : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-neutral-600">
                      {r.wcSupplyTons > 0 ? r.wcSupplyTons.toFixed(1) : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center"><RagDot status={wcR} /></td>
                    {/* FPP */}
                    <td className="px-2 py-2 text-right tabular-nums border-l border-[var(--border-subtle)]">
                      {r.fppDemandTons > 0 ? r.fppDemandTons.toFixed(1) : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-neutral-600">
                      {r.fppSupplyTons > 0 ? r.fppSupplyTons.toFixed(1) : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center"><RagDot status={fppR} /></td>
                    {/* Cuts */}
                    <td className="px-2 py-2 text-right tabular-nums border-l border-[var(--border-subtle)]">
                      {r.cutsDemandTons > 0 ? r.cutsDemandTons.toFixed(1) : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-neutral-600">
                      {r.cutsSupplyTons > 0 ? r.cutsSupplyTons.toFixed(1) : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center"><RagDot status={cutsR} /></td>
                    {/* Meta */}
                    <td className="px-2 py-2 text-right tabular-nums border-l border-[var(--border-subtle)]">
                      {r.placementWeek > 0 ? (
                        <span className="text-brand-green-dark font-medium">{r.placementWeek > 0 ? weekLabel(r.placementWeek, params.planStartDate) : `Wk ${r.placementWeek}`}</span>
                      ) : (
                        <span className="text-neutral-400 text-[11px]">pre-plan</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <RagPill status={r.overallStatus} />
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="border-t-2 border-brand-green/30 bg-brand-green-tint/50 font-semibold">
                <td className="sticky left-0 bg-brand-green-tint/50 px-3 py-2 text-brand-green-dark text-[11px] uppercase">Total</td>
                <td className="px-2 py-2 text-right tabular-nums border-l border-[var(--border-subtle)]">{totalWcD.toFixed(1)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{totalWcS.toFixed(1)}</td>
                <td className="px-2 py-2 text-center"><RagPill status={rag(totalWcD, totalWcS)} /></td>
                <td className="px-2 py-2 text-right tabular-nums border-l border-[var(--border-subtle)]">{totalFppD.toFixed(1)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{totalFppS.toFixed(1)}</td>
                <td className="px-2 py-2 text-center"><RagPill status={rag(totalFppD, totalFppS)} /></td>
                <td className="px-2 py-2 text-right tabular-nums border-l border-[var(--border-subtle)]">{totalCutsD.toFixed(1)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{totalCutsS.toFixed(1)}</td>
                <td className="px-2 py-2 text-center"><RagPill status={rag(totalCutsD, totalCutsS)} /></td>
                <td className="px-2 py-2 border-l border-[var(--border-subtle)]" />
                <td className="px-2 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Exceptions / action items */}
      {(deficitWeeks.length > 0 || tightWeeks.length > 0 || prePlanWeeks.length > 0) && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-4 space-y-3">
          <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Exceptions &amp; Action Items</h3>
          {deficitWeeks.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <RagDot status="red" />
              <div>
                <span className="font-semibold text-red-700">Supply deficit</span>
                <span className="text-neutral-600 ml-1">in weeks {deficitWeeks.map((r) => weekLabel(r.week, params.planStartDate)).join(", ")}. Review placement plan or adjust demand.</span>
              </div>
            </div>
          )}
          {tightWeeks.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <RagDot status="amber" />
              <div>
                <span className="font-semibold text-amber-700">Tight supply</span>
                <span className="text-neutral-600 ml-1">in weeks {tightWeeks.map((r) => weekLabel(r.week, params.planStartDate)).join(", ")}. Supply within 5% of demand — monitor closely.</span>
              </div>
            </div>
          )}
          {prePlanWeeks.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <RagDot status="amber" />
              <div>
                <span className="font-semibold text-amber-700">Pre-plan placements required</span>
                <span className="text-neutral-600 ml-1">for weeks {prePlanWeeks.map((r) => weekLabel(r.week, params.planStartDate)).join(", ")} — placement falls before the planning horizon. Enter manually in the Placement Plan.</span>
              </div>
            </div>
          )}
          {deficitWeeks.length === 0 && tightWeeks.length === 0 && prePlanWeeks.length === 0 && (
            <p className="text-sm text-green-700">No exceptions — all categories are within supply targets.</p>
          )}
        </div>
      )}

      {hasDemand && deficitWeeks.length === 0 && tightWeeks.length === 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <span className="text-base">✅</span>
          All weeks are on track — supply meets or exceeds demand across all categories.
        </div>
      )}
    </div>
  );
}

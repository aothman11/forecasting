"use client";

import Image from "next/image";
import { STEPS, usePlanStore } from "@/lib/store";

export function Sidebar() {
  const selectedStep = usePlanStore((s) => s.selectedStep);
  const setSelectedStep = usePlanStore((s) => s.setSelectedStep);
  const compareOpen = usePlanStore((s) => s.compareOpen);
  const setCompareOpen = usePlanStore((s) => s.setCompareOpen);
  const demandOpen = usePlanStore((s) => s.demandOpen);
  const setDemandOpen = usePlanStore((s) => s.setDemandOpen);
  const supplyOpen = usePlanStore((s) => s.supplyOpen);
  const setSupplyOpen = usePlanStore((s) => s.setSupplyOpen);
  const reconcileOpen = usePlanStore((s) => s.reconcileOpen);
  const setReconcileOpen = usePlanStore((s) => s.setReconcileOpen);
  const ddpOpen = usePlanStore((s) => s.ddpOpen);
  const setDdpOpen = usePlanStore((s) => s.setDdpOpen);
  const reportOpen = usePlanStore((s) => s.reportOpen);
  const setReportOpen = usePlanStore((s) => s.setReportOpen);
  const homeOpen = usePlanStore((s) => s.homeOpen);
  const setHomeOpen = usePlanStore((s) => s.setHomeOpen);

  return (
    <aside className="w-64 shrink-0 border-r border-[var(--border-subtle)] bg-white flex flex-col">
      <div className="px-4 py-4 border-b border-[var(--border-subtle)] bg-gradient-to-br from-brand-green-tint to-white">
        <Image src="/alwatania-logo-white.png" alt="Al-Watania Poultry" width={140} height={70} className="h-10 w-auto mb-2" priority />
        <div className="text-lg font-bold text-brand-green section-title leading-tight">
          AWP Production Forecast
        </div>
        <div className="text-[11px] text-neutral-500 mt-0.5">Demand → Supply · S&amp;OP</div>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        {/* ── Home ── */}
        <button
          onClick={() => { setCompareOpen(false); setDemandOpen(false); setSupplyOpen(false); setReconcileOpen(false); setDdpOpen(false); setReportOpen(false); setHomeOpen(true); }}
          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors mb-2 ${homeOpen ? "bg-brand-green-tint text-brand-green-dark font-semibold border-r-2 border-brand-green" : "text-neutral-600 hover:bg-neutral-50"}`}
        >
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-shadow ${homeOpen ? "bg-brand-green text-white shadow-sm shadow-brand-green/30" : "bg-neutral-200 text-neutral-600"}`}>🏠</span>
          Home
        </button>

        {/* ── S&OP Modules ── */}
        <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mb-1">S&amp;OP Modules</div>
        {STEPS.map((step) => {
          const active = !compareOpen && !demandOpen && !supplyOpen && !reconcileOpen && !ddpOpen && !reportOpen && !homeOpen && selectedStep === step.id;
          return (
            <button
              key={step.id}
              onClick={() => { setCompareOpen(false); setDemandOpen(false); setSupplyOpen(false); setReconcileOpen(false); setDdpOpen(false); setReportOpen(false); setHomeOpen(false); setSelectedStep(step.id); }}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${active ? "bg-brand-green-tint text-brand-green-dark font-semibold border-r-2 border-brand-green" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-shadow ${active ? "bg-brand-green text-white shadow-sm shadow-brand-green/30" : "bg-neutral-200 text-neutral-600"}`}>{step.id}</span>
              <span aria-hidden className="shrink-0">{step.icon}</span>
              {step.label}
            </button>
          );
        })}

        {/* M1 — Demand Plan */}
        <button
          onClick={() => { setCompareOpen(false); setSupplyOpen(false); setReconcileOpen(false); setDdpOpen(false); setReportOpen(false); setHomeOpen(false); setDemandOpen(true); }}
          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${demandOpen ? "bg-brand-green-tint text-brand-green-dark font-semibold border-r-2 border-brand-green" : "text-neutral-600 hover:bg-neutral-50"}`}
        >
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-shadow ${demandOpen ? "bg-brand-green text-white shadow-sm shadow-brand-green/30" : "bg-neutral-200 text-neutral-600"}`}>📊</span>
          Demand Plan
        </button>

        {/* M2 — Supply Requirements */}
        <button
          onClick={() => { setCompareOpen(false); setDemandOpen(false); setReconcileOpen(false); setDdpOpen(false); setReportOpen(false); setHomeOpen(false); setSupplyOpen(true); }}
          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${supplyOpen ? "bg-brand-green-tint text-brand-green-dark font-semibold border-r-2 border-brand-green" : "text-neutral-600 hover:bg-neutral-50"}`}
        >
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-shadow ${supplyOpen ? "bg-brand-green text-white shadow-sm shadow-brand-green/30" : "bg-neutral-200 text-neutral-600"}`}>🔗</span>
          Supply Requirements
        </button>

        {/* M3 — Reconciliation */}
        <button
          onClick={() => { setCompareOpen(false); setDemandOpen(false); setSupplyOpen(false); setDdpOpen(false); setReportOpen(false); setHomeOpen(false); setReconcileOpen(true); }}
          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${reconcileOpen ? "bg-brand-green-tint text-brand-green-dark font-semibold border-r-2 border-brand-green" : "text-neutral-600 hover:bg-neutral-50"}`}
        >
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-shadow ${reconcileOpen ? "bg-brand-green text-white shadow-sm shadow-brand-green/30" : "bg-neutral-200 text-neutral-600"}`}>⇌</span>
          Reconciliation
        </button>

        {/* M4 — Demand-Driven Placement */}
        <button
          onClick={() => { setCompareOpen(false); setDemandOpen(false); setSupplyOpen(false); setReconcileOpen(false); setReportOpen(false); setHomeOpen(false); setDdpOpen(true); }}
          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${ddpOpen ? "bg-brand-green-tint text-brand-green-dark font-semibold border-r-2 border-brand-green" : "text-neutral-600 hover:bg-neutral-50"}`}
        >
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-shadow ${ddpOpen ? "bg-brand-green text-white shadow-sm shadow-brand-green/30" : "bg-neutral-200 text-neutral-600"}`}>🎯</span>
          Demand-Driven Placement
        </button>

        {/* M5 — S&OP Report */}
        <button
          onClick={() => { setCompareOpen(false); setDemandOpen(false); setSupplyOpen(false); setReconcileOpen(false); setDdpOpen(false); setHomeOpen(false); setReportOpen(true); }}
          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${reportOpen ? "bg-brand-green-tint text-brand-green-dark font-semibold border-r-2 border-brand-green" : "text-neutral-600 hover:bg-neutral-50"}`}
        >
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-shadow ${reportOpen ? "bg-brand-green text-white shadow-sm shadow-brand-green/30" : "bg-neutral-200 text-neutral-600"}`}>📋</span>
          S&amp;OP Report
        </button>

        {/* ── Tools ── */}
        <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mt-4 mb-1">Tools</div>
        <button
          onClick={() => { setDemandOpen(false); setSupplyOpen(false); setReconcileOpen(false); setDdpOpen(false); setReportOpen(false); setHomeOpen(false); setCompareOpen(true); }}
          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${compareOpen ? "bg-brand-green-tint text-brand-green-dark font-semibold border-r-2 border-brand-green" : "text-neutral-600 hover:bg-neutral-50"}`}
        >
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-shadow ${compareOpen ? "bg-brand-green text-white shadow-sm shadow-brand-green/30" : "bg-neutral-200 text-neutral-600"}`}>⇄</span>
          Scenario Comparison
        </button>
      </nav>
    </aside>
  );
}

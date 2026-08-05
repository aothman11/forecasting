"use client";

import { useState } from "react";
import Image from "next/image";
import { STEPS, usePlanStore } from "@/lib/store";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

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
  const bomOpen = usePlanStore((s) => s.bomOpen);
  const setBomOpen = usePlanStore((s) => s.setBomOpen);
  const processingPlanOpen = usePlanStore((s) => s.processingPlanOpen);
  const setProcessingPlanOpen = usePlanStore((s) => s.setProcessingPlanOpen);

  const closeAll = () => {
    setCompareOpen(false); setDemandOpen(false); setSupplyOpen(false);
    setReconcileOpen(false); setDdpOpen(false); setReportOpen(false);
    setBomOpen(false); setProcessingPlanOpen(false);
  };

  const btnBase = "w-full text-left flex items-center transition-colors text-sm";
  const btnPad = collapsed ? "px-0 py-2.5 justify-center" : "px-4 py-2.5 gap-3";
  const badgeActive = "bg-brand-green text-white shadow-sm shadow-brand-green/30";
  const badgeIdle = "bg-neutral-200 text-neutral-600";

  function NavBtn({
    active, onClick, badge, label, title,
  }: {
    active: boolean; onClick: () => void; badge: string; label: string; title: string;
  }) {
    return (
      <button
        title={collapsed ? title : undefined}
        onClick={onClick}
        className={`${btnBase} ${btnPad} ${active ? "bg-brand-green-tint text-brand-green-dark font-semibold border-r-2 border-brand-green" : "text-neutral-600 hover:bg-neutral-50"}`}
      >
        <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-shadow ${active ? badgeActive : badgeIdle}`}>
          {badge}
        </span>
        {!collapsed && <span>{label}</span>}
      </button>
    );
  }

  return (
    <aside
      className={`relative shrink-0 border-r border-[var(--border-subtle)] bg-white flex flex-col transition-all duration-200 ${collapsed ? "w-14" : "w-64"}`}
    >
      {/* Collapse / expand tab — sticks out from the right edge */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3.5 top-6 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-white border border-[var(--border-subtle)] shadow-md text-neutral-500 hover:text-brand-green hover:border-brand-green transition-colors"
      >
        {collapsed ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        )}
      </button>

      {/* Header */}
      <div className={`border-b border-[var(--border-subtle)] bg-gradient-to-br from-brand-green-tint to-white ${collapsed ? "px-2 py-3 flex justify-center" : "px-4 py-4"}`}>
        {!collapsed && (
          <div>
            <Image src="/alwatania-logo-white.png" alt="Al-Watania Poultry" width={140} height={70} className="h-10 w-auto mb-2" priority />
            <div className="text-lg font-bold text-brand-green section-title leading-tight">AWP Production Forecast</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Demand → Supply · S&amp;OP</div>
          </div>
        )}
        {collapsed && (
          <Image src="/alwatania-logo-white.png" alt="" width={32} height={32} className="h-7 w-auto" priority />
        )}
      </div>

      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">

        {/* Home */}
        <div className={collapsed ? "" : "mb-2"}>
          <NavBtn
            active={homeOpen}
            onClick={() => { closeAll(); setHomeOpen(true); }}
            badge="🏠"
            label="Home"
            title="Home"
          />
        </div>

        {/* S&OP Modules header */}
        {!collapsed && (
          <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mb-1">S&amp;OP Modules</div>
        )}
        {collapsed && <div className="border-t border-neutral-100 my-1 mx-2" />}

        <NavBtn active={demandOpen} onClick={() => { closeAll(); setHomeOpen(false); setDemandOpen(true); }} badge="M1" label="Demand Plan" title="M1 · Demand Plan" />
        <NavBtn
          active={processingPlanOpen}
          onClick={() => { closeAll(); setHomeOpen(false); setProcessingPlanOpen(true); }}
          badge="PP"
          label="Processing Plan"
          title="Processing Plan (Demand)"
        />
        <NavBtn active={supplyOpen} onClick={() => { closeAll(); setHomeOpen(false); setSupplyOpen(true); }} badge="M2" label="Supply Requirements" title="M2 · Supply Requirements" />
        <NavBtn active={reconcileOpen} onClick={() => { closeAll(); setHomeOpen(false); setReconcileOpen(true); }} badge="M3" label="Reconciliation" title="M3 · Reconciliation" />
        <NavBtn active={ddpOpen} onClick={() => { closeAll(); setHomeOpen(false); setDdpOpen(true); }} badge="M4" label="Demand-Driven Placement" title="M4 · Demand-Driven Placement" />
        <NavBtn active={reportOpen} onClick={() => { closeAll(); setHomeOpen(false); setReportOpen(true); }} badge="M5" label="S&OP Report" title="M5 · S&OP Report" />

        {/* Master Data header */}
        {!collapsed && (
          <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mt-4 mb-1">Master Data</div>
        )}
        {collapsed && <div className="border-t border-neutral-100 my-1 mx-2" />}

        <NavBtn
          active={bomOpen}
          onClick={() => { closeAll(); setHomeOpen(false); setBomOpen(true); }}
          badge="BOM"
          label="Product BOM"
          title="Product BOM"
        />

        {/* Production Pipeline header */}
        {!collapsed && (
          <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mt-4 mb-1">Production Pipeline</div>
        )}
        {collapsed && <div className="border-t border-neutral-100 my-1 mx-2" />}

        {STEPS.map((step) => {
          const active = !compareOpen && !demandOpen && !supplyOpen && !reconcileOpen && !ddpOpen && !reportOpen && !homeOpen && selectedStep === step.id;
          return (
            <NavBtn
              key={step.id}
              active={active}
              onClick={() => { closeAll(); setHomeOpen(false); setSelectedStep(step.id); }}
              badge={String(step.id)}
              label={`${step.icon} ${step.label}`}
              title={`${step.icon} ${step.label}`}
            />
          );
        })}

        {/* Tools header */}
        {!collapsed && (
          <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mt-4 mb-1">Tools</div>
        )}
        {collapsed && <div className="border-t border-neutral-100 my-1 mx-2" />}

        <NavBtn active={compareOpen} onClick={() => { closeAll(); setHomeOpen(false); setCompareOpen(true); }} badge="⇄" label="Scenario Comparison" title="Scenario Comparison" />

      </nav>
    </aside>
  );
}

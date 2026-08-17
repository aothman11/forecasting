"use client";

import { useState } from "react";
import Image from "next/image";
import { STEPS, usePlanStore } from "@/lib/store";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFormStatus } from "react-dom";
import { logoutAction } from "@/app/actions/logout";
import { AdminOnly } from "@/components/auth/AdminOnly";
import { ROLE_LABELS } from "@/lib/role-permissions";

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
  const cutBalanceOpen = usePlanStore((s) => s.cutBalanceOpen);
  const setCutBalanceOpen = usePlanStore((s) => s.setCutBalanceOpen);
  const processingPlanOpen = usePlanStore((s) => s.processingPlanOpen);
  const setProcessingPlanOpen = usePlanStore((s) => s.setProcessingPlanOpen);
  const broilerIntakeOpen = usePlanStore((s) => s.broilerIntakeOpen);
  const setBroilerIntakeOpen = usePlanStore((s) => s.setBroilerIntakeOpen);
  const shortTermPlanningOpen = usePlanStore((s) => s.shortTermPlanningOpen);
  const setShortTermPlanningOpen = usePlanStore((s) => s.setShortTermPlanningOpen);

  const closeAll = () => {
    setCompareOpen(false); setDemandOpen(false); setSupplyOpen(false);
    setReconcileOpen(false); setDdpOpen(false); setReportOpen(false);
    setBomOpen(false); setProcessingPlanOpen(false); setBroilerIntakeOpen(false);
    setCutBalanceOpen(false); setShortTermPlanningOpen(false);
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
      className={`relative shrink-0 border-r border-[var(--border-subtle)] bg-white flex flex-col h-screen transition-all duration-200 ${collapsed ? "w-14" : "w-64"}`}
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
            <div className="text-lg font-bold text-brand-green section-title leading-tight">AWP COP</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Central Operational Planning</div>
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

        {/* COP Modules header */}
        {!collapsed && (
          <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mb-1">COP Modules</div>
        )}
        {collapsed && <div className="border-t border-neutral-100 my-1 mx-2" />}

        <NavBtn active={demandOpen} onClick={() => { closeAll(); setHomeOpen(false); setDemandOpen(true); }} badge="M1" label="Demand Plan" title="M1 · Demand Plan" />
        <NavBtn active={supplyOpen} onClick={() => { closeAll(); setHomeOpen(false); setSupplyOpen(true); }} badge="M2" label="Supply Requirements" title="M2 · Supply Requirements" />
        <NavBtn active={reconcileOpen} onClick={() => { closeAll(); setHomeOpen(false); setReconcileOpen(true); }} badge="M3" label="Reconciliation" title="M3 · Reconciliation" />
        <NavBtn active={ddpOpen} onClick={() => { closeAll(); setHomeOpen(false); setDdpOpen(true); }} badge="M4" label="Demand-Driven Placement" title="M4 · Demand-Driven Placement" />
        <NavBtn active={reportOpen} onClick={() => { closeAll(); setHomeOpen(false); setReportOpen(true); }} badge="M5" label="COP Report" title="M5 · COP Report" />

        {/* Processing Plan header */}
        {!collapsed && (
          <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mt-4 mb-1">Processing Plan</div>
        )}
        {collapsed && <div className="border-t border-neutral-100 my-1 mx-2" />}

        <NavBtn
          active={processingPlanOpen}
          onClick={() => { closeAll(); setHomeOpen(false); setProcessingPlanOpen(true); }}
          badge="PP"
          label="Carcass Requirement"
          title="Processing Plan — Carcass Requirement"
        />
        <NavBtn
          active={broilerIntakeOpen}
          onClick={() => { closeAll(); setHomeOpen(false); setBroilerIntakeOpen(true); }}
          badge="BI"
          label="Broiler Intake"
          title="Broiler Intake Plan — Supply vs Demand"
        />
        <NavBtn
          active={cutBalanceOpen}
          onClick={() => { closeAll(); setHomeOpen(false); setCutBalanceOpen(true); }}
          badge="WC"
          label="Whole Carcass Balance"
          title="Whole Carcass Balance — Cut Surplus from Demand"
        />
        <NavBtn
          active={shortTermPlanningOpen}
          onClick={() => { closeAll(); setHomeOpen(false); setShortTermPlanningOpen(true); }}
          badge="ST"
          label="Short-Term Planning"
          title="Broiler Short-Term Planning — Weekly Mix Analysis"
        />

        {/* Production Pipeline header */}
        {!collapsed && (
          <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mt-4 mb-1">Production Pipeline</div>
        )}
        {collapsed && <div className="border-t border-neutral-100 my-1 mx-2" />}

        {STEPS.map((step) => {
          const active = !compareOpen && !demandOpen && !supplyOpen && !reconcileOpen && !ddpOpen && !reportOpen && !homeOpen && !bomOpen && !processingPlanOpen && !broilerIntakeOpen && !cutBalanceOpen && !shortTermPlanningOpen && selectedStep === step.id;
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

        <NavBtn active={compareOpen} onClick={() => { closeAll(); setHomeOpen(false); setCompareOpen(true); }} badge="⇄" label="Saved Plans" title="Saved Plans" />

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

        {/* Admin section */}
        <AdminOnly>
          {!collapsed && (
            <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mt-4 mb-1">Admin</div>
          )}
          {collapsed && <div className="border-t border-neutral-100 my-1 mx-2" />}
          <NavBtn
            active={false}
            onClick={() => { window.location.href = "/admin/users"; }}
            badge="👤"
            label="User Management"
            title="User Management"
          />
        </AdminOnly>

      </nav>

      {/* User identity footer + logout */}
      <UserFooter collapsed={collapsed} />
    </aside>
  );
}

// ── Logout submit button (needs useFormStatus inside a <form>) ──────────────
function LogoutButton({ collapsed }: { collapsed: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Sign out"
      className="flex items-center justify-center w-7 h-7 rounded-md text-neutral-400 hover:text-brand-alert hover:bg-neutral-100 transition-colors shrink-0 disabled:opacity-40"
    >
      {pending ? (
        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      )}
      {!collapsed && <span className="ml-1.5 text-xs">{pending ? "…" : "Sign out"}</span>}
    </button>
  );
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const user = useCurrentUser();
  if (!user) return null;

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`border-t border-[var(--border-subtle)] ${collapsed ? "px-2 py-3 flex flex-col items-center gap-2" : "px-3 py-3"}`}>
      {collapsed ? (
        <>
          {/* Avatar only when collapsed */}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
            style={{ background: "var(--brand-green)" }}
            title={`${user.name} · ${roleLabel}`}
          >
            {initials}
          </div>
          <form action={logoutAction}>
            <LogoutButton collapsed />
          </form>
        </>
      ) : (
        <div className="flex items-center gap-2">
          {/* Avatar */}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
            style={{ background: "var(--brand-green)" }}
          >
            {initials}
          </div>
          {/* Name + role */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-neutral-700 truncate">{user.name}</div>
            <span
              className="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-full mt-0.5 leading-tight"
              style={{
                background: user.role === "admin" ? "#047836" : user.role === "sales_planner" ? "#C49A1A" : user.role === "broiler_planner" ? "#1a6fc4" : "#6b2fc4",
                color: "#fff",
              }}
            >
              {roleLabel}
            </span>
          </div>
          {/* Logout */}
          <form action={logoutAction}>
            <LogoutButton collapsed={false} />
          </form>
        </div>
      )}
    </div>
  );
}

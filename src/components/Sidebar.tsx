"use client";

import Image from "next/image";
import { STEPS, usePlanStore } from "@/lib/store";

export function Sidebar() {
  const selectedStep = usePlanStore((s) => s.selectedStep);
  const setSelectedStep = usePlanStore((s) => s.setSelectedStep);
  const compareOpen = usePlanStore((s) => s.compareOpen);
  const setCompareOpen = usePlanStore((s) => s.setCompareOpen);

  return (
    <aside className="w-64 shrink-0 border-r border-[var(--border-subtle)] bg-white flex flex-col">
      <div className="px-4 py-4 border-b border-[var(--border-subtle)] bg-gradient-to-br from-brand-green-tint to-white">
        <Image src="/alwatania-logo-white.png" alt="Al-Watania Poultry" width={140} height={70} className="h-10 w-auto mb-2" priority />
        <div className="text-lg font-bold text-brand-green section-title leading-tight">
          AWP Production Forecast
        </div>
        <div className="text-[11px] text-neutral-500 mt-0.5">Placement → Processing Plan</div>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mb-1">
          Planning Steps
        </div>
        {STEPS.map((step) => {
          const active = !compareOpen && selectedStep === step.id;
          return (
            <button
              key={step.id}
              onClick={() => {
                setCompareOpen(false);
                setSelectedStep(step.id);
              }}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${
                active
                  ? "bg-brand-green-tint text-brand-green-dark font-semibold border-r-2 border-brand-green"
                  : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <span
                className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-shadow ${
                  active ? "bg-brand-green text-white shadow-sm shadow-brand-green/30" : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {step.id}
              </span>
              {step.label}
            </button>
          );
        })}

        <div className="px-4 text-[11px] uppercase tracking-wide text-neutral-400 font-semibold mt-4 mb-1">
          Cross-Cutting
        </div>
        <button
          onClick={() => setCompareOpen(true)}
          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${
            compareOpen
              ? "bg-brand-green-tint text-brand-green-dark font-semibold border-r-2 border-brand-green"
              : "text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          <span
            className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-shadow ${
              compareOpen ? "bg-brand-green text-white shadow-sm shadow-brand-green/30" : "bg-neutral-200 text-neutral-600"
            }`}
          >
            ⇄
          </span>
          Scenario Comparison
        </button>
      </nav>
    </aside>
  );
}

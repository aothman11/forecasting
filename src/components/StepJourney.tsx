"use client";

import { STEPS, usePlanStore } from "@/lib/store";

export function StepJourney() {
  const selectedStep = usePlanStore((s) => s.selectedStep);
  const compareOpen = usePlanStore((s) => s.compareOpen);
  const demandOpen = usePlanStore((s) => s.demandOpen);
  const homeOpen = usePlanStore((s) => s.homeOpen);
  const setSelectedStep = usePlanStore((s) => s.setSelectedStep);
  const setCompareOpen = usePlanStore((s) => s.setCompareOpen);
  const setDemandOpen = usePlanStore((s) => s.setDemandOpen);
  const setHomeOpen = usePlanStore((s) => s.setHomeOpen);
  const inStepView = !compareOpen && !demandOpen && !homeOpen;

  return (
    <div className="flex items-center justify-center gap-1.5 px-6 py-3 bg-white border-b border-[var(--border-subtle)] overflow-x-auto">
      {STEPS.map((step, i) => {
        const active = inStepView && selectedStep === step.id;
        const done = inStepView && selectedStep > step.id;
        return (
          <div key={step.id} className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                setCompareOpen(false);
                setDemandOpen(false);
                setHomeOpen(false);
                setSelectedStep(step.id);
              }}
              className="flex flex-col items-center gap-1 group"
            >
              <span
                className={`flex items-center justify-center w-9 h-9 rounded-full text-base shadow-sm transition-all ${
                  active
                    ? "bg-brand-green text-white shadow-brand-green/30 scale-110"
                    : done
                    ? "bg-brand-green-tint text-brand-green"
                    : "bg-neutral-100 text-neutral-400 group-hover:bg-neutral-200"
                }`}
              >
                {step.icon}
              </span>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  active ? "text-brand-green-dark" : "text-neutral-400"
                }`}
              >
                {step.short}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span className={`text-sm mb-4 ${done ? "text-brand-green" : "text-neutral-300"}`}>→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

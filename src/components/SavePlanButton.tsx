"use client";

import { useRef, useState } from "react";
import { usePlanStore } from "@/lib/store";

/**
 * Header-level "Save Plan" button.
 * Saves a full snapshot of the current aligned plan (params + placement + demand)
 * using the existing ScenarioSnapshot / saveScenario mechanism, so it appears
 * in Scenario Compare for side-by-side review.
 */
export function SavePlanButton() {
  const saveScenario = usePlanStore((s) => s.saveScenario);
  const scenarios = usePlanStore((s) => s.scenarios);

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpen = () => {
    const today = new Date().toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
    setLabel(`Aligned Plan – ${today}`);
    setOpen(true);
    setTimeout(() => inputRef.current?.select(), 50);
  };

  const handleSave = () => {
    const name = label.trim() || `Aligned Plan – ${new Date().toLocaleDateString("en-GB")}`;
    saveScenario(name);
    setOpen(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="relative">
      {/* Trigger button */}
      {!open && (
        <button
          onClick={handleOpen}
          title="Save a full snapshot of the current aligned plan (production + demand)"
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1.5 ${
            saved
              ? "border-brand-green bg-brand-green-tint text-brand-green-dark"
              : "border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green text-neutral-600"
          }`}
        >
          {saved ? (
            <>✓ Plan Saved</>
          ) : (
            <>💾 Save Plan</>
          )}
          {scenarios.length > 0 && !saved && (
            <span className="ml-0.5 text-[10px] bg-neutral-100 text-neutral-500 rounded-full px-1.5 py-0.5 font-semibold">
              {scenarios.length}
            </span>
          )}
        </button>
      )}

      {/* Inline label input */}
      {open && (
        <div className="flex items-center gap-2 bg-white border border-brand-green rounded-md px-2 py-1 shadow-sm">
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Label this plan version…"
            className="text-xs outline-none w-52 text-neutral-700 placeholder-neutral-400"
            autoFocus
          />
          <button
            onClick={handleSave}
            className="text-xs font-semibold text-brand-green-dark hover:text-brand-green whitespace-nowrap"
          >
            Save
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-neutral-400 hover:text-neutral-600 text-sm leading-none"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

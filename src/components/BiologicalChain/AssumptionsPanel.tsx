"use client";
/**
 * AssumptionsPanel — collapsible right-hand panel for editing BioChainAssumptions.
 *
 * Groups are color-coded: AWP (green) / GP (amber).
 * Each field is an inline number input with unit label.
 * Decimal fields (mortality, hatchability, HDP, ratio) are displayed as
 * percentages for readability but stored as fractions (0–1).
 */

import React, { useState } from "react";
import { BioChainAssumptions } from "@/lib/biologicalChain/types";
import { ASSUMPTION_GROUPS, AssumptionField } from "@/lib/biologicalChain/constants";
import { totalLeadWeeks } from "@/lib/biologicalChain/calculations";

interface Props {
  assumptions: BioChainAssumptions;
  onChange: (next: BioChainAssumptions) => void;
}

function isPct(unit: string) {
  return unit === "decimal" || unit === "eggs/hen/day";
}

export function AssumptionsPanel({ assumptions, onChange }: Props) {
  const [open, setOpen] = useState<Set<string>>(
    new Set(ASSUMPTION_GROUPS.map((g) => g.id)),
  );

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  function handleChange(field: AssumptionField, rawValue: string) {
    const parsed = parseFloat(rawValue);
    if (isNaN(parsed)) return;
    const stored = field.unit === "decimal" ? parsed / 100
      : field.unit === "eggs/hen/day" ? parsed / 100
      : parsed;
    const clamped = Math.max(field.min, Math.min(field.max, stored));
    onChange({ ...assumptions, [field.key]: clamped });
  }

  function displayValue(field: AssumptionField): string {
    const v = assumptions[field.key] as number;
    if (field.unit === "decimal") return (v * 100).toFixed(1);
    if (field.unit === "eggs/hen/day") return (v * 100).toFixed(1);
    return String(v);
  }

  function displayUnit(field: AssumptionField): string {
    if (field.unit === "decimal") return "%";
    if (field.unit === "eggs/hen/day") return "% HDP";
    return field.unit;
  }

  const lead = totalLeadWeeks(assumptions);

  return (
    <aside className="w-72 shrink-0 border-l border-[var(--border-subtle)] bg-white flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div>
          <div className="text-sm font-semibold text-neutral-800">Biological Assumptions</div>
          <div className="text-[10px] text-neutral-400 mt-0.5">
            Total lead time: <span className="font-bold text-neutral-700">{lead} wks</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {ASSUMPTION_GROUPS.map((group) => {
          const isOpen = open.has(group.id);
          const isGP = group.company === "GP";
          const accentColor = isGP ? "#b45309" : "#15803d";
          const bgTint = isGP ? "rgba(180,83,9,0.06)" : "rgba(21,128,61,0.06)";

          return (
            <div key={group.id} className="border-b border-neutral-100 last:border-0">
              {/* Group header — clickable collapse toggle */}
              <button
                onClick={() => toggle(group.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: accentColor }}
                  />
                  <span className="text-xs font-semibold text-neutral-700">{group.title}</span>
                </div>
                <svg
                  width="12" height="12" viewBox="0 0 12 12" fill="none"
                  className="shrink-0 transition-transform"
                  style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  <path d="M2 4l4 4 4-4" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {isOpen && (
                <div className="px-4 pb-3" style={{ background: bgTint }}>
                  {group.fields.map((field) => (
                    <div key={field.key} className="flex items-center justify-between mt-2 gap-2">
                      <label className="text-[11px] text-neutral-600 leading-tight flex-1 min-w-0">
                        {field.label}
                      </label>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          step={field.unit === "decimal" || field.unit === "eggs/hen/day" ? 0.1 : field.step}
                          min={field.unit === "decimal" || field.unit === "eggs/hen/day" ? field.min * 100 : field.min}
                          max={field.unit === "decimal" || field.unit === "eggs/hen/day" ? field.max * 100 : field.max}
                          value={displayValue(field)}
                          onChange={(e) => handleChange(field, e.target.value)}
                          className="w-16 text-right text-xs border border-neutral-200 rounded px-1.5 py-1 focus:outline-none focus:border-brand-green bg-white"
                        />
                        <span className="text-[10px] text-neutral-400 w-10">{displayUnit(field)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reset to defaults */}
      <div className="shrink-0 border-t border-neutral-100 px-4 py-3">
        <button
          onClick={() => {
            import("@/lib/biologicalChain/constants").then(({ DEFAULT_BIO_ASSUMPTIONS }) => {
              onChange({ ...DEFAULT_BIO_ASSUMPTIONS });
            });
          }}
          className="w-full text-xs text-neutral-500 hover:text-brand-green hover:bg-brand-green-tint border border-neutral-200 hover:border-brand-green rounded-md py-1.5 transition-colors"
        >
          Reset to defaults
        </button>
      </div>
    </aside>
  );
}

"use client";

import { useState } from "react";
import { prepPhases, type PrepPhase } from "@/lib/cLayer/calc";
import { LAYER_PLANTS, PREP_GROUP_PLANT, type LayerPrepOperation, type PrepGroup } from "@/lib/cLayer/types";
import { btnText } from "./ui";

type Kind = "pest" | "cleaning" | "disinfection" | "maintenance" | "rest" | "lab";

/** Colour family per kind of work, so the routing reads at a glance. */
const KIND: Record<Kind, { label: string; bar: string; dot: string }> = {
  pest:         { label: "Pest control",  bar: "bg-[#d24918]",            dot: "bg-[#d24918]" },
  cleaning:     { label: "Cleaning",      bar: "bg-[#2f7fb5]",            dot: "bg-[#2f7fb5]" },
  disinfection: { label: "Disinfection",  bar: "bg-[#7a4fb0]",            dot: "bg-[#7a4fb0]" },
  maintenance:  { label: "Maintenance",   bar: "bg-brand-gold",           dot: "bg-brand-gold" },
  rest:         { label: "Rest period",   bar: "bg-[#cfdad3]",            dot: "bg-[#cfdad3]" },
  lab:          { label: "Lab check",     bar: "bg-brand-green",          dot: "bg-brand-green" },
};

function kindOf(text: string): Kind {
  const t = text.toLowerCase();
  if (/rodent|insect|beatle|pest/.test(t)) return "pest";
  if (/disinfect/.test(t)) return "disinfection";
  if (/lab/.test(t)) return "lab";
  if (/rest/.test(t)) return "rest";
  if (/maint/.test(t)) return "maintenance";
  return "cleaning";
}

const days = (p: PrepPhase) => p.toDay - p.fromDay + 1;
const dayRange = (p: PrepPhase) => (p.fromDay === p.toDay ? `Day ${p.fromDay}` : `Days ${p.fromDay}–${p.toDay}`);
const codeRange = (p: PrepPhase) => (p.opCodes.length > 1 ? `${p.opCodes[0]} – ${p.opCodes.at(-1)}` : p.opCodes[0]);

export function PrepTimeline({ group, operations }: { group: PrepGroup; operations: LayerPrepOperation[] }) {
  const [showOps, setShowOps] = useState(false);
  const plant = PREP_GROUP_PLANT[group];
  const phases = prepPhases(operations);
  const total = operations.reduce((m, o) => Math.max(m, o.day), 0);

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-brand-green-dark">{group}</span>
        <span className="text-xs text-neutral-500">Plant {plant} · {LAYER_PLANTS[plant]}</span>
      </div>
      {total > 0 && (
        <span className="text-xs text-neutral-600">
          <span className="font-semibold tabular-nums">{total}</span> days · {(total / 7).toFixed(1)} weeks · {operations.length} operations
        </span>
      )}
    </div>
  );

  if (!total) {
    return (
      <div className="rounded-lg border border-[var(--border-subtle)] p-4 flex flex-col gap-2">
        {header}
        <p className="text-xs text-brand-alert">No routing — no preparation period is planned for plant {plant}.</p>
      </div>
    );
  }

  const weekTicks = Array.from({ length: Math.floor(total / 7) }, (_, i) => (i + 1) * 7).filter((d) => total - d >= 6);
  const usedKinds = [...new Set(phases.map((p) => kindOf(p.text)))];

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] p-4 flex flex-col gap-4 min-w-0">
      {header}

      {/* Day-scaled timeline: one segment per phase, ticks at the end of each week. */}
      <div>
        <div className="relative flex h-9 w-full overflow-hidden rounded-md ring-1 ring-black/5">
          {phases.map((p, i) => {
            const k = kindOf(p.text);
            return (
              <div
                key={i}
                className={`${KIND[k].bar} h-full border-r border-white/70 last:border-r-0 flex items-center justify-center overflow-hidden`}
                style={{ width: `${(days(p) / total) * 100}%` }}
                title={`${dayRange(p)} · ${p.text} (${days(p)} day${days(p) > 1 ? "s" : ""})`}
              >
                {days(p) / total > 0.12 && (
                  <span className={`truncate px-1 text-[10px] font-semibold ${k === "rest" ? "text-neutral-600" : "text-white"}`}>{p.text}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="relative h-4 mt-1 text-[9px] text-neutral-400 tabular-nums">
          <span className="absolute left-0">Day 1</span>
          {weekTicks.map((d) => (
            <span key={d} className="absolute -translate-x-1/2" style={{ left: `${(d / total) * 100}%` }}>
              W{d / 7}
            </span>
          ))}
          <span className="absolute right-0">Day {total}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {usedKinds.map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[10px] text-neutral-500">
              <span className={`h-2 w-2 rounded-full ${KIND[k].dot}`} />
              {KIND[k].label} · {phases.filter((p) => kindOf(p.text) === k).reduce((s, p) => s + days(p), 0)} d
            </span>
          ))}
        </div>
      </div>

      {/* Phase sequence */}
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {phases.map((p, i) => {
          const k = kindOf(p.text);
          return (
            <li key={i} className="flex gap-3 rounded-md bg-neutral-50 px-3 py-2 min-w-0">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${KIND[k].dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-neutral-800 truncate" title={p.text}>{p.text}</span>
                  <span className="text-[10px] font-semibold text-neutral-500 tabular-nums whitespace-nowrap">{days(p)} d</span>
                </div>
                <div className="text-[10px] text-neutral-500 tabular-nums">
                  {dayRange(p)} · {codeRange(p)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div>
        <button className={btnText} onClick={() => setShowOps(!showOps)}>
          {showOps ? "Hide" : "Show"} all {operations.length} SAP operations
        </button>
        {showOps && (
          <div className="max-h-72 overflow-y-auto mt-2">
            <table className="data-grid text-xs w-full">
              <thead><tr><th className="text-right">Day</th><th className="text-left">Operation</th><th className="text-left">Text</th></tr></thead>
              <tbody>
                {operations.map((o) => (
                  <tr key={o.seq}><td className="text-right tabular-nums">{o.day}</td><td>{o.opCode}</td><td>{o.text}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
/**
 * GpFlockRegister — CRUD table for the GP flock fleet.
 *
 * Shows each flock with its computed status, age, lay-start / depop dates.
 * Users can add, rename, adjust female count, change placement week, and delete flocks.
 *
 * Placement weeks are displayed as calendar dates computed from planStartDate + (week−1)×7d.
 * Status at plan Week 1:
 *   future   → age < 0  (not yet placed)
 *   rearing  → 0 ≤ age < gpRearingWeeks
 *   laying   → gpRearingWeeks ≤ age < gpLayEndAgeWeeks
 *   completed→ age ≥ gpLayEndAgeWeeks
 */

import React, { useState } from "react";
import type { BioChainGpFlock, GpFlockStatus } from "@/lib/biologicalChain/types";
import type { BioChainAssumptions } from "@/lib/biologicalChain/types";
import { isoForWeek } from "@/lib/biologicalChain/calculations";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  flocks: BioChainGpFlock[];
  assumptions: BioChainAssumptions;
  /** ISO date for plan Week 1 (used to display placement dates). */
  planWeek1Date: string;
  onAdd: (flock: BioChainGpFlock) => void;
  onUpdate: (id: string, patch: Partial<BioChainGpFlock>) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const N = new Intl.NumberFormat("en-US");

function flockStatus(
  ageAtW1: number,
  layStartAge: number,
  layEndAge: number,
): GpFlockStatus {
  if (ageAtW1 < 0) return "future";
  if (ageAtW1 < layStartAge) return "rearing";
  if (ageAtW1 < layEndAge) return "laying";
  return "completed";
}

const STATUS_LABELS: Record<GpFlockStatus, string> = {
  future:    "Future",
  rearing:   "Rearing",
  laying:    "Laying",
  completed: "Completed",
};

const STATUS_COLORS: Record<GpFlockStatus, { bg: string; text: string }> = {
  future:    { bg: "rgba(156,163,175,0.15)", text: "#6b7280" },
  rearing:   { bg: "rgba(59,130,246,0.12)",  text: "#1d4ed8" },
  laying:    { bg: "rgba(180,83,9,0.14)",    text: "#92400e" },
  completed: { bg: "rgba(107,114,128,0.1)",  text: "#9ca3af" },
};

/** Generate the next flock ID from the existing list. */
function nextFlockId(existing: BioChainGpFlock[]): string {
  return `gp-custom-${Date.now()}`;
}

/** Compute the placement week for a new flock to continue the 7-week cycle. */
function suggestNextPlacementWeek(flocks: BioChainGpFlock[]): number {
  if (flocks.length === 0) return 4;
  const latest = Math.max(...flocks.map((f) => f.placementWeek));
  return latest + 7;
}

// ─── Inline editable cell ─────────────────────────────────────────────────────

function EditableCell({
  value,
  onCommit,
  type = "text",
  className = "",
}: {
  value: string | number;
  onCommit: (v: string) => void;
  type?: "text" | "number";
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function commit() {
    setEditing(false);
    onCommit(draft);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setEditing(false); setDraft(String(value)); }
        }}
        className={`w-full border border-[#b45309] rounded px-1.5 py-0.5 text-xs focus:outline-none bg-white ${className}`}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      title="Click to edit"
      className={`cursor-text hover:bg-amber-50 rounded px-1 py-0.5 transition-colors ${className}`}
    >
      {value}
    </span>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function GpFlockRegister({
  flocks,
  assumptions,
  planWeek1Date,
  onAdd,
  onUpdate,
  onRemove,
  onReset,
}: Props) {
  const [showDetail, setShowDetail] = useState(true);

  const layStartAge = assumptions.gpRearingWeeks;
  const layEndAge   = assumptions.gpLayEndAgeWeeks;

  // Sort flocks by placement week ascending (oldest first)
  const sorted = [...flocks].sort((a, b) => a.placementWeek - b.placementWeek);

  const layingCount   = sorted.filter((f) => {
    const age = 1 - f.placementWeek;
    return age >= layStartAge && age < layEndAge;
  }).length;
  const rearingCount  = sorted.filter((f) => {
    const age = 1 - f.placementWeek;
    return age >= 0 && age < layStartAge;
  }).length;
  const totalFemales  = sorted.reduce((s, f) => s + f.femaleCount, 0);

  function addFlock() {
    const placementWeek = suggestNextPlacementWeek(flocks);
    onAdd({
      id: nextFlockId(flocks),
      name: `GP Flock ${String.fromCharCode(65 + flocks.length % 26)}`,
      placementWeek,
      femaleCount: 12198,
    });
  }

  return (
    <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden mb-3">
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-neutral-50 transition-colors"
        onClick={() => setShowDetail((o) => !o)}
        style={{ background: showDetail ? "white" : undefined }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Chevron */}
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            className="shrink-0 transition-transform"
            style={{ transform: showDetail ? "rotate(180deg)" : "rotate(0deg)", color: "#9ca3af" }}
          >
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>

          {/* GP badge */}
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: "rgba(180,83,9,0.12)", color: "#92400e" }}
          >
            GP
          </span>

          <span className="text-sm font-semibold text-neutral-800">GP Flock Fleet Register</span>

          {/* Fleet summary pills */}
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full hidden sm:inline-block"
            style={{ background: "rgba(180,83,9,0.10)", color: "#92400e" }}
          >
            {layingCount} laying
          </span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full hidden sm:inline-block"
            style={{ background: "rgba(59,130,246,0.10)", color: "#1d4ed8" }}
          >
            {rearingCount} rearing
          </span>
          <span className="text-xs text-neutral-400 hidden md:block">
            {N.format(Math.round(totalFemales / flocks.length || 0))} F/flock avg
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-neutral-400">{flocks.length} flocks</span>
          <button
            onClick={(e) => { e.stopPropagation(); addFlock(); }}
            className="text-xs font-medium px-2.5 py-1 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
          >
            + Add Flock
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm("Reset to the 9 default flocks?")) onReset();
            }}
            className="text-xs text-neutral-400 hover:text-neutral-600 border border-neutral-200 hover:border-neutral-300 rounded-md px-2.5 py-1 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* ── Table body ── */}
      {showDetail && (
        <div className="overflow-x-auto border-t border-[var(--border-subtle)]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-amber-50/60">
                {[
                  "Flock Name",
                  "Placement Wk",
                  "Placement Date",
                  "Females",
                  "Age at W1",
                  "Status",
                  "Lay Start",
                  "Depop Wk",
                  "",
                ].map((h, i) => (
                  <th
                    key={i}
                    className={`px-3 py-2 font-semibold text-neutral-600 border-b border-amber-100 whitespace-nowrap ${i >= 3 ? "text-right" : "text-left"}`}
                    style={{ color: "#92400e" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((flock) => {
                const ageAtW1    = 1 - flock.placementWeek;
                const status     = flockStatus(ageAtW1, layStartAge, layEndAge);
                const { bg, text } = STATUS_COLORS[status];
                const placementDate = isoForWeek(flock.placementWeek, 1, planWeek1Date);
                const layStartWk    = flock.placementWeek + layStartAge;
                const depopWk       = flock.placementWeek + layEndAge;
                const layStartDate  = isoForWeek(layStartWk, 1, planWeek1Date);

                return (
                  <tr
                    key={flock.id}
                    className="border-b border-neutral-100 last:border-0 hover:bg-amber-50/30"
                  >
                    {/* Name */}
                    <td className="px-3 py-2 font-medium text-neutral-800">
                      <EditableCell
                        value={flock.name}
                        onCommit={(v) => onUpdate(flock.id, { name: v.trim() || flock.name })}
                      />
                    </td>

                    {/* Placement week */}
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                      <EditableCell
                        value={flock.placementWeek}
                        type="number"
                        onCommit={(v) => {
                          const n = parseInt(v, 10);
                          if (!isNaN(n)) onUpdate(flock.id, { placementWeek: n });
                        }}
                        className="text-right w-16"
                      />
                    </td>

                    {/* Placement date */}
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                      {placementDate}
                    </td>

                    {/* Female count */}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "#92400e" }}>
                      <EditableCell
                        value={N.format(flock.femaleCount)}
                        type="number"
                        onCommit={(v) => {
                          const n = parseInt(v.replace(/,/g, ""), 10);
                          if (!isNaN(n) && n > 0) onUpdate(flock.id, { femaleCount: n });
                        }}
                        className="text-right w-24"
                      />
                    </td>

                    {/* Age at plan W1 */}
                    <td
                      className="px-3 py-2 text-right tabular-nums"
                      style={{ color: ageAtW1 < 0 ? "#9ca3af" : "inherit" }}
                    >
                      {ageAtW1 < 0 ? `−${Math.abs(ageAtW1)} (future)` : `${ageAtW1} wks`}
                    </td>

                    {/* Status pill */}
                    <td className="px-3 py-2 text-right">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: bg, color: text }}
                      >
                        {STATUS_LABELS[status]}
                      </span>
                    </td>

                    {/* Lay start */}
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                      W{layStartWk} · {layStartDate}
                    </td>

                    {/* Depop week */}
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                      W{depopWk}
                    </td>

                    {/* Delete */}
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => onRemove(flock.id)}
                        title="Remove flock"
                        className="text-neutral-300 hover:text-red-500 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {flocks.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-5 text-xs text-neutral-400 text-center">
                    No flocks registered — click &quot;+ Add Flock&quot; or &quot;Reset&quot; to restore defaults.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

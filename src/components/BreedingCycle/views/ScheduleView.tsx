"use client";
/**
 * ScheduleView — Procurement & Operational Action Schedule.
 *
 * Shows all procurement actions sorted by date:
 *   Ross POs (order dates 52 wks before arrival)
 *   GP Orders (order dates ~52 wks before GP placement)
 *   GP Flock Transfers (3300 → 3200 at lay start)
 *   PS Transfers (1230 → 1220 at lay start)
 *   GP Depopulations
 *   PS Depopulations
 *
 * Filter by breed, type, or urgency.
 */

import React, { useMemo, useState } from "react";
import type { ProcurementAction, ProcActionType } from "@/lib/breedingCycleTypes";

interface Props {
  actions: ProcurementAction[];
  today: string; // ISO yyyy-mm-dd
}

const TYPE_META: Record<ProcActionType, { label: string; icon: string }> = {
  "ross-po":      { label: "Ross PO",        icon: "📋" },
  "gp-order":     { label: "GP Order",        icon: "🛒" },
  "gp-to-laying": { label: "GP → Laying",     icon: "🔀" },
  "ps-to-laying": { label: "PS → Laying",     icon: "🔀" },
  "gp-depop":     { label: "GP Depop",        icon: "❌" },
  "ps-depop":     { label: "PS Depop",        icon: "❌" },
};

const URGENCY_STYLES: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  overdue:  { bg: "#fff1f2", text: "#dc2626", border: "#fca5a5", badge: "🔴 Overdue" },
  "due-soon":{ bg: "#fffbeb", text: "#d97706", border: "#fcd34d", badge: "⚠️ Due Soon" },
  ok:       { bg: "white",   text: "#374151", border: "#e5e7eb", badge: "" },
};

const BREED_META: Record<string, { label: string; color: string; bg: string }> = {
  "cobb-gp":  { label: "Cobb GP",  color: "#92400e", bg: "rgba(180,83,9,0.10)" },
  "cobb-ps":  { label: "Cobb PS",  color: "#1d4ed8", bg: "rgba(59,130,246,0.10)" },
  "ross-308": { label: "Ross-308", color: "#1d4ed8", bg: "rgba(59,130,246,0.10)" },
};

export function ScheduleView({ actions, today }: Props) {
  const [filterBreed, setFilterBreed]   = useState<string>("all");
  const [filterType,  setFilterType]    = useState<string>("all");
  const [filterUrgency, setFilterUrgency] = useState<string>("all");
  const [showPast,    setShowPast]      = useState(false);

  const filtered = useMemo(() => {
    return actions.filter((a) => {
      if (!showPast && a.actionDate < today) return false;
      if (filterBreed   !== "all" && a.breed   !== filterBreed)   return false;
      if (filterType    !== "all" && a.type    !== filterType)    return false;
      if (filterUrgency !== "all" && a.urgency !== filterUrgency) return false;
      return true;
    });
  }, [actions, filterBreed, filterType, filterUrgency, showPast, today]);

  const overdueCount  = actions.filter((a) => a.urgency === "overdue").length;
  const dueSoonCount  = actions.filter((a) => a.urgency === "due-soon").length;
  const totalCount    = actions.length;

  return (
    <div className="p-6 space-y-5">
      {/* ── Alert banner ── */}
      {(overdueCount > 0 || dueSoonCount > 0) && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
          overdueCount > 0
            ? "bg-red-50 border-red-200 text-red-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          {overdueCount > 0 ? "🔴" : "⚠️"}
          {overdueCount > 0
            ? `${overdueCount} action${overdueCount > 1 ? "s" : ""} are overdue`
            : `${dueSoonCount} action${dueSoonCount > 1 ? "s" : ""} due within 4 weeks`}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterBreed}
          onChange={(e) => setFilterBreed(e.target.value)}
          className="text-xs border border-[var(--border-subtle)] rounded-md px-2 py-1.5 focus:outline-none focus:border-brand-green"
        >
          <option value="all">All breeds</option>
          <option value="cobb-gp">Cobb GP</option>
          <option value="ross-308">Ross-308</option>
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-xs border border-[var(--border-subtle)] rounded-md px-2 py-1.5 focus:outline-none focus:border-brand-green"
        >
          <option value="all">All action types</option>
          {(Object.keys(TYPE_META) as ProcActionType[]).map((t) => (
            <option key={t} value={t}>{TYPE_META[t].label}</option>
          ))}
        </select>

        <select
          value={filterUrgency}
          onChange={(e) => setFilterUrgency(e.target.value)}
          className="text-xs border border-[var(--border-subtle)] rounded-md px-2 py-1.5 focus:outline-none focus:border-brand-green"
        >
          <option value="all">All urgency</option>
          <option value="overdue">🔴 Overdue</option>
          <option value="due-soon">⚠️ Due soon</option>
          <option value="ok">✅ OK</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer select-none">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
          Show past actions
        </label>

        <span className="text-xs text-neutral-400 ml-auto">{filtered.length} / {totalCount} actions</span>
      </div>

      {/* ── Action table ── */}
      <div className="bg-white border border-[var(--border-subtle)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: "var(--brand-green-tint)" }}>
                {["Status", "Date", "Action Type", "Breed", "Plant", "Qty", "Notes"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-neutral-700 border-b border-green-200 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                    No actions match the current filters.
                    {actions.length === 0 && " Add GP flocks or Ross PS orders to generate a schedule."}
                  </td>
                </tr>
              ) : (
                filtered.map((a) => {
                  const us = URGENCY_STYLES[a.urgency];
                  const bm = BREED_META[a.breed];
                  const tm = TYPE_META[a.type];
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-neutral-100 last:border-0"
                      style={{ background: us.bg }}
                    >
                      {/* Status badge */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        {a.urgency === "ok" ? (
                          <span className="text-[10px] text-neutral-400">✅</span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ color: us.text, background: a.urgency === "overdue" ? "#fee2e2" : "#fef3c7" }}>
                            {us.badge}
                          </span>
                        )}
                      </td>
                      {/* Date */}
                      <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: us.text }}>
                        {a.actionDate}
                      </td>
                      {/* Type */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <span>{tm.icon}</span>
                          <span className="font-medium text-neutral-800">{tm.label}</span>
                        </span>
                      </td>
                      {/* Breed */}
                      <td className="px-3 py-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: bm.bg, color: bm.color }}>
                          {bm.label}
                        </span>
                      </td>
                      {/* Plant */}
                      <td className="px-3 py-2 tabular-nums text-neutral-600 font-mono text-[10px]">{a.plant}</td>
                      {/* Qty */}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-neutral-800">
                        {a.qty > 0 ? new Intl.NumberFormat("en-US").format(Math.round(a.qty)) : "—"}
                      </td>
                      {/* Notes */}
                      <td className="px-3 py-2 text-neutral-600 max-w-xs truncate" title={a.notes}>{a.notes}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[10px] text-neutral-500">
        <span className="font-semibold">Legend:</span>
        <span>📋 Purchase Order issued to supplier</span>
        <span>🔀 Internal flock transfer between plants</span>
        <span>❌ Depopulation / flock removal</span>
        <span>🔴 Overdue = past due date</span>
        <span>⚠️ Due soon = within 4 weeks</span>
      </div>
    </div>
  );
}

"use client";
/**
 * StageTable — reusable collapsible table for one biological chain stage.
 *
 * Each stage (e.g. GP Rearing, AWP PS Laying) renders as:
 *   • A clickable header row with stage name, company badge, and row count
 *   • A horizontally-scrollable table body (hidden when collapsed)
 *   • An "Export" button that downloads this stage's data as a CSV
 *
 * Column definitions are passed by the parent so this component is fully generic.
 */

import React, { useState } from "react";

// Non-generic col definition — key is a string; fmt receives the raw cell value.
export interface ColDef {
  key: string;
  header: string;
  headerAr?: string;
  fmt?: (v: unknown) => string;
  right?: boolean;       // right-align (numbers)
  highlight?: boolean;   // slightly bolder / accent cell
}

interface StageTableProps {
  stageKey: string;
  title: string;
  titleAr?: string;
  company: "AWP" | "GP";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  cols: ColDef[];
  defaultOpen?: boolean;
}

const N = new Intl.NumberFormat("en-US");
export const fmtN = (v: unknown) => (typeof v === "number" ? N.format(Math.round(v as number)) : String(v ?? ""));
export const fmtDate = (v: unknown) => String(v ?? "").slice(0, 10);

export function StageTable({
  stageKey,
  title,
  titleAr,
  company,
  rows,
  cols,
  defaultOpen = false,
}: StageTableProps) {
  const [open, setOpen] = useState(defaultOpen);

  const isGP = company === "GP";
  const accentColor = isGP ? "#b45309" : "#15803d";
  const badgeBg = isGP ? "rgba(180,83,9,0.12)" : "rgba(21,128,61,0.12)";
  const badgeText = isGP ? "#92400e" : "#166534";

  function downloadCsv() {
    const header = cols.map((c) => c.header).join(",");
    const lines = rows.map((row) =>
      cols.map((c) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const raw = row[c.key];
        const val = c.fmt ? c.fmt(raw) : String(raw ?? "");
        // quote if contains comma
        return val.includes(",") ? `"${val}"` : val;
      }).join(","),
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bio-chain-${stageKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden mb-3">
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-neutral-50 transition-colors"
        onClick={() => setOpen((o) => !o)}
        style={{ background: open ? "white" : undefined }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Collapse chevron */}
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            className="shrink-0 transition-transform"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: "#9ca3af" }}
          >
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>

          {/* Company badge */}
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: badgeBg, color: badgeText }}
          >
            {company}
          </span>

          {/* Stage name */}
          <span className="text-sm font-semibold text-neutral-800 truncate">{title}</span>
          {titleAr && (
            <span className="text-xs text-neutral-400 hidden lg:block" dir="rtl">{titleAr}</span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-neutral-400">{rows.length} rows</span>
          {/* Export CSV — stops propagation so click doesn't toggle collapse */}
          <button
            onClick={(e) => { e.stopPropagation(); downloadCsv(); }}
            className="text-xs text-neutral-500 hover:text-brand-green hover:bg-brand-green-tint border border-neutral-200 hover:border-brand-green rounded-md px-2.5 py-1 transition-colors"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {/* ── Table body ── */}
      {open && rows.length > 0 && (
        <div className="overflow-x-auto border-t border-[var(--border-subtle)]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50">
                {cols.map((c) => (
                  <th
                    key={String(c.key)}
                    className={`px-3 py-2 font-semibold text-neutral-600 border-b border-neutral-200 whitespace-nowrap ${c.right ? "text-right" : "text-left"}`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  {cols.map((c) => {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const raw = row[c.key];
                    const display = c.fmt ? c.fmt(raw) : fmtN(raw);
                    return (
                      <td
                        key={String(c.key)}
                        className={`px-3 py-2 tabular-nums ${c.right ? "text-right" : "text-left"} ${c.highlight ? "font-semibold" : "text-neutral-700"}`}
                        style={c.highlight ? { color: accentColor } : undefined}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && rows.length === 0 && (
        <div className="px-4 py-5 text-xs text-neutral-400 border-t border-neutral-100 text-center">
          No data — add catching plan rows in Step 1
        </div>
      )}
    </div>
  );
}

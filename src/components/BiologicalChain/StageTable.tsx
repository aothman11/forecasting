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
 * Editable columns (ColDef.editable = true) render as inputs. Override values are
 * tracked externally; the parent passes overrides + callbacks.
 */

import React, { useState, useRef } from "react";

// Non-generic col definition — key is a string; fmt receives the raw cell value.
export interface ColDef {
  key: string;
  header: string;
  headerAr?: string;
  fmt?: (v: unknown) => string;
  right?: boolean;       // right-align (numbers)
  highlight?: boolean;   // slightly bolder / accent cell
  editable?: boolean;    // renders as <input> — user can type a new value
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
  /**
   * Keys are `"${weekDate}::${field}"` (ISO date + field name).
   * When a key is present the cell is considered "overridden" (amber border).
   */
  overrides?: Record<string, number>;
  /** Called when user commits a new value in an editable cell. weekDate = ISO yyyy-mm-dd. */
  onCellEdit?: (weekDate: string, field: string, value: number) => void;
  /** Called when user clicks the reset (↺) icon on an overridden cell. */
  onCellReset?: (weekDate: string, field: string) => void;
}

const N = new Intl.NumberFormat("en-US");
export const fmtN = (v: unknown) => (typeof v === "number" ? N.format(Math.round(v as number)) : String(v ?? ""));
export const fmtDate = (v: unknown) => String(v ?? "").slice(0, 10);

// ─── EditableCell — isolated component so it can hold its own input state ─────

interface EditableCellProps {
  rawValue: number;
  formattedValue: string;
  isOverridden: boolean;
  accentColor: string;
  highlight?: boolean;
  right?: boolean;
  onCommit: (value: number) => void;
  onReset: () => void;
}

function EditableCell({
  rawValue,
  formattedValue,
  isOverridden,
  accentColor,
  highlight,
  right,
  onCommit,
  onReset,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(String(Math.round(rawValue)));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    const num = parseFloat(draft.replace(/,/g, ""));
    if (!isNaN(num) && num !== rawValue) onCommit(num);
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  const borderStyle: React.CSSProperties = isOverridden
    ? { borderColor: "#d97706", background: "rgba(251,191,36,0.10)", color: "#92400e" }
    : { borderColor: "#d1d5db", background: "white" };

  return (
    <div className={`flex items-center gap-1 ${right ? "justify-end" : ""}`}>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.currentTarget.blur(); }
            if (e.key === "Escape") cancel();
          }}
          className="w-24 text-right tabular-nums text-xs px-1.5 py-0.5 rounded border outline-none focus:ring-1 focus:ring-amber-400"
          style={borderStyle}
        />
      ) : (
        <button
          onClick={startEdit}
          title="Click to edit"
          className={`
            tabular-nums text-xs px-1.5 py-0.5 rounded border transition-colors
            hover:border-amber-400 hover:bg-amber-50 cursor-text text-left min-w-[5rem]
            ${right ? "text-right" : "text-left"}
            ${highlight ? "font-semibold" : ""}
          `}
          style={isOverridden ? borderStyle : { borderColor: "transparent", background: "transparent", color: highlight ? accentColor : undefined }}
        >
          {formattedValue}
        </button>
      )}
      {isOverridden && !editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onReset(); }}
          title="Reset to computed value"
          className="text-amber-500 hover:text-amber-700 text-[11px] leading-none shrink-0 font-bold"
        >
          ↺
        </button>
      )}
    </div>
  );
}

// ─── StageTable ───────────────────────────────────────────────────────────────

export function StageTable({
  stageKey,
  title,
  titleAr,
  company,
  rows,
  cols,
  defaultOpen = false,
  overrides,
  onCellEdit,
  onCellReset,
}: StageTableProps) {
  const [open, setOpen] = useState(defaultOpen);

  const isGP = company === "GP";
  const accentColor = isGP ? "#b45309" : "#15803d";
  const badgeBg = isGP ? "rgba(180,83,9,0.12)" : "rgba(21,128,61,0.12)";
  const badgeText = isGP ? "#92400e" : "#166534";

  // Count how many overridden cells exist for this stage
  const overrideCount = overrides ? Object.keys(overrides).length : 0;

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
    <div
      className="border rounded-xl overflow-hidden mb-3"
      style={{ borderColor: overrideCount > 0 ? "#d97706" : "var(--border-subtle)" }}
    >
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

          {/* Override indicator */}
          {overrideCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
              {overrideCount} edited
            </span>
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
          {onCellEdit && (
            <div className="px-3 py-1.5 text-[11px] text-amber-700 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5">
              <span>✏️</span>
              <span>Click any highlighted value to edit — derived columns update automatically. Use ↺ to reset.</span>
            </div>
          )}
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50">
                {cols.map((c) => (
                  <th
                    key={String(c.key)}
                    className={`px-3 py-2 font-semibold text-neutral-600 border-b border-neutral-200 whitespace-nowrap ${c.right ? "text-right" : "text-left"}`}
                  >
                    {c.header}
                    {c.editable && <span className="ml-1 text-amber-400" title="Editable">✎</span>}
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

                    // Editable column — render interactive cell
                    if (c.editable && onCellEdit && onCellReset) {
                      // Use weekStart (ISO date) as the stable row key — same convention
                      // as dailyPlannedQtyOverrides and consistent with production plan week dates.
                      const weekDate = String(row.weekStart ?? row.week ?? "");
                      const overrideKey = `${weekDate}::${c.key}`;
                      const isOverridden = !!(overrides && overrideKey in overrides);
                      return (
                        <td
                          key={String(c.key)}
                          className={`px-3 py-1.5 ${c.right ? "text-right" : "text-left"}`}
                        >
                          <EditableCell
                            rawValue={typeof raw === "number" ? raw : 0}
                            formattedValue={display}
                            isOverridden={isOverridden}
                            accentColor={accentColor}
                            highlight={c.highlight}
                            right={c.right}
                            onCommit={(value) => onCellEdit(weekDate, c.key, value)}
                            onReset={() => onCellReset(weekDate, c.key)}
                          />
                        </td>
                      );
                    }

                    // Read-only column
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

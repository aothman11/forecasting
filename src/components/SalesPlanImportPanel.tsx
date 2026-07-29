"use client";

import { useMemo, useRef, useState } from "react";
import { usePlanStore } from "@/lib/store";
import { weekStartDate } from "@/lib/calculations";
import {
  aggregateSalesPlanByWeek,
  distinctValues,
  distinctWeeksOfYear,
  isSalesPlanFile,
  isoWeekNumber,
  parseSalesPlan,
  type FreshFrozen,
  type SalesPlanAggregate,
  type SalesPlanRow,
  type WholeOrFpp,
} from "@/lib/salesPlanImport";

function kg(n: number) {
  return Math.round(n).toLocaleString();
}

const NONE = "none";

export function SalesPlanImportPanel({ onClose }: { onClose: () => void }) {
  const params = usePlanStore((s) => s.params);
  const demand = usePlanStore((s) => s.demand);
  const setDemandWeek = usePlanStore((s) => s.setDemandWeek);
  const savedDivisionMap = usePlanStore((s) => s.salesPlanDivisionMap);
  const savedCategoryMap = usePlanStore((s) => s.salesPlanCategoryMap);
  const setSalesPlanDivisionMap = usePlanStore((s) => s.setSalesPlanDivisionMap);
  const setSalesPlanCategoryMap = usePlanStore((s) => s.setSalesPlanCategoryMap);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<SalesPlanRow[] | null>(null);
  const [divisionDraft, setDivisionDraft] = useState<Record<string, FreshFrozen>>({});
  const [categoryDraft, setCategoryDraft] = useState<Record<string, WholeOrFpp>>({});
  const [weekAssignment, setWeekAssignment] = useState<Record<number, string>>({});
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  const divisionValues = useMemo(() => (rows ? distinctValues(rows, "division") : []), [rows]);
  const categoryValues = useMemo(() => (rows ? distinctValues(rows, "materialCategory") : []), [rows]);
  const weeksInFile = useMemo(() => (rows ? distinctWeeksOfYear(rows) : []), [rows]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseSalesPlan(reader.result as ArrayBuffer);
      setRows(parsed);
      setFileName(file.name);
      setAppliedMessage(null);

      const divs: Record<string, FreshFrozen> = {};
      distinctValues(parsed, "division").forEach((v) => {
        divs[v] = savedDivisionMap[v] ?? "ignore";
      });
      setDivisionDraft(divs);

      const cats: Record<string, WholeOrFpp> = {};
      distinctValues(parsed, "materialCategory").forEach((v) => {
        cats[v] = savedCategoryMap[v] ?? "ignore";
      });
      setCategoryDraft(cats);

      const fileWeeks = distinctWeeksOfYear(parsed);
      const initialAssignment: Record<number, string> = {};
      demand.forEach((d) => {
        const suggested = isoWeekNumber(weekStartDate(params.planStartDate, d.week));
        initialAssignment[d.week] = fileWeeks.includes(suggested) ? String(suggested) : NONE;
      });
      setWeekAssignment(initialAssignment);
    };
    reader.readAsArrayBuffer(file);
  };

  const byWeekAggregate: Map<number, SalesPlanAggregate> = useMemo(
    () => (rows ? aggregateSalesPlanByWeek(rows, divisionDraft, categoryDraft) : new Map()),
    [rows, divisionDraft, categoryDraft]
  );

  const matchedCount = Object.values(weekAssignment).filter((v) => v !== NONE).length;

  const applyToHorizon = () => {
    let applied = 0;
    demand.forEach((d) => {
      const assigned = weekAssignment[d.week];
      if (!assigned || assigned === NONE) return;
      const agg = byWeekAggregate.get(Number(assigned));
      if (!agg) return;
      setDemandWeek(d.week, {
        wcFreshKg: Math.round(agg.wcFreshKg),
        wcFrozenKg: Math.round(agg.wcFrozenKg),
        fppKg: Math.round(agg.fppKg),
      });
      applied++;
    });
    setSalesPlanDivisionMap({ ...savedDivisionMap, ...divisionDraft });
    setSalesPlanCategoryMap({ ...savedCategoryMap, ...categoryDraft });
    setAppliedMessage(`Applied demand to ${applied} of ${demand.length} plan weeks.`);
  };

  return (
    <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-white shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-brand-green-dark">Import Sales Plan (SAP export)</div>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">
          ✕
        </button>
      </div>

      {!rows ? (
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
          >
            Choose File (.xlsx / .csv)
          </button>
          <span className="text-xs text-neutral-400">
            Uses the &quot;Week No. in &lt;year&gt;&quot; column to align each week of sales to the matching plan
            week automatically.
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && isSalesPlanFile(file)) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <>
          <div className="text-xs text-neutral-500">
            {rows.length.toLocaleString()} rows loaded from <span className="font-medium">{fileName}</span> ·{" "}
            {weeksInFile.length} distinct week(s) found: {weeksInFile.join(", ") || "none"}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1.5">
                Division → Fresh / Frozen
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {divisionValues.map((v) => (
                  <div key={v} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate" title={v}>
                      {v}
                    </span>
                    <select
                      value={divisionDraft[v] ?? "ignore"}
                      onChange={(e) =>
                        setDivisionDraft({ ...divisionDraft, [v]: e.target.value as FreshFrozen })
                      }
                      className="border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-xs shrink-0"
                    >
                      <option value="ignore">Ignore</option>
                      <option value="fresh">Fresh</option>
                      <option value="frozen">Frozen</option>
                    </select>
                  </div>
                ))}
                {divisionValues.length === 0 && <div className="text-xs text-neutral-400">No values found.</div>}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1.5">
                Material Category → Product Type
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {categoryValues.map((v) => (
                  <div key={v} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate" title={v}>
                      {v}
                    </span>
                    <select
                      value={categoryDraft[v] ?? "ignore"}
                      onChange={(e) =>
                        setCategoryDraft({ ...categoryDraft, [v]: e.target.value as WholeOrFpp })
                      }
                      className="border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-xs shrink-0"
                    >
                      <option value="ignore">Ignore</option>
                      <option value="whole">Whole Chicken</option>
                      <option value="fpp">FPP (Cuts)</option>
                    </select>
                  </div>
                ))}
                {categoryValues.length === 0 && <div className="text-xs text-neutral-400">No values found.</div>}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                Plan Week ↔ File Week Alignment
              </div>
              <span className="text-xs text-neutral-400">
                {matchedCount} of {demand.length} weeks matched — review before applying
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto border border-[var(--border-subtle)] rounded-lg">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="bg-[var(--brand-green-tint)] text-[10px] uppercase tracking-wide text-brand-green-dark sticky top-0">
                    <th className="text-left px-2 py-1.5">Plan Week</th>
                    <th className="text-left px-2 py-1.5">File Week</th>
                    <th className="text-right px-2 py-1.5">WC Fresh (kg)</th>
                    <th className="text-right px-2 py-1.5">WC Frozen (kg)</th>
                    <th className="text-right px-2 py-1.5">FPP (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {demand.map((d) => {
                    const assigned = weekAssignment[d.week] ?? NONE;
                    const agg = assigned !== NONE ? byWeekAggregate.get(Number(assigned)) : undefined;
                    return (
                      <tr key={d.week} className="border-t border-[var(--border-subtle)]">
                        <td className="px-2 py-1">W{d.week}</td>
                        <td className="px-2 py-1">
                          <select
                            value={assigned}
                            onChange={(e) =>
                              setWeekAssignment({ ...weekAssignment, [d.week]: e.target.value })
                            }
                            className="border border-[var(--border-subtle)] rounded px-1 py-0.5 text-xs"
                          >
                            <option value={NONE}>—</option>
                            {weeksInFile.map((w) => (
                              <option key={w} value={w}>
                                Wk {w}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1 text-right">{agg ? kg(agg.wcFreshKg) : "—"}</td>
                        <td className="px-2 py-1 text-right">{agg ? kg(agg.wcFrozenKg) : "—"}</td>
                        <td className="px-2 py-1 text-right">{agg ? kg(agg.fppKg) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={applyToHorizon}
              disabled={matchedCount === 0}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors disabled:opacity-40"
            >
              Apply to {matchedCount} Matched Week{matchedCount === 1 ? "" : "s"}
            </button>
            <button
              onClick={() => {
                setRows(null);
                setFileName(null);
                setAppliedMessage(null);
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green transition-colors"
            >
              Load Different File
            </button>
          </div>

          {appliedMessage && (
            <div className="text-xs text-brand-green-dark bg-brand-green-tint rounded-md px-3 py-1.5">
              {appliedMessage}
            </div>
          )}
        </>
      )}
    </div>
  );
}

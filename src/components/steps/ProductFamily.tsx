"use client";

import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { SummaryCard } from "../shared/SummaryCard";
import { FamilyDonut } from "../charts/FamilyDonut";
import type { ProductFamilyWeek } from "@/lib/types";

function pct(v: number) {
  return Math.round(v * 1000) / 10;
}

export function ProductFamily() {
  const { result, params } = usePipeline();
  const setParam = usePlanStore((s) => s.setParam);
  const rows = result.family;

  const totals = rows.reduce(
    (acc, r) => {
      acc.fresh += r.wcFreshTons;
      acc.frozen += r.wcFrozenTons;
      acc.fpp += r.fppTons;
      acc.total += r.totalTons;
      return acc;
    },
    { fresh: 0, frozen: 0, fpp: 0, total: 0 }
  );

  const columns: DataTableColumn<ProductFamilyWeek>[] = [
    { key: "week", header: "Week", render: (r) => `W${r.week}` },
    {
      key: "fresh",
      header: "WC Fresh (tons)",
      align: "right",
      render: (r) => r.wcFreshTons.toFixed(1),
      footer: totals.fresh.toFixed(1),
    },
    {
      key: "frozen",
      header: "WC Frozen (tons)",
      align: "right",
      render: (r) => r.wcFrozenTons.toFixed(1),
      footer: totals.frozen.toFixed(1),
    },
    {
      key: "fpp",
      header: "FPP (tons)",
      align: "right",
      render: (r) => r.fppTons.toFixed(1),
      footer: totals.fpp.toFixed(1),
    },
    {
      key: "total",
      header: "Total (tons)",
      align: "right",
      render: (r) => r.totalTons.toFixed(1),
      footer: totals.total.toFixed(1),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Step 4 — Product Family Allocation</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Grade A/B carcass allocated across product families. Grade C flows entirely to FPP.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <SummaryCard label="Whole Chicken Fresh" value={`${totals.fresh.toFixed(0)} t`} accent="green" />
        <SummaryCard label="Whole Chicken Frozen" value={`${totals.frozen.toFixed(0)} t`} accent="gold" />
        <SummaryCard label="FPP" value={`${totals.fpp.toFixed(0)} t`} />
        <SummaryCard label="Total" value={`${totals.total.toFixed(0)} t`} />
      </div>

      <div className="border border-[var(--border-subtle)] rounded-lg p-3 overflow-x-auto">
        <div className="text-xs font-semibold text-brand-green-dark mb-2 uppercase tracking-wide">
          Allocation Matrix
        </div>
        <table className="text-xs">
          <thead>
            <tr className="text-neutral-500">
              <th className="text-left pr-4 pb-1">Source</th>
              <th className="text-right px-3 pb-1">WC Fresh</th>
              <th className="text-right px-3 pb-1">WC Frozen</th>
              <th className="text-right px-3 pb-1">FPP</th>
              <th className="text-right px-3 pb-1">Σ</th>
            </tr>
          </thead>
          <tbody>
            {(["A", "B", "C"] as const).map((grade) => {
              const row = params.familyAllocation[grade];
              const sum = row.wcFresh + row.wcFrozen + row.fpp;
              return (
                <tr key={grade}>
                  <td className="pr-4 py-1 font-medium">Grade {grade}</td>
                  {(["wcFresh", "wcFrozen", "fpp"] as const).map((key) => (
                    <td key={key} className="px-3 py-1 text-right">
                      <input
                        type="number"
                        step={0.5}
                        value={pct(row[key])}
                        onChange={(e) =>
                          setParam({
                            familyAllocation: {
                              ...params.familyAllocation,
                              [grade]: { ...row, [key]: Number(e.target.value) / 100 },
                            },
                          })
                        }
                        className="w-16 text-right border border-[var(--border-subtle)] rounded px-1 py-0.5 tabular-nums"
                      />
                    </td>
                  ))}
                  <td className={`px-3 py-1 text-right ${Math.abs(sum - 1) > 0.005 ? "text-brand-alert font-semibold" : "text-neutral-400"}`}>
                    {pct(sum)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.week} />
        <div>
          <div className="text-xs font-semibold text-neutral-500 mb-1">Overall Split — Full Horizon</div>
          <FamilyDonut data={rows} />
        </div>
      </div>
    </div>
  );
}

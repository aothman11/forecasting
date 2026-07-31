"use client";

import { Fragment } from "react";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/defaults";
import { getDemandCell, weekLabel } from "@/lib/demandPlan";
import type { ChannelKey, DemandPlanQty, DemandProduct, ProductCategory } from "@/lib/types";

const CATEGORY_ORDER: ProductCategory[] = ["wholeChicken", "cuts", "fpp", "eggs"];

interface DemandPlanMatrixProps {
  products: DemandProduct[];
  qty: DemandPlanQty;
  channel: ChannelKey | "ALL";
  weeks: number[];
  planStartDate?: string;
  onCellChange?: (productId: string, week: number, value: number) => void;
  onRemoveProduct?: (productId: string) => void;
}

export function DemandPlanMatrix({ products, qty, channel, weeks, planStartDate, onCellChange, onRemoveProduct }: DemandPlanMatrixProps) {
  const editable = channel !== "ALL";

  return (
    <div className="w-full overflow-auto rounded-xl border border-[var(--border-subtle)] shadow-sm" style={{ maxHeight: 560 }}>
      <table className="text-xs tabular-nums border-collapse w-full">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 bg-[var(--brand-green-tint)] text-left px-3 py-2 text-brand-green-dark uppercase tracking-wide text-[10px] font-semibold min-w-[220px]">
              Product
            </th>
            {weeks.map((w) => (
              <th
                key={w}
                className="sticky top-0 z-10 bg-[var(--brand-green-tint)] text-right px-2 py-2 text-brand-green-dark text-[10px] font-semibold whitespace-nowrap"
              >
                {planStartDate ? weekLabel(w, planStartDate) : `W${w}`}
              </th>
            ))}
            <th className="sticky top-0 right-0 z-20 bg-[var(--brand-green-tint)] text-right px-3 py-2 text-brand-green-dark text-[10px] font-semibold whitespace-nowrap">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {CATEGORY_ORDER.map((cat) => {
            const catProducts = products.filter((p) => p.category === cat);
            if (catProducts.length === 0) return null;
            return (
              <Fragment key={cat}>
                <tr className="bg-neutral-50">
                  <td
                    colSpan={weeks.length + 2}
                    className="px-3 py-1.5 font-semibold text-neutral-600 text-[11px] uppercase tracking-wide border-t border-b border-[var(--border-subtle)]"
                  >
                    {PRODUCT_CATEGORY_LABELS[cat]}
                  </td>
                </tr>
                {catProducts.map((p) => {
                  const rowTotal = weeks.reduce((s, w) => s + getDemandCell(qty, p.id, channel, w), 0);
                  return (
                    <tr key={p.id} className="hover:bg-neutral-50 group">
                      <td className="sticky left-0 bg-white group-hover:bg-neutral-50 px-3 py-1 border-b border-[var(--border-subtle)] whitespace-nowrap">
                        {p.name}
                        {onRemoveProduct && (
                          <button
                            onClick={() => onRemoveProduct(p.id)}
                            className="ml-2 text-neutral-300 hover:text-brand-alert"
                            title="Remove product"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                      {weeks.map((w) => {
                        const value = getDemandCell(qty, p.id, channel, w);
                        return (
                          <td key={w} className="px-1 py-1 border-b border-[var(--border-subtle)] text-right">
                            {editable ? (
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={value || ""}
                                placeholder="0"
                                onChange={(e) => onCellChange?.(p.id, w, Number(e.target.value))}
                                className="cell-input text-right w-16"
                              />
                            ) : (
                              <span className="px-1 text-neutral-600">{value ? Math.round(value).toLocaleString() : "—"}</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="sticky right-0 bg-white group-hover:bg-neutral-50 px-3 py-1 border-b border-[var(--border-subtle)] text-right font-semibold">
                        {rowTotal.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

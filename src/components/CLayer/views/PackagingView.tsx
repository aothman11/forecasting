"use client";

import { useMemo, useState } from "react";
import { isoWeekLabel, packagingPlan } from "@/lib/cLayer/calc";
import { exportPackaging } from "@/lib/cLayer/excel";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, KpiRow, Notice, RangeControls, btn, defaultRange, fmtInt, rangeBounds } from "../ui";

export function PackagingView({ data, projections }: CLayerViewProps) {
  const [range, setRange] = useState(defaultRange);
  const { settings, skus, packaging } = data;

  const lines = useMemo(
    () => packagingPlan(projections, settings, skus, packaging, settings.packagingLeadDays, rangeBounds(range)),
    [projections, settings, skus, packaging, range],
  );

  // Pivot: one row per material (or uncoded component), one column per week.
  const keyOf = (l: (typeof lines)[number]) => l.materialNo || `~${l.component}|${l.unit}`;
  const items = [...new Map(lines.map((l) => [keyOf(l), l])).values()].sort((a, b) => a.component.localeCompare(b.component));
  const weeks = [...new Set(lines.map((l) => l.weekStart))].sort();
  const qty = new Map(lines.map((l) => [`${keyOf(l)}|${l.weekStart}`, l.qty]));
  const orderDate = new Map(lines.map((l) => [l.weekStart, l.orderDate]));

  const notices = [
    ...(settings.rejectPct === null || settings.gradeTablePct === null ? ["Grading is not set (reject % and 90001 / 90002 split) — packs and packaging cannot be planned."] : []),
    ...(skus.some((s) => s.packMixPct === null) ? ["The SKU pack mix is not complete — SKUs without a pack mix get no packaging."] : []),
    ...(packaging.length === 0 ? ["No packaging components yet — add them under Standards & Settings → Packaging per SKU."] : []),
    ...(packaging.some((p) => !p.materialNo) ? ["Some components have no SAP material code yet — they are listed by name."] : []),
    ...(settings.packagingLeadDays === null ? ["Missing setting: Packaging lead time — order dates stay blank."] : []),
  ];

  const download = () =>
    exportPackaging(
      lines.map((l) => ({
        supplySource: settings.packagingSupplySource ?? "",
        materialNo: l.materialNo,
        component: l.component,
        qty: l.qty,
        unit: l.unit,
        packingWeek: l.isoWeek,
        packingDate: l.weekStart,
        orderDate: l.orderDate ?? "",
        skus: Object.keys(l.bySku).join(", "),
      })),
    );

  const totalItems = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="flex flex-col gap-5">
      <RangeControls value={range} onChange={setRange} />
      {notices.length > 0 && <Notice lines={notices} />}
      <KpiRow
        items={[
          { label: "Packaging materials", value: String(items.length), tone: "green" },
          { label: "Weeks with packing", value: String(weeks.length) },
          { label: "Supplied by", value: settings.packagingSupplySource || "not set", tone: settings.packagingSupplySource ? "neutral" : "alert" },
          { label: "Order lead time", value: settings.packagingLeadDays === null ? "not set" : `${settings.packagingLeadDays} days`, tone: settings.packagingLeadDays === null ? "alert" : "gold" },
        ]}
      />
      <Card
        title="Packaging needed per week"
        subtitle={`Eggs → graded 90001 / 90002 → packs per SKU (pack mix) → × components per pack. Rounded up to whole units. ${fmtInt(totalItems)} units in range.`}
        actions={<button className={btn} onClick={download} disabled={!lines.length}>Download Excel</button>}
      >
        {lines.length === 0 ? (
          <p className="text-sm text-neutral-500">No packaging in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-grid text-xs">
              <thead>
                <tr>
                  <th className="text-left sticky left-0 bg-brand-green-tint">Material</th>
                  <th className="text-left">Unit</th>
                  {weeks.map((w) => (
                    <th key={w} className="text-right" title={orderDate.get(w) ? `Order by ${orderDate.get(w)}` : undefined}>
                      {isoWeekLabel(w).slice(5)}
                      <span className="block text-[9px] font-normal normal-case">{orderDate.get(w) ? `order ${orderDate.get(w)!.slice(5)}` : w.slice(0, 4)}</span>
                    </th>
                  ))}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const k = keyOf(it);
                  const total = weeks.reduce((s, w) => s + (qty.get(`${k}|${w}`) ?? 0), 0);
                  return (
                    <tr key={k}>
                      <td className="sticky left-0 bg-white whitespace-nowrap">
                        <span className="font-medium">{it.materialNo || <span className="text-brand-alert">no code</span>}</span>
                        <span className="text-[10px] text-neutral-500"> · {it.component}</span>
                      </td>
                      <td>{it.unit}</td>
                      {weeks.map((w) => (
                        <td key={w} className="text-right tabular-nums">{qty.get(`${k}|${w}`) ? fmtInt(qty.get(`${k}|${w}`)!) : "—"}</td>
                      ))}
                      <td className="text-right tabular-nums font-semibold">{fmtInt(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

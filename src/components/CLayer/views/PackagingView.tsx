"use client";

import { useMemo, useState } from "react";
import { isoWeekLabel, packagingOrders, packagingPlan } from "@/lib/cLayer/calc";
import { exportPackaging, exportPackagingOrders } from "@/lib/cLayer/excel";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, KpiRow, Notice, RangeControls, btn, defaultRange, fmtDec, fmtInt, rangeBounds, todayIso } from "../ui";

export function PackagingView({ data, projections }: CLayerViewProps) {
  const [range, setRange] = useState(defaultRange);
  const { settings, skus, packaging } = data;

  const lines = useMemo(
    () => packagingPlan(projections, settings, skus, packaging, settings.packagingLeadDays, rangeBounds(range)),
    [projections, settings, skus, packaging, range],
  );

  const orders = useMemo(
    () => packagingOrders(lines, data.packagingPolicies, settings.packagingLeadDays),
    [lines, data.packagingPolicies, settings.packagingLeadDays],
  );
  const today = todayIso();
  const overdue = (d: string | null) => d !== null && d < today;
  const fmtQty = (n: number) => (Number.isInteger(n) ? fmtInt(n) : fmtDec(n, 2));

  // Pivot: one row per material (or uncoded component), one column per week.
  const keyOf = (l: (typeof lines)[number]) => l.materialNo || `~${l.component}|${l.unit}`;
  const items = [...new Map(lines.map((l) => [keyOf(l), l])).values()].sort((a, b) => a.component.localeCompare(b.component));
  const weeks = [...new Set(lines.map((l) => l.weekStart))].sort();
  const qty = new Map(lines.map((l) => [`${keyOf(l)}|${l.weekStart}`, l]));
  const orderDate = new Map(lines.map((l) => [l.weekStart, l.orderDate]));

  const notices = [
    ...(settings.rejectPct === null || settings.gradeTablePct === null ? ["Grading is not set (reject % and 90001 / 90002 split) — packs and packaging cannot be planned."] : []),
    ...(skus.some((s) => s.packMixPct === null) ? ["The SKU pack mix is not complete — SKUs without a pack mix get no packaging."] : []),
    ...(packaging.length === 0 ? ["No packaging components yet — add them under Standards & Settings → Packaging per SKU."] : []),
    ...(settings.packagingLeadDays === null ? ["Missing setting: Packaging lead time — order dates stay blank."] : []),
  ];

  const download = () =>
    exportPackaging(
      lines.map((l) => ({
        supplySource: settings.packagingSupplySource ?? "",
        component: l.component,
        qty: l.qty,
        unit: l.unit,
        orderQty: l.orderQty,
        orderUnit: l.orderUnit ?? "",
        packingWeek: l.isoWeek,
        packingDate: l.weekStart,
        orderDate: l.orderDate ?? "",
        skus: Object.keys(l.bySku).join(", "),
      })),
    );

  const downloadOrders = () =>
    exportPackagingOrders(
      orders.map((o) => ({
        supplySource: settings.packagingSupplySource ?? "",
        component: o.component,
        qty: o.qty,
        unit: o.unit,
        orderDate: o.orderDate ?? "",
        status: overdue(o.orderDate) ? "Overdue" : "",
        fromWeek: isoWeekLabel(o.fromWeek),
        toWeek: isoWeekLabel(o.toWeek),
        need: o.need,
        stockAfter: o.stockAfter,
      })),
    );

  return (
    <div className="flex flex-col gap-5">
      <RangeControls value={range} onChange={setRange} />
      {notices.length > 0 && <Notice lines={notices} />}
      <KpiRow
        items={[
          { label: "Packaging materials", value: String(items.length), tone: "green" },
          { label: "Orders in range", value: String(orders.length), sub: orders.some((o) => overdue(o.orderDate)) ? `${orders.filter((o) => overdue(o.orderDate)).length} overdue` : undefined, tone: orders.some((o) => overdue(o.orderDate)) ? "alert" : "neutral" },
          { label: "Supplied by", value: settings.packagingSupplySource || "not set", tone: settings.packagingSupplySource ? "neutral" : "alert" },
          { label: "Order lead time", value: settings.packagingLeadDays === null ? "not set" : `${settings.packagingLeadDays} days`, tone: settings.packagingLeadDays === null ? "alert" : "gold" },
        ]}
      />
      <Card
        title="Packaging orders"
        subtitle="From the order rules (Standards & Settings). Rounding surplus carries into the next order."
        actions={<button className={btn} onClick={downloadOrders} disabled={!orders.length}>Download orders</button>}
      >
        {orders.length === 0 ? (
          <p className="text-sm text-neutral-500">No orders in this range.</p>
        ) : (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="data-grid text-xs">
              <thead>
                <tr>
                  <th className="text-left">Order by</th>
                  <th className="text-left">Component</th>
                  <th className="text-right">Order qty</th>
                  <th className="text-left">Unit</th>
                  <th className="text-left">Covers</th>
                  <th className="text-right">Need</th>
                  <th className="text-right">Stock after</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={`${o.component}|${o.fromWeek}`} className={overdue(o.orderDate) ? "bg-red-50" : undefined}>
                    <td className="whitespace-nowrap tabular-nums">
                      {o.orderDate ?? "—"}
                      {overdue(o.orderDate) && <span className="ml-2 rounded bg-brand-alert px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Overdue</span>}
                    </td>
                    <td className="font-medium">{o.component}</td>
                    <td className="text-right tabular-nums font-semibold">{fmtQty(o.qty)}</td>
                    <td>{o.unit}</td>
                    <td className="whitespace-nowrap">{o.fromWeek === o.toWeek ? isoWeekLabel(o.fromWeek) : `${isoWeekLabel(o.fromWeek)} – ${isoWeekLabel(o.toWeek).slice(5)}`}</td>
                    <td className="text-right tabular-nums">{fmtQty(o.need)}</td>
                    <td className="text-right tabular-nums text-neutral-500">{fmtQty(o.stockAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card
        title="Packaging needed per week"
        subtitle="Packs per SKU × BOM. In order units where set."
        actions={<button className={btn} onClick={download} disabled={!lines.length}>Download Excel</button>}
      >
        {lines.length === 0 ? (
          <p className="text-sm text-neutral-500">No packaging in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-grid text-xs">
              <thead>
                <tr>
                  <th className="text-left sticky left-0 bg-brand-green-tint">Component</th>
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
                  const cells = weeks.map((w) => qty.get(`${k}|${w}`));
                  const total = cells.reduce((s, c) => s + (c?.qty ?? 0), 0);
                  const inOrderUnit = it.orderUnit && it.perOrderUnit;
                  const orderTotal = inOrderUnit ? Math.ceil(total / it.perOrderUnit! - 1e-9) : null;
                  return (
                    <tr key={k}>
                      <td className="sticky left-0 bg-white whitespace-nowrap">
                        <span className="font-medium">{it.component}</span>
                      </td>
                      <td className="whitespace-nowrap" title={inOrderUnit ? `1 ${it.orderUnit} = ${it.perOrderUnit} ${it.unit}` : undefined}>
                        {inOrderUnit ? <>{it.orderUnit} <span className="text-[10px] text-neutral-500">({fmtInt(it.perOrderUnit!)} {it.unit})</span></> : it.unit}
                      </td>
                      {cells.map((c, i) => (
                        <td key={weeks[i]} className="text-right tabular-nums" title={c ? `${fmtInt(c.qty)} ${c.unit}` : undefined}>
                          {!c ? "—" : c.orderQty !== null ? fmtDec(c.orderQty, 2) : fmtInt(c.qty)}
                        </td>
                      ))}
                      <td className="text-right tabular-nums font-semibold whitespace-nowrap" title={inOrderUnit ? `${fmtInt(total)} ${it.unit}` : undefined}>
                        {orderTotal !== null ? `${fmtInt(orderTotal)} ${it.orderUnit}` : fmtInt(total)}
                      </td>
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

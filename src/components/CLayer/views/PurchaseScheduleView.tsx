"use client";

import { useMemo } from "react";
import { addDays, format, parseISO } from "date-fns";
import { purchaseSchedule } from "@/lib/cLayer/calc";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, KpiRow, Notice, fmtInt, todayIso } from "../ui";

export function PurchaseScheduleView({ data }: CLayerViewProps) {
  const today = todayIso();
  const { lines, warnings } = useMemo(
    () => purchaseSchedule(data.placements, data.settings, today),
    [data.placements, data.settings, today],
  );
  const breedName = new Map(data.breeds.map((b) => [b.id, b.name]));
  const farm = new Map(data.farms.map((f) => [f.id, f]));
  const in30 = format(addDays(parseISO(today), 30), "yyyy-MM-dd");
  const overdue = lines.filter((l) => l.prInPast).length;
  const dueSoon = lines.filter((l) => l.prDate !== null && l.prDate >= today && l.prDate <= in30).length;

  return (
    <div className="flex flex-col gap-5">
      <KpiRow
        items={[
          { label: "Purchases planned", value: String(lines.length), tone: "green" },
          { label: "PR date passed", value: String(overdue), sub: "raise PR now", tone: overdue ? "alert" : "neutral" },
          { label: "PR due in 30 days", value: String(dueSoon), tone: dueSoon ? "gold" : "neutral" },
          { label: "Chicks to buy", value: fmtInt(lines.reduce((s, l) => s + l.chicks, 0)) },
        ]}
      />
      <Notice lines={warnings} />
      <Card
        title="Chick purchase schedule"
        subtitle="PO date = placement Monday − PO→delivery lead time · PR date = PO date − PR→PO lead time. Sorted by PR date."
      >
        {lines.length === 0 ? (
          <p className="text-sm text-neutral-500 py-6 text-center">No planned placements yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-grid text-sm">
              <thead>
                <tr>
                  <th className="text-left">PR date</th>
                  <th className="text-left">PO date</th>
                  <th className="text-left">Placement week</th>
                  <th className="text-right">Chicks</th>
                  <th className="text-left">Breed</th>
                  <th className="text-left">Farm</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const f = farm.get(l.farmId);
                  return (
                    <tr key={l.placementId} className={l.prInPast ? "bg-red-50" : undefined}>
                      <td className={l.prInPast ? "text-brand-alert font-semibold" : undefined}>
                        {l.prDate ?? <span className="text-neutral-400">missing setting</span>}
                        {l.prInPast && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide">passed</span>}
                      </td>
                      <td>{l.poDate ?? <span className="text-neutral-400">missing setting</span>}</td>
                      <td>{l.isoWeek} <span className="text-[11px] text-neutral-500">· Mon {l.placementWeekStart}</span></td>
                      <td className="text-right tabular-nums">{fmtInt(l.chicks)}</td>
                      <td>{breedName.get(l.breedId) ?? "—"}</td>
                      <td>{f ? `${f.code} · ${f.name}` : "—"}</td>
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

"use client";

import { useMemo, useState } from "react";
import { mondayOf, spentHensSchedule } from "@/lib/cLayer/calc";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, FilterBar, KpiRow, fmtInt, todayIso, type FilterState } from "../ui";

export function SpentHensView({ data, projections }: CLayerViewProps) {
  const [filter, setFilter] = useState<FilterState>({ farmId: "", breedId: "" });
  const lines = useMemo(() => spentHensSchedule(projections, filter), [projections, filter]);
  const farm = new Map(data.farms.map((f) => [f.id, f]));
  const breedName = new Map(data.breeds.map((b) => [b.id, b.name]));
  const thisWeek = mondayOf(todayIso());
  const upcoming = lines.filter((l) => l.weekStart >= thisWeek);
  const next = upcoming[0];

  const byWeek = new Map<string, { isoWeek: string; birds: number; farms: Set<string> }>();
  for (const l of lines) {
    const w = byWeek.get(l.weekStart) ?? { isoWeek: l.isoWeek, birds: 0, farms: new Set<string>() };
    w.birds += l.birds;
    w.farms.add(farm.get(l.farmId)?.code ?? "?");
    byWeek.set(l.weekStart, w);
  }

  return (
    <div className="flex flex-col gap-5">
      <FilterBar farms={data.farms} breeds={data.breeds} value={filter} onChange={setFilter} />
      <KpiRow
        items={[
          { label: "Flocks leaving (upcoming)", value: String(upcoming.length), tone: "green" },
          { label: "Spent hens (upcoming)", value: fmtInt(upcoming.reduce((s, l) => s + l.birds, 0)), tone: "gold" },
          { label: "Next depopulation", value: next?.isoWeek ?? "—", sub: next ? `${farm.get(next.farmId)?.code ?? ""} · ${fmtInt(next.birds)} birds` : undefined },
          { label: "Busiest week", value: [...byWeek.values()].sort((a, b) => b.birds - a.birds)[0]?.isoWeek ?? "—" },
        ]}
      />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 min-w-0">
          <Card title="Spent hens by flock" subtitle="Birds alive at end of lay leave in the following calendar week.">
            {lines.length === 0 ? (
              <p className="text-sm text-neutral-500 py-6 text-center">No projected depopulations.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Week leaving</th>
                      <th className="text-left">Farm</th>
                      <th className="text-left">Breed</th>
                      <th className="text-right">Age at exit</th>
                      <th className="text-right">Spent hens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.placementId} className={l.weekStart < thisWeek ? "text-neutral-400" : undefined}>
                        <td>{l.isoWeek} <span className="text-[11px] text-neutral-500">· Mon {l.weekStart}</span></td>
                        <td>{farm.get(l.farmId) ? `${farm.get(l.farmId)!.code} · ${farm.get(l.farmId)!.name}` : "—"}</td>
                        <td>{breedName.get(l.breedId) ?? "—"}</td>
                        <td className="text-right tabular-nums">wk {l.ageWeek}</td>
                        <td className="text-right tabular-nums">{fmtInt(l.birds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <Card title="Total by week">
          {byWeek.size === 0 ? (
            <p className="text-sm text-neutral-500 py-6 text-center">—</p>
          ) : (
            <table className="data-grid text-sm">
              <thead>
                <tr><th className="text-left">Week</th><th className="text-left">Farms</th><th className="text-right">Birds</th></tr>
              </thead>
              <tbody>
                {[...byWeek.entries()].map(([ws, w]) => (
                  <tr key={ws}>
                    <td>{w.isoWeek}</td>
                    <td className="text-xs">{[...w.farms].join(", ")}</td>
                    <td className="text-right tabular-nums">{fmtInt(w.birds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

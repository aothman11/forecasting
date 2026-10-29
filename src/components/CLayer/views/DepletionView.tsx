"use client";

import { useMemo, useState } from "react";
import { depletionSchedule, mondayOf } from "@/lib/cLayer/calc";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, FilterBar, KpiRow, Notice, emptyFilter, fmtInt, todayIso } from "../ui";

export function DepletionView({ data, projections }: CLayerViewProps) {
  const [filter, setFilter] = useState(emptyFilter);
  const lines = useMemo(
    () => depletionSchedule(projections, { farmId: filter.farmId || undefined, breedId: filter.breedId || undefined }),
    [projections, filter],
  );
  const farm = new Map(data.farms.map((f) => [f.id, f]));
  const breed = new Map(data.breeds.map((b) => [b.id, b]));
  const flockNo = new Map(data.placements.map((p) => [p.id, p.flockNo]));
  const thisWeek = mondayOf(todayIso());
  const upcoming = lines.filter((l) => l.weekStart >= thisWeek);
  const next = upcoming[0];
  const notProjected = projections.filter((p) => p.weeks.length > 0 && p.depletionWeekStart === null);
  const missingDefault = notProjected.some((p) => p.missingSettings.includes("Default depletion age"));

  const byWeek = new Map<string, { isoWeek: string; birds: number; farms: Set<string> }>();
  for (const l of lines) {
    const w = byWeek.get(l.weekStart) ?? { isoWeek: l.isoWeek, birds: 0, farms: new Set<string>() };
    w.birds += l.birds;
    w.farms.add(farm.get(l.farmId)?.code ?? "?");
    byWeek.set(l.weekStart, w);
  }

  return (
    <div className="flex flex-col gap-5">
      <FilterBar farms={data.farms} breeds={data.breeds} value={filter} onChange={setFilter} onlyPlant="1250" />
      {notProjected.length > 0 && (
        <Notice
          lines={[
            `${notProjected.length} flock(s) have no projected depletion${missingDefault ? " — Missing setting: Default depletion age (or set a depletion age on the flock)" : " — see the warning on the flock"}.`,
          ]}
        />
      )}
      <KpiRow
        items={[
          { label: "Flocks depleting (upcoming)", value: String(upcoming.length), tone: "green" },
          { label: "Spent hens (upcoming)", value: fmtInt(upcoming.reduce((s, l) => s + l.birds, 0)), tone: "gold" },
          { label: "Next depletion", value: next?.isoWeek ?? "—", sub: next ? `${farm.get(next.farmId)?.code ?? ""} · ${fmtInt(next.birds)} birds` : undefined },
          { label: "Busiest week", value: [...byWeek.values()].sort((a, b) => b.birds - a.birds)[0]?.isoWeek ?? "—" },
        ]}
      />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 min-w-0">
          <Card title="Depletion by flock" subtitle="Plant 1250. Birds alive at the end of the depletion age week leave the laying farm in the following calendar week.">
            {lines.length === 0 ? (
              <p className="text-sm text-neutral-500 py-6 text-center">No projected depletions.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid text-sm">
                  <thead>
                    <tr>
                      <th className="text-right">Flock</th>
                      <th className="text-left">Week leaving</th>
                      <th className="text-left">Laying farm · 1250</th>
                      <th className="text-left">Breed</th>
                      <th className="text-right">Depletion age</th>
                      <th className="text-right">Spent hens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const f = farm.get(l.farmId);
                      return (
                        <tr key={l.placementId} className={l.weekStart < thisWeek ? "text-neutral-400" : undefined}>
                          <td className="text-right tabular-nums font-semibold">{flockNo.get(l.placementId) ?? "—"}</td>
                          <td>{l.isoWeek} <span className="text-[11px] text-neutral-500">· Mon {l.weekStart}</span></td>
                          <td>{f ? `${f.code} · ${f.name}` : "—"}</td>
                          <td>{breed.get(l.breedId)?.name ?? "—"}</td>
                          <td className="text-right tabular-nums">wk {l.depletionAge}</td>
                          <td className="text-right tabular-nums">{fmtInt(l.birds)}</td>
                        </tr>
                      );
                    })}
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

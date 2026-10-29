"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { mondayOf, transferSchedule, weekRange, isoWeekLabel } from "@/lib/cLayer/calc";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, FilterBar, KpiRow, Notice, RangeControls, defaultRange, emptyFilter, fmtInt, rangeBounds, todayIso } from "../ui";

export function TransferPlanView({ data, projections }: CLayerViewProps) {
  const [filter, setFilter] = useState(emptyFilter);
  const [range, setRange] = useState(defaultRange);
  const { from, to } = rangeBounds(range);

  const all = useMemo(
    () => transferSchedule(projections, { farmId: filter.farmId || undefined, breedId: filter.breedId || undefined }),
    [projections, filter],
  );
  const lines = all.filter((l) => l.weekStart >= from && l.weekStart <= to);
  const farm = new Map(data.farms.map((f) => [f.id, f]));
  const breed = new Map(data.breeds.map((b) => [b.id, b]));
  const houses = new Map(data.placements.map((p) => [p.id, p.layingHouses]));
  const flockNo = new Map(data.placements.map((p) => [p.id, p.flockNo]));
  const next = all.find((l) => l.weekStart >= mondayOf(todayIso()));
  const missingTransfer = projections.some((p) => p.missingSettings.includes("Default transfer age"));

  const byWeek = new Map(weekRange(from, to).map((w) => [w, 0]));
  for (const l of lines) byWeek.set(l.weekStart, (byWeek.get(l.weekStart) ?? 0) + l.birds);
  const chartData = [...byWeek.entries()].map(([w, birds]) => ({ week: isoWeekLabel(w), Pullets: Math.round(birds) }));

  const byFarm = new Map<string, { birds: number; flocks: number; houses: number }>();
  for (const l of lines) {
    const f = byFarm.get(l.toFarmId) ?? { birds: 0, flocks: 0, houses: 0 };
    f.birds += l.birds;
    f.flocks += 1;
    f.houses += houses.get(l.placementId) ?? 0;
    byFarm.set(l.toFarmId, f);
  }
  const farmLabel = (id: string) => {
    const f = farm.get(id);
    return f ? `${f.code} · ${f.plant ?? "?"}` : "—";
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-6">
        <FilterBar farms={data.farms} breeds={data.breeds} value={filter} onChange={setFilter} />
        <RangeControls value={range} onChange={setRange} />
      </div>
      {missingTransfer && <Notice lines={["Missing setting: Default transfer age. Flocks without their own transfer age are not shown."]} />}
      <Notice
        tone="info"
        lines={[
          "Reference only: the business process document notes a cadence of six houses transferred from rearing to laying every 3 months. It is not enforced — set Show to 13 weeks to compare a 3-month window with “Laying houses filled”.",
        ]}
      />
      <KpiRow
        items={[
          { label: "Transfers in range", value: String(lines.length), tone: "green" },
          { label: "Pullets 1260 → 1250", value: fmtInt(lines.reduce((s, l) => s + l.birds, 0)), tone: "gold" },
          { label: "Laying houses filled", value: String(lines.reduce((s, l) => s + (houses.get(l.placementId) ?? 0), 0)), sub: "where houses are given" },
          { label: "Next transfer", value: next?.isoWeek ?? "—", sub: next ? `${farmLabel(next.fromFarmId)} → ${farmLabel(next.toFarmId)}` : undefined },
        ]}
      />
      <Card title="Projected pullet transfers by week" subtitle="Planned quantity = birds alive at the end of the week before the transfer age. Not a goods movement.">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => Number(v).toLocaleString()} />
              <Bar dataKey="Pullets" fill="#C49A1A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 min-w-0">
          <Card title="Transfers by flock">
            {lines.length === 0 ? (
              <p className="text-sm text-neutral-500 py-6 text-center">No projected transfers in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid text-sm">
                  <thead>
                    <tr>
                      <th className="text-right">Flock</th>
                      <th className="text-left">Transfer week</th>
                      <th className="text-left">From 1260</th>
                      <th className="text-left">To 1250</th>
                      <th className="text-left">Breed</th>
                      <th className="text-right">Age</th>
                      <th className="text-right">Houses</th>
                      <th className="text-right">Pullets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.placementId}>
                        <td className="text-right tabular-nums font-semibold">{flockNo.get(l.placementId) ?? "—"}</td>
                        <td>{l.isoWeek} <span className="text-[11px] text-neutral-500">· Mon {l.weekStart}</span></td>
                        <td>{farmLabel(l.fromFarmId)}</td>
                        <td>{farmLabel(l.toFarmId)}</td>
                        <td>{breed.get(l.breedId)?.name ?? "—"}</td>
                        <td className="text-right tabular-nums">wk {l.ageWeek}</td>
                        <td className="text-right tabular-nums">{houses.get(l.placementId) ?? "—"}</td>
                        <td className="text-right tabular-nums">{fmtInt(l.birds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <Card title="By laying farm">
          {byFarm.size === 0 ? (
            <p className="text-sm text-neutral-500 py-6 text-center">—</p>
          ) : (
            <table className="data-grid text-sm">
              <thead>
                <tr><th className="text-left">Farm</th><th className="text-right">Flocks</th><th className="text-right">Houses</th><th className="text-right">Pullets</th></tr>
              </thead>
              <tbody>
                {[...byFarm.entries()].map(([id, f]) => (
                  <tr key={id}>
                    <td>{farmLabel(id)}</td>
                    <td className="text-right tabular-nums">{f.flocks}</td>
                    <td className="text-right tabular-nums">{f.houses || "—"}</td>
                    <td className="text-right tabular-nums">{fmtInt(f.birds)}</td>
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

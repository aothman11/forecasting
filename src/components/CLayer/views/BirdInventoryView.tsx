"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { weeklyTotals, type CalendarWeekTotals } from "@/lib/cLayer/calc";
import type { CLayerViewProps } from "../CLayerPage";
import {
  Card,
  FilterBar,
  KpiRow,
  Notice,
  RangeControls,
  defaultRange,
  emptyFilter,
  fmtInt,
  rangeBounds,
  toProjectionFilter,
  weekTooltip,
} from "../ui";

const total = (w: CalendarWeekTotals) => w.birds1260 + w.birds1250 + w.birdsUnassigned;

export function BirdInventoryView({ data, projections }: CLayerViewProps) {
  const [filter, setFilter] = useState(emptyFilter);
  const [range, setRange] = useState(defaultRange);
  const materialByBreed = useMemo(() => Object.fromEntries(data.breeds.map((b) => [b.id, b.eggMaterialNo])), [data.breeds]);
  const weeks = useMemo(
    () => weeklyTotals(projections, toProjectionFilter(filter), rangeBounds(range), materialByBreed),
    [projections, filter, range, materialByBreed],
  );

  const farmCode = new Map(data.farms.map((f) => [f.id, f.code]));
  const breedName = new Map(data.breeds.map((b) => [b.id, b.name]));
  const flockNo = new Map(data.placements.map((p) => [p.id, p.flockNo]));
  const tip = (w: CalendarWeekTotals) => weekTooltip(w, farmCode, breedName, flockNo);
  const peak = weeks.reduce((best, w) => (total(w) > total(best) ? w : best), weeks[0]);
  const unprojected = projections.filter((p) => p.weeks.length === 0).length;
  const unassigned = weeks.some((w) => w.birdsUnassigned > 0);
  const first = weeks[0];

  const chartData = weeks.map((w) => ({
    week: w.isoWeek,
    "1260 Rearing": Math.round(w.birds1260),
    "1250 Laying": Math.round(w.birds1250),
    ...(unassigned ? { "Plant unknown": Math.round(w.birdsUnassigned) } : {}),
  }));

  const stageList = (w: CalendarWeekTotals) => [...new Set(w.flocks.map((f) => f.feedStage).filter(Boolean))].join(", ");
  const rows: [string, (w: CalendarWeekTotals) => number, string?][] = [
    ["1260 · Rearing", (w) => w.birds1260],
    ["1250 · Laying", (w) => w.birds1250],
    ...(unassigned ? [["Plant unknown", (w: CalendarWeekTotals) => w.birdsUnassigned] as [string, (w: CalendarWeekTotals) => number]] : []),
    ["Total live birds", total, "font-semibold"],
    ["Transfer 1260 → 1250", (w) => w.transferBirds, "text-neutral-500"],
    ["Depleted (leaving)", (w) => w.depletedBirds, "text-neutral-500"],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-6">
        <FilterBar farms={data.farms} breeds={data.breeds} value={filter} onChange={setFilter} showPlant />
        <RangeControls value={range} onChange={setRange} />
      </div>
      {unprojected > 0 && <Notice lines={[`${unprojected} flock(s) are excluded because their breed has no weekly standard.`]} />}
      {unassigned && <Notice lines={["Some birds have no plant because no transfer age is set (Missing setting: Default transfer age)."]} />}
      <KpiRow
        items={[
          { label: "Live birds this week", value: fmtInt(first ? total(first) : 0), sub: first?.isoWeek, tone: "green" },
          { label: "Plant 1260 · Rearing", value: fmtInt(first?.birds1260 ?? 0), tone: "gold" },
          { label: "Plant 1250 · Laying", value: fmtInt(first?.birds1250 ?? 0), tone: "green" },
          { label: "Peak in range", value: fmtInt(peak ? total(peak) : 0), sub: peak?.isoWeek },
        ]}
      />
      <Card title="Live birds by calendar week" subtitle="Birds alive at the start of each week, by plant. Birds move from 1260 to 1250 in the transfer week.">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => Number(v).toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="1260 Rearing" stackId="b" fill="#C49A1A" />
              <Bar dataKey="1250 Laying" stackId="b" fill="#047836" radius={unassigned ? undefined : [3, 3, 0, 0]} />
              {unassigned && <Bar dataKey="Plant unknown" stackId="b" fill="#9ca3af" radius={[3, 3, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Weekly table" subtitle="Hover a week for each flock's plant, farm, age and feed stage.">
        <div className="overflow-x-auto">
          <table className="data-grid text-xs">
            <thead>
              <tr>
                <th className="text-left sticky left-0 bg-brand-green-tint">Birds</th>
                {weeks.map((w) => (
                  <th key={w.weekStart} className="text-right cursor-help" title={tip(w)}>
                    {w.isoWeek.slice(5)}<span className="block text-[9px] font-normal normal-case">{w.isoWeek.slice(0, 4)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, get, cls]) => (
                <tr key={name} className={cls}>
                  <td className="sticky left-0 bg-white">{name}</td>
                  {weeks.map((w) => (
                    <td key={w.weekStart} className="text-right tabular-nums" title={tip(w)}>
                      {get(w) ? fmtInt(get(w)) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="sticky left-0 bg-white text-neutral-500">Feed stage(s)</td>
                {weeks.map((w) => (
                  <td key={w.weekStart} className="text-right text-[10px] text-neutral-500 max-w-[90px] truncate" title={stageList(w)}>
                    {stageList(w) || "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

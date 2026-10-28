"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { weeklyTotals, type CalendarWeekTotals } from "@/lib/cLayer/calc";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, FilterBar, KpiRow, Notice, RangeControls, defaultRange, fmtInt, rangeBounds, type FilterState } from "../ui";

export function ageTooltip(week: CalendarWeekTotals, farmCode: Map<string, string>, breedName: Map<string, string>): string {
  if (!week.flocks.length) return `${week.isoWeek} · Mon ${week.weekStart}\nNo flocks this week`;
  return [
    `${week.isoWeek} · Mon ${week.weekStart} · bird age:`,
    ...week.flocks.map((f) => `${farmCode.get(f.farmId) ?? "?"} · ${breedName.get(f.breedId) ?? "?"}: age wk ${f.ageWeek}`),
  ].join("\n");
}

export function BirdInventoryView({ data, projections }: CLayerViewProps) {
  const [filter, setFilter] = useState<FilterState>({ farmId: "", breedId: "" });
  const [range, setRange] = useState(defaultRange);
  const weeks = useMemo(() => weeklyTotals(projections, filter, rangeBounds(range)), [projections, filter, range]);

  const farmCode = new Map(data.farms.map((f) => [f.id, f.code]));
  const breedName = new Map(data.breeds.map((b) => [b.id, b.name]));
  const total = (w: CalendarWeekTotals) => w.rearingBirds + w.layingBirds;
  const peak = weeks.reduce((best, w) => (total(w) > total(best) ? w : best), weeks[0]);
  const unprojected = projections.filter((p) => p.weeks.length === 0).length;

  const chartData = weeks.map((w) => ({ week: w.isoWeek, Rearing: Math.round(w.rearingBirds), Laying: Math.round(w.layingBirds) }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-6">
        <FilterBar farms={data.farms} breeds={data.breeds} value={filter} onChange={setFilter} />
        <RangeControls value={range} onChange={setRange} />
      </div>
      {unprojected > 0 && <Notice lines={[`${unprojected} placement(s) are excluded because their breed has no weekly standard.`]} />}
      <KpiRow
        items={[
          { label: "Birds this week", value: fmtInt(weeks[0] ? total(weeks[0]) : 0), sub: weeks[0]?.isoWeek, tone: "green" },
          { label: "Laying this week", value: fmtInt(weeks[0]?.layingBirds ?? 0), tone: "green" },
          { label: "Rearing this week", value: fmtInt(weeks[0]?.rearingBirds ?? 0), tone: "gold" },
          { label: "Peak in range", value: fmtInt(peak ? total(peak) : 0), sub: peak?.isoWeek },
        ]}
      />
      <Card title="Live birds by calendar week" subtitle="Birds alive at the start of each week, split by phase.">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => Number(v).toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Rearing" stackId="b" fill="#C49A1A" />
              <Bar dataKey="Laying" stackId="b" fill="#047836" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Weekly table" subtitle="Hover a week to see each flock's age.">
        <div className="overflow-x-auto">
          <table className="data-grid text-xs">
            <thead>
              <tr>
                <th className="text-left sticky left-0 bg-brand-green-tint">Birds</th>
                {weeks.map((w) => (
                  <th key={w.weekStart} className="text-right cursor-help" title={ageTooltip(w, farmCode, breedName)}>
                    {w.isoWeek.slice(5)}<span className="block text-[9px] font-normal normal-case">{w.isoWeek.slice(0, 4)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([["Rearing", (w: CalendarWeekTotals) => w.rearingBirds], ["Laying", (w: CalendarWeekTotals) => w.layingBirds], ["Total", total]] as const).map(([name, get]) => (
                <tr key={name} className={name === "Total" ? "font-semibold" : undefined}>
                  <td className="sticky left-0 bg-white">{name}</td>
                  {weeks.map((w) => (
                    <td key={w.weekStart} className="text-right tabular-nums" title={ageTooltip(w, farmCode, breedName)}>
                      {get(w) ? fmtInt(get(w)) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

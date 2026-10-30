"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { feedStoPlan, isoWeekLabel, type FeedStoLine } from "@/lib/cLayer/calc";
import { exportFeedSto } from "@/lib/cLayer/excel";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, FilterBar, KpiRow, Notice, RangeControls, btn, defaultRange, emptyFilter, fmtDec, rangeBounds, todayIso } from "../ui";

const FARM_COLORS = ["#047836", "#C49A1A", "#2f7fb5", "#7a4fb0", "#d24918", "#5b8f6f", "#8a6d1e", "#4a5d73"];

const ranges = (ages: number[]) => {
  const sorted = [...ages].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`);
    i = j;
  }
  return out.join(", ");
};

export function FeedStoView({ data, projections }: CLayerViewProps) {
  const [filter, setFilter] = useState(emptyFilter);
  const [range, setRange] = useState(defaultRange);
  const { settings } = data;
  const supplyPlant = settings.feedSupplyPlant ?? "";

  const farmById = useMemo(() => new Map(data.farms.map((f) => [f.id, f])), [data.farms]);
  const flockNo = useMemo(() => new Map(data.placements.map((p) => [p.id, p.flockNo])), [data.placements]);
  const flockLabel = (id: string) => String(flockNo.get(id) ?? "?");

  const plan = useMemo(
    () =>
      feedStoPlan(
        projections.filter((p) => !filter.breedId || p.breedId === filter.breedId),
        data.standards,
        {
          feedStages: data.feedStages,
          leadDays: settings.feedStoLeadDays,
          truckTons: settings.feedTruckTons,
          siloByFarm: Object.fromEntries(data.farms.map((f) => [f.id, f.siloCapacityT])),
        },
        rangeBounds(range),
      ),
    [projections, filter.breedId, data.standards, data.feedStages, data.farms, settings.feedStoLeadDays, settings.feedTruckTons, range],
  );

  const lines = plan.lines.filter((l) => (!filter.plant || l.plant === filter.plant) && (!filter.farmId || l.farmId === filter.farmId));
  const total = lines.reduce((s, l) => s + l.tons, 0);
  const firstWeek = lines[0]?.weekStart;
  const firstWeekTons = lines.filter((l) => l.weekStart === firstWeek).reduce((s, l) => s + l.tons, 0);
  const noMaterial = [...new Set(lines.filter((l) => !l.materialNo).map((l) => l.feedStage))];
  const siloTight = lines.filter((l) => l.siloCoverDays !== null && l.siloCoverDays < 2);
  // Overdue: the STO should already have been created (its date is before today).
  const today = todayIso();
  const isOverdue = (l: FeedStoLine) => l.stoDate !== null && l.stoDate < today;
  const overdue = lines.filter(isOverdue);

  const farmsInPlan = [...new Set(lines.map((l) => l.farmId))].sort((a, b) => (farmById.get(a)?.code ?? "").localeCompare(farmById.get(b)?.code ?? ""));
  const weeks = [...new Set(lines.map((l) => l.weekStart))];
  const chartData = weeks.map((w) => ({
    week: isoWeekLabel(w).slice(2),
    ...Object.fromEntries(
      farmsInPlan.map((id) => [farmById.get(id)?.code ?? id, Math.round(lines.filter((l) => l.weekStart === w && l.farmId === id).reduce((s, l) => s + l.tons, 0) * 10) / 10]),
    ),
  }));

  const notices = [
    ...(supplyPlant ? [] : ["Missing setting: Feed STO supplying plant (feed mill)."]),
    ...(settings.feedStoLeadDays === null ? ["Missing setting: Feed STO lead time — STO dates stay blank."] : []),
    ...(overdue.length ? [`${overdue.length} STO line(s) are overdue — their STO date has passed (first: ${overdue[0].isoWeek}). Create them now.`] : []),
    ...(noMaterial.length ? [`No SAP feed material on stage(s): ${noMaterial.join(", ")} — enter the feed codes under Standards & Settings → Feed stages.`] : []),
    ...plan.gaps.map((g) =>
      g.reason === "noFeedIntake"
        ? `Flock ${flockLabel(g.placementId)}: no feed intake in the breed standard for age week(s) ${ranges(g.ageWeeks)} — not planned.`
        : `Flock ${flockLabel(g.placementId)}: no feed stage covers age week(s) ${ranges(g.ageWeeks)} — not planned.`,
    ),
  ];

  const download = () =>
    exportFeedSto(
      lines.map((l) => ({
        supplyPlant,
        receivingPlant: l.plant,
        farmCode: farmById.get(l.farmId)?.code ?? "",
        materialNo: l.materialNo,
        feedStage: l.feedStage,
        tons: Math.round(l.tons * 100) / 100,
        deliveryWeek: l.isoWeek,
        deliveryDate: l.weekStart,
        stoDate: l.stoDate ?? "",
        status: isOverdue(l) ? "Overdue" : "",
        trucks: l.trucks,
        flocks: l.placementIds.map(flockLabel).join(", "),
      })),
    );

  const siloCell = (l: FeedStoLine) =>
    l.siloCoverDays === null ? (
      <span className="text-neutral-400">—</span>
    ) : (
      <span className={l.siloCoverDays < 2 ? "text-brand-alert font-semibold" : undefined} title={`${l.siloDeliveries} deliveries needed this week for the farm's silo`}>
        {fmtDec(l.siloCoverDays, 1)} d · {l.siloDeliveries}×/wk
      </span>
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-6">
        <FilterBar farms={data.farms} breeds={data.breeds} value={filter} onChange={setFilter} showPlant />
        <RangeControls value={range} onChange={setRange} />
      </div>
      {notices.length > 0 && <Notice lines={notices} />}
      <KpiRow
        items={[
          { label: "Feed in range", value: `${fmtDec(total, 1)} t`, sub: `${weeks.length} weeks`, tone: "green" },
          { label: "First week", value: `${fmtDec(firstWeekTons, 1)} t`, sub: firstWeek ? isoWeekLabel(firstWeek) : undefined, tone: "gold" },
          { label: "Overdue STOs", value: String(overdue.length), sub: `of ${lines.length} lines from plant ${supplyPlant || "?"}`, tone: overdue.length ? "alert" : "neutral" },
          { label: "Silo cover < 2 days", value: String(siloTight.length), sub: "lines", tone: siloTight.length ? "alert" : "neutral" },
        ]}
      />
      <Card title="Feed by week and farm (tons)" subtitle="Live birds × breed feed intake (g/bird/day) × 7. Feed goes to the farm the flock is on that week: rearing farm until transfer, laying farm after.">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} unit=" t" />
              <Tooltip formatter={(v) => `${Number(v).toLocaleString()} t`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {farmsInPlan.map((id, i) => (
                <Bar key={id} dataKey={farmById.get(id)?.code ?? id} stackId="f" fill={FARM_COLORS[i % FARM_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card
        title="Planned feed STOs"
        subtitle={`One line per delivery week × farm × feed material, supplied by plant ${supplyPlant || "?"}. Quantities in tons (TO); the MRP run sets the actual delivery days. STO created ${settings.feedStoLeadDays ?? "?"} days before the delivery week. Silo cover = days one full silo lasts; silo sizes are sample values (rearing 40 t, laying 120 t) until the real ones are entered under Farms.`}
        actions={<button className={btn} onClick={download} disabled={!lines.length}>Download Excel</button>}
      >
        {lines.length === 0 ? (
          <p className="text-sm text-neutral-500">No feed needed in this range. Add flocks in the Flock Plan.</p>
        ) : (
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="data-grid text-xs">
              <thead>
                <tr>
                  <th className="text-left">STO date</th>
                  <th className="text-left">Delivery week</th>
                  <th className="text-left">From → To</th>
                  <th className="text-left">Farm</th>
                  <th className="text-left">Feed stage</th>
                  <th className="text-left">Material</th>
                  <th className="text-right">Tons</th>
                  {settings.feedTruckTons !== null && <th className="text-right">Trucks</th>}
                  <th className="text-right">Silo cover</th>
                  <th className="text-left">Flocks</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={`${l.weekStart}|${l.farmId}|${l.feedStage}`} className={isOverdue(l) ? "bg-red-50" : undefined}>
                    <td className="whitespace-nowrap tabular-nums">
                      {l.stoDate ?? "—"}
                      {isOverdue(l) && <span className="ml-2 rounded bg-brand-alert px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Overdue</span>}
                    </td>
                    <td className="whitespace-nowrap">{l.isoWeek}</td>
                    <td className="whitespace-nowrap">{supplyPlant || "?"} → {l.plant}</td>
                    <td className="font-medium">{farmById.get(l.farmId)?.code ?? "?"}</td>
                    <td>{l.feedStage}</td>
                    <td>{l.materialNo || <span className="text-brand-alert">not set</span>}</td>
                    <td className="text-right tabular-nums font-semibold">{fmtDec(l.tons, 2)}</td>
                    {settings.feedTruckTons !== null && <td className="text-right tabular-nums">{l.trucks}</td>}
                    <td className="text-right tabular-nums whitespace-nowrap">{siloCell(l)}</td>
                    <td>{l.placementIds.map(flockLabel).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

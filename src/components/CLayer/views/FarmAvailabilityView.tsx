"use client";

import { useMemo, useState } from "react";
import { farmAvailability, farmStays, isoWeekLabel, type FarmWeekStatus } from "@/lib/cLayer/calc";
import { LAYER_PLANTS, PREP_GROUP_PLANT, PREP_MATERIAL, type LayerPlant } from "@/lib/cLayer/types";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, KpiRow, Notice, RangeControls, defaultRange, rangeBounds } from "../ui";

const CELL: Record<FarmWeekStatus["status"], string> = {
  occupied: "bg-brand-green text-white",
  preparation: "bg-brand-gold/80 text-white",
  free: "bg-white text-neutral-300",
};

const groupOf = (plant: LayerPlant) => Object.entries(PREP_GROUP_PLANT).find(([, p]) => p === plant)?.[0] ?? "";

export function FarmAvailabilityView({ data, projections, prepPlans }: CLayerViewProps) {
  const [range, setRange] = useState(defaultRange);
  const [plant, setPlant] = useState<LayerPlant | "">("");
  const flockNo = new Map(data.placements.map((p) => [p.id, p.flockNo]));
  const flockName = (id: string) => (flockNo.get(id) ? `flock ${flockNo.get(id)}` : "a flock");

  const farms = useMemo(
    () => data.farms.filter((f) => (f.active || projections.some((p) => p.rearingFarmId === f.id || p.layingFarmId === f.id)) && (!plant || f.plant === plant)),
    [data.farms, projections, plant],
  );
  const stays = useMemo(() => farmStays(data.placements, projections, prepPlans), [data.placements, projections, prepPlans]);
  const rows = useMemo(
    () => farmAvailability(farms.map((f) => f.id), stays, prepPlans, rangeBounds(range)),
    [farms, stays, prepPlans, range],
  );
  const weeks = rows[0]?.weeks.map((w) => w.weekStart) ?? [];
  const farmById = new Map(data.farms.map((f) => [f.id, f]));

  const thisWeek = rows.map((r) => r.weeks[0]?.status);
  const missingPlans = (["1260", "1250"] as LayerPlant[]).filter((p) => !prepPlans[p]);

  const tip = (w: FarmWeekStatus) =>
    w.status === "occupied"
      ? `${isoWeekLabel(w.weekStart)}: ${w.placementIds.map(flockName).join(", ")} on the farm${w.prepConflict ? " — CONFLICT: the house should still be in preparation" : ""}`
      : w.status === "preparation"
        ? `${isoWeekLabel(w.weekStart)}: preparation after ${flockName(w.placementIds[0])}, day ${w.prepDays![0]}–${w.prepDays![1]}: ${w.prepSteps}`
        : `${isoWeekLabel(w.weekStart)}: free`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-6">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Plant</span>
          <select className="text-sm rounded-md border border-[var(--border-subtle)] px-2 py-1.5 bg-white" value={plant} onChange={(e) => setPlant(e.target.value as LayerPlant | "")}>
            <option value="">All plants</option>
            {(Object.keys(LAYER_PLANTS) as LayerPlant[]).map((p) => (
              <option key={p} value={p}>{p} · {LAYER_PLANTS[p]}</option>
            ))}
          </select>
        </label>
        <RangeControls value={range} onChange={setRange} />
      </div>
      {missingPlans.length > 0 && (
        <Notice lines={missingPlans.map((p) => `No ${PREP_MATERIAL} routing for plant ${p} (${groupOf(p)}) — its farms show no preparation period. Upload it under Standards & Settings.`)} />
      )}
      <KpiRow
        items={[
          { label: "Farms", value: String(rows.length) },
          { label: "Occupied this week", value: String(thisWeek.filter((s) => s === "occupied").length), tone: "green" },
          { label: "In preparation", value: String(thisWeek.filter((s) => s === "preparation").length), tone: "gold" },
          { label: "Free this week", value: String(thisWeek.filter((s) => s === "free").length) },
        ]}
      />
      <Card
        title="Farm availability by week"
        subtitle={`Green = flock on the farm. Red = flock placed while the house should still be in preparation. Gold = house preparation (${PREP_MATERIAL}): one operation per day, starting the week the flock leaves — transfer for 1260, depletion for 1250. Hover a cell for the day range and operations.`}
      >
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500">No farms yet. Add farms under Standards & Settings.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-grid text-xs">
              <thead>
                <tr>
                  <th className="text-left sticky left-0 bg-brand-green-tint">Farm</th>
                  <th className="text-left">Free from</th>
                  {weeks.map((w) => (
                    <th key={w} className="text-center px-1">
                      {isoWeekLabel(w).slice(5)}<span className="block text-[9px] font-normal normal-case">{w.slice(0, 4)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const f = farmById.get(r.farmId);
                  return (
                    <tr key={r.farmId}>
                      <td className="sticky left-0 bg-white whitespace-nowrap">
                        <span className="font-medium">{f?.code}</span>
                        <span className="text-[10px] text-neutral-400"> · {f?.plant ?? "?"}</span>
                      </td>
                      <td className="whitespace-nowrap tabular-nums">{r.freeFrom ? isoWeekLabel(r.freeFrom) : "now"}</td>
                      {r.weeks.map((w) => (
                        <td key={w.weekStart} className={`text-center px-1 text-[10px] cursor-help ${w.prepConflict ? "bg-brand-alert text-white" : CELL[w.status]}`} title={tip(w)}>
                          {w.status === "occupied"
                            ? w.placementIds.map((id) => flockNo.get(id) ?? "•").join("+")
                            : w.status === "preparation"
                              ? `d${w.prepDays![0]}`
                              : "·"}
                        </td>
                      ))}
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

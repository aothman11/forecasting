"use client";

import { addDays, format } from "date-fns";
import { usePipeline } from "@/lib/usePipeline";
import { weekLabel } from "@/lib/demandPlan";
import { carcassYieldPct } from "@/lib/calculations";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { SummaryCard } from "../shared/SummaryCard";
import { CapacityChart } from "../charts/CapacityChart";
import { ProcessingFunnelChart } from "../charts/ProcessingFunnelChart";
import type { LiveBirdWeek } from "@/lib/types";

function birds(n: number) {
  return Math.round(n).toLocaleString();
}

function kg(n: number) {
  return Math.round(n).toLocaleString();
}

interface WaterfallRow {
  label: string;
  kind: "stock" | "loss" | "result";
  value: string;
  pctOfHarvestable: number | null;
}

export function LiveBirdForecast() {
  const { result, params } = usePipeline();
  const rows = result.liveBird;

  const totalBirds = rows.reduce((s, r) => s + r.harvestableBirds, 0);
  const totalKg = rows.reduce((s, r) => s + r.totalLiveWeightKg, 0);
  const breachWeeks = rows.filter((r) => r.exceedsCapacity).length;

  const totals = rows.reduce(
    (acc, r) => {
      acc.harvestable += r.harvestableBirds;
      acc.harvestMortality += r.harvestMortalityBirds;
      acc.dispatched += r.dispatchedBirds;
      acc.doa += r.doaBirds;
      acc.culled += r.culledBirds;
      acc.electronic += r.electronicBirdCount;
      acc.pluckingReject += r.pluckingRejectBirds;
      acc.slaughtered += r.slaughteredBirds;
      acc.slaughteredKg += r.slaughteredCarcassWeightKg;
      return acc;
    },
    {
      harvestable: 0,
      harvestMortality: 0,
      dispatched: 0,
      doa: 0,
      culled: 0,
      electronic: 0,
      pluckingReject: 0,
      slaughtered: 0,
      slaughteredKg: 0,
    }
  );

  const pctOf = (v: number) => (totals.harvestable > 0 ? (v / totals.harvestable) * 100 : 0);

  const waterfall: WaterfallRow[] = [
    { label: "Harvestable Birds", kind: "stock", value: birds(totals.harvestable), pctOfHarvestable: 100 },
    { label: "− Harvest Mortality (0.2%)", kind: "loss", value: `−${birds(totals.harvestMortality)}`, pctOfHarvestable: pctOf(totals.harvestMortality) },
    { label: "= Dispatched Birds", kind: "result", value: birds(totals.dispatched), pctOfHarvestable: pctOf(totals.dispatched) },
    { label: "− Dead on Arrival (0.5%)", kind: "loss", value: `−${birds(totals.doa)}`, pctOfHarvestable: pctOf(totals.doa) },
    { label: "− Culled Birds (0.2%)", kind: "loss", value: `−${birds(totals.culled)}`, pctOfHarvestable: pctOf(totals.culled) },
    { label: "= Electronic Bird Count", kind: "result", value: birds(totals.electronic), pctOfHarvestable: pctOf(totals.electronic) },
    { label: "− Plucking Rejects (0.6%)", kind: "loss", value: `−${birds(totals.pluckingReject)}`, pctOfHarvestable: pctOf(totals.pluckingReject) },
    { label: "= Slaughtered Birds", kind: "result", value: birds(totals.slaughtered), pctOfHarvestable: pctOf(totals.slaughtered) },
    { label: `× Avg Carcass Weight (${params.avgCarcassWeightKg.toFixed(3)} kg)`, kind: "loss", value: "", pctOfHarvestable: null },
    { label: "= Slaughtered Carcass Weight", kind: "result", value: `${kg(totals.slaughteredKg)} kg`, pctOfHarvestable: null },
  ];

  const funnelStages = [
    { name: "Harvestable", value: totals.harvestable, fill: "#047836" },
    { name: "Dispatched", value: totals.dispatched, fill: "#0f9a4a" },
    { name: "Electronic Count", value: totals.electronic, fill: "#C49A1A" },
    { name: "Slaughtered", value: totals.slaughtered, fill: "#D24918" },
  ];

  const columns: DataTableColumn<LiveBirdWeek>[] = [
    { key: "week", header: "Week", render: (r) => weekLabel(r.week, params.planStartDate) },
    {
      key: "range",
      header: "Harvest Date Range",
      render: (r) => `${r.harvestDateStart} → ${r.harvestDateEnd}`,
    },
    {
      key: "ref",
      header: "Placement Date Range",
      render: (r) => {
        const offset = -Math.round(params.cycleLengthDays);
        const start = format(addDays(new Date(r.harvestDateStart), offset), "yyyy-MM-dd");
        const end = format(addDays(new Date(r.harvestDateEnd), offset), "yyyy-MM-dd");
        return <span className="text-neutral-500 text-[11px]">{start} → {end}</span>;
      },
    },
    {
      key: "birds",
      header: "Harvestable Birds",
      align: "right",
      render: (r) => Math.round(r.harvestableBirds).toLocaleString(),
      footer: Math.round(totalBirds).toLocaleString(),
    },
    {
      key: "kg",
      header: "Total Live Weight (kg)",
      align: "right",
      render: (r) => Math.round(r.totalLiveWeightKg).toLocaleString(),
      footer: Math.round(totalKg).toLocaleString(),
    },
    {
      key: "util",
      header: "Utilization %",
      align: "right",
      render: (r) => (
        <span className={r.exceedsCapacity ? "text-brand-alert font-semibold" : ""}>
          {r.utilizationPct.toFixed(1)}%
        </span>
      ),
    },
  ];

  const funnelColumns: DataTableColumn<LiveBirdWeek>[] = [
    { key: "week", header: "Week", render: (r) => weekLabel(r.week, params.planStartDate) },
    { key: "harvestable", header: "Harvestable", align: "right", render: (r) => birds(r.harvestableBirds) },
    { key: "dispatched", header: "Dispatched", align: "right", render: (r) => birds(r.dispatchedBirds) },
    { key: "electronic", header: "Electronic Count", align: "right", render: (r) => birds(r.electronicBirdCount) },
    { key: "slaughtered", header: "Slaughtered Birds", align: "right", render: (r) => birds(r.slaughteredBirds) },
    {
      key: "slaughteredKg",
      header: "Slaughtered Carcass (kg)",
      align: "right",
      render: (r) => kg(r.slaughteredCarcassWeightKg),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Step 2 — Live Bird Forecast &amp; Processing Funnel</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Cascaded from the placement plan, then carried through catching, counting, and slaughter losses.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <SummaryCard label="Total Harvestable Birds" value={Math.round(totalBirds).toLocaleString()} accent="green" />
        <SummaryCard label="Carcass Yield %" value={`${(carcassYieldPct(params) * 100).toFixed(2)}%`} sublabel="ACW / ALW" accent="gold" />
        <SummaryCard label="Total Slaughtered Carcass" value={`${kg(totals.slaughteredKg)} kg`} />
        <SummaryCard
          label="Weeks Over Capacity"
          value={String(breachWeeks)}
          accent={breachWeeks > 0 ? "alert" : "neutral"}
        />
      </div>

      <CapacityChart data={rows} planStartDate={params.planStartDate} />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.week}
        rowClassName={(r) => (r.exceedsCapacity ? "bg-red-50" : "")}
      />

      <div>
        <h2 className="text-base font-semibold section-title text-brand-green-dark">Processing Funnel</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Where birds are lost between harvest and slaughter, over the full {rows.length}-week horizon.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
        <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="bg-[var(--brand-green-tint)] text-[11px] uppercase tracking-wide text-brand-green-dark">
                <th className="text-left px-3 py-2 font-semibold">Stage</th>
                <th className="text-right px-3 py-2 font-semibold">Birds</th>
                <th className="text-right px-3 py-2 font-semibold">% of Harvestable</th>
              </tr>
            </thead>
            <tbody>
              {waterfall.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-[var(--border-subtle)] last:border-0 ${
                    row.kind === "result" ? "bg-brand-green-tint/40 font-semibold" : ""
                  }`}
                >
                  <td
                    className={`px-3 py-1.5 ${
                      row.kind === "loss" ? "text-brand-gold" : row.kind === "result" ? "text-brand-green-dark" : "text-foreground"
                    }`}
                  >
                    {row.label}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right ${
                      row.kind === "loss" ? "text-brand-gold" : row.kind === "result" ? "text-brand-green-dark" : "text-foreground"
                    }`}
                  >
                    {row.value}
                  </td>
                  <td className="px-3 py-1.5 text-right text-neutral-400">
                    {row.pctOfHarvestable === null ? "" : `${row.pctOfHarvestable.toFixed(2)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ProcessingFunnelChart stages={funnelStages} />
      </div>

      <DataTable columns={funnelColumns} rows={rows} rowKey={(r) => r.week} maxHeight="360px" />
    </div>
  );
}

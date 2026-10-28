"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cLayerApi, errorLines } from "@/lib/cLayer/api";
import { isoWeekLabel, missingSettings, packEggs, weekRange, type EggCell } from "@/lib/cLayer/calc";
import { groupWeeksByMonth } from "@/lib/demandPlan";
import { Card, FilterBar, KpiRow, Notice, RangeControls, defaultRange, fmtInt, input, label, rangeBounds, type FilterState } from "../ui";

interface EggOutputResponse {
  cells: EggCell[];
  farms: { id: string; code: string; name: string }[];
  breeds: { id: string; name: string }[];
  packing: { eggsPerTray: number | null; traysPerCase: number | null };
  warnings: string[];
}

type Unit = "eggs" | "trays" | "cases";

/** Reads the computed egg-output endpoint, so it works for roles that cannot see raw placements. */
export function EggOutputView() {
  const [res, setRes] = useState<EggOutputResponse | null>(null);
  const [error, setError] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<FilterState>({ farmId: "", breedId: "" });
  const [range, setRange] = useState(defaultRange);
  const [unit, setUnit] = useState<Unit>("eggs");

  useEffect(() => {
    let cancelled = false;
    cLayerApi<EggOutputResponse>("GET", "/egg-output")
      .then((r) => !cancelled && setRes(r))
      .catch((err) => !cancelled && setError(errorLines(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const weeks = useMemo(() => {
    if (!res) return [];
    const { from, to } = rangeBounds(range);
    const byWeek = new Map(weekRange(from, to).map((w) => [w, { weekStart: w, eggs: 0, minAge: Infinity, maxAge: 0 }]));
    for (const c of res.cells) {
      if ((filter.farmId && c.farmId !== filter.farmId) || (filter.breedId && c.breedId !== filter.breedId)) continue;
      const w = byWeek.get(c.weekStart);
      if (!w) continue;
      w.eggs += c.eggs;
      w.minAge = Math.min(w.minAge, c.minAge);
      w.maxAge = Math.max(w.maxAge, c.maxAge);
    }
    return [...byWeek.values()].map((w) => ({ ...w, isoWeek: isoWeekLabel(w.weekStart), ...packEggs(w.eggs, res.packing) }));
  }, [res, filter, range]);

  if (error) return <Notice tone="error" lines={["Could not load egg output:", ...error]} />;
  if (!res) return <div className="text-sm text-neutral-500 py-10 text-center">Loading egg output…</div>;

  const missing = missingSettings(res.packing, ["eggsPerTray", "traysPerCase"]);
  const unitAvailable = (u: Unit) => u === "eggs" || (u === "trays" ? res.packing.eggsPerTray !== null : missing.length === 0);
  const activeUnit: Unit = unitAvailable(unit) ? unit : "eggs";
  const value = (w: (typeof weeks)[number]) => (activeUnit === "eggs" ? w.eggs : activeUnit === "trays" ? w.trays : w.cases);
  const unitLabel = { eggs: "Eggs", trays: "Trays", cases: "Cases" }[activeUnit];
  const sum = (u: Unit) => weeks.reduce((s, w) => s + ((u === "eggs" ? w.eggs : u === "trays" ? w.trays : w.cases) ?? 0), 0);
  const ageTip = (w: (typeof weeks)[number]) =>
    `${w.isoWeek} · Mon ${w.weekStart}\n${w.eggs > 0 ? `Laying flock age: wk ${w.minAge === w.maxAge ? w.minAge : `${w.minAge}–${w.maxAge}`}` : "No laying flocks"}`;

  const months = groupWeeksByMonth(weeks.map((_, i) => i + 1), range.from).map((m) => {
    const ws = m.weeks.map((i) => weeks[i - 1]);
    return {
      label: m.monthLabel,
      eggs: ws.reduce((s, w) => s + w.eggs, 0),
      trays: res.packing.eggsPerTray === null ? null : ws.reduce((s, w) => s + (w.trays ?? 0), 0),
      cases: missing.length ? null : ws.reduce((s, w) => s + (w.cases ?? 0), 0),
    };
  });

  const chartData = weeks.map((w) => ({ week: w.isoWeek, value: Math.round(value(w) ?? 0) }));
  const rows: [string, (w: (typeof weeks)[number]) => number | null][] = [
    ["Eggs", (w) => w.eggs],
    ["Trays", (w) => w.trays],
    ["Cases", (w) => w.cases],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-6">
        <FilterBar farms={res.farms} breeds={res.breeds} value={filter} onChange={setFilter} />
        <RangeControls value={range} onChange={setRange} />
        <label className="flex flex-col gap-1">
          <span className={label}>Chart unit</span>
          <select className={input} value={activeUnit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {(["eggs", "trays", "cases"] as Unit[]).map((u) => (
              <option key={u} value={u} disabled={!unitAvailable(u)}>{u[0].toUpperCase() + u.slice(1)}{unitAvailable(u) ? "" : " (setting missing)"}</option>
            ))}
          </select>
        </label>
      </div>
      <Notice lines={[...res.warnings, ...missing.map((m) => `Missing setting: ${m}. Packed units that depend on it are blank.`)]} />
      <KpiRow
        items={[
          { label: "Eggs in range", value: fmtInt(sum("eggs")), tone: "green" },
          { label: "Trays in range", value: res.packing.eggsPerTray === null ? "—" : fmtInt(sum("trays")), tone: "gold" },
          { label: "Cases in range", value: missing.length ? "—" : fmtInt(sum("cases")) },
          { label: "Avg eggs / week", value: fmtInt(weeks.length ? sum("eggs") / weeks.length : 0) },
        ]}
      />
      <Card title={`${unitLabel} by calendar week`}>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
              <Tooltip formatter={(v) => [Number(v).toLocaleString(), unitLabel]} />
              <Bar dataKey="value" name={unitLabel} fill="#047836" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Weekly table" subtitle="Hover a week to see the laying flocks' age.">
        <div className="overflow-x-auto">
          <table className="data-grid text-xs">
            <thead>
              <tr>
                <th className="text-left sticky left-0 bg-brand-green-tint">Output</th>
                {weeks.map((w) => (
                  <th key={w.weekStart} className="text-right cursor-help" title={ageTip(w)}>
                    {w.isoWeek.slice(5)}<span className="block text-[9px] font-normal normal-case">{w.isoWeek.slice(0, 4)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, get]) => (
                <tr key={name}>
                  <td className="sticky left-0 bg-white font-medium">{name}</td>
                  {weeks.map((w) => {
                    const v = get(w);
                    return <td key={w.weekStart} className="text-right tabular-nums" title={ageTip(w)}>{v === null ? "—" : v ? fmtInt(v) : "·"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Monthly rollup" subtitle="Each week counts in the month its Monday falls in (same rule as the COP demand plan).">
        <div className="overflow-x-auto">
          <table className="data-grid text-sm">
            <thead>
              <tr>
                <th className="text-left">Month</th>
                <th className="text-right">Eggs</th>
                <th className="text-right">Trays</th>
                <th className="text-right">Cases</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td className="text-right tabular-nums">{fmtInt(m.eggs)}</td>
                  <td className="text-right tabular-nums">{m.trays === null ? "—" : fmtInt(m.trays)}</td>
                  <td className="text-right tabular-nums">{m.cases === null ? "—" : fmtInt(m.cases)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

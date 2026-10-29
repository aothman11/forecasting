"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cLayerApi, errorLines } from "@/lib/cLayer/api";
import { gradeEggs, isoWeekLabel, packSkus, weekRange, type EggCell, type GradingSettings } from "@/lib/cLayer/calc";
import { GRADED_MATERIALS, type LayerPlant, type LayerSku } from "@/lib/cLayer/types";
import { groupWeeksByMonth } from "@/lib/demandPlan";
import { Card, FilterBar, KpiRow, Notice, RangeControls, defaultRange, emptyFilter, fmtInt, input, label, rangeBounds } from "../ui";

interface EggOutputResponse {
  cells: EggCell[];
  farms: { id: string; code: string; name: string; plant: LayerPlant | null }[];
  breeds: { id: string; name: string; eggMaterialNo: string }[];
  grading: GradingSettings;
  skus: Pick<LayerSku, "materialNo" | "description" | "grade" | "piecesPerPack" | "packMixPct">[];
  warnings: string[];
}

type ChartMode = "materials" | "graded" | "packs";

const MATERIAL_COLORS = ["#047836", "#C49A1A", "#1a6fc4", "#7c3aed", "#0f766e"];
const SKU_COLORS = ["#047836", "#15803d", "#C49A1A", "#D24918"];

interface Week {
  weekStart: string;
  isoWeek: string;
  eggs: number;
  byMaterial: Record<string, number>;
  minAge: number;
  maxAge: number;
  rejects: number | null;
  table: number | null;
  gradeC: number | null;
  packs: Record<string, number | null>;
}

/** Reads the computed egg-output endpoint, so it works for roles that cannot see raw flocks. */
export function EggOutputView() {
  const [res, setRes] = useState<EggOutputResponse | null>(null);
  const [error, setError] = useState<string[] | null>(null);
  const [filter, setFilter] = useState(emptyFilter);
  const [range, setRange] = useState(defaultRange);
  const [mode, setMode] = useState<ChartMode>("materials");

  useEffect(() => {
    let cancelled = false;
    cLayerApi<EggOutputResponse>("GET", "/egg-output")
      .then((r) => !cancelled && setRes(r))
      .catch((err) => !cancelled && setError(errorLines(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const weeks = useMemo((): Week[] => {
    if (!res) return [];
    const { from, to } = rangeBounds(range);
    const byWeek = new Map(
      weekRange(from, to).map((w) => [w, { weekStart: w, eggs: 0, byMaterial: {} as Record<string, number>, minAge: Infinity, maxAge: 0 }]),
    );
    for (const c of res.cells) {
      if ((filter.farmId && c.farmId !== filter.farmId) || (filter.breedId && c.breedId !== filter.breedId)) continue;
      const w = byWeek.get(c.weekStart);
      if (!w) continue;
      w.eggs += c.eggs;
      w.byMaterial[c.eggMaterialNo] = (w.byMaterial[c.eggMaterialNo] ?? 0) + c.eggs;
      w.minAge = Math.min(w.minAge, c.minAge);
      w.maxAge = Math.max(w.maxAge, c.maxAge);
    }
    return [...byWeek.values()].map((w) => {
      const g = gradeEggs(w.eggs, res.grading);
      const packs = Object.fromEntries(packSkus(g, res.skus).map((s) => [s.materialNo, s.packs]));
      return { ...w, isoWeek: isoWeekLabel(w.weekStart), rejects: g.rejects, table: g.table, gradeC: g.gradeC, packs };
    });
  }, [res, filter, range]);

  if (error) return <Notice tone="error" lines={["Could not load egg output:", ...error]} />;
  if (!res) return <div className="text-sm text-neutral-500 py-10 text-center">Loading egg output…</div>;

  const breedByMaterial = new Map(res.breeds.map((b) => [b.eggMaterialNo, b.name]));
  const materials = [...new Set(res.cells.map((c) => c.eggMaterialNo))].sort();
  const gradingReady = res.grading.rejectPct !== null && res.grading.gradeTablePct !== null;
  const packReady = gradingReady && res.skus.every((s) => s.packMixPct !== null);
  const missing = [
    res.grading.rejectPct === null && "Reject %",
    res.grading.gradeTablePct === null && "Grade split 90001 / 90002",
    res.skus.some((s) => s.packMixPct === null) && "Pack mix of 90001 table eggs",
  ].filter(Boolean) as string[];
  const activeMode: ChartMode = mode === "graded" && !gradingReady ? "materials" : mode === "packs" && !packReady ? "materials" : mode;

  const sum = (get: (w: Week) => number | null) => weeks.reduce((s, w) => s + (get(w) ?? 0), 0);
  const ageTip = (w: Week) =>
    `${w.isoWeek} · Mon ${w.weekStart}\n${w.eggs > 0 ? `Laying flock age: wk ${w.minAge === w.maxAge ? w.minAge : `${w.minAge}–${w.maxAge}`} · plant 1250` : "No laying flocks"}`;

  const chartData = weeks.map((w) => {
    const row: Record<string, string | number> = { week: w.isoWeek };
    if (activeMode === "materials") materials.forEach((m) => (row[m] = Math.round(w.byMaterial[m] ?? 0)));
    if (activeMode === "graded") {
      row[GRADED_MATERIALS.table.materialNo] = Math.round(w.table ?? 0);
      row[GRADED_MATERIALS.gradeC.materialNo] = Math.round(w.gradeC ?? 0);
    }
    if (activeMode === "packs") res.skus.forEach((s) => (row[s.materialNo] = Math.round((w.packs[s.materialNo] ?? 0) * 10) / 10));
    return row;
  });
  const series =
    activeMode === "materials"
      ? materials.map((m, i) => ({ key: m, name: `${m} ${breedByMaterial.get(m) ?? ""}`.trim(), color: MATERIAL_COLORS[i % MATERIAL_COLORS.length] }))
      : activeMode === "graded"
        ? [
            { key: GRADED_MATERIALS.table.materialNo, name: `${GRADED_MATERIALS.table.materialNo} Table egg`, color: "#047836" },
            { key: GRADED_MATERIALS.gradeC.materialNo, name: `${GRADED_MATERIALS.gradeC.materialNo} Grade C`, color: "#D24918" },
          ]
        : res.skus.map((s, i) => ({ key: s.materialNo, name: `${s.materialNo} packs`, color: SKU_COLORS[i % SKU_COLORS.length] }));

  type Row = { label: string; sub?: string; get: (w: Week) => number | null; cls?: string; dec?: boolean };
  const rows: Row[] = [
    ...materials.map((m): Row => ({ label: m, sub: `${breedByMaterial.get(m) ?? "?"} · eggs`, get: (w) => w.byMaterial[m] ?? 0 })),
    { label: "Total eggs laid", get: (w) => w.eggs, cls: "font-semibold" },
    { label: "Rejects", sub: `${res.grading.rejectPct ?? "?"}%`, get: (w) => w.rejects, cls: "text-neutral-500" },
    { label: GRADED_MATERIALS.table.materialNo, sub: GRADED_MATERIALS.table.description, get: (w) => w.table },
    { label: GRADED_MATERIALS.gradeC.materialNo, sub: GRADED_MATERIALS.gradeC.description, get: (w) => w.gradeC },
    ...res.skus.map((s): Row => ({ label: s.materialNo, sub: `${s.description} · packs`, get: (w) => w.packs[s.materialNo] ?? null, dec: true })),
  ];
  const cell = (v: number | null, dec?: boolean) => (v === null ? "—" : v === 0 ? "·" : dec ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : fmtInt(v));

  const months = groupWeeksByMonth(weeks.map((_, i) => i + 1), range.from).map((m) => {
    const ws = m.weeks.map((i) => weeks[i - 1]);
    return { label: m.monthLabel, values: rows.map((r) => (ws.some((w) => r.get(w) === null) ? null : ws.reduce((s, w) => s + (r.get(w) ?? 0), 0))) };
  });
  const totalPacks = packReady ? sum((w) => Object.values(w.packs).reduce<number>((s, v) => s + (v ?? 0), 0)) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-6">
        <FilterBar farms={res.farms} breeds={res.breeds} value={filter} onChange={setFilter} />
        <RangeControls value={range} onChange={setRange} />
        <label className="flex flex-col gap-1">
          <span className={label}>Chart</span>
          <select className={input} value={activeMode} onChange={(e) => setMode(e.target.value as ChartMode)}>
            <option value="materials">Eggs by breed material</option>
            <option value="graded" disabled={!gradingReady}>Graded 90001 / 90002{gradingReady ? "" : " (setting missing)"}</option>
            <option value="packs" disabled={!packReady}>Packs per SKU{packReady ? "" : " (setting missing)"}</option>
          </select>
        </label>
      </div>
      <Notice lines={[...res.warnings, ...(missing.length ? [`Missing setting: ${missing.join(", ")}. Graded and packed outputs that depend on it are blank.`] : [])]} />
      <KpiRow
        items={[
          { label: "Eggs laid in range", value: fmtInt(sum((w) => w.eggs)), tone: "green" },
          { label: `${GRADED_MATERIALS.table.materialNo} table eggs`, value: gradingReady ? fmtInt(sum((w) => w.table)) : "—", tone: "gold" },
          { label: `${GRADED_MATERIALS.gradeC.materialNo} Grade C`, value: gradingReady ? fmtInt(sum((w) => w.gradeC)) : "—" },
          { label: "Packs (all SKUs)", value: totalPacks === null ? "—" : fmtInt(totalPacks) },
        ]}
      />
      <Card title={series.length ? `${activeMode === "packs" ? "Packs" : "Eggs"} by calendar week` : "Eggs by calendar week"}>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
              <Tooltip formatter={(v) => Number(v).toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.name} stackId="e" fill={s.color} radius={i === series.length - 1 ? [3, 3, 0, 0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Weekly table" subtitle="Laid eggs by breed material → grading (rejects, 90001, 90002) → packs per SKU. Hover a week for flock age.">
        <div className="overflow-x-auto">
          <table className="data-grid text-xs">
            <thead>
              <tr>
                <th className="text-left sticky left-0 bg-brand-green-tint">Material</th>
                {weeks.map((w) => (
                  <th key={w.weekStart} className="text-right cursor-help" title={ageTip(w)}>
                    {w.isoWeek.slice(5)}<span className="block text-[9px] font-normal normal-case">{w.isoWeek.slice(0, 4)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label + (r.sub ?? "")} className={r.cls}>
                  <td className="sticky left-0 bg-white whitespace-nowrap">
                    {r.label}{r.sub && <span className="ml-1 text-[10px] font-normal text-neutral-400">{r.sub}</span>}
                  </td>
                  {weeks.map((w) => (
                    <td key={w.weekStart} className="text-right tabular-nums" title={ageTip(w)}>{cell(r.get(w), r.dec)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Monthly rollup" subtitle="Each week counts in the month its Monday falls in (same rule as the COP demand plan). Packs are fractional planning quantities.">
        <div className="overflow-x-auto">
          <table className="data-grid text-xs">
            <thead>
              <tr>
                <th className="text-left">Month</th>
                {rows.map((r) => <th key={r.label + (r.sub ?? "")} className="text-right" title={r.sub}>{r.label}{r.dec ? " packs" : ""}</th>)}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  {m.values.map((v, i) => <td key={i} className="text-right tabular-nums">{cell(v, rows[i].dec)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

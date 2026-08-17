"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Legend,
} from "recharts";
import { usePlanStore } from "@/lib/store";
import type { BomRecord } from "@/lib/bomTypes";
import {
  buildWeekOptions,
  filterWeekRows,
  deriveGradeSplit,
  deriveProductSplit,
  deriveProductionRequirements,
  applyScenarioOverride,
  type STPGradeSplit,
  type STPProductSplit,
  type STPProductionRequirements,
} from "@/lib/shortTermPlanning";

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmtKg = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)} t`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)} t`
    : `${Math.round(n)} kg`;

const fmtNum = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

// ─── Palette ──────────────────────────────────────────────────────────────────

const COLORS = {
  gradeA: "#047836",  // AWP brand green
  gradeB: "#C49A1A",  // AWP gold
  gradeC: "#D24918",  // AWP orange-red
  fresh:  "#0ea5e9",  // sky-500
  frozen: "#6366f1",  // indigo-500
  cuts:   "#f59e0b",  // amber-500
  scenarioBorder: "#7c3aed", // violet — marks scenario values
};

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ scenario }: { scenario: boolean }) {
  return scenario ? (
    <span className="px-2 py-0.5 text-[10px] font-bold rounded border border-violet-400 text-violet-600 bg-violet-50">
      SCENARIO
    </span>
  ) : (
    <span className="px-2 py-0.5 text-[10px] font-bold rounded border border-brand-green/50 text-brand-green-dark bg-brand-green-tint">
      SALES PLAN
    </span>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-[var(--border-subtle)] p-5 ${className}`}>
      {children}
    </div>
  );
}

// ─── Percentage slider with locked-sum constraint ─────────────────────────────

interface TripleSliderProps {
  labels: [string, string, string];
  colors: [string, string, string];
  values: [number, number, number]; // pct, must sum to 100
  onChange: (a: number, b: number, c: number) => void;
}

function TripleSlider({ labels, colors, values, onChange }: TripleSliderProps) {
  const [a, b, c] = values;
  const sum = a + b + c;
  const error = Math.abs(sum - 100) > 0.5;

  function handleChange(idx: 0 | 1 | 2, raw: number) {
    let next: [number, number, number] = [a, b, c];
    next[idx] = raw;
    // Redistribute the remainder proportionally to the other two
    const remainder = 100 - raw;
    const others = [0, 1, 2].filter((i) => i !== idx) as (0 | 1 | 2)[];
    const otherSum = next[others[0]] + next[others[1]];
    if (otherSum > 0) {
      next[others[0]] = (next[others[0]] / otherSum) * remainder;
      next[others[1]] = (next[others[1]] / otherSum) * remainder;
    } else {
      next[others[0]] = remainder / 2;
      next[others[1]] = remainder / 2;
    }
    onChange(Math.round(next[0]), Math.round(next[1]), 100 - Math.round(next[0]) - Math.round(next[1]));
  }

  return (
    <div className="space-y-3">
      {([0, 1, 2] as const).map((idx) => (
        <div key={idx}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold" style={{ color: colors[idx] }}>{labels[idx]}</span>
            <span className="text-xs font-mono text-neutral-600">{fmtPct(values[idx])}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(values[idx])}
            onChange={(e) => handleChange(idx, Number(e.target.value))}
            className="w-full accent-violet-600"
          />
        </div>
      ))}
      {error && (
        <p className="text-[11px] text-red-600 font-semibold">⚠ Must sum to 100% (currently {sum.toFixed(1)}%)</p>
      )}
    </div>
  );
}

// ─── Grade split panel ────────────────────────────────────────────────────────

function GradeSplitPanel({
  split,
  scenarioActive,
}: {
  split: STPGradeSplit;
  scenarioActive: boolean;
}) {
  const data = [
    { name: "Grade A", value: split.A_pct, kg: split.A_kg, fill: COLORS.gradeA },
    { name: "Grade B", value: split.B_pct, kg: split.B_kg, fill: COLORS.gradeB },
    { name: "Grade C", value: split.C_pct, kg: split.C_kg, fill: COLORS.gradeC },
  ].filter((d) => d.value > 0 || d.kg > 0);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-neutral-800">Grade Split (A / B / C)</h3>
        <SourceBadge scenario={scenarioActive} />
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(val: any, _name: any, props: any) => [
                `${fmtPct(Number(val))}  (${fmtKg(props.payload.kg)})`,
                props.payload.name,
              ]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={scenarioActive ? COLORS.scenarioBorder : d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Grade A", pct: split.A_pct, kg: split.A_kg, color: COLORS.gradeA },
          { label: "Grade B", pct: split.B_pct, kg: split.B_kg, color: COLORS.gradeB },
          { label: "Grade C", pct: split.C_pct, kg: split.C_kg, color: COLORS.gradeC },
        ].map(({ label, pct, kg, color }) => (
          <div key={label} className="rounded-lg p-2 bg-neutral-50 border border-[var(--border-subtle)]">
            <div className="text-[10px] text-neutral-500 font-medium">{label}</div>
            <div className="text-base font-bold mt-0.5" style={{ color }}>{fmtPct(pct)}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">{fmtKg(kg)}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-neutral-400 mt-2">
        Grade C = ungraded WC → Whole Chicken Frozen only
      </p>
    </Card>
  );
}

// ─── Fresh / Frozen / Cuts panel ─────────────────────────────────────────────

function ProductSplitPanel({
  split,
  scenarioActive,
}: {
  split: STPProductSplit;
  scenarioActive: boolean;
}) {
  const data = [
    { name: "Fresh", value: split.fresh_pct, kg: split.fresh_kg, fill: COLORS.fresh },
    { name: "Frozen", value: split.frozen_pct, kg: split.frozen_kg, fill: COLORS.frozen },
    { name: "Cuts + FPP", value: split.cuts_pct, kg: split.cuts_kg, fill: COLORS.cuts },
  ].filter((d) => d.value > 0 || d.kg > 0);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-neutral-800">Fresh / Frozen / Cuts Split</h3>
        <SourceBadge scenario={scenarioActive} />
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={3}
              label={({ name, value }) => `${name} ${fmtPct(value)}`}
              labelLine={false}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={scenarioActive ? COLORS.scenarioBorder : d.fill} />
              ))}
            </Pie>
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(val: any, _name: any, props: any) => [
                `${fmtPct(Number(val))}  (${fmtKg(props.payload.kg)})`,
                props.payload.name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Fresh", pct: split.fresh_pct, kg: split.fresh_kg, color: COLORS.fresh },
          { label: "Frozen", pct: split.frozen_pct, kg: split.frozen_kg, color: COLORS.frozen },
          { label: "Cuts + FPP", pct: split.cuts_pct, kg: split.cuts_kg, color: COLORS.cuts },
        ].map(({ label, pct, kg, color }) => (
          <div key={label} className="rounded-lg p-2 bg-neutral-50 border border-[var(--border-subtle)]">
            <div className="text-[10px] text-neutral-500 font-medium">{label}</div>
            <div className="text-base font-bold mt-0.5" style={{ color }}>{fmtPct(pct)}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">{fmtKg(kg)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Production Summary Table ─────────────────────────────────────────────────

interface SummaryRowProps {
  label: string;
  salesPlan: string;
  scenario?: string;
  delta?: string;
  deltaPositive?: boolean | null; // true=green, false=red, null=neutral
  indent?: boolean;
  bold?: boolean;
  separator?: boolean;
}

function SummaryRow({
  label, salesPlan, scenario, delta, deltaPositive, indent, bold, separator,
}: SummaryRowProps) {
  if (separator) {
    return (
      <tr>
        <td colSpan={4} className="py-1">
          <div className="border-t border-[var(--border-subtle)]" />
        </td>
      </tr>
    );
  }
  return (
    <tr className={bold ? "bg-brand-green-tint/30" : "hover:bg-neutral-50"}>
      <td className={`py-1.5 pr-3 text-xs ${indent ? "pl-6 text-neutral-500" : "pl-2 font-semibold text-neutral-700"}`}>
        {label}
      </td>
      <td className={`py-1.5 px-3 text-right text-xs font-mono ${bold ? "font-bold text-brand-green-dark" : "text-neutral-700"}`}>
        {salesPlan}
      </td>
      {scenario !== undefined && (
        <>
          <td className="py-1.5 px-3 text-right text-xs font-mono text-violet-700 font-semibold">
            {scenario}
          </td>
          <td className={`py-1.5 pl-3 text-right text-xs font-mono font-semibold ${
            delta === "—" || deltaPositive === null
              ? "text-neutral-400"
              : deltaPositive
              ? "text-green-600"
              : "text-red-600"
          }`}>
            {delta}
          </td>
        </>
      )}
    </tr>
  );
}

function ProductionSummaryTable({
  salesPlan: sp,
  scenario: sc,
  showScenario,
}: {
  salesPlan: STPProductionRequirements;
  scenario: STPProductionRequirements | null;
  showScenario: boolean;
}) {
  const pct = (a: number, b: number) =>
    b > 0 ? ((a - b) / b) * 100 : 0;

  const delta = (a: number, b: number, fmt: (n: number) => string): { val: string; pos: boolean | null } => {
    const d = a - b;
    if (Math.abs(d) < 0.5) return { val: "—", pos: null };
    return { val: (d > 0 ? "+" : "") + fmt(d), pos: d > 0 };
  };

  const hasScenario = showScenario && sc !== null;

  const rows: SummaryRowProps[] = [
    {
      label: "Total Sales Volume",
      bold: true,
      salesPlan: fmtKg(sp.totalFinishedKg),
      ...(hasScenario && sc ? {
        scenario: fmtKg(sc.totalFinishedKg),
        ...delta(sc.totalFinishedKg, sp.totalFinishedKg, fmtKg),
      } : {}),
    },
    { separator: true, label: "", salesPlan: "" },
    {
      label: "Required Carcass Weight",
      salesPlan: fmtKg(sp.requiredCarcassKg),
      indent: true,
      ...(hasScenario && sc ? {
        scenario: fmtKg(sc.requiredCarcassKg),
        ...delta(sc.requiredCarcassKg, sp.requiredCarcassKg, fmtKg),
      } : {}),
    },
    {
      label: `Dressing Yield (${fmtPct(sp.dressingYield * 100)})`,
      salesPlan: `ACW ${sp.dressingYield > 0 ? (sp.requiredCarcassKg / sp.totalFinishedKg * 100).toFixed(1) : "—"}%`,
      indent: true,
      ...(hasScenario ? { scenario: "—", delta: "—", deltaPositive: null } : {}),
    },
    {
      label: "Required Live Birds",
      salesPlan: fmtNum(sp.requiredLiveBirds),
      bold: true,
      ...(hasScenario && sc ? {
        scenario: fmtNum(sc.requiredLiveBirds),
        ...delta(sc.requiredLiveBirds, sp.requiredLiveBirds, fmtNum),
      } : {}),
    },
    {
      label: `Required Placements (÷ ${fmtPct((1 - sp.dressingYield) * 100 + sp.dressingYield * 100)} survival)`,
      salesPlan: fmtNum(sp.requiredPlacements),
      indent: true,
      ...(hasScenario && sc ? {
        scenario: fmtNum(sc.requiredPlacements),
        ...delta(sc.requiredPlacements, sp.requiredPlacements, fmtNum),
      } : {}),
    },
    { separator: true, label: "", salesPlan: "" },
    {
      label: "Grade A Volume",
      salesPlan: `${fmtKg(sp.gradeA_kg)}  (${fmtPct(sp.totalFinishedKg > 0 ? sp.gradeA_kg / sp.totalFinishedKg * 100 : 0)})`,
      indent: true,
      ...(hasScenario && sc ? {
        scenario: `${fmtKg(sc.gradeA_kg)}  (${fmtPct(sc.totalFinishedKg > 0 ? sc.gradeA_kg / sc.totalFinishedKg * 100 : 0)})`,
        ...delta(sc.gradeA_kg, sp.gradeA_kg, fmtKg),
      } : {}),
    },
    {
      label: "Grade B Volume",
      salesPlan: `${fmtKg(sp.gradeB_kg)}  (${fmtPct(sp.totalFinishedKg > 0 ? sp.gradeB_kg / sp.totalFinishedKg * 100 : 0)})`,
      indent: true,
      ...(hasScenario && sc ? {
        scenario: `${fmtKg(sc.gradeB_kg)}  (${fmtPct(sc.totalFinishedKg > 0 ? sc.gradeB_kg / sc.totalFinishedKg * 100 : 0)})`,
        ...delta(sc.gradeB_kg, sp.gradeB_kg, fmtKg),
      } : {}),
    },
    {
      label: "Grade C Volume (WC Frozen)",
      salesPlan: `${fmtKg(sp.gradeC_kg)}  (${fmtPct(sp.totalFinishedKg > 0 ? sp.gradeC_kg / sp.totalFinishedKg * 100 : 0)})`,
      indent: true,
      ...(hasScenario && sc ? {
        scenario: `${fmtKg(sc.gradeC_kg)}  (${fmtPct(sc.totalFinishedKg > 0 ? sc.gradeC_kg / sc.totalFinishedKg * 100 : 0)})`,
        ...delta(sc.gradeC_kg, sp.gradeC_kg, fmtKg),
      } : {}),
    },
    { separator: true, label: "", salesPlan: "" },
    {
      label: "Fresh Volume",
      salesPlan: `${fmtKg(sp.fresh_kg)}  (${fmtPct(sp.fresh_kg / (sp.totalFinishedKg || 1) * 100)})`,
      indent: true,
      ...(hasScenario && sc ? {
        scenario: `${fmtKg(sc.fresh_kg)}  (${fmtPct(sc.fresh_kg / (sc.totalFinishedKg || 1) * 100)})`,
        ...delta(sc.fresh_kg, sp.fresh_kg, fmtKg),
      } : {}),
    },
    {
      label: "Frozen Volume",
      salesPlan: `${fmtKg(sp.frozen_kg)}  (${fmtPct(sp.frozen_kg / (sp.totalFinishedKg || 1) * 100)})`,
      indent: true,
      ...(hasScenario && sc ? {
        scenario: `${fmtKg(sc.frozen_kg)}  (${fmtPct(sc.frozen_kg / (sc.totalFinishedKg || 1) * 100)})`,
        ...delta(sc.frozen_kg, sp.frozen_kg, fmtKg),
      } : {}),
    },
    {
      label: "Cuts + FPP Volume",
      salesPlan: `${fmtKg(sp.cuts_kg)}  (${fmtPct(sp.cuts_kg / (sp.totalFinishedKg || 1) * 100)})`,
      indent: true,
      ...(hasScenario && sc ? {
        scenario: `${fmtKg(sc.cuts_kg)}  (${fmtPct(sc.cuts_kg / (sc.totalFinishedKg || 1) * 100)})`,
        ...delta(sc.cuts_kg, sp.cuts_kg, fmtKg),
      } : {}),
    },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-neutral-800">Weekly Production Requirements</h3>
        <div className="flex gap-2">
          <SourceBadge scenario={false} />
          {hasScenario && <SourceBadge scenario={true} />}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="text-left py-1.5 pl-2 text-neutral-500 font-semibold text-[10px] uppercase tracking-wide">Metric</th>
              <th className="text-right py-1.5 px-3 text-brand-green-dark font-semibold text-[10px] uppercase tracking-wide">Sales Plan</th>
              {hasScenario && (
                <>
                  <th className="text-right py-1.5 px-3 text-violet-600 font-semibold text-[10px] uppercase tracking-wide">Scenario</th>
                  <th className="text-right py-1.5 pl-3 text-neutral-500 font-semibold text-[10px] uppercase tracking-wide">Δ</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <SummaryRow
                key={i}
                {...r}
                scenario={hasScenario ? (r.scenario ?? r.salesPlan) : undefined}
                delta={hasScenario ? (r.delta ?? "—") : undefined}
                deltaPositive={hasScenario ? (r.deltaPositive ?? null) : undefined}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Scenario Tester ──────────────────────────────────────────────────────────

interface ScenarioState {
  overrideActive: boolean;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  fresh: number;
  frozen: number;
  cuts: number;
}

function ScenarioTester({
  scenario,
  onScenarioChange,
  salesPlanGrade,
  salesPlanFFC,
}: {
  scenario: ScenarioState;
  onScenarioChange: (patch: Partial<ScenarioState>) => void;
  salesPlanGrade: STPGradeSplit;
  salesPlanFFC: STPProductSplit;
}) {
  const gradeSum = scenario.gradeA + scenario.gradeB + scenario.gradeC;
  const ffcSum = scenario.fresh + scenario.frozen + scenario.cuts;
  const gradeOk = Math.abs(gradeSum - 100) <= 0.5;
  const ffcOk = Math.abs(ffcSum - 100) <= 0.5;

  function resetToSalesPlan() {
    onScenarioChange({
      gradeA: Math.round(salesPlanGrade.A_pct),
      gradeB: Math.round(salesPlanGrade.B_pct),
      gradeC: 100 - Math.round(salesPlanGrade.A_pct) - Math.round(salesPlanGrade.B_pct),
      fresh:  Math.round(salesPlanFFC.fresh_pct),
      frozen: Math.round(salesPlanFFC.frozen_pct),
      cuts:   100 - Math.round(salesPlanFFC.fresh_pct) - Math.round(salesPlanFFC.frozen_pct),
    });
  }

  return (
    <Card className="border-violet-200 bg-violet-50/30">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-neutral-800">⚗ Scenario Tester</span>
          <span className="text-[10px] text-neutral-400">(read-only simulation — never saved)</span>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-neutral-600 font-medium">Override Sales Plan mix</span>
          <div
            onClick={() => onScenarioChange({ overrideActive: !scenario.overrideActive })}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
              scenario.overrideActive ? "bg-violet-600" : "bg-neutral-300"
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              scenario.overrideActive ? "translate-x-4" : ""
            }`} />
          </div>
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grade sliders */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-700">Grade Mix (%)</span>
            {!gradeOk && (
              <span className="text-[10px] text-red-600 font-semibold">Must sum to 100%</span>
            )}
          </div>
          <TripleSlider
            labels={["Grade A", "Grade B", "Grade C"]}
            colors={[COLORS.gradeA, COLORS.gradeB, COLORS.gradeC]}
            values={[scenario.gradeA, scenario.gradeB, scenario.gradeC]}
            onChange={(a, b, c) => onScenarioChange({ gradeA: a, gradeB: b, gradeC: c })}
          />
        </div>

        {/* Fresh/Frozen/Cuts sliders */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-700">Product Mix (%)</span>
            {!ffcOk && (
              <span className="text-[10px] text-red-600 font-semibold">Must sum to 100%</span>
            )}
          </div>
          <TripleSlider
            labels={["Fresh", "Frozen", "Cuts + FPP"]}
            colors={[COLORS.fresh, COLORS.frozen, COLORS.cuts]}
            values={[scenario.fresh, scenario.frozen, scenario.cuts]}
            onChange={(a, b, c) => onScenarioChange({ fresh: a, frozen: b, cuts: c })}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={resetToSalesPlan}
          className="px-3 py-1.5 text-xs font-semibold rounded border border-neutral-300 hover:border-neutral-400 text-neutral-600 transition-colors"
        >
          ↺ Reset to Sales Plan
        </button>
        {scenario.overrideActive && gradeOk && ffcOk && (
          <span className="text-[11px] text-violet-600 font-semibold">
            ✓ Scenario active — summary table shows side-by-side comparison
          </span>
        )}
      </div>
    </Card>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-72 text-center gap-3">
      <div className="text-4xl">📋</div>
      <div className="text-sm font-semibold text-neutral-600">No Sales Plan uploaded yet</div>
      <div className="text-xs text-neutral-400 max-w-xs">
        Upload and confirm a SAP Sales Plan in{" "}
        <strong>Processing Plan → Carcass Requirement</strong> first, then return here.
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ShortTermPlanning() {
  const salesPlanCartonRows = usePlanStore((s) => s.salesPlanCartonRows);
  const salesPlanCartonConfirmed = usePlanStore((s) => s.salesPlanCartonConfirmed);
  const bomRecords = usePlanStore((s) => s.bomRecords);
  const params = usePlanStore((s) => s.params);

  const bomMap = useMemo<Map<string, BomRecord>>(
    () => new Map(bomRecords.map((r) => [r.skuCode, r])),
    [bomRecords]
  );

  const weekOptions = useMemo(
    () => buildWeekOptions(salesPlanCartonRows),
    [salesPlanCartonRows]
  );

  const [selectedWeek, setSelectedWeek] = useState<number>(() => weekOptions[0]?.week ?? 0);
  const [scenario, setScenario] = useState<ScenarioState>({
    overrideActive: false,
    gradeA: 65, gradeB: 25, gradeC: 10,
    fresh: 60, frozen: 20, cuts: 20,
  });

  // Ensure selectedWeek is valid when options change
  const activeWeek = weekOptions.some((o) => o.week === selectedWeek)
    ? selectedWeek
    : (weekOptions[0]?.week ?? 0);

  const weekItems = useMemo(
    () => filterWeekRows(salesPlanCartonRows, activeWeek, bomMap),
    [salesPlanCartonRows, activeWeek, bomMap]
  );

  const gradeSplit = useMemo(() => deriveGradeSplit(weekItems), [weekItems]);
  const productSplit = useMemo(() => deriveProductSplit(weekItems), [weekItems]);
  const salesPlanReqs = useMemo(
    () => deriveProductionRequirements(gradeSplit, productSplit, params),
    [gradeSplit, productSplit, params]
  );

  const scenarioReqs = useMemo(() => {
    if (!scenario.overrideActive) return null;
    return applyScenarioOverride(
      salesPlanReqs.totalFinishedKg,
      { A: scenario.gradeA, B: scenario.gradeB, C: scenario.gradeC },
      { fresh: scenario.fresh, frozen: scenario.frozen, cuts: scenario.cuts },
      params
    );
  }, [scenario, salesPlanReqs.totalFinishedKg, params]);

  // Derived splits for display (Sales Plan or Scenario)
  const displayGrade = scenario.overrideActive && scenarioReqs
    ? ({
        A_kg: scenarioReqs.gradeA_kg, B_kg: scenarioReqs.gradeB_kg, C_kg: scenarioReqs.gradeC_kg,
        total_kg: scenarioReqs.totalFinishedKg,
        A_pct: scenario.gradeA, B_pct: scenario.gradeB, C_pct: scenario.gradeC,
      } as STPGradeSplit)
    : gradeSplit;

  const displayProduct = scenario.overrideActive && scenarioReqs
    ? ({
        fresh_kg: scenarioReqs.fresh_kg, frozen_kg: scenarioReqs.frozen_kg, cuts_kg: scenarioReqs.cuts_kg,
        total_kg: scenarioReqs.totalFinishedKg,
        fresh_pct: scenario.fresh, frozen_pct: scenario.frozen, cuts_pct: scenario.cuts,
      } as STPProductSplit)
    : productSplit;

  const hasData = salesPlanCartonConfirmed && salesPlanCartonRows.length > 0;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-bold text-neutral-800">Broiler Short-Term Planning</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Weekly mix analysis derived from the uploaded SAP Sales Plan. Use the Scenario Tester to simulate alternative mixes — changes are not saved.
        </p>
      </div>

      {!hasData ? (
        <Card>
          <EmptyState />
        </Card>
      ) : (
        <>
          {/* Week selector */}
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-neutral-600">Planning Week:</span>
              <div className="flex flex-wrap gap-1.5">
                {weekOptions.map((o) => (
                  <button
                    key={o.week}
                    onClick={() => setSelectedWeek(o.week)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors border ${
                      activeWeek === o.week
                        ? "bg-brand-green text-white border-brand-green shadow-sm"
                        : "border-[var(--border-subtle)] text-neutral-600 hover:border-brand-green hover:text-brand-green"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {weekItems.length === 0 && activeWeek > 0 && (
                <span className="text-xs text-amber-600">No BOM-matched rows for this week.</span>
              )}
            </div>
          </Card>

          {weekItems.length > 0 && (
            <>
              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <GradeSplitPanel split={displayGrade} scenarioActive={scenario.overrideActive} />
                <ProductSplitPanel split={displayProduct} scenarioActive={scenario.overrideActive} />
              </div>

              {/* Production summary */}
              <ProductionSummaryTable
                salesPlan={salesPlanReqs}
                scenario={scenarioReqs}
                showScenario={scenario.overrideActive}
              />

              {/* Scenario tester */}
              <ScenarioTester
                scenario={scenario}
                onScenarioChange={(patch) => setScenario((s) => ({ ...s, ...patch }))}
                salesPlanGrade={gradeSplit}
                salesPlanFFC={productSplit}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

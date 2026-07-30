"use client";

import { usePlanStore } from "@/lib/store";
import { DEFAULT_PARAMETERS, MAX_HORIZON_WEEKS, MIN_HORIZON_WEEKS, SIZE_KEYS, SIZE_LABELS } from "@/lib/defaults";
import { carcassSizeDistributionSum, carcassYieldPct, fullCycleDays } from "@/lib/calculations";
import type { Parameters } from "@/lib/types";

function Field({
  label,
  value,
  onChange,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="text-neutral-600">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 text-right border border-[var(--border-subtle)] rounded px-1.5 py-0.5 tabular-nums focus:outline-none focus:border-brand-green"
        />
        {suffix && <span className="text-neutral-400 w-6">{suffix}</span>}
      </span>
    </label>
  );
}

function PercentField({
  label,
  value,
  onChange,
  step = 0.5,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <Field
      label={label}
      value={Math.round(value * 10000) / 100}
      onChange={(v) => onChange(v / 100)}
      suffix="%"
      step={step}
    />
  );
}

function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="border-b border-[var(--border-subtle)] group">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-brand-green-dark bg-brand-green-tint/60 flex items-center justify-between">
        {title}
        <span className="text-neutral-400 group-open:rotate-90 transition-transform">›</span>
      </summary>
      <div className="px-4 py-2 space-y-0.5">{children}</div>
    </details>
  );
}

export function ParameterPanel() {
  const params = usePlanStore((s) => s.params);
  const setParam = usePlanStore((s) => s.setParam);
  const setHorizonWeeks = usePlanStore((s) => s.setHorizonWeeks);
  const resetToDefaults = usePlanStore((s) => s.resetToDefaults);
  const assumptionsOpen = usePlanStore((s) => s.assumptionsOpen);
  const toggleAssumptions = usePlanStore((s) => s.toggleAssumptions);

  if (!assumptionsOpen) return null;

  const patchFamily = (grade: "A" | "B" | "C", key: "wcFresh" | "wcFrozen" | "fpp", v: number) => {
    setParam({
      familyAllocation: {
        ...params.familyAllocation,
        [grade]: { ...params.familyAllocation[grade], [key]: v },
      },
    });
  };

  const patchCut = (key: keyof Parameters["cutYields"], v: number) => {
    setParam({ cutYields: { ...params.cutYields, [key]: v } });
  };

  const patchSize = (key: (typeof SIZE_KEYS)[number], v: number) => {
    setParam({ carcassSizeDistribution: { ...params.carcassSizeDistribution, [key]: v } });
  };

  const sizeSum = carcassSizeDistributionSum(params);

  return (
    <aside className="w-[320px] shrink-0 border-l border-[var(--border-subtle)] bg-white flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="text-sm font-semibold text-brand-green-dark">Assumptions</div>
        <button onClick={toggleAssumptions} className="text-neutral-400 hover:text-neutral-700 text-sm">
          ✕
        </button>
      </div>

      <Section title="Planning Horizon" defaultOpen>
        <Field
          label="Horizon (weeks)"
          value={params.planningHorizonWeeks}
          onChange={(v) =>
            setHorizonWeeks(Math.min(MAX_HORIZON_WEEKS, Math.max(MIN_HORIZON_WEEKS, Math.round(v))))
          }
        />
        <label className="flex items-center justify-between gap-2 py-1 text-xs">
          <span className="text-neutral-600">Harvest start date</span>
          <input
            type="date"
            value={params.planStartDate}
            onChange={(e) => setParam({ planStartDate: e.target.value })}
            className="border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-xs"
          />
        </label>
        <Field label="Working days / week" value={params.workingDaysPerWeek} onChange={(v) => setParam({ workingDaysPerWeek: v })} />
        <label className="flex items-center justify-between gap-2 py-1 text-xs">
          <span className="text-neutral-600">Friday off (placement &amp; catching)</span>
          <input
            type="checkbox"
            checked={params.fridayOff}
            onChange={(e) => setParam({ fridayOff: e.target.checked })}
          />
        </label>
      </Section>

      <Section title="Flock & House Parameters">
        <Field
          label="Quick Fill rate (houses/day)"
          value={params.houseCount}
          onChange={(v) => setParam({ houseCount: v })}
        />
        <Field
          label="Houses per farm"
          value={params.housesPerFarm}
          onChange={(v) => setParam({ housesPerFarm: v })}
        />
        <div className="flex items-center justify-between py-1 text-xs text-neutral-500">
          <span>≈ Farms placing per day (derived)</span>
          <span className="tabular-nums">
            {params.housesPerFarm > 0 ? (params.houseCount / params.housesPerFarm).toFixed(2) : "—"}
          </span>
        </div>
        <Field
          label="Avg placed birds / house"
          value={params.chicksPerHouse}
          step={100}
          onChange={(v) => setParam({ chicksPerHouse: v })}
        />
        <Field
          label="Cycle length (days)"
          value={params.cycleLengthDays}
          step={0.5}
          onChange={(v) => setParam({ cycleLengthDays: v })}
        />
        <Field label="Downtime (days)" value={params.downtimeDays} onChange={(v) => setParam({ downtimeDays: v })} />
        <div className="flex items-center justify-between py-1 text-xs text-neutral-500">
          <span>Full cycle (derived)</span>
          <span className="tabular-nums">{fullCycleDays(params).toFixed(1)} days</span>
        </div>
        <PercentField label="Mortality rate" value={params.mortalityRate} onChange={(v) => setParam({ mortalityRate: v })} />
        <Field
          label="Avg live weight (ALW)"
          value={params.avgLiveWeightKg}
          step={0.01}
          suffix="kg"
          onChange={(v) => setParam({ avgLiveWeightKg: v })}
        />
        <Field
          label="Avg carcass weight (ACW)"
          value={params.avgCarcassWeightKg}
          step={0.01}
          suffix="kg"
          onChange={(v) => setParam({ avgCarcassWeightKg: v })}
        />
        <div className="flex items-center justify-between py-1 text-xs text-neutral-500">
          <span>Carcass yield % (derived = ACW / ALW)</span>
          <span className="tabular-nums font-semibold text-brand-green-dark">
            {(carcassYieldPct(params) * 100).toFixed(2)}%
          </span>
        </div>
      </Section>

      <Section title="Processing Losses">
        <PercentField
          label="Harvest mortality %"
          value={params.harvestMortalityRate}
          step={0.05}
          onChange={(v) => setParam({ harvestMortalityRate: v })}
        />
        <PercentField
          label="Dead on arrival (DOA) %"
          value={params.doaRate}
          step={0.05}
          onChange={(v) => setParam({ doaRate: v })}
        />
        <PercentField
          label="Culled birds %"
          value={params.culledRate}
          step={0.05}
          onChange={(v) => setParam({ culledRate: v })}
        />
        <PercentField
          label="Plucking reject %"
          value={params.pluckingRejectRate}
          step={0.05}
          onChange={(v) => setParam({ pluckingRejectRate: v })}
        />
      </Section>

      <Section title="Hatchery">
        <Field
          label="Hatchery capacity"
          value={params.hatcheryCapacity}
          step={1000}
          suffix="eggs"
          onChange={(v) => setParam({ hatcheryCapacity: v })}
        />
        <PercentField label="Hatchability rate" value={params.hatchabilityRate} onChange={(v) => setParam({ hatchabilityRate: v })} />
      </Section>

      <Section title="Plant Shares & Capacity">
        {(["plant1", "plant2", "plant3"] as const).map((p, i) => (
          <div key={p} className="mb-2">
            <div className="text-[11px] font-semibold text-neutral-500 mt-1">Plant {i + 1}</div>
            <PercentField
              label="Share of slaughter"
              value={params.plantShares[p]}
              onChange={(v) => setParam({ plantShares: { ...params.plantShares, [p]: v } })}
            />
            <Field
              label="Daily capacity"
              value={params.plantCapacities[p]}
              step={1000}
              suffix="brd"
              onChange={(v) => setParam({ plantCapacities: { ...params.plantCapacities, [p]: v } })}
            />
          </div>
        ))}
      </Section>

      <Section title="Grade Split">
        <PercentField label="Grade A" value={params.gradeSplit.A} onChange={(v) => setParam({ gradeSplit: { ...params.gradeSplit, A: v } })} />
        <PercentField label="Grade B" value={params.gradeSplit.B} onChange={(v) => setParam({ gradeSplit: { ...params.gradeSplit, B: v } })} />
        <PercentField label="Grade C / Reject" value={params.gradeSplit.C} onChange={(v) => setParam({ gradeSplit: { ...params.gradeSplit, C: v } })} />
      </Section>

      <Section title="Carcass Size Distribution">
        {SIZE_KEYS.map((key) => (
          <PercentField
            key={key}
            label={SIZE_LABELS[key]}
            value={params.carcassSizeDistribution[key]}
            step={0.01}
            onChange={(v) => patchSize(key, v)}
          />
        ))}
        <div className={`text-xs mt-1 ${Math.abs(sizeSum - 1) > 0.01 ? "text-brand-alert font-semibold" : "text-neutral-400"}`}>
          Σ {(sizeSum * 100).toFixed(2)}%
        </div>
      </Section>

      <Section title="Product Family Allocation">
        {(["A", "B", "C"] as const).map((grade) => (
          <div key={grade} className="mb-2">
            <div className="text-[11px] font-semibold text-neutral-500 mt-1">Grade {grade}</div>
            <PercentField label="WC Fresh" value={params.familyAllocation[grade].wcFresh} onChange={(v) => patchFamily(grade, "wcFresh", v)} />
            <PercentField label="WC Frozen" value={params.familyAllocation[grade].wcFrozen} onChange={(v) => patchFamily(grade, "wcFrozen", v)} />
            <PercentField label="FPP" value={params.familyAllocation[grade].fpp} onChange={(v) => patchFamily(grade, "fpp", v)} />
          </div>
        ))}
      </Section>

      <Section title="FPP Cut Yields">
        <label className="flex items-center justify-between gap-2 py-1 text-xs">
          <span className="text-neutral-600">Leg split mode</span>
          <input
            type="checkbox"
            checked={params.legSplitMode}
            onChange={(e) => setParam({ legSplitMode: e.target.checked })}
          />
        </label>
        <PercentField label="Breast (bone-in)" value={params.cutYields.breastBoneIn} onChange={(v) => patchCut("breastBoneIn", v)} />
        <PercentField label="Breast (boneless)" value={params.cutYields.breastBoneless} onChange={(v) => patchCut("breastBoneless", v)} />
        {params.legSplitMode ? (
          <>
            <PercentField label="Drumstick" value={params.cutYields.drumstick} onChange={(v) => patchCut("drumstick", v)} />
            <PercentField label="Thigh (bone-in)" value={params.cutYields.thighBoneIn} onChange={(v) => patchCut("thighBoneIn", v)} />
          </>
        ) : (
          <PercentField label="Whole Leg" value={params.cutYields.wholeLeg} onChange={(v) => patchCut("wholeLeg", v)} />
        )}
        <PercentField label="Wings" value={params.cutYields.wings} onChange={(v) => patchCut("wings", v)} />
        <PercentField label="Back & Neck" value={params.cutYields.backNeck} onChange={(v) => patchCut("backNeck", v)} />
        <PercentField label="Giblets" value={params.cutYields.giblets} onChange={(v) => patchCut("giblets", v)} />
        <PercentField label="Trim / Mince" value={params.cutYields.trimMince} onChange={(v) => patchCut("trimMince", v)} />
      </Section>

      <div className="p-4">
        <button
          onClick={() => {
            if (confirm("Reset all parameters and the placement plan to AWP defaults?")) resetToDefaults();
          }}
          className="w-full text-xs font-medium py-2 rounded-md border border-brand-alert text-brand-alert hover:bg-brand-alert hover:text-white transition-colors"
        >
          Reset to Defaults
        </button>
        <div className="text-[10px] text-neutral-400 mt-2 text-center">
          Defaults reflect {DEFAULT_PARAMETERS.houseCount} houses/day · {DEFAULT_PARAMETERS.cycleLengthDays}d cycle
        </div>
      </div>
    </aside>
  );
}

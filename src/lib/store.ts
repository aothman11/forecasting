import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Parameters, PlacementDayRow, PlantKey, ScenarioSnapshot } from "./types";
import { DEFAULT_PARAMETERS } from "./defaults";
import { ensurePlacementDaysHorizon, quickFillPlacementDays, fullCycleDays } from "./calculations";

export const STEPS = [
  { id: 1, label: "Placement Plan" },
  { id: 2, label: "Live Bird Forecast" },
  { id: 3, label: "Carcass Yield & Grade Split" },
  { id: 4, label: "Product Family Allocation" },
  { id: 5, label: "FPP Cut Plan" },
  { id: 6, label: "Processing Plan by Plant" },
] as const;

export type PlantFilter = PlantKey | "all";

function horizonDaysFor(params: Pick<Parameters, "planningHorizonWeeks">): number {
  return params.planningHorizonWeeks * 7;
}

interface PlanState {
  params: Parameters;
  placementDays: PlacementDayRow[];
  selectedStep: number;
  selectedPlant: PlantFilter;
  assumptionsOpen: boolean;
  compareOpen: boolean;
  scenarios: ScenarioSnapshot[];

  setParam: (patch: Partial<Parameters>) => void;
  setNestedParam: <K extends keyof Parameters>(key: K, value: Parameters[K]) => void;
  setPlacementDayRow: (dayIndex: number, patch: Partial<PlacementDayRow>) => void;
  setPlacementDays: (rows: PlacementDayRow[]) => void;
  quickFillPlacementPlan: () => void;
  setHorizonWeeks: (weeks: number) => void;
  setPlanStartDate: (date: string) => void;
  resetToDefaults: () => void;
  setSelectedStep: (step: number) => void;
  setSelectedPlant: (plant: PlantFilter) => void;
  toggleAssumptions: () => void;
  setCompareOpen: (open: boolean) => void;
  saveScenario: (name: string) => void;
  deleteScenario: (id: string) => void;
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set) => ({
      params: DEFAULT_PARAMETERS,
      placementDays: ensurePlacementDaysHorizon(
        [],
        horizonDaysFor(DEFAULT_PARAMETERS),
        DEFAULT_PARAMETERS.planStartDate
      ),
      selectedStep: 1,
      selectedPlant: "all",
      assumptionsOpen: false,
      compareOpen: false,
      scenarios: [],

      setParam: (patch) =>
        set((s) => ({
          params: { ...s.params, ...patch },
        })),

      setNestedParam: (key, value) =>
        set((s) => ({
          params: { ...s.params, [key]: value },
        })),

      setPlacementDayRow: (dayIndex, patch) =>
        set((s) => ({
          placementDays: s.placementDays.map((r) => (r.dayIndex === dayIndex ? { ...r, ...patch } : r)),
        })),

      setPlacementDays: (rows) => set({ placementDays: rows }),

      quickFillPlacementPlan: () =>
        set((s) => ({
          placementDays: quickFillPlacementDays(
            horizonDaysFor(s.params),
            s.params.totalFarms,
            s.params.planStartDate,
            fullCycleDays(s.params)
          ),
        })),

      setHorizonWeeks: (weeks) =>
        set((s) => ({
          params: { ...s.params, planningHorizonWeeks: weeks },
          placementDays: ensurePlacementDaysHorizon(s.placementDays, weeks * 7, s.params.planStartDate),
        })),

      setPlanStartDate: (date) =>
        set((s) => ({
          params: { ...s.params, planStartDate: date },
          placementDays: ensurePlacementDaysHorizon(s.placementDays, horizonDaysFor(s.params), date),
        })),

      resetToDefaults: () =>
        set(() => ({
          params: DEFAULT_PARAMETERS,
          placementDays: ensurePlacementDaysHorizon(
            [],
            horizonDaysFor(DEFAULT_PARAMETERS),
            DEFAULT_PARAMETERS.planStartDate
          ),
        })),

      setSelectedStep: (step) => set({ selectedStep: step }),
      setSelectedPlant: (plant) => set({ selectedPlant: plant }),
      toggleAssumptions: () => set((s) => ({ assumptionsOpen: !s.assumptionsOpen })),
      setCompareOpen: (open) => set({ compareOpen: open }),

      saveScenario: (name) =>
        set((s) => {
          const snapshot: ScenarioSnapshot = {
            id: `${Date.now()}`,
            name,
            savedAt: new Date().toISOString(),
            params: s.params,
            placementDays: s.placementDays,
          };
          const next = [...s.scenarios, snapshot].slice(-3);
          return { scenarios: next };
        }),

      deleteScenario: (id) =>
        set((s) => ({ scenarios: s.scenarios.filter((sc) => sc.id !== id) })),
    }),
    {
      name: "awp-broiler-forecast-store",
      version: 2,
      // v2 switched Step 1 from weekly to daily placement rows (PlacementRow -> PlacementDayRow).
      // Older persisted scenarios carry the pre-v2 shape and would crash the pipeline, so drop them.
      migrate: (persisted, version) => {
        if (version >= 2) return persisted;
        const state = persisted as { params?: Parameters; placementDays?: unknown };
        const days = state.placementDays;
        const looksDaily =
          Array.isArray(days) && days.length > 0 && typeof (days[0] as { dayIndex?: unknown })?.dayIndex === "number";
        return {
          params: state.params,
          ...(looksDaily ? { placementDays: days } : {}),
          scenarios: [],
        };
      },
      partialize: (s) => ({
        params: s.params,
        placementDays: s.placementDays,
        scenarios: s.scenarios,
      }),
    }
  )
);

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Parameters, PlacementRow, PlantKey, ScenarioSnapshot } from "./types";
import { DEFAULT_PARAMETERS } from "./defaults";
import { ensurePlacementHorizon, quickFillPlacement, fullCycleDays } from "./calculations";

export const STEPS = [
  { id: 1, label: "Placement Plan" },
  { id: 2, label: "Live Bird Forecast" },
  { id: 3, label: "Carcass Yield & Grade Split" },
  { id: 4, label: "Product Family Allocation" },
  { id: 5, label: "FPP Cut Plan" },
  { id: 6, label: "Processing Plan by Plant" },
] as const;

export type PlantFilter = PlantKey | "all";

interface PlanState {
  params: Parameters;
  placement: PlacementRow[];
  selectedStep: number;
  selectedPlant: PlantFilter;
  assumptionsOpen: boolean;
  compareOpen: boolean;
  scenarios: ScenarioSnapshot[];

  setParam: (patch: Partial<Parameters>) => void;
  setNestedParam: <K extends keyof Parameters>(key: K, value: Parameters[K]) => void;
  setPlacementRow: (week: number, patch: Partial<PlacementRow>) => void;
  setPlacement: (rows: PlacementRow[]) => void;
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
      placement: ensurePlacementHorizon([], DEFAULT_PARAMETERS.planningHorizonWeeks, DEFAULT_PARAMETERS.planStartDate),
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

      setPlacementRow: (week, patch) =>
        set((s) => ({
          placement: s.placement.map((r) => (r.week === week ? { ...r, ...patch } : r)),
        })),

      setPlacement: (rows) => set({ placement: rows }),

      quickFillPlacementPlan: () =>
        set((s) => ({
          placement: quickFillPlacement(
            s.params.planningHorizonWeeks,
            s.params.totalFarms,
            s.params.planStartDate,
            fullCycleDays(s.params)
          ),
        })),

      setHorizonWeeks: (weeks) =>
        set((s) => ({
          params: { ...s.params, planningHorizonWeeks: weeks },
          placement: ensurePlacementHorizon(s.placement, weeks, s.params.planStartDate),
        })),

      setPlanStartDate: (date) =>
        set((s) => ({
          params: { ...s.params, planStartDate: date },
          placement: ensurePlacementHorizon(s.placement, s.params.planningHorizonWeeks, date),
        })),

      resetToDefaults: () =>
        set(() => ({
          params: DEFAULT_PARAMETERS,
          placement: ensurePlacementHorizon(
            [],
            DEFAULT_PARAMETERS.planningHorizonWeeks,
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
            placement: s.placement,
          };
          const next = [...s.scenarios, snapshot].slice(-3);
          return { scenarios: next };
        }),

      deleteScenario: (id) =>
        set((s) => ({ scenarios: s.scenarios.filter((sc) => sc.id !== id) })),
    }),
    {
      name: "awp-broiler-forecast-store",
      partialize: (s) => ({
        params: s.params,
        placement: s.placement,
        scenarios: s.scenarios,
      }),
    }
  )
);

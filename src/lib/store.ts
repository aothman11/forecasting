import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DemandWeek, Parameters, PlacementDayRow, PlantKey, ScenarioSnapshot } from "./types";
import { DEFAULT_PARAMETERS } from "./defaults";
import { ensureDemandHorizon, ensurePlacementDaysHorizon, quickFillPlacementDays } from "./calculations";
import type { FreshFrozen, WholeOrFpp } from "./salesPlanImport";

export const STEPS = [
  { id: 1, label: "Placement Plan", short: "Placement", icon: "🐣" },
  { id: 2, label: "Live Bird Forecast", short: "Live Birds", icon: "🐔" },
  { id: 3, label: "Carcass Yield & Grade Split", short: "Carcass", icon: "⚖️" },
  { id: 4, label: "Product Family Allocation", short: "Products", icon: "📦" },
  { id: 5, label: "FPP Cut Plan", short: "Cuts", icon: "🍗" },
  { id: 6, label: "Processing Plan by Plant", short: "Plants", icon: "🏭" },
] as const;

export type PlantFilter = PlantKey | "all";

function horizonDaysFor(params: Pick<Parameters, "planningHorizonWeeks">): number {
  return params.planningHorizonWeeks * 7;
}

interface PlanState {
  params: Parameters;
  placementDays: PlacementDayRow[];
  demand: DemandWeek[];
  salesPlanDivisionMap: Record<string, FreshFrozen>;
  salesPlanCategoryMap: Record<string, WholeOrFpp>;
  selectedStep: number;
  selectedPlant: PlantFilter;
  assumptionsOpen: boolean;
  compareOpen: boolean;
  demandOpen: boolean;
  homeOpen: boolean;
  scenarios: ScenarioSnapshot[];

  setParam: (patch: Partial<Parameters>) => void;
  setNestedParam: <K extends keyof Parameters>(key: K, value: Parameters[K]) => void;
  setPlacementDayRow: (dayIndex: number, patch: Partial<PlacementDayRow>) => void;
  setPlacementDays: (rows: PlacementDayRow[]) => void;
  quickFillPlacementPlan: () => void;
  setDemandWeek: (week: number, patch: Partial<DemandWeek>) => void;
  setDemand: (rows: DemandWeek[]) => void;
  setSalesPlanDivisionMap: (map: Record<string, FreshFrozen>) => void;
  setSalesPlanCategoryMap: (map: Record<string, WholeOrFpp>) => void;
  setHorizonWeeks: (weeks: number) => void;
  setPlanStartDate: (date: string) => void;
  resetToDefaults: () => void;
  setSelectedStep: (step: number) => void;
  setSelectedPlant: (plant: PlantFilter) => void;
  toggleAssumptions: () => void;
  setCompareOpen: (open: boolean) => void;
  setDemandOpen: (open: boolean) => void;
  setHomeOpen: (open: boolean) => void;
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
        DEFAULT_PARAMETERS.planStartDate,
        DEFAULT_PARAMETERS.fridayOff,
        DEFAULT_PARAMETERS.chicksPerHouse
      ),
      demand: ensureDemandHorizon([], DEFAULT_PARAMETERS.planningHorizonWeeks),
      salesPlanDivisionMap: {},
      salesPlanCategoryMap: {},
      selectedStep: 1,
      selectedPlant: "all",
      assumptionsOpen: false,
      compareOpen: false,
      demandOpen: false,
      homeOpen: true,
      scenarios: [],

      setParam: (patch) =>
        set((s) => {
          const params = { ...s.params, ...patch };
          // Friday-off is a hard scheduling rule, so flipping it re-clamps any existing Friday entries.
          const placementDays =
            "fridayOff" in patch
              ? ensurePlacementDaysHorizon(
                  s.placementDays,
                  horizonDaysFor(params),
                  params.planStartDate,
                  params.fridayOff,
                  params.chicksPerHouse
                )
              : s.placementDays;
          return { params, placementDays };
        }),

      setNestedParam: (key, value) =>
        set((s) => ({
          params: { ...s.params, [key]: value },
        })),

      setPlacementDayRow: (dayIndex, patch) =>
        set((s) => ({
          placementDays: s.placementDays.map((r) => (r.dayIndex === dayIndex ? { ...r, ...patch } : r)),
        })),

      setPlacementDays: (rows) => set({ placementDays: rows }),

      setDemandWeek: (week, patch) =>
        set((s) => ({
          demand: s.demand.map((r) => (r.week === week ? { ...r, ...patch } : r)),
        })),

      setDemand: (rows) => set({ demand: rows }),

      setSalesPlanDivisionMap: (map) => set({ salesPlanDivisionMap: map }),
      setSalesPlanCategoryMap: (map) => set({ salesPlanCategoryMap: map }),

      quickFillPlacementPlan: () =>
        set((s) => ({
          placementDays: quickFillPlacementDays(
            horizonDaysFor(s.params),
            s.params.houseCount,
            s.params.planStartDate,
            s.params.fridayOff,
            s.params.chicksPerHouse
          ),
        })),

      setHorizonWeeks: (weeks) =>
        set((s) => ({
          params: { ...s.params, planningHorizonWeeks: weeks },
          placementDays: ensurePlacementDaysHorizon(
            s.placementDays,
            weeks * 7,
            s.params.planStartDate,
            s.params.fridayOff,
            s.params.chicksPerHouse
          ),
          demand: ensureDemandHorizon(s.demand, weeks),
        })),

      setPlanStartDate: (date) =>
        set((s) => ({
          params: { ...s.params, planStartDate: date },
          placementDays: ensurePlacementDaysHorizon(
            s.placementDays,
            horizonDaysFor(s.params),
            date,
            s.params.fridayOff,
            s.params.chicksPerHouse
          ),
        })),

      resetToDefaults: () =>
        set(() => ({
          params: DEFAULT_PARAMETERS,
          placementDays: ensurePlacementDaysHorizon(
            [],
            horizonDaysFor(DEFAULT_PARAMETERS),
            DEFAULT_PARAMETERS.planStartDate,
            DEFAULT_PARAMETERS.fridayOff,
            DEFAULT_PARAMETERS.chicksPerHouse
          ),
          demand: ensureDemandHorizon([], DEFAULT_PARAMETERS.planningHorizonWeeks),
        })),

      setSelectedStep: (step) => set({ selectedStep: step }),
      setSelectedPlant: (plant) => set({ selectedPlant: plant }),
      toggleAssumptions: () => set((s) => ({ assumptionsOpen: !s.assumptionsOpen })),
      setCompareOpen: (open) => set({ compareOpen: open }),
      setDemandOpen: (open) => set({ demandOpen: open }),
      setHomeOpen: (open) => set({ homeOpen: open }),

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
      version: 4,
      // v2 switched Step 1 from weekly to daily placement rows (PlacementRow -> PlacementDayRow).
      // v3 replaced the farm-based model (totalFarms/dressingPct/chicksPerFarm) with the house-based
      // processing chain (houseCount/avgCarcassWeightKg/chicksPerHouse/...). Both changes touch nearly
      // every field, so pre-v3 persisted state is discarded wholesale rather than partially migrated.
      // v4 added housesPerFarm (purely additive/informational), so v3 state is backfilled instead.
      migrate: (persisted, version) => {
        if (version >= 4) return persisted;
        if (version < 3) return { scenarios: [] };
        const state = persisted as { params?: Parameters };
        return {
          ...(persisted as object),
          params: state.params ? { ...DEFAULT_PARAMETERS, ...state.params } : undefined,
        };
      },
      partialize: (s) => ({
        params: s.params,
        placementDays: s.placementDays,
        demand: s.demand,
        salesPlanDivisionMap: s.salesPlanDivisionMap,
        salesPlanCategoryMap: s.salesPlanCategoryMap,
        scenarios: s.scenarios,
      }),
    }
  )
);

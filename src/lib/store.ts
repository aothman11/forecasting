import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChannelKey,
  DemandPlanQty,
  DemandProduct,
  Farm,
  Parameters,
  PlacementDayRow,
  PlantKey,
  ScenarioSnapshot,
  SupplyRequirementsWeek,
} from "./types";
import { DEFAULT_DEMAND_PRODUCTS, DEFAULT_FARMS, DEFAULT_PARAMETERS } from "./defaults";
import { ensurePlacementDaysHorizon, isFridayDate, quickFillPlacementDays } from "./calculations";
import { bulkAdjustDemand, copyDemandWeekForward, demandCellKey, type BulkAdjustOptions } from "./demandPlan";

export const STEPS = [
  { id: 1, label: "Placement Plan", short: "Placement", icon: "🐣" },
  { id: 2, label: "Live Bird Forecast", short: "Live Birds", icon: "🐔" },
  { id: 3, label: "Carcass Yield & Grade Split", short: "Carcass", icon: "⚖️" },
  { id: 4, label: "Product Family Allocation", short: "Products", icon: "📦" },
  { id: 5, label: "FPP Cut Plan", short: "Cuts", icon: "🍗" },
  { id: 6, label: "Processing Plan by Plant", short: "Plants", icon: "🏭" },
  { id: 7, label: "Farm Quota Distribution", short: "Farms", icon: "🌾" },
] as const;

export type PlantFilter = PlantKey | "all";

function horizonDaysFor(params: Pick<Parameters, "planningHorizonWeeks">): number {
  return params.planningHorizonWeeks * 7;
}

interface PlanState {
  params: Parameters;
  placementDays: PlacementDayRow[];
  demandProducts: DemandProduct[];
  demandQty: DemandPlanQty;
  salesPlanProductMap: Record<string, string>;
  salesPlanChannelMap: Record<string, ChannelKey>;
  farms: Farm[];
  selectedStep: number;
  selectedPlant: PlantFilter;
  assumptionsOpen: boolean;
  compareOpen: boolean;
  demandOpen: boolean;
  supplyOpen: boolean;
  reconcileOpen: boolean;
  ddpOpen: boolean;
  reportOpen: boolean;
  homeOpen: boolean;
  scenarios: ScenarioSnapshot[];

  setParam: (patch: Partial<Parameters>) => void;
  setNestedParam: <K extends keyof Parameters>(key: K, value: Parameters[K]) => void;
  setPlacementDayRow: (dayIndex: number, patch: Partial<PlacementDayRow>) => void;
  setPlacementDays: (rows: PlacementDayRow[]) => void;
  quickFillPlacementPlan: () => void;
  applyDemandDrivenPlacement: (rows: SupplyRequirementsWeek[]) => void;
  addDemandProduct: (product: DemandProduct) => void;
  updateDemandProduct: (id: string, patch: Partial<DemandProduct>) => void;
  removeDemandProduct: (id: string) => void;
  setDemandCell: (productId: string, channel: ChannelKey, week: number, qty: number) => void;
  bulkAdjustDemandPlan: (opts: BulkAdjustOptions) => void;
  copyDemandWeekForwardAction: (channel: ChannelKey | "ALL", fromWeek: number, toWeek: number) => void;
  setSalesPlanProductMap: (map: Record<string, string>) => void;
  setSalesPlanChannelMap: (map: Record<string, ChannelKey>) => void;
  addFarm: (farm: Farm) => void;
  updateFarm: (id: string, patch: Partial<Farm>) => void;
  removeFarm: (id: string) => void;
  setFarms: (farms: Farm[]) => void;
  setHorizonWeeks: (weeks: number) => void;
  setPlanStartDate: (date: string) => void;
  resetToDefaults: () => void;
  setSelectedStep: (step: number) => void;
  setSelectedPlant: (plant: PlantFilter) => void;
  toggleAssumptions: () => void;
  setCompareOpen: (open: boolean) => void;
  setDemandOpen: (open: boolean) => void;
  setSupplyOpen: (open: boolean) => void;
  setReconcileOpen: (open: boolean) => void;
  setDdpOpen: (open: boolean) => void;
  setReportOpen: (open: boolean) => void;
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
      demandProducts: DEFAULT_DEMAND_PRODUCTS,
      demandQty: {},
      salesPlanProductMap: {},
      salesPlanChannelMap: {},
      farms: DEFAULT_FARMS,
      selectedStep: 1,
      selectedPlant: "all",
      assumptionsOpen: false,
      compareOpen: false,
      demandOpen: false,
      supplyOpen: false,
      reconcileOpen: false,
      ddpOpen: false,
      reportOpen: false,
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

      addDemandProduct: (product) => set((s) => ({ demandProducts: [...s.demandProducts, product] })),

      updateDemandProduct: (id, patch) =>
        set((s) => ({
          demandProducts: s.demandProducts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      removeDemandProduct: (id) =>
        set((s) => {
          const demandProducts = s.demandProducts.filter((p) => p.id !== id);
          const demandQty = Object.fromEntries(
            Object.entries(s.demandQty).filter(([key]) => !key.startsWith(`${id}::`))
          );
          return { demandProducts, demandQty };
        }),

      setDemandCell: (productId, channel, week, qty) =>
        set((s) => ({
          demandQty: { ...s.demandQty, [demandCellKey(productId, channel, week)]: qty },
        })),

      bulkAdjustDemandPlan: (opts) => set((s) => ({ demandQty: bulkAdjustDemand(s.demandQty, opts) })),

      copyDemandWeekForwardAction: (channel, fromWeek, toWeek) =>
        set((s) => ({
          demandQty: copyDemandWeekForward(s.demandQty, s.demandProducts, channel, fromWeek, toWeek),
        })),

      setSalesPlanProductMap: (map) => set({ salesPlanProductMap: map }),
      setSalesPlanChannelMap: (map) => set({ salesPlanChannelMap: map }),

      addFarm: (farm) => set((s) => ({ farms: [...s.farms, farm] })),
      updateFarm: (id, patch) =>
        set((s) => ({ farms: s.farms.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      removeFarm: (id) => set((s) => ({ farms: s.farms.filter((f) => f.id !== id) })),
      setFarms: (farms) => set({ farms }),

      applyDemandDrivenPlacement: (rows) =>
        set((s) => {
          // Group requiredChicksPlaced by placement week
          const chicksMap = new Map<number, number>();
          for (const row of rows) {
            if (row.placementWeek > 0 && row.requiredChicksPlaced > 0) {
              chicksMap.set(row.placementWeek, (chicksMap.get(row.placementWeek) ?? 0) + row.requiredChicksPlaced);
            }
          }

          // Count working days per week from the existing calendar
          const workDaysMap = new Map<number, number>();
          for (const day of s.placementDays) {
            const week = Math.floor(day.dayIndex / 7) + 1;
            if (!(s.params.fridayOff && isFridayDate(day.date))) {
              workDaysMap.set(week, (workDaysMap.get(week) ?? 0) + 1);
            }
          }

          // Required houses per working day per placement week
          const housesMap = new Map<number, number>();
          for (const [week, chicks] of chicksMap) {
            const workDays = workDaysMap.get(week) ?? s.params.workingDaysPerWeek;
            housesMap.set(week, Math.ceil(chicks / workDays / s.params.chicksPerHouse));
          }

          const placementDays = s.placementDays.map((day) => {
            const week = Math.floor(day.dayIndex / 7) + 1;
            const targetHouses = housesMap.get(week);
            if (targetHouses === undefined) return day;
            const isFri = s.params.fridayOff && isFridayDate(day.date);
            return { ...day, farmsPlacing: isFri ? 0 : targetHouses };
          });

          return { placementDays };
        }),

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
          demandProducts: DEFAULT_DEMAND_PRODUCTS,
          demandQty: {},
        })),

      setSelectedStep: (step) => set({ selectedStep: step }),
      setSelectedPlant: (plant) => set({ selectedPlant: plant }),
      toggleAssumptions: () => set((s) => ({ assumptionsOpen: !s.assumptionsOpen })),
      setCompareOpen: (open) => set({ compareOpen: open }),
      setDemandOpen: (open) => set({ demandOpen: open }),
      setSupplyOpen: (open) => set({ supplyOpen: open }),
      setReconcileOpen: (open) => set({ reconcileOpen: open }),
      setDdpOpen: (open) => set({ ddpOpen: open }),
      setReportOpen: (open) => set({ reportOpen: open }),
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
      version: 8,
      // v2 switched Step 1 from weekly to daily placement rows (PlacementRow -> PlacementDayRow).
      // v3 replaced the farm-based model (totalFarms/dressingPct/chicksPerFarm) with the house-based
      // processing chain (houseCount/avgCarcassWeightKg/chicksPerHouse/...). Both changes touch nearly
      // every field, so pre-v3 persisted state is discarded wholesale rather than partially migrated.
      // v4 added housesPerFarm (purely additive/informational), so v3 state is backfilled instead.
      // v5 replaced the 3-bucket weekly Demand Forecast (demand/salesPlanDivisionMap/salesPlanCategoryMap)
      // with the Module 1 Demand Plan (demandProducts/demandQty/salesPlanProductMap/salesPlanChannelMap) —
      // shape changed entirely, so pre-v5 demand-related state is discarded.
      // v6 expanded WC weight buckets to 50g steps (500–1500g).
      // v7 corrected to 100g steps (500–1500g); demandProducts and demandQty reset again.
      migrate: (persisted, version) => {
        if (version >= 8) return persisted;
        const state = persisted as { params?: Parameters; placementDays?: unknown; scenarios?: unknown };
        if (version < 3) return { scenarios: [] };
        const params = state.params ? { ...DEFAULT_PARAMETERS, ...state.params } : undefined;
        // v7→v8: additive — just seed farms from defaults; all prior state preserved
        return {
          params,
          placementDays: state.placementDays,
          scenarios: state.scenarios ?? [],
          demandProducts: (persisted as Record<string, unknown>).demandProducts,
          demandQty: (persisted as Record<string, unknown>).demandQty,
          salesPlanProductMap: (persisted as Record<string, unknown>).salesPlanProductMap,
          salesPlanChannelMap: (persisted as Record<string, unknown>).salesPlanChannelMap,
          farms: DEFAULT_FARMS,
        };
      },
      partialize: (s) => ({
        params: s.params,
        placementDays: s.placementDays,
        demandProducts: s.demandProducts,
        demandQty: s.demandQty,
        salesPlanProductMap: s.salesPlanProductMap,
        salesPlanChannelMap: s.salesPlanChannelMap,
        farms: s.farms,
        scenarios: s.scenarios,
      }),
    }
  )
);

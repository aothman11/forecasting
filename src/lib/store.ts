import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChannelKey,
  DemandPlanQty,
  DemandProduct,
  Farm,
  MonthlyPlanConfig,
  Parameters,
  PlacementDayRow,
  PlacementEntry,
  PlantKey,
  ScenarioSnapshot,
  SupplyRequirementsWeek,
} from "./types";
import { DEFAULT_BOM_RECORDS } from "./bomDefaults";
import type { BomRecord } from "./bomTypes";
import type { SalesPlanCartonRow } from "./processingPlanTypes";
import { DEFAULT_DEMAND_PRODUCTS, DEFAULT_FARMS, DEFAULT_MONTHLY_PLAN_CONFIG, DEFAULT_PARAMETERS } from "./defaults";
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
  placementEntries: PlacementEntry[];
  monthlyPlanConfig: MonthlyPlanConfig;
  dailyPlannedQtyOverrides: Record<string, number>;
  bomRecords: BomRecord[];
  salesPlanCartonRows: SalesPlanCartonRow[];
  salesPlanCartonConfirmed: boolean;
  processingPlanOpen: boolean;
  broilerIntakeOpen: boolean;
  broilerCapacity: Record<string, number>; // key: `${plant}::${week}`, value: birds available
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
  bomOpen: boolean;
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
  clearDemandPlan: () => void;
  setDemandQty: (qty: DemandPlanQty) => void;
  setSalesPlanProductMap: (map: Record<string, string>) => void;
  setSalesPlanChannelMap: (map: Record<string, ChannelKey>) => void;
  addFarm: (farm: Farm) => void;
  updateFarm: (code: string, patch: Partial<Farm>) => void;
  removeFarm: (code: string) => void;
  setFarms: (farms: Farm[]) => void;
  addPlacementEntry: (entry: PlacementEntry) => void;
  updatePlacementEntry: (id: string, patch: Partial<PlacementEntry>) => void;
  removePlacementEntry: (id: string) => void;
  setPlacementEntries: (entries: PlacementEntry[]) => void;
  updateMonthlyPlanConfig: (patch: Partial<MonthlyPlanConfig>) => void;
  setDailyPlannedQtyOverride: (date: string, qty: number | null) => void;
  harvestDeferrals: Record<number, number>;
  setHarvestDeferral: (week: number, birds: number) => void;
  clearHarvestDeferrals: () => void;
  setHorizonWeeks: (weeks: number) => void;
  setPlanStartDate: (date: string) => void;
  resetToDefaults: () => void;
  setSelectedStep: (step: number) => void;
  setSelectedPlant: (plant: PlantFilter) => void;
  toggleAssumptions: () => void;
  setSalesPlanCartonRows: (rows: SalesPlanCartonRow[]) => void;
  confirmSalesPlan: () => void;
  clearSalesPlan: () => void;
  setProcessingPlanOpen: (open: boolean) => void;
  setBroilerIntakeOpen: (open: boolean) => void;
  setBroilerCapacity: (plant: string, week: number, birds: number) => void;
  addBomRecord: (record: BomRecord) => void;
  updateBomRecord: (id: string, patch: Partial<BomRecord>) => void;
  removeBomRecord: (id: string) => void;
  setBomRecords: (records: BomRecord[]) => void;
  setCompareOpen: (open: boolean) => void;
  setDemandOpen: (open: boolean) => void;
  setSupplyOpen: (open: boolean) => void;
  setReconcileOpen: (open: boolean) => void;
  setDdpOpen: (open: boolean) => void;
  setReportOpen: (open: boolean) => void;
  setHomeOpen: (open: boolean) => void;
  setBomOpen: (open: boolean) => void;
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
      placementEntries: [],
      monthlyPlanConfig: DEFAULT_MONTHLY_PLAN_CONFIG,
      dailyPlannedQtyOverrides: {},
      bomRecords: DEFAULT_BOM_RECORDS,
      salesPlanCartonRows: [],
      salesPlanCartonConfirmed: false,
      processingPlanOpen: false,
      broilerIntakeOpen: false,
      broilerCapacity: {},
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
      bomOpen: false,
      scenarios: [],
      harvestDeferrals: {},

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

      clearDemandPlan: () => set({ demandQty: {} }),
      setDemandQty: (qty) => set({ demandQty: qty }),

      setSalesPlanProductMap: (map) => set({ salesPlanProductMap: map }),
      setSalesPlanChannelMap: (map) => set({ salesPlanChannelMap: map }),

      addFarm: (farm) => set((s) => ({ farms: [...s.farms, farm] })),
      updateFarm: (code, patch) =>
        set((s) => ({ farms: s.farms.map((f) => (f.code === code ? { ...f, ...patch } : f)) })),
      removeFarm: (code) => set((s) => ({ farms: s.farms.filter((f) => f.code !== code) })),
      setFarms: (farms) => set({ farms }),

      addPlacementEntry: (entry) => set((s) => ({ placementEntries: [...s.placementEntries, entry] })),
      updatePlacementEntry: (id, patch) =>
        set((s) => ({
          placementEntries: s.placementEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      removePlacementEntry: (id) =>
        set((s) => ({ placementEntries: s.placementEntries.filter((e) => e.id !== id) })),
      setPlacementEntries: (entries) => set({ placementEntries: entries }),
      updateMonthlyPlanConfig: (patch) =>
        set((s) => ({ monthlyPlanConfig: { ...s.monthlyPlanConfig, ...patch } })),
      setDailyPlannedQtyOverride: (date, qty) =>
        set((s) => {
          const next = { ...s.dailyPlannedQtyOverrides };
          if (qty === null) delete next[date];
          else next[date] = qty;
          return { dailyPlannedQtyOverrides: next };
        }),

      applyDemandDrivenPlacement: (rows) =>
        set((s) => {
          // All placement weeks that correspond to a harvest week within the plan horizon
          const allPlacementWeeks = new Set<number>();
          for (const row of rows) {
            if (row.placementWeek > 0) allPlacementWeeks.add(row.placementWeek);
          }

          // Group requiredChicksPlaced by placement week (only weeks that have demand)
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
            if (!allPlacementWeeks.has(week)) return day; // outside plan scope — keep as-is
            const isFri = s.params.fridayOff && isFridayDate(day.date);
            // Weeks in scope with no demand are zeroed out; weeks with demand get the required houses
            const targetHouses = housesMap.get(week) ?? 0;
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

      setHarvestDeferral: (week, birds) =>
        set((s) => ({
          harvestDeferrals:
            birds > 0
              ? { ...s.harvestDeferrals, [week]: birds }
              : Object.fromEntries(Object.entries(s.harvestDeferrals).filter(([k]) => Number(k) !== week)),
        })),

      clearHarvestDeferrals: () => set({ harvestDeferrals: {} }),

      setSelectedStep: (step) => set({ selectedStep: step }),
      setSelectedPlant: (plant) => set({ selectedPlant: plant }),
      toggleAssumptions: () => set((s) => ({ assumptionsOpen: !s.assumptionsOpen })),
      setSalesPlanCartonRows: (rows) => set({ salesPlanCartonRows: rows, salesPlanCartonConfirmed: false }),
      confirmSalesPlan: () => set({ salesPlanCartonConfirmed: true }),
      clearSalesPlan: () => set({ salesPlanCartonRows: [], salesPlanCartonConfirmed: false }),
      setProcessingPlanOpen: (open) => set({ processingPlanOpen: open }),
      setBroilerIntakeOpen: (open) => set({ broilerIntakeOpen: open }),
      setBroilerCapacity: (plant, week, birds) =>
        set((s) => ({
          broilerCapacity: { ...s.broilerCapacity, [`${plant}::${week}`]: birds },
        })),

      addBomRecord: (record) => set((s) => ({ bomRecords: [...s.bomRecords, record] })),
      updateBomRecord: (id, patch) =>
        set((s) => ({ bomRecords: s.bomRecords.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      removeBomRecord: (id) => set((s) => ({ bomRecords: s.bomRecords.filter((r) => r.id !== id) })),
      setBomRecords: (records) => set({ bomRecords: records }),

      setCompareOpen: (open) => set({ compareOpen: open }),
      setDemandOpen: (open) => set({ demandOpen: open }),
      setSupplyOpen: (open) => set({ supplyOpen: open }),
      setReconcileOpen: (open) => set({ reconcileOpen: open }),
      setDdpOpen: (open) => set({ ddpOpen: open }),
      setReportOpen: (open) => set({ reportOpen: open }),
      setHomeOpen: (open) => set({ homeOpen: open }),
      setBomOpen: (open) => set({ bomOpen: open }),

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
      version: 14,
      // v2  switched Step 1 from weekly to daily placement rows (PlacementRow -> PlacementDayRow).
      // v3  replaced the farm-based model with the house-based processing chain — discarded wholesale.
      // v4  added housesPerFarm (additive).
      // v5  replaced 3-bucket Demand Forecast with Module 1 Demand Plan — demand state discarded.
      // v6  expanded WC weight buckets to 50g steps.
      // v7  corrected to 100g steps; demandProducts and demandQty reset.
      // v8  seeded farms from defaults (old placeholder shape).
      // v9  Farm type changed entirely. Added placementEntries, monthlyPlanConfig,
      //     dailyPlannedQtyOverrides. Farms reset to new default.
      // v10 inverted FPP→Cuts to Cuts→FPP: familyAllocation.fpp renamed to .cuts;
      //     added fppFromCuts (per-cut FPP routing) and openingFrozenStockKg.
      // v11 BOM editor: added bomRecords (seeded from defaults) and
      //     gradeYields to params (65/15/10/10 from SAP BOM 930-933).
      // v12 Processing Plan: added salesPlanCartonRows, salesPlanCartonConfirmed (additive).
      // v13 Broiler Intake Plan: added broilerIntakeOpen, broilerCapacity (additive).
      // v14 Fix farm cycleLengthDays: was storing total cycle (43 d) instead of grow-out only
      //     (25.5 d). computeSequenceQueue adds cleaningDays separately, so the old value caused
      //     a 60-day turnaround instead of the correct 43 days (25.5 grow-out + 17 cleaning).
      migrate: (persisted, version) => {
        if (version >= 14) return persisted;
        // v13 → v14: patch farms that still carry cycleLengthDays === 43 (the buggy total-cycle
        // value). Only farms with exactly 43 grow-out + 17 cleaning are touched; any farm a user
        // has manually customised to a different value is left unchanged.
        if (version === 13) {
          const s13 = persisted as Record<string, unknown>;
          const farms = s13.farms as Array<Record<string, unknown>> | undefined;
          return {
            ...s13,
            farms: (farms ?? DEFAULT_FARMS).map((f) =>
              f.cycleLengthDays === 43 && f.cleaningDays === 17
                ? { ...f, cycleLengthDays: 25.5 }
                : f
            ),
          };
        }
        if (version >= 13) return persisted;
        // v12 → v13: additive — seed empty broiler capacity
        if (version === 12) {
          const s12 = persisted as Record<string, unknown>;
          return { ...s12, broilerCapacity: {} };
        }
        if (version >= 12) return persisted;
        // v11 → v12: additive — seed empty sales plan carton state
        if (version === 11) {
          const s11 = persisted as Record<string, unknown>;
          return {
            ...s11,
            salesPlanCartonRows: [],
            salesPlanCartonConfirmed: false,
          };
        }
        if (version >= 11) return persisted;
        // v10 → v11: additive — seed bomRecords, add gradeYields to params
        if (version === 10) {
          const s = persisted as { params?: Parameters; scenarios?: ScenarioSnapshot[] };
          const patchParams = (p: Parameters): Parameters => ({
            ...DEFAULT_PARAMETERS,
            ...p,
            gradeYields: DEFAULT_PARAMETERS.gradeYields,
          });
          return {
            ...s,
            bomRecords: DEFAULT_BOM_RECORDS,
            params: s.params ? patchParams(s.params) : undefined,
            scenarios: (s.scenarios ?? []).map((sc) => ({ ...sc, params: patchParams(sc.params) })),
          };
        }
        if (version >= 10) return persisted;
        if (version === 9) {
          const s = persisted as { params?: Parameters & { familyAllocation?: Record<string, Record<string, number>> }; scenarios?: ScenarioSnapshot[] };
          const migrateParams = (p: Parameters): Parameters => {
            const fam = p.familyAllocation as unknown as Record<"A" | "B" | "C", { wcFresh: number; wcFrozen: number; fpp?: number; cuts?: number }>;
            const familyAllocation = Object.fromEntries(
              (["A", "B", "C"] as const).map((g) => [
                g,
                { wcFresh: fam[g].wcFresh, wcFrozen: fam[g].wcFrozen, cuts: fam[g].cuts ?? fam[g].fpp ?? 0 },
              ])
            ) as unknown as Parameters["familyAllocation"];
            return {
              ...DEFAULT_PARAMETERS,
              ...p,
              familyAllocation,
              fppFromCuts: DEFAULT_PARAMETERS.fppFromCuts,
              openingFrozenStockKg: DEFAULT_PARAMETERS.openingFrozenStockKg,
            };
          };
          return {
            ...s,
            params: s.params ? migrateParams(s.params) : undefined,
            scenarios: (s.scenarios ?? []).map((sc) => ({ ...sc, params: migrateParams(sc.params) })),
          };
        }
        const state = persisted as { params?: Parameters; placementDays?: unknown; scenarios?: unknown };
        if (version < 3) return { scenarios: [] };
        // Old stores predate the Cuts→FPP inversion — take defaults for the allocation-related params.
        const params = state.params
          ? {
              ...DEFAULT_PARAMETERS,
              ...state.params,
              familyAllocation: DEFAULT_PARAMETERS.familyAllocation,
              fppFromCuts: DEFAULT_PARAMETERS.fppFromCuts,
              openingFrozenStockKg: DEFAULT_PARAMETERS.openingFrozenStockKg,
            }
          : undefined;
        return {
          params,
          placementDays: state.placementDays,
          scenarios: state.scenarios ?? [],
          demandProducts: (persisted as Record<string, unknown>).demandProducts,
          demandQty: (persisted as Record<string, unknown>).demandQty,
          salesPlanProductMap: (persisted as Record<string, unknown>).salesPlanProductMap,
          salesPlanChannelMap: (persisted as Record<string, unknown>).salesPlanChannelMap,
          // v9: reset farms to new shape; clear placement entries and plan config
          farms: DEFAULT_FARMS,
          placementEntries: [],
          monthlyPlanConfig: DEFAULT_MONTHLY_PLAN_CONFIG,
          dailyPlannedQtyOverrides: {},
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
        placementEntries: s.placementEntries,
        monthlyPlanConfig: s.monthlyPlanConfig,
        dailyPlannedQtyOverrides: s.dailyPlannedQtyOverrides,
        bomRecords: s.bomRecords,
        // salesPlanCartonRows intentionally NOT persisted — re-populated on
        // every file upload. Keeping 40k+ rows out of localStorage prevents
        // the main-thread serialisation freeze on Zustand state changes.
        broilerCapacity: s.broilerCapacity,
        scenarios: s.scenarios,
        harvestDeferrals: s.harvestDeferrals,
      }),
    }
  )
);

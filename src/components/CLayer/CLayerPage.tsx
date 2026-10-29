"use client";

import { useMemo } from "react";
import { usePlanStore, type CLayerView } from "@/lib/store";
import { useAuth } from "@/components/auth/AuthProvider";
import { canCLayer, type CLayerAction } from "@/lib/role-permissions";
import { useCLayerData } from "@/lib/cLayer/api";
import { projectAll } from "@/lib/cLayer/calc";
import { Notice } from "./ui";
import { PlacementsView } from "./views/PlacementsView";
import { PurchaseScheduleView } from "./views/PurchaseScheduleView";
import { BirdInventoryView } from "./views/BirdInventoryView";
import { TransferPlanView } from "./views/TransferPlanView";
import { EggOutputView } from "./views/EggOutputView";
import { DepletionView } from "./views/DepletionView";
import { KpiView } from "./views/KpiView";
import { StandardsSettingsView } from "./views/StandardsSettingsView";

const TABS: { key: CLayerView; label: string; needs: CLayerAction }[] = [
  { key: "placements", label: "Flock Plan",            needs: "read_data" },
  { key: "purchase",   label: "DOC Purchase Schedule", needs: "read_data" },
  { key: "inventory",  label: "Bird Inventory",        needs: "read_data" },
  { key: "transfer",   label: "Transfer Plan",         needs: "read_data" },
  { key: "eggs",       label: "Egg Output",            needs: "view_egg_output" },
  { key: "spent",      label: "Depletion",             needs: "read_data" },
  { key: "kpis",       label: "KPIs",                  needs: "read_data" },
  { key: "settings",   label: "Standards & Settings",  needs: "read_data" },
];

export function CLayerPage() {
  const user = useAuth();
  const role = user?.role ?? "";
  const storedView = usePlanStore((s) => s.cLayerView);
  const setView = usePlanStore((s) => s.setCLayerView);

  const tabs = TABS.filter((t) => canCLayer(role, t.needs));
  const view = tabs.some((t) => t.key === storedView) ? storedView : tabs[0]?.key;
  const canRead = canCLayer(role, "read_data");
  const { data, error, reload } = useCLayerData(canRead);

  const projections = useMemo(
    () =>
      data
        ? projectAll(data.placements, data.standards, {
            defaultTransferAge: data.settings.defaultTransferAge,
            defaultDepletionAge: data.settings.defaultDepletionAge,
            feedStages: data.feedStages,
            materialStageAges: data.settings,
          })
        : [],
    [data],
  );

  if (!tabs.length) return <Notice tone="error" lines={["Your role does not have access to the C.Layer Plan."]} />;

  const shared = data && {
    data,
    projections,
    reload,
    canWritePlacements: canCLayer(role, "write_placements"),
    canWriteMaster: canCLayer(role, "write_master"),
  };

  return (
    <div className="flex flex-col gap-5 max-w-[1400px]">
      <div>
        <h1 className="section-title text-xl text-brand-green-dark">C.Layer Plan</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Commercial table-egg layers · planning only. Planned DOC placements projected forward: PR → PO → rearing (plant 1260) → transfer → laying (plant 1250) → depletion.
        </p>
      </div>

      <nav aria-label="C.Layer sections" className="flex flex-wrap gap-1 border-b border-[var(--border-subtle)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            aria-current={view === t.key ? "page" : undefined}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              view === t.key
                ? "border-brand-green text-brand-green-dark"
                : "border-transparent text-neutral-500 hover:text-neutral-800 hover:border-neutral-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {view === "eggs" ? (
        <EggOutputView />
      ) : error && !data ? (
        <Notice tone="error" lines={[`Could not load the C.Layer plan: ${error}`]} />
      ) : !shared ? (
        <div className="text-sm text-neutral-500 py-10 text-center">Loading C.Layer plan…</div>
      ) : (
        <>
          {error && <Notice tone="error" lines={[`Refresh failed: ${error}`]} />}
          {view === "placements" && <PlacementsView {...shared} />}
          {view === "purchase" && <PurchaseScheduleView {...shared} />}
          {view === "inventory" && <BirdInventoryView {...shared} />}
          {view === "transfer" && <TransferPlanView {...shared} />}
          {view === "spent" && <DepletionView {...shared} />}
          {view === "kpis" && <KpiView {...shared} />}
          {view === "settings" && <StandardsSettingsView {...shared} />}
        </>
      )}
    </div>
  );
}

export type CLayerViewProps = {
  data: import("@/lib/cLayer/api").CLayerData;
  projections: import("@/lib/cLayer/calc").FlockProjection[];
  reload: () => void;
  canWritePlacements: boolean;
  canWriteMaster: boolean;
};

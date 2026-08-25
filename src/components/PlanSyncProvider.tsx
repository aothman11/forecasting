"use client";

/**
 * PlanSyncProvider
 *
 * On mount:  fetches /api/active-plan and hydrates the Zustand store via
 *            loadSavedPlan() — so every PC starts with the same shared plan.
 *
 * On change: subscribes to store changes, debounces 3 s, then POSTs the
 *            updated plan to /api/active-plan — so every edit is persisted.
 *
 * If the server is unreachable (POSTGRES_URL not set, table missing, etc.)
 * we log a warning but never crash the app — localStorage remains as fallback.
 */
import { useEffect, useRef } from "react";
import { usePlanStore } from "@/lib/store";
import type { SavedPlanState } from "@/lib/types";

const DEBOUNCE_MS = 3_000;

export default function PlanSyncProvider({ children }: { children: React.ReactNode }) {
  const loadSavedPlan = usePlanStore((s) => s.loadSavedPlan);
  const collectPlanState = usePlanStore((s) => s.collectPlanState);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  // ── Initial load from server ───────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    fetch("/api/active-plan")
      .then(async (res) => {
        if (!res.ok) {
          console.warn("[PlanSync] GET /api/active-plan returned", res.status);
          return;
        }
        const { plan } = await res.json() as { plan: SavedPlanState | null };
        if (plan) {
          loadSavedPlan(plan);
          console.info("[PlanSync] Plan loaded from server.");
        }
      })
      .catch((err) => {
        console.warn("[PlanSync] Could not fetch plan from server:", err);
      });
  }, [loadSavedPlan]);

  // ── Subscribe to store changes → debounced save ───────────────────────────
  useEffect(() => {
    const unsubscribe = usePlanStore.subscribe(() => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const state = collectPlanState();
        fetch("/api/active-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
        }).catch((err) => {
          console.warn("[PlanSync] Could not save plan to server:", err);
        });
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [collectPlanState]);

  return <>{children}</>;
}

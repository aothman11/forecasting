"use client";

/**
 * PlanSyncProvider
 *
 * On mount:
 *   1. Fetch /api/active-plan from server.
 *   2. If the server has a non-empty plan (has params), load it into the store
 *      (overrides localStorage so all PCs share the same state).
 *   3. If the server has no plan yet, upload the current store state so other
 *      PCs can pick it up on their next load.
 *
 * On change: subscribes to store, debounces 3 s, POSTs updated plan.
 *
 * Network failures are logged but never crash the app — localStorage remains
 * as fallback.
 */
import { useEffect, useRef } from "react";
import { usePlanStore } from "@/lib/store";
import type { SavedPlanState } from "@/lib/types";

const DEBOUNCE_MS = 3_000;

export default function PlanSyncProvider({ children }: { children: React.ReactNode }) {
  const loadSavedPlan  = usePlanStore((s) => s.loadSavedPlan);
  const collectPlanState = usePlanStore((s) => s.collectPlanState);
  const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  // ── Initial load / first-time upload ──────────────────────────────────────
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

        // Only restore from server if it contains real plan data
        if (plan && plan.params) {
          loadSavedPlan(plan);
          console.info("[PlanSync] Plan loaded from server.");
        } else {
          // Server is empty — upload whatever this PC has in localStorage
          const localState = collectPlanState();
          await fetch("/api/active-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(localState),
          });
          console.info("[PlanSync] Local plan uploaded to server.");
        }
      })
      .catch((err) => {
        console.warn("[PlanSync] Could not reach server:", err);
      });
  }, [loadSavedPlan, collectPlanState]);

  // ── Subscribe to store changes → debounced save ───────────────────────────
  // Track the last serialised planning state so UI-only mutations (opening a
  // panel, switching steps) don't trigger a network write — only real data
  // changes do.
  const lastSavedJsonRef = useRef<string>("");

  useEffect(() => {
    const unsubscribe = usePlanStore.subscribe(() => {
      const state = collectPlanState();
      const json  = JSON.stringify(state);
      if (json === lastSavedJsonRef.current) return; // planning data unchanged

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        lastSavedJsonRef.current = json;
        fetch("/api/active-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: json,
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

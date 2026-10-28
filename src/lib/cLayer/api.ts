"use client";

import { useCallback, useEffect, useState } from "react";
import type { LayerBreed, LayerBreedStandardRow, LayerFarm, LayerPlacement, LayerSettings } from "./types";

export class ApiError extends Error {
  constructor(message: string, readonly details: string[] = []) {
    super(message);
  }
}

/** JSON fetch against /api/c-layer; throws ApiError with the server's validation details. */
export async function cLayerApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/c-layer${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; details?: string[] };
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`, json.details ?? []);
  return json as T;
}

export function errorLines(err: unknown): string[] {
  if (err instanceof ApiError) return err.details.length ? err.details : [err.message];
  return [err instanceof Error ? err.message : String(err)];
}

export interface CLayerData {
  breeds: LayerBreed[];
  farms: LayerFarm[];
  placements: LayerPlacement[];
  settings: LayerSettings;
  standards: Record<string, LayerBreedStandardRow[]>;
}

async function loadAll(): Promise<CLayerData> {
  const [b, f, p, s, st] = await Promise.all([
    cLayerApi<{ breeds: LayerBreed[] }>("GET", "/breeds"),
    cLayerApi<{ farms: LayerFarm[] }>("GET", "/farms"),
    cLayerApi<{ placements: LayerPlacement[] }>("GET", "/placements"),
    cLayerApi<{ settings: LayerSettings }>("GET", "/settings"),
    cLayerApi<{ standards: Record<string, LayerBreedStandardRow[]> }>("GET", "/standards"),
  ]);
  return { breeds: b.breeds, farms: f.farms, placements: p.placements, settings: s.settings, standards: st.standards };
}

/** Loads all C.Layer master and plan data. `reload()` refetches after a write. */
export function useCLayerData(enabled: boolean) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ data: CLayerData | null; error: string | null }>({ data: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadAll()
      .then((data) => !cancelled && setState({ data, error: null }))
      .catch((err) => !cancelled && setState((s) => ({ data: s.data, error: errorLines(err).join(" ") })));
    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

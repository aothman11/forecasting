import "server-only";
import { getClient } from "@/lib/db";
import type {
  LayerBreed,
  LayerBreedInput,
  LayerBreedStandardRow,
  LayerFarm,
  LayerFarmInput,
  LayerPlacement,
  LayerPlacementInput,
  LayerSettings,
  LayerSettingsInput,
} from "./types";

type Row = Record<string, unknown>;

let schemaPromise: Promise<void> | null = null;

/** Creates the C.Layer tables once per cold start. A failed attempt is retried on the next request. */
export function ensureCLayerSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const db = getClient();
    await db`
      CREATE TABLE IF NOT EXISTS layer_breeds (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS layer_breed_standards (
        breed_id       TEXT NOT NULL REFERENCES layer_breeds(id) ON DELETE CASCADE,
        age_week       INTEGER NOT NULL CHECK (age_week >= 1),
        mortality_pct  NUMERIC NOT NULL CHECK (mortality_pct BETWEEN 0 AND 100),
        hen_day_pct    NUMERIC NOT NULL CHECK (hen_day_pct BETWEEN 0 AND 100),
        egg_weight_g   NUMERIC CHECK (egg_weight_g IS NULL OR egg_weight_g > 0),
        PRIMARY KEY (breed_id, age_week)
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS layer_farms (
        id          TEXT PRIMARY KEY,
        code        TEXT NOT NULL UNIQUE,
        name        TEXT NOT NULL,
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS layer_placements (
        id                    TEXT PRIMARY KEY,
        placement_week_start  DATE NOT NULL CHECK (EXTRACT(ISODOW FROM placement_week_start) = 1),
        chicks                INTEGER NOT NULL CHECK (chicks > 0),
        breed_id              TEXT NOT NULL REFERENCES layer_breeds(id) ON DELETE RESTRICT,
        farm_id               TEXT NOT NULL REFERENCES layer_farms(id) ON DELETE RESTRICT,
        end_of_lay_week       INTEGER CHECK (end_of_lay_week IS NULL OR end_of_lay_week >= 1),
        notes                 TEXT NOT NULL DEFAULT '',
        created_by            TEXT NOT NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by            TEXT NOT NULL,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS layer_settings (
        id                   INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        pr_to_po_days        INTEGER CHECK (pr_to_po_days IS NULL OR pr_to_po_days >= 0),
        po_to_delivery_days  INTEGER CHECK (po_to_delivery_days IS NULL OR po_to_delivery_days >= 0),
        eggs_per_tray        INTEGER CHECK (eggs_per_tray IS NULL OR eggs_per_tray > 0),
        trays_per_case       INTEGER CHECK (trays_per_case IS NULL OR trays_per_case > 0),
        updated_by           TEXT,
        updated_at           TIMESTAMPTZ
      )
    `;
    await db`INSERT INTO layer_settings (id) VALUES (1) ON CONFLICT DO NOTHING`;
  })().catch((err) => {
    schemaPromise = null;
    throw err;
  });
  return schemaPromise;
}

// ── Row mappers (NUMERIC arrives as string, timestamps as Date or string) ─────

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function toBreed(r: Row): LayerBreed {
  return {
    id: String(r.id),
    name: String(r.name),
    active: Boolean(r.active),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toFarm(r: Row): LayerFarm {
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    active: Boolean(r.active),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toStandard(r: Row): LayerBreedStandardRow {
  return {
    ageWeek: Number(r.age_week),
    mortalityPct: Number(r.mortality_pct),
    henDayPct: Number(r.hen_day_pct),
    eggWeightG: numOrNull(r.egg_weight_g),
  };
}

function toPlacement(r: Row): LayerPlacement {
  return {
    id: String(r.id),
    placementWeekStart: String(r.placement_week_start),
    chicks: Number(r.chicks),
    breedId: String(r.breed_id),
    farmId: String(r.farm_id),
    endOfLayWeek: numOrNull(r.end_of_lay_week),
    notes: String(r.notes ?? ""),
    createdBy: String(r.created_by),
    createdAt: iso(r.created_at),
    updatedBy: String(r.updated_by),
    updatedAt: iso(r.updated_at),
  };
}

function toSettings(r: Row | undefined): LayerSettings {
  return {
    prToPoDays: numOrNull(r?.pr_to_po_days),
    poToDeliveryDays: numOrNull(r?.po_to_delivery_days),
    eggsPerTray: numOrNull(r?.eggs_per_tray),
    traysPerCase: numOrNull(r?.trays_per_case),
    updatedBy: r?.updated_by ? String(r.updated_by) : null,
    updatedAt: r?.updated_at ? iso(r.updated_at) : null,
  };
}

// ── Breeds ────────────────────────────────────────────────────────────────────

export async function listBreeds(): Promise<LayerBreed[]> {
  const rows = await getClient()`SELECT * FROM layer_breeds ORDER BY name`;
  return (rows as Row[]).map(toBreed);
}

export async function getBreed(id: string): Promise<LayerBreed | null> {
  const rows = await getClient()`SELECT * FROM layer_breeds WHERE id = ${id}`;
  const r = (rows as Row[])[0];
  return r ? toBreed(r) : null;
}

export async function createBreed(input: LayerBreedInput): Promise<LayerBreed> {
  const id = crypto.randomUUID();
  const rows = await getClient()`
    INSERT INTO layer_breeds (id, name, active) VALUES (${id}, ${input.name}, ${input.active})
    RETURNING *
  `;
  return toBreed((rows as Row[])[0]);
}

export async function updateBreed(id: string, input: LayerBreedInput): Promise<LayerBreed | null> {
  const rows = await getClient()`
    UPDATE layer_breeds SET name = ${input.name}, active = ${input.active}, updated_at = now()
    WHERE id = ${id} RETURNING *
  `;
  const r = (rows as Row[])[0];
  return r ? toBreed(r) : null;
}

export async function deleteBreed(id: string): Promise<boolean> {
  const rows = await getClient()`DELETE FROM layer_breeds WHERE id = ${id} RETURNING id`;
  return (rows as Row[]).length > 0;
}

// ── Breed weekly standards ────────────────────────────────────────────────────

export async function getStandards(breedId: string): Promise<LayerBreedStandardRow[]> {
  const rows = await getClient()`
    SELECT * FROM layer_breed_standards WHERE breed_id = ${breedId} ORDER BY age_week
  `;
  return (rows as Row[]).map(toStandard);
}

/** Every breed's standard table, keyed by breed id. */
export async function getAllStandards(): Promise<Record<string, LayerBreedStandardRow[]>> {
  const rows = await getClient()`SELECT * FROM layer_breed_standards ORDER BY breed_id, age_week`;
  const out: Record<string, LayerBreedStandardRow[]> = {};
  for (const r of rows as Row[]) (out[String(r.breed_id)] ??= []).push(toStandard(r));
  return out;
}

/** Highest age week in a breed's standard table — the default end of lay. null when no table exists. */
export async function getMaxAgeWeek(breedId: string): Promise<number | null> {
  const rows = await getClient()`
    SELECT MAX(age_week) AS max_age FROM layer_breed_standards WHERE breed_id = ${breedId}
  `;
  return numOrNull((rows as Row[])[0]?.max_age);
}

/** Replaces a breed's whole standard table in one transaction (all rows or none). */
export async function replaceStandards(breedId: string, rows: LayerBreedStandardRow[]): Promise<void> {
  const db = getClient();
  await db.transaction((tx) => [
    tx`DELETE FROM layer_breed_standards WHERE breed_id = ${breedId}`,
    ...rows.map(
      (r) => tx`
        INSERT INTO layer_breed_standards (breed_id, age_week, mortality_pct, hen_day_pct, egg_weight_g)
        VALUES (${breedId}, ${r.ageWeek}, ${r.mortalityPct}, ${r.henDayPct}, ${r.eggWeightG})
      `,
    ),
    tx`UPDATE layer_breeds SET updated_at = now() WHERE id = ${breedId}`,
  ]);
}

// ── Farms ─────────────────────────────────────────────────────────────────────

export async function listFarms(): Promise<LayerFarm[]> {
  const rows = await getClient()`SELECT * FROM layer_farms ORDER BY code`;
  return (rows as Row[]).map(toFarm);
}

export async function getFarm(id: string): Promise<LayerFarm | null> {
  const rows = await getClient()`SELECT * FROM layer_farms WHERE id = ${id}`;
  const r = (rows as Row[])[0];
  return r ? toFarm(r) : null;
}

export async function createFarm(input: LayerFarmInput): Promise<LayerFarm> {
  const id = crypto.randomUUID();
  const rows = await getClient()`
    INSERT INTO layer_farms (id, code, name, active)
    VALUES (${id}, ${input.code}, ${input.name}, ${input.active})
    RETURNING *
  `;
  return toFarm((rows as Row[])[0]);
}

export async function updateFarm(id: string, input: LayerFarmInput): Promise<LayerFarm | null> {
  const rows = await getClient()`
    UPDATE layer_farms
    SET code = ${input.code}, name = ${input.name}, active = ${input.active}, updated_at = now()
    WHERE id = ${id} RETURNING *
  `;
  const r = (rows as Row[])[0];
  return r ? toFarm(r) : null;
}

export async function deleteFarm(id: string): Promise<boolean> {
  const rows = await getClient()`DELETE FROM layer_farms WHERE id = ${id} RETURNING id`;
  return (rows as Row[]).length > 0;
}

// ── Placements ────────────────────────────────────────────────────────────────
// The DATE column is selected as text so no timezone conversion can shift the Monday.

export async function listPlacements(): Promise<LayerPlacement[]> {
  const rows = await getClient()`
    SELECT id, placement_week_start::text AS placement_week_start, chicks, breed_id, farm_id,
           end_of_lay_week, notes, created_by, created_at, updated_by, updated_at
    FROM layer_placements ORDER BY placement_week_start, created_at
  `;
  return (rows as Row[]).map(toPlacement);
}

export async function getPlacement(id: string): Promise<LayerPlacement | null> {
  const rows = await getClient()`
    SELECT id, placement_week_start::text AS placement_week_start, chicks, breed_id, farm_id,
           end_of_lay_week, notes, created_by, created_at, updated_by, updated_at
    FROM layer_placements WHERE id = ${id}
  `;
  const r = (rows as Row[])[0];
  return r ? toPlacement(r) : null;
}

export async function createPlacement(input: LayerPlacementInput, user: string): Promise<LayerPlacement> {
  const id = crypto.randomUUID();
  await getClient()`
    INSERT INTO layer_placements
      (id, placement_week_start, chicks, breed_id, farm_id, end_of_lay_week, notes, created_by, updated_by)
    VALUES
      (${id}, ${input.placementWeekStart}, ${input.chicks}, ${input.breedId}, ${input.farmId},
       ${input.endOfLayWeek}, ${input.notes}, ${user}, ${user})
  `;
  return (await getPlacement(id))!;
}

export async function updatePlacement(
  id: string,
  input: LayerPlacementInput,
  user: string,
): Promise<LayerPlacement | null> {
  const rows = await getClient()`
    UPDATE layer_placements SET
      placement_week_start = ${input.placementWeekStart},
      chicks               = ${input.chicks},
      breed_id             = ${input.breedId},
      farm_id              = ${input.farmId},
      end_of_lay_week      = ${input.endOfLayWeek},
      notes                = ${input.notes},
      updated_by           = ${user},
      updated_at           = now()
    WHERE id = ${id} RETURNING id
  `;
  return (rows as Row[]).length ? getPlacement(id) : null;
}

/** Applies an Excel import in one transaction: rows with an id update that placement, others are created. */
export async function importPlacements(
  rows: { id: string | null; input: LayerPlacementInput }[],
  user: string,
): Promise<{ created: number; updated: number }> {
  const db = getClient();
  let created = 0;
  let updated = 0;
  await db.transaction((tx) =>
    rows.map(({ id, input }) => {
      if (id) {
        updated++;
        return tx`
          UPDATE layer_placements SET
            placement_week_start = ${input.placementWeekStart}, chicks = ${input.chicks},
            breed_id = ${input.breedId}, farm_id = ${input.farmId}, end_of_lay_week = ${input.endOfLayWeek},
            notes = ${input.notes}, updated_by = ${user}, updated_at = now()
          WHERE id = ${id}
        `;
      }
      created++;
      return tx`
        INSERT INTO layer_placements
          (id, placement_week_start, chicks, breed_id, farm_id, end_of_lay_week, notes, created_by, updated_by)
        VALUES (${crypto.randomUUID()}, ${input.placementWeekStart}, ${input.chicks}, ${input.breedId},
                ${input.farmId}, ${input.endOfLayWeek}, ${input.notes}, ${user}, ${user})
      `;
    }),
  );
  return { created, updated };
}

export async function deletePlacement(id: string): Promise<boolean> {
  const rows = await getClient()`DELETE FROM layer_placements WHERE id = ${id} RETURNING id`;
  return (rows as Row[]).length > 0;
}

/**
 * Checks a placement's references: breed and farm must exist, must be active when newly chosen,
 * and an end-of-lay override cannot run past the breed's standard table.
 */
export async function placementReferenceErrors(
  input: LayerPlacementInput,
  previous?: LayerPlacement,
): Promise<string[]> {
  const errors: string[] = [];
  const [breed, farm, maxAge] = await Promise.all([
    getBreed(input.breedId),
    getFarm(input.farmId),
    getMaxAgeWeek(input.breedId),
  ]);
  if (!breed) errors.push("breedId does not match any breed.");
  else if (!breed.active && previous?.breedId !== breed.id) errors.push(`Breed "${breed.name}" is inactive.`);
  if (!farm) errors.push("farmId does not match any farm.");
  else if (!farm.active && previous?.farmId !== farm.id) errors.push(`Farm "${farm.code}" is inactive.`);
  if (breed && input.endOfLayWeek !== null && maxAge !== null && input.endOfLayWeek > maxAge) {
    errors.push(`endOfLayWeek ${input.endOfLayWeek} is beyond the breed standard, which ends at age week ${maxAge}.`);
  }
  return errors;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<LayerSettings> {
  const rows = await getClient()`SELECT * FROM layer_settings WHERE id = 1`;
  return toSettings((rows as Row[])[0]);
}

export async function updateSettings(input: LayerSettingsInput, user: string): Promise<LayerSettings> {
  const rows = await getClient()`
    UPDATE layer_settings SET
      pr_to_po_days       = ${input.prToPoDays},
      po_to_delivery_days = ${input.poToDeliveryDays},
      eggs_per_tray       = ${input.eggsPerTray},
      trays_per_case      = ${input.traysPerCase},
      updated_by          = ${user},
      updated_at          = now()
    WHERE id = 1 RETURNING *
  `;
  return toSettings((rows as Row[])[0]);
}

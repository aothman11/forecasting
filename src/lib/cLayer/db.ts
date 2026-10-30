import "server-only";
import { getClient } from "@/lib/db";
import { GUIDE_STANDARDS } from "./guideStandards";
import { DEFAULT_PREP_ROUTING } from "./prepRoutingDefaults";
import type {
  LayerBreed,
  LayerBreedInput,
  LayerBreedStandardRow,
  LayerFarm,
  LayerFarmInput,
  LayerFeedStage,
  LayerFeedStageInput,
  LayerPlacement,
  LayerPlacementInput,
  LayerPrepOperation,
  LayerSettings,
  PrepGroup,
  LayerSettingsInput,
  LayerSku,
  LayerSkuUpdate,
} from "./types";

type Row = Record<string, unknown>;

let schemaPromise: Promise<void> | null = null;

/**
 * Creates and migrates the C.Layer tables once per cold start; a failed attempt is retried on the
 * next request. Migrations are additive only: the v1 columns (layer_placements.farm_id /
 * end_of_lay_week, layer_settings.eggs_per_tray / trays_per_case) stay until the new version is
 * deployed, so the previously deployed code keeps working against the same database.
 */
export function ensureCLayerSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const db = getClient();
    // ── v1 tables ──
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
        farm_id               TEXT REFERENCES layer_farms(id) ON DELETE RESTRICT,
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

    // ── v2: business-process alignment (additive) ──
    await db`ALTER TABLE layer_breeds ADD COLUMN IF NOT EXISTS egg_material_no TEXT NOT NULL DEFAULT ''`;
    await db`ALTER TABLE layer_breeds ADD COLUMN IF NOT EXISTS doc_material_no TEXT NOT NULL DEFAULT ''`;
    await db`ALTER TABLE layer_breeds ADD COLUMN IF NOT EXISTS pullet14_material_no TEXT NOT NULL DEFAULT ''`;
    await db`ALTER TABLE layer_breeds ADD COLUMN IF NOT EXISTS laying_pullet19_material_no TEXT NOT NULL DEFAULT ''`;
    await db`
      DO $$ BEGIN
        ALTER TABLE layer_breed_standards ADD CONSTRAINT layer_breed_standards_age_max CHECK (age_week <= 100);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `;
    await db`ALTER TABLE layer_farms ADD COLUMN IF NOT EXISTS plant TEXT CHECK (plant IS NULL OR plant IN ('1260', '1250'))`;
    await db`ALTER TABLE layer_farms ADD COLUMN IF NOT EXISTS houses INTEGER CHECK (houses IS NULL OR houses > 0)`;
    await db`ALTER TABLE layer_placements ALTER COLUMN farm_id DROP NOT NULL`;
    await db`ALTER TABLE layer_placements ADD COLUMN IF NOT EXISTS rearing_farm_id TEXT REFERENCES layer_farms(id) ON DELETE RESTRICT`;
    await db`ALTER TABLE layer_placements ADD COLUMN IF NOT EXISTS laying_farm_id TEXT REFERENCES layer_farms(id) ON DELETE RESTRICT`;
    await db`ALTER TABLE layer_placements ADD COLUMN IF NOT EXISTS rearing_houses INTEGER CHECK (rearing_houses IS NULL OR rearing_houses > 0)`;
    await db`ALTER TABLE layer_placements ADD COLUMN IF NOT EXISTS laying_houses INTEGER CHECK (laying_houses IS NULL OR laying_houses > 0)`;
    await db`ALTER TABLE layer_placements ADD COLUMN IF NOT EXISTS transfer_age_week INTEGER CHECK (transfer_age_week IS NULL OR transfer_age_week BETWEEN 10 AND 25)`;
    await db`ALTER TABLE layer_placements ADD COLUMN IF NOT EXISTS depletion_age_week INTEGER CHECK (depletion_age_week IS NULL OR depletion_age_week BETWEEN 79 AND 100)`;
    await db`ALTER TABLE layer_placements ADD COLUMN IF NOT EXISTS flock_no INTEGER CHECK (flock_no IS NULL OR flock_no > 0)`;
    await db`CREATE UNIQUE INDEX IF NOT EXISTS layer_placements_flock_no_key ON layer_placements (flock_no)`;
    await db`ALTER TABLE layer_settings ADD COLUMN IF NOT EXISTS default_transfer_age INTEGER CHECK (default_transfer_age IS NULL OR default_transfer_age BETWEEN 10 AND 25)`;
    await db`ALTER TABLE layer_settings ADD COLUMN IF NOT EXISTS default_depletion_age INTEGER CHECK (default_depletion_age IS NULL OR default_depletion_age BETWEEN 79 AND 100)`;
    await db`ALTER TABLE layer_settings ADD COLUMN IF NOT EXISTS reject_pct NUMERIC CHECK (reject_pct IS NULL OR reject_pct BETWEEN 0 AND 100)`;
    await db`ALTER TABLE layer_settings ADD COLUMN IF NOT EXISTS grade_table_pct NUMERIC CHECK (grade_table_pct IS NULL OR grade_table_pct BETWEEN 0 AND 100)`;
    await db`ALTER TABLE layer_settings ADD COLUMN IF NOT EXISTS grade_c_pct NUMERIC CHECK (grade_c_pct IS NULL OR grade_c_pct BETWEEN 0 AND 100)`;
    await db`ALTER TABLE layer_settings ADD COLUMN IF NOT EXISTS seed_version INTEGER NOT NULL DEFAULT 0`;
    // pullet_from_age / laying_pullet_from_age belong to the superseded 4-stage model; kept, unused.
    await db`ALTER TABLE layer_settings ADD COLUMN IF NOT EXISTS pullet_from_age INTEGER DEFAULT 14 CHECK (pullet_from_age IS NULL OR pullet_from_age BETWEEN 2 AND 100)`;
    await db`ALTER TABLE layer_settings ADD COLUMN IF NOT EXISTS laying_pullet_from_age INTEGER DEFAULT 19 CHECK (laying_pullet_from_age IS NULL OR laying_pullet_from_age BETWEEN 2 AND 100)`;
    await db`ALTER TABLE layer_settings ADD COLUMN IF NOT EXISTS asset_from_age INTEGER DEFAULT 21 CHECK (asset_from_age IS NULL OR asset_from_age BETWEEN 2 AND 100)`;
    // Phases given by AWP (2026-10-30), plan age weeks: rearing 1–15, pre-lay 16–20 (laying farm), laying 21+.
    await db`ALTER TABLE layer_settings ADD COLUMN IF NOT EXISTS pre_lay_from_age INTEGER DEFAULT 16 CHECK (pre_lay_from_age IS NULL OR pre_lay_from_age BETWEEN 2 AND 100)`;
    await db`
      CREATE TABLE IF NOT EXISTS layer_feed_stages (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        phase        TEXT NOT NULL CHECK (phase IN ('rearing', 'laying')),
        from_week    INTEGER NOT NULL CHECK (from_week BETWEEN 0 AND 100),
        to_week      INTEGER NOT NULL CHECK (to_week BETWEEN 0 AND 100),
        material_no  TEXT NOT NULL DEFAULT '',
        sort_order   INTEGER NOT NULL DEFAULT 0,
        CHECK (from_week <= to_week)
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS layer_skus (
        material_no      TEXT PRIMARY KEY,
        description      TEXT NOT NULL,
        grade            TEXT NOT NULL CHECK (grade IN ('table', 'grade_c')),
        pieces_per_pack  INTEGER NOT NULL CHECK (pieces_per_pack > 0),
        trays_per_pack   INTEGER NOT NULL CHECK (trays_per_pack > 0),
        eggs_per_tray    INTEGER NOT NULL CHECK (eggs_per_tray > 0),
        pack_mix_pct     NUMERIC CHECK (pack_mix_pct IS NULL OR pack_mix_pct BETWEEN 0 AND 100),
        sort_order       INTEGER NOT NULL DEFAULT 0
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS layer_prep_operations (
        group_code  TEXT NOT NULL CHECK (group_code IN ('LR01', 'LL01')),
        seq         INTEGER NOT NULL,
        op_code     TEXT NOT NULL,
        op_text     TEXT NOT NULL,
        day         INTEGER NOT NULL CHECK (day BETWEEN 1 AND 365),
        PRIMARY KEY (group_code, seq)
      )
    `;
    await seedV2();
    await seedGuideStandards();
    await seedPhaseAges();
    await seedExampleFlock();
    await seedExampleSettings();
    await seedAwpFarms();
    await seedPrepRouting();
  })().catch((err) => {
    schemaPromise = null;
    throw err;
  });
  return schemaPromise;
}

/**
 * Seeds reference data from the C.Layer Business Process document exactly once (seed_version 0 → 1),
 * so rows an Admin later edits or deletes are never re-created. Every statement is guarded by the
 * flag and runs in one transaction; ON CONFLICT covers two cold starts seeding at the same moment.
 */
async function seedV2(): Promise<void> {
  const db = getClient();
  await db.transaction((tx) => [
    tx`
      INSERT INTO layer_breeds (id, name, egg_material_no)
      SELECT gen_random_uuid()::text, v.name, v.mat
      FROM (VALUES ('Hisex White', '60001'), ('LSL White', '60002'), ('Hy-Line White', '60005')) AS v(name, mat)
      WHERE EXISTS (SELECT 1 FROM layer_settings WHERE id = 1 AND seed_version = 0)
      ON CONFLICT (name) DO NOTHING
    `,
    tx`
      INSERT INTO layer_feed_stages (id, name, phase, from_week, to_week, sort_order)
      SELECT v.id, v.name, v.phase, v.f, v.t, v.s
      FROM (VALUES
        ('starter',   'Starter layer',   'rearing', 0,  6,  0),
        ('grower',    'Grower layer',    'rearing', 7,  11, 1),
        ('developer', 'Developer layer', 'rearing', 12, 16, 2),
        ('prelayer',  'Pre-layer',       'laying',  17, 18, 3),
        ('layer01',   'Layer-01',        'laying',  19, 36, 4),
        ('layer02',   'Layer-02',        'laying',  37, 68, 5),
        ('layer03',   'Layer-03',        'laying',  69, 100, 6)
      ) AS v(id, name, phase, f, t, s)
      WHERE EXISTS (SELECT 1 FROM layer_settings WHERE id = 1 AND seed_version = 0)
      ON CONFLICT (id) DO NOTHING
    `,
    tx`
      INSERT INTO layer_skus (material_no, description, grade, pieces_per_pack, trays_per_pack, eggs_per_tray, pack_mix_pct, sort_order)
      SELECT v.mat, v.descr, v.grade, v.pcs, v.trays, v.ept, v.mix, v.s
      FROM (VALUES
        ('8210132', 'White egg small s.pack 300pc, 10T×30pc', 'table',   300, 10, 30, NULL::numeric, 0),
        ('8210133', 'White egg ML s.pack 300pc, 10T×30pc',    'table',   300, 10, 30, NULL::numeric, 1),
        ('8220303', 'White egg XL s.pack 250pc, 25T×10pc',    'table',   250, 25, 10, NULL::numeric, 2),
        ('8220301', 'White egg G.C 360pc, 12T×30pc',          'grade_c', 360, 12, 30, 100::numeric,  3)
      ) AS v(mat, descr, grade, pcs, trays, ept, mix, s)
      WHERE EXISTS (SELECT 1 FROM layer_settings WHERE id = 1 AND seed_version = 0)
      ON CONFLICT (material_no) DO NOTHING
    `,
    tx`UPDATE layer_settings SET default_transfer_age = 17, seed_version = 1 WHERE id = 1 AND seed_version = 0`,
  ]);
}

/**
 * Seeds the breeder-guide weekly standards once per database (seed_version 1 → 2), and only into
 * the seeded breeds that still have no standard, so a standard an Admin uploaded is never replaced.
 */
async function seedGuideStandards(): Promise<void> {
  const db = getClient();
  await db.transaction((tx) => [
    ...Object.entries(GUIDE_STANDARDS).map(([breedName, rows]) => {
      const json = JSON.stringify(rows.map(([a, m, h, e]) => ({ a, m, h, e })));
      return tx`
        INSERT INTO layer_breed_standards (breed_id, age_week, mortality_pct, hen_day_pct, egg_weight_g)
        SELECT b.id, r.a, r.m, r.h, r.e
        FROM layer_breeds b
        CROSS JOIN jsonb_to_recordset(${json}::jsonb) AS r(a integer, m numeric, h numeric, e numeric)
        WHERE b.name = ${breedName}
          AND EXISTS (SELECT 1 FROM layer_settings WHERE id = 1 AND seed_version = 1)
          AND NOT EXISTS (SELECT 1 FROM layer_breed_standards s WHERE s.breed_id = b.id)
        ON CONFLICT (breed_id, age_week) DO NOTHING
      `;
    }),
    tx`UPDATE layer_settings SET seed_version = 2 WHERE id = 1 AND seed_version = 1`,
  ]);
}

/**
 * One-time move to AWP's phases (seed_version 2 → 3): asset from age 21 (was 20) and the default
 * transfer at the start of pre-lay, age 16 (was 17). Only values still at the old defaults change.
 */
async function seedPhaseAges(): Promise<void> {
  await getClient()`
    UPDATE layer_settings SET
      asset_from_age       = CASE WHEN asset_from_age = 20 THEN 21 ELSE asset_from_age END,
      default_transfer_age = CASE WHEN default_transfer_age = 17 THEN 16 ELSE default_transfer_age END,
      seed_version         = 3
    WHERE id = 1 AND seed_version = 2
  `;
}

/**
 * TEMPORARY demo requested by AWP (2026-10-30): one example flock (no. 900) on two example farms so
 * planners can walk the workflow in production. Runs once (seed_version 3 → 4), so it never returns
 * after an Admin deletes it. Remove this function once the example has been deleted.
 */
async function seedExampleFlock(): Promise<void> {
  const db = getClient();
  const note = "EXAMPLE — delete when done";
  await db.transaction((tx) => [
    tx`
      INSERT INTO layer_farms (id, code, name, plant, houses)
      SELECT v.id, v.code, v.name, v.plant, 6
      FROM (VALUES ('example-rearing-farm', 'EXAMPLE-R1', 'Example rearing farm (delete when done)', '1260'),
                   ('example-laying-farm',  'EXAMPLE-L1', 'Example laying farm (delete when done)',  '1250')) AS v(id, code, name, plant)
      WHERE EXISTS (SELECT 1 FROM layer_settings WHERE id = 1 AND seed_version = 3)
      ON CONFLICT DO NOTHING
    `,
    tx`
      INSERT INTO layer_placements
        (id, flock_no, placement_week_start, chicks, breed_id, rearing_farm_id, rearing_houses,
         laying_farm_id, laying_houses, transfer_age_week, depletion_age_week, notes, created_by, updated_by)
      SELECT 'example-flock-900', 900, DATE '2026-07-06', 30000, b.id, 'example-rearing-farm', 6,
             'example-laying-farm', 6, NULL, 90, ${note}, 'System (example)', 'System (example)'
      FROM layer_breeds b
      WHERE b.name = 'Hy-Line White'
        AND EXISTS (SELECT 1 FROM layer_settings WHERE id = 1 AND seed_version = 3)
        AND EXISTS (SELECT 1 FROM layer_farms WHERE id = 'example-rearing-farm')
        AND EXISTS (SELECT 1 FROM layer_farms WHERE id = 'example-laying-farm')
      ON CONFLICT DO NOTHING
    `,
    tx`UPDATE layer_settings SET seed_version = 4 WHERE id = 1 AND seed_version = 3`,
  ]);
}

/**
 * TEMPORARY demo requested by AWP (2026-10-30): example settings so every output is visible during
 * the walkthrough. Runs once (seed_version 4 → 5) and fills only values that are still empty, so
 * nothing an Admin already entered is replaced. Remove this function together with the example flock.
 */
async function seedExampleSettings(): Promise<void> {
  const db = getClient();
  await db.transaction((tx) => [
    tx`
      UPDATE layer_settings SET
        pr_to_po_days         = COALESCE(pr_to_po_days, 14),
        po_to_delivery_days   = COALESCE(po_to_delivery_days, 56),
        default_depletion_age = COALESCE(default_depletion_age, 90),
        reject_pct            = COALESCE(reject_pct, 3),
        grade_table_pct       = CASE WHEN grade_table_pct IS NULL AND grade_c_pct IS NULL THEN 94 ELSE grade_table_pct END,
        grade_c_pct           = CASE WHEN grade_table_pct IS NULL AND grade_c_pct IS NULL THEN 6 ELSE grade_c_pct END,
        updated_by            = COALESCE(updated_by, 'System (example)'),
        updated_at            = COALESCE(updated_at, now())
      WHERE id = 1 AND seed_version = 4
    `,
    tx`
      UPDATE layer_skus s SET pack_mix_pct = v.mix
      FROM (VALUES ('8210132', 30::numeric), ('8210133', 50::numeric), ('8220303', 20::numeric)) AS v(mat, mix)
      WHERE s.material_no = v.mat
        AND EXISTS (SELECT 1 FROM layer_settings WHERE id = 1 AND seed_version = 4)
        AND NOT EXISTS (SELECT 1 FROM layer_skus WHERE grade = 'table' AND pack_mix_pct IS NOT NULL)
    `,
    tx`UPDATE layer_settings SET seed_version = 5 WHERE id = 1 AND seed_version = 4`,
  ]);
}

/**
 * AWP's commercial-layer farms (seed_version 5 → 6): rearing LR01, LR02 with 6 houses each in 1260,
 * laying LL01, LL02 with 18 houses each in 1250. A code that already exists is left as it is. The
 * example laying farm gets the real laying-farm size (18) if it still has the seeded 6.
 */
async function seedAwpFarms(): Promise<void> {
  const db = getClient();
  await db.transaction((tx) => [
    tx`
      INSERT INTO layer_farms (id, code, name, plant, houses)
      SELECT gen_random_uuid()::text, v.code, v.name, v.plant, v.houses
      FROM (VALUES ('LR01', 'Rearing farm LR01', '1260', 6),
                   ('LR02', 'Rearing farm LR02', '1260', 6),
                   ('LL01', 'Laying farm LL01',  '1250', 18),
                   ('LL02', 'Laying farm LL02',  '1250', 18)) AS v(code, name, plant, houses)
      WHERE EXISTS (SELECT 1 FROM layer_settings WHERE id = 1 AND seed_version = 5)
      ON CONFLICT (code) DO NOTHING
    `,
    tx`
      UPDATE layer_farms SET houses = 18, updated_at = now()
      WHERE id = 'example-laying-farm' AND houses = 6
        AND EXISTS (SELECT 1 FROM layer_settings WHERE id = 1 AND seed_version = 5)
    `,
    tx`UPDATE layer_settings SET seed_version = 6 WHERE id = 1 AND seed_version = 5`,
  ]);
}

/**
 * Seeds the "Cage House Prepared" routing (SAP export 2026-10-30) into any group that has no
 * operations yet, so a routing an Admin uploaded later is never replaced.
 */
async function seedPrepRouting(): Promise<void> {
  const db = getClient();
  await db.transaction((tx) =>
    Object.entries(DEFAULT_PREP_ROUTING).map(([group, rows]) => {
      const json = JSON.stringify(rows.map(([c, t, d], i) => ({ s: i + 1, c, t, d })));
      return tx`
        INSERT INTO layer_prep_operations (group_code, seq, op_code, op_text, day)
        SELECT ${group}, r.s, r.c, r.t, r.d
        FROM jsonb_to_recordset(${json}::jsonb) AS r(s integer, c text, t text, d integer)
        WHERE NOT EXISTS (SELECT 1 FROM layer_prep_operations WHERE group_code = ${group})
        ON CONFLICT DO NOTHING
      `;
    }),
  );
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
    eggMaterialNo: String(r.egg_material_no ?? ""),
    docMaterialNo: String(r.doc_material_no ?? ""),
    pullet14MaterialNo: String(r.pullet14_material_no ?? ""),
    layingPullet19MaterialNo: String(r.laying_pullet19_material_no ?? ""),
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
    plant: r.plant === "1260" || r.plant === "1250" ? r.plant : null,
    houses: numOrNull(r.houses),
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
    flockNo: numOrNull(r.flock_no),
    placementWeekStart: String(r.placement_week_start),
    chicks: Number(r.chicks),
    breedId: String(r.breed_id),
    rearingFarmId: String(r.rearing_farm_id ?? ""),
    rearingHouses: numOrNull(r.rearing_houses),
    layingFarmId: String(r.laying_farm_id ?? ""),
    layingHouses: numOrNull(r.laying_houses),
    transferAgeWeek: numOrNull(r.transfer_age_week),
    depletionAgeWeek: numOrNull(r.depletion_age_week),
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
    defaultTransferAge: numOrNull(r?.default_transfer_age),
    defaultDepletionAge: numOrNull(r?.default_depletion_age),
    rejectPct: numOrNull(r?.reject_pct),
    gradeTablePct: numOrNull(r?.grade_table_pct),
    gradeCPct: numOrNull(r?.grade_c_pct),
    preLayFromAge: numOrNull(r?.pre_lay_from_age),
    assetFromAge: numOrNull(r?.asset_from_age),
    updatedBy: r?.updated_by ? String(r.updated_by) : null,
    updatedAt: r?.updated_at ? iso(r.updated_at) : null,
  };
}

function toFeedStage(r: Row): LayerFeedStage {
  return {
    id: String(r.id),
    name: String(r.name),
    phase: r.phase === "laying" ? "laying" : "rearing",
    fromWeek: Number(r.from_week),
    toWeek: Number(r.to_week),
    materialNo: String(r.material_no ?? ""),
    sortOrder: Number(r.sort_order),
  };
}

function toSku(r: Row): LayerSku {
  return {
    materialNo: String(r.material_no),
    description: String(r.description),
    grade: r.grade === "grade_c" ? "grade_c" : "table",
    piecesPerPack: Number(r.pieces_per_pack),
    traysPerPack: Number(r.trays_per_pack),
    eggsPerTray: Number(r.eggs_per_tray),
    packMixPct: numOrNull(r.pack_mix_pct),
    sortOrder: Number(r.sort_order),
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
  const rows = await getClient()`
    INSERT INTO layer_breeds
      (id, name, egg_material_no, doc_material_no, pullet14_material_no, laying_pullet19_material_no, active)
    VALUES (${crypto.randomUUID()}, ${input.name}, ${input.eggMaterialNo}, ${input.docMaterialNo},
            ${input.pullet14MaterialNo}, ${input.layingPullet19MaterialNo}, ${input.active})
    RETURNING *
  `;
  return toBreed((rows as Row[])[0]);
}

export async function updateBreed(id: string, input: LayerBreedInput): Promise<LayerBreed | null> {
  const rows = await getClient()`
    UPDATE layer_breeds
    SET name = ${input.name}, egg_material_no = ${input.eggMaterialNo}, doc_material_no = ${input.docMaterialNo},
        pullet14_material_no = ${input.pullet14MaterialNo}, laying_pullet19_material_no = ${input.layingPullet19MaterialNo},
        active = ${input.active}, updated_at = now()
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
  const rows = await getClient()`SELECT * FROM layer_farms ORDER BY plant DESC NULLS LAST, code`;
  return (rows as Row[]).map(toFarm);
}

export async function getFarm(id: string): Promise<LayerFarm | null> {
  const rows = await getClient()`SELECT * FROM layer_farms WHERE id = ${id}`;
  const r = (rows as Row[])[0];
  return r ? toFarm(r) : null;
}

export async function createFarm(input: LayerFarmInput): Promise<LayerFarm> {
  const rows = await getClient()`
    INSERT INTO layer_farms (id, code, name, plant, houses, active)
    VALUES (${crypto.randomUUID()}, ${input.code}, ${input.name}, ${input.plant}, ${input.houses}, ${input.active})
    RETURNING *
  `;
  return toFarm((rows as Row[])[0]);
}

export async function updateFarm(id: string, input: LayerFarmInput): Promise<LayerFarm | null> {
  const rows = await getClient()`
    UPDATE layer_farms
    SET code = ${input.code}, name = ${input.name}, plant = ${input.plant}, houses = ${input.houses},
        active = ${input.active}, updated_at = now()
    WHERE id = ${id} RETURNING *
  `;
  const r = (rows as Row[])[0];
  return r ? toFarm(r) : null;
}

export async function deleteFarm(id: string): Promise<boolean> {
  const rows = await getClient()`DELETE FROM layer_farms WHERE id = ${id} RETURNING id`;
  return (rows as Row[]).length > 0;
}

// ── Placements (planned flocks) ───────────────────────────────────────────────
// The DATE column is selected as text so no timezone conversion can shift the Monday.

export async function listPlacements(): Promise<LayerPlacement[]> {
  const rows = await getClient()`
    SELECT id, flock_no, placement_week_start::text AS placement_week_start, chicks, breed_id,
           rearing_farm_id, rearing_houses, laying_farm_id, laying_houses,
           transfer_age_week, depletion_age_week, notes, created_by, created_at, updated_by, updated_at
    FROM layer_placements ORDER BY placement_week_start, flock_no NULLS LAST, created_at
  `;
  return (rows as Row[]).map(toPlacement);
}

export async function getPlacement(id: string): Promise<LayerPlacement | null> {
  const rows = await getClient()`
    SELECT id, flock_no, placement_week_start::text AS placement_week_start, chicks, breed_id,
           rearing_farm_id, rearing_houses, laying_farm_id, laying_houses,
           transfer_age_week, depletion_age_week, notes, created_by, created_at, updated_by, updated_at
    FROM layer_placements WHERE id = ${id}
  `;
  const r = (rows as Row[])[0];
  return r ? toPlacement(r) : null;
}

export async function createPlacement(input: LayerPlacementInput, user: string): Promise<LayerPlacement> {
  const id = crypto.randomUUID();
  // A blank flock number takes the next running number; the unique index rejects a concurrent clash.
  await getClient()`
    INSERT INTO layer_placements
      (id, flock_no, placement_week_start, chicks, breed_id, rearing_farm_id, rearing_houses, laying_farm_id,
       laying_houses, transfer_age_week, depletion_age_week, notes, created_by, updated_by)
    VALUES
      (${id}, COALESCE(${input.flockNo}::integer, (SELECT COALESCE(MAX(flock_no), 0) + 1 FROM layer_placements)),
       ${input.placementWeekStart}, ${input.chicks}, ${input.breedId}, ${input.rearingFarmId},
       ${input.rearingHouses}, ${input.layingFarmId}, ${input.layingHouses}, ${input.transferAgeWeek},
       ${input.depletionAgeWeek}, ${input.notes}, ${user}, ${user})
  `;
  return (await getPlacement(id))!;
}

export async function updatePlacement(id: string, input: LayerPlacementInput, user: string): Promise<LayerPlacement | null> {
  const rows = await getClient()`
    UPDATE layer_placements SET
      flock_no             = COALESCE(${input.flockNo}::integer, flock_no),
      placement_week_start = ${input.placementWeekStart},
      chicks               = ${input.chicks},
      breed_id             = ${input.breedId},
      rearing_farm_id      = ${input.rearingFarmId},
      rearing_houses       = ${input.rearingHouses},
      laying_farm_id       = ${input.layingFarmId},
      laying_houses        = ${input.layingHouses},
      transfer_age_week    = ${input.transferAgeWeek},
      depletion_age_week   = ${input.depletionAgeWeek},
      notes                = ${input.notes},
      updated_by           = ${user},
      updated_at           = now()
    WHERE id = ${id} RETURNING id
  `;
  return (rows as Row[]).length ? getPlacement(id) : null;
}

/**
 * Applies an Excel import in one transaction: rows with an id update that flock, others are created.
 * Every row arrives with its flock number already resolved.
 */
export async function importPlacements(
  rows: { id: string | null; input: LayerPlacementInput & { flockNo: number } }[],
  user: string,
): Promise<{ created: number; updated: number }> {
  const db = getClient();
  const updated = rows.filter((r) => r.id).length;
  await db.transaction((tx) =>
    rows.map(({ id, input }) =>
      id
        ? tx`
            UPDATE layer_placements SET
              flock_no = ${input.flockNo},
              placement_week_start = ${input.placementWeekStart}, chicks = ${input.chicks},
              breed_id = ${input.breedId}, rearing_farm_id = ${input.rearingFarmId},
              rearing_houses = ${input.rearingHouses}, laying_farm_id = ${input.layingFarmId},
              laying_houses = ${input.layingHouses}, transfer_age_week = ${input.transferAgeWeek},
              depletion_age_week = ${input.depletionAgeWeek}, notes = ${input.notes},
              updated_by = ${user}, updated_at = now()
            WHERE id = ${id}
          `
        : tx`
            INSERT INTO layer_placements
              (id, flock_no, placement_week_start, chicks, breed_id, rearing_farm_id, rearing_houses, laying_farm_id,
               laying_houses, transfer_age_week, depletion_age_week, notes, created_by, updated_by)
            VALUES (${crypto.randomUUID()}, ${input.flockNo}, ${input.placementWeekStart}, ${input.chicks}, ${input.breedId},
                    ${input.rearingFarmId}, ${input.rearingHouses}, ${input.layingFarmId}, ${input.layingHouses},
                    ${input.transferAgeWeek}, ${input.depletionAgeWeek}, ${input.notes}, ${user}, ${user})
          `,
    ),
  );
  return { created: rows.length - updated, updated };
}

export async function deletePlacement(id: string): Promise<boolean> {
  const rows = await getClient()`DELETE FROM layer_placements WHERE id = ${id} RETURNING id`;
  return (rows as Row[]).length > 0;
}

// ── Reference checks for planned flocks ───────────────────────────────────────

export interface PlacementRefContext {
  breeds: Map<string, LayerBreed>;
  farms: Map<string, LayerFarm>;
  maxAgeByBreed: Map<string, number>;
  settings: LayerSettings;
  /** flock number → id of the flock that holds it */
  flockOwner: Map<number, string>;
}

/** Loads everything placement checks need in one round of queries (used for single saves and imports). */
export async function loadPlacementRefContext(): Promise<PlacementRefContext> {
  const [breeds, farms, standards, settings, placements] = await Promise.all([
    listBreeds(),
    listFarms(),
    getAllStandards(),
    getSettings(),
    listPlacements(),
  ]);
  return {
    breeds: new Map(breeds.map((b) => [b.id, b])),
    farms: new Map(farms.map((f) => [f.id, f])),
    maxAgeByBreed: new Map(Object.entries(standards).map(([id, rows]) => [id, rows.length])),
    settings,
    flockOwner: new Map(placements.filter((p) => p.flockNo !== null).map((p) => [p.flockNo!, p.id])),
  };
}

/**
 * Cross-record checks: breed and farms exist and (when newly chosen) are active, the rearing farm is
 * plant 1260 and the laying farm 1250, house counts fit the farm, and the effective transfer and
 * depletion ages (per flock, else the defaults) are in order and within the breed standard.
 */
export function placementReferenceErrors(
  ctx: PlacementRefContext,
  input: LayerPlacementInput,
  previous?: LayerPlacement,
): string[] {
  const errors: string[] = [];
  if (input.flockNo !== null) {
    const owner = ctx.flockOwner.get(input.flockNo);
    if (owner && owner !== previous?.id) errors.push(`Flock ${input.flockNo} already exists. Use another number or leave it empty for the next one.`);
  }
  const breed = ctx.breeds.get(input.breedId);
  if (!breed) errors.push("The breed does not exist.");
  else if (!breed.active && previous?.breedId !== breed.id) errors.push(`Breed "${breed.name}" is inactive.`);

  const checkFarm = (farmId: string, plant: "1260" | "1250", houses: number | null, role: string, prevId?: string) => {
    const farm = ctx.farms.get(farmId);
    if (!farm) {
      errors.push(`The ${role} farm does not exist.`);
      return;
    }
    if (farm.plant !== plant) errors.push(`The ${role} farm must be in plant ${plant}; ${farm.code} is ${farm.plant ? `plant ${farm.plant}` : "not assigned to a plant"}.`);
    if (!farm.active && prevId !== farm.id) errors.push(`Farm ${farm.code} is inactive.`);
    if (houses !== null && farm.houses !== null && houses > farm.houses) {
      errors.push(`${farm.code} has ${farm.houses} houses; the flock is assigned ${houses}.`);
    }
  };
  checkFarm(input.rearingFarmId, "1260", input.rearingHouses, "rearing", previous?.rearingFarmId);
  checkFarm(input.layingFarmId, "1250", input.layingHouses, "laying", previous?.layingFarmId);

  const transfer = input.transferAgeWeek ?? ctx.settings.defaultTransferAge;
  const depletion = input.depletionAgeWeek ?? ctx.settings.defaultDepletionAge;
  if (transfer !== null && depletion !== null && depletion <= transfer) {
    errors.push(`Depletion age (${depletion}) must be after the transfer age (${transfer}).`);
  }
  const maxAge = breed ? ctx.maxAgeByBreed.get(breed.id) : undefined;
  if (maxAge !== undefined) {
    if (depletion !== null && depletion > maxAge) {
      errors.push(`Depletion age ${depletion} is beyond the ${breed!.name} standard, which ends at age week ${maxAge}.`);
    }
    if (transfer !== null && transfer > maxAge) {
      errors.push(`Transfer age ${transfer} is beyond the ${breed!.name} standard, which ends at age week ${maxAge}.`);
    }
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
      pr_to_po_days         = ${input.prToPoDays},
      po_to_delivery_days   = ${input.poToDeliveryDays},
      default_transfer_age  = ${input.defaultTransferAge},
      default_depletion_age = ${input.defaultDepletionAge},
      reject_pct            = ${input.rejectPct},
      grade_table_pct       = ${input.gradeTablePct},
      grade_c_pct           = ${input.gradeCPct},
      pre_lay_from_age      = ${input.preLayFromAge},
      asset_from_age        = ${input.assetFromAge},
      updated_by            = ${user},
      updated_at            = now()
    WHERE id = 1 RETURNING *
  `;
  return toSettings((rows as Row[])[0]);
}

// ── Feed stages ───────────────────────────────────────────────────────────────

export async function listFeedStages(): Promise<LayerFeedStage[]> {
  const rows = await getClient()`SELECT * FROM layer_feed_stages ORDER BY from_week, sort_order`;
  return (rows as Row[]).map(toFeedStage);
}

/** Replaces the whole feed stage table in one transaction. */
export async function replaceFeedStages(stages: LayerFeedStageInput[]): Promise<void> {
  const db = getClient();
  await db.transaction((tx) => [
    tx`DELETE FROM layer_feed_stages`,
    ...stages.map(
      (s) => tx`
        INSERT INTO layer_feed_stages (id, name, phase, from_week, to_week, material_no, sort_order)
        VALUES (${s.id ?? crypto.randomUUID()}, ${s.name}, ${s.phase}, ${s.fromWeek}, ${s.toWeek}, ${s.materialNo}, ${s.sortOrder})
      `,
    ),
  ]);
}

// ── House preparation routing ─────────────────────────────────────────────────

export async function listPrepOperations(): Promise<LayerPrepOperation[]> {
  const rows = await getClient()`SELECT * FROM layer_prep_operations ORDER BY group_code, seq`;
  return (rows as Row[]).map((r) => ({
    group: r.group_code === "LL01" ? "LL01" : "LR01",
    seq: Number(r.seq),
    opCode: String(r.op_code),
    text: String(r.op_text),
    day: Number(r.day),
  }));
}

/** Replaces the operations of the given groups in one transaction; groups not given are untouched. */
export async function replacePrepRouting(groups: Partial<Record<PrepGroup, Omit<LayerPrepOperation, "group" | "seq">[]>>): Promise<void> {
  const db = getClient();
  await db.transaction((tx) =>
    Object.entries(groups).flatMap(([group, ops]) => [
      tx`DELETE FROM layer_prep_operations WHERE group_code = ${group}`,
      ...ops!.map(
        (o, i) => tx`
          INSERT INTO layer_prep_operations (group_code, seq, op_code, op_text, day)
          VALUES (${group}, ${i + 1}, ${o.opCode}, ${o.text}, ${o.day})
        `,
      ),
    ]),
  );
}

// ── SKUs ──────────────────────────────────────────────────────────────────────

export async function listSkus(): Promise<LayerSku[]> {
  const rows = await getClient()`SELECT * FROM layer_skus ORDER BY sort_order, material_no`;
  return (rows as Row[]).map(toSku);
}

/** Updates pack sizes and pack mix for existing SKUs in one transaction. */
export async function updateSkus(updates: LayerSkuUpdate[]): Promise<void> {
  const db = getClient();
  await db.transaction((tx) =>
    updates.map(
      (u) => tx`
        UPDATE layer_skus SET
          pieces_per_pack = ${u.piecesPerPack}, trays_per_pack = ${u.traysPerPack},
          eggs_per_tray = ${u.eggsPerTray}, pack_mix_pct = ${u.packMixPct}
        WHERE material_no = ${u.materialNo}
      `,
    ),
  );
}

import { DEPLETION_AGE_RANGE, MAX_STANDARD_AGE_WEEK, TRANSFER_AGE_RANGE } from "./calc";
import type {
  LayerBreedInput,
  LayerBreedStandardRow,
  LayerFarmInput,
  LayerFeedStageInput,
  LayerPlacementInput,
  LayerPrepOperation,
  LayerSettingsInput,
  LayerSku,
  LayerSkuPackagingInput,
  LayerSkuUpdate,
  PrepGroup,
} from "./types";

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const MAX_NOTES = 1000;
const MAX_NAME = 100;
const SUM_TOLERANCE = 1e-6;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPositiveInt(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) > 0;
}

function isIntInRange(v: unknown, min: number, max: number): v is number {
  return Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
}

function isPct(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0 && v <= 100;
}

/** True for a real calendar date in yyyy-mm-dd form that falls on a Monday. */
export function isIsoMonday(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const roundTrips = dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  return roundTrips && dt.getUTCDay() === 1;
}

function requiredText(v: unknown, field: string, max: number, errors: string[]): string {
  if (typeof v !== "string" || v.trim() === "") {
    errors.push(`${field} is required.`);
    return "";
  }
  if (v.trim().length > max) errors.push(`${field} must be at most ${max} characters.`);
  return v.trim();
}

function optionalText(v: unknown, field: string, max: number, errors: string[]): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") {
    errors.push(`${field} must be text.`);
    return "";
  }
  if (v.trim().length > max) errors.push(`${field} must be at most ${max} characters.`);
  return v.trim();
}

function optionalBoolean(v: unknown, field: string, fallback: boolean, errors: string[]): boolean {
  if (v === undefined) return fallback;
  if (typeof v !== "boolean") errors.push(`${field} must be true or false.`);
  return v === true;
}

function optionalPositiveInt(v: unknown, field: string, errors: string[]): number | null {
  if (v === undefined || v === null) return null;
  if (!isPositiveInt(v)) errors.push(`${field} must be empty or a whole number greater than 0.`);
  return v as number;
}

function optionalIntRange(v: unknown, field: string, min: number, max: number, errors: string[]): number | null {
  if (v === undefined || v === null) return null;
  if (!isIntInRange(v, min, max)) errors.push(`${field} must be empty or a whole number from ${min} to ${max}.`);
  return v as number;
}

export function validateBreedInput(body: unknown): Validation<LayerBreedInput> {
  if (!isObject(body)) return { ok: false, errors: ["Body must be an object."] };
  const errors: string[] = [];
  const name = requiredText(body.name, "name", MAX_NAME, errors);
  const eggMaterialNo = requiredText(body.eggMaterialNo, "eggMaterialNo", 20, errors);
  const docMaterialNo = optionalText(body.docMaterialNo, "DOC material no.", 20, errors);
  const pullet14MaterialNo = optionalText(body.pullet14MaterialNo, "Pullet 14WK material no.", 20, errors);
  const layingPullet19MaterialNo = optionalText(body.layingPullet19MaterialNo, "Laying Pullet 19WK material no.", 20, errors);
  const active = optionalBoolean(body.active, "active", true, errors);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name, eggMaterialNo, docMaterialNo, pullet14MaterialNo, layingPullet19MaterialNo, active } };
}

export function validateFarmInput(body: unknown): Validation<LayerFarmInput> {
  if (!isObject(body)) return { ok: false, errors: ["Body must be an object."] };
  const errors: string[] = [];
  const code = requiredText(body.code, "code", 30, errors);
  const name = requiredText(body.name, "name", MAX_NAME, errors);
  if (body.plant !== "1260" && body.plant !== "1250") errors.push("plant must be 1260 (rearing) or 1250 (laying).");
  const houses = optionalPositiveInt(body.houses, "houses", errors);
  const siloCapacityT = body.siloCapacityT ?? null;
  if (siloCapacityT !== null && !(isFiniteNumber(siloCapacityT) && siloCapacityT > 0)) errors.push("silo capacity must be empty or a number of tons greater than 0.");
  const active = optionalBoolean(body.active, "active", true, errors);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { code, name, plant: body.plant as "1260" | "1250", houses, siloCapacityT: siloCapacityT as number | null, active } };
}

export function validatePlacementInput(body: unknown): Validation<LayerPlacementInput> {
  if (!isObject(body)) return { ok: false, errors: ["Body must be an object."] };
  const errors: string[] = [];

  const flockNo = body.flockNo ?? null;
  if (flockNo !== null && !isIntInRange(flockNo, 1, 999999)) errors.push("Flock no. must be empty (next number) or a whole number from 1 to 999999.");
  if (!isIsoMonday(body.placementWeekStart)) {
    errors.push("placementWeekStart must be the Monday (yyyy-mm-dd) of the ISO placement week.");
  }
  if (!isPositiveInt(body.chicks)) errors.push("chicks must be a whole number greater than 0.");
  const breedId = requiredText(body.breedId, "breedId", 100, errors);
  const rearingFarmId = requiredText(body.rearingFarmId, "rearingFarmId", 100, errors);
  const layingFarmId = requiredText(body.layingFarmId, "layingFarmId", 100, errors);
  const rearingHouses = optionalPositiveInt(body.rearingHouses, "rearingHouses", errors);
  const layingHouses = optionalPositiveInt(body.layingHouses, "layingHouses", errors);
  const transferAgeWeek = optionalIntRange(body.transferAgeWeek, "transferAgeWeek", TRANSFER_AGE_RANGE.min, TRANSFER_AGE_RANGE.max, errors);
  const depletionAgeWeek = optionalIntRange(body.depletionAgeWeek, "depletionAgeWeek", DEPLETION_AGE_RANGE.min, DEPLETION_AGE_RANGE.max, errors);
  const notes = optionalText(body.notes, "notes", MAX_NOTES, errors);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      flockNo: flockNo as number | null,
      placementWeekStart: body.placementWeekStart as string,
      chicks: body.chicks as number,
      breedId,
      rearingFarmId,
      rearingHouses,
      layingFarmId,
      layingHouses,
      transferAgeWeek,
      depletionAgeWeek,
      notes,
    },
  };
}

/** Both percentages null, or both set and summing to 100. */
function pairSumsTo100(a: unknown, b: unknown, label: string, errors: string[]): [number | null, number | null] {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null && y === null) return [null, null];
  if (x === null || y === null) {
    errors.push(`${label}: set both percentages, or leave both empty.`);
    return [x as number | null, y as number | null];
  }
  if (!isPct(x) || !isPct(y)) errors.push(`${label}: percentages must be between 0 and 100.`);
  else if (Math.abs(x + y - 100) > SUM_TOLERANCE) errors.push(`${label}: percentages must total 100 (now ${x + y}).`);
  return [x as number, y as number];
}

export function validateSettingsInput(body: unknown): Validation<LayerSettingsInput> {
  if (!isObject(body)) return { ok: false, errors: ["Body must be an object."] };
  const errors: string[] = [];

  const days = (field: "prToPoDays" | "poToDeliveryDays"): number | null => {
    const v = body[field] ?? null;
    if (v !== null && !(Number.isInteger(v) && (v as number) >= 0)) {
      errors.push(`${field} must be empty or a whole number of days (0 or more).`);
    }
    return v as number | null;
  };
  const rejectPct = body.rejectPct ?? null;
  if (rejectPct !== null && !isPct(rejectPct)) errors.push("rejectPct must be empty or between 0 and 100.");
  const [gradeTablePct, gradeCPct] = pairSumsTo100(body.gradeTablePct, body.gradeCPct, "Grade split 90001 / 90002", errors);

  const value: LayerSettingsInput = {
    prToPoDays: days("prToPoDays"),
    poToDeliveryDays: days("poToDeliveryDays"),
    defaultTransferAge: optionalIntRange(body.defaultTransferAge, "defaultTransferAge", TRANSFER_AGE_RANGE.min, TRANSFER_AGE_RANGE.max, errors),
    defaultDepletionAge: optionalIntRange(body.defaultDepletionAge, "defaultDepletionAge", DEPLETION_AGE_RANGE.min, DEPLETION_AGE_RANGE.max, errors),
    rejectPct: rejectPct as number | null,
    gradeTablePct,
    gradeCPct,
    preLayFromAge: null,
    assetFromAge: null,
    feedSupplyPlant: optionalText(body.feedSupplyPlant, "feedSupplyPlant", 10, errors) || null,
    feedStoLeadDays: optionalIntRange(body.feedStoLeadDays, "feedStoLeadDays", 0, 60, errors),
    feedTruckTons: null,
    packagingSupplySource: optionalText(body.packagingSupplySource, "packagingSupplySource", 40, errors) || null,
    packagingLeadDays: optionalIntRange(body.packagingLeadDays, "packagingLeadDays", 0, 180, errors),
  };
  const truck = body.feedTruckTons ?? null;
  if (truck !== null && !(isFiniteNumber(truck) && truck > 0)) errors.push("feedTruckTons must be empty or a number of tons greater than 0.");
  else value.feedTruckTons = truck as number | null;
  value.preLayFromAge = optionalIntRange(body.preLayFromAge, "preLayFromAge", 2, MAX_STANDARD_AGE_WEEK, errors);
  value.assetFromAge = optionalIntRange(body.assetFromAge, "assetFromAge", 2, MAX_STANDARD_AGE_WEEK, errors);
  if (value.preLayFromAge !== null && value.assetFromAge !== null && value.preLayFromAge >= value.assetFromAge) {
    errors.push("The pre-lay phase must start before the laying (asset) phase.");
  }
  if (value.defaultTransferAge !== null && value.defaultDepletionAge !== null && value.defaultDepletionAge <= value.defaultTransferAge) {
    errors.push("The default depletion age must be after the default transfer age.");
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/**
 * A breed standard must be a non-empty table whose age weeks run 1, 2, 3 … (at most 100) with no
 * gaps or duplicates, and whose percentages are within 0–100.
 */
export function validateStandardRows(input: unknown): Validation<LayerBreedStandardRow[]> {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, errors: ["The standard table must contain at least one row."] };
  }
  const errors: string[] = [];
  const rows: LayerBreedStandardRow[] = [];
  const seen = new Set<number>();

  input.forEach((raw, i) => {
    const label = `Row ${i + 1}`;
    if (!isObject(raw)) {
      errors.push(`${label}: must be an object.`);
      return;
    }
    const { ageWeek, mortalityPct, henDayPct } = raw;
    const eggWeightG = raw.eggWeightG ?? null;
    const feedGPerDay = raw.feedGPerDay ?? null;
    if (feedGPerDay !== null && !(isFiniteNumber(feedGPerDay) && feedGPerDay >= 0 && feedGPerDay <= 300)) {
      errors.push(`${label}: feed intake must be empty or between 0 and 300 g/bird/day.`);
    }

    if (!isIntInRange(ageWeek, 1, MAX_STANDARD_AGE_WEEK)) {
      errors.push(`${label}: age week must be a whole number from 1 to ${MAX_STANDARD_AGE_WEEK}.`);
    } else if (seen.has(ageWeek)) errors.push(`${label}: age week ${ageWeek} appears more than once.`);
    else seen.add(ageWeek);

    if (!isPct(mortalityPct)) errors.push(`${label}: mortality % must be between 0 and 100.`);
    if (!isPct(henDayPct)) errors.push(`${label}: hen-day % must be between 0 and 100.`);
    if (eggWeightG !== null && (!isFiniteNumber(eggWeightG) || eggWeightG <= 0)) {
      errors.push(`${label}: egg weight must be empty or a number greater than 0.`);
    }

    rows.push({
      ageWeek: ageWeek as number,
      mortalityPct: mortalityPct as number,
      henDayPct: henDayPct as number,
      eggWeightG: eggWeightG as number | null,
      feedGPerDay: feedGPerDay as number | null,
    });
  });

  if (errors.length) return { ok: false, errors };

  rows.sort((a, b) => a.ageWeek - b.ageWeek);
  const firstGap = rows.findIndex((r, i) => r.ageWeek !== i + 1);
  if (firstGap >= 0) {
    return { ok: false, errors: [`Age weeks must start at 1 and be continuous. First missing week: ${firstGap + 1}.`] };
  }
  return { ok: true, value: rows };
}

/** Feed stage table: names and phases set, 0 ≤ from ≤ to ≤ 100, and no two stages overlapping. */
export function validateFeedStages(input: unknown): Validation<LayerFeedStageInput[]> {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, errors: ["Add at least one feed stage."] };
  const errors: string[] = [];
  const rows: LayerFeedStageInput[] = [];

  input.forEach((raw, i) => {
    const label = `Stage ${i + 1}`;
    if (!isObject(raw)) {
      errors.push(`${label}: must be an object.`);
      return;
    }
    const name = requiredText(raw.name, `${label} name`, 60, errors);
    if (raw.phase !== "rearing" && raw.phase !== "laying") errors.push(`${label}: phase must be rearing or laying.`);
    const okWeeks = isIntInRange(raw.fromWeek, 0, MAX_STANDARD_AGE_WEEK) && isIntInRange(raw.toWeek, 0, MAX_STANDARD_AGE_WEEK);
    if (!okWeeks) errors.push(`${label}: from and to weeks must be whole numbers from 0 to ${MAX_STANDARD_AGE_WEEK}.`);
    else if ((raw.fromWeek as number) > (raw.toWeek as number)) errors.push(`${label}: from week is after to week.`);
    const materialNo = optionalText(raw.materialNo, `${label} material no.`, 20, errors);
    rows.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : undefined,
      name,
      phase: raw.phase as "rearing" | "laying",
      fromWeek: raw.fromWeek as number,
      toWeek: raw.toWeek as number,
      materialNo,
      sortOrder: i,
    });
  });
  if (errors.length) return { ok: false, errors };

  const sorted = [...rows].sort((a, b) => a.fromWeek - b.fromWeek);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].fromWeek <= sorted[i - 1].toWeek) {
      errors.push(`"${sorted[i - 1].name}" and "${sorted[i].name}" overlap at week ${sorted[i].fromWeek}.`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: rows };
}

/** Field checks for an SKU update batch; the per-grade pack-mix total is checked by validateSkuSet. */
export function validateSkuUpdates(input: unknown): Validation<LayerSkuUpdate[]> {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, errors: ["No SKU changes given."] };
  const errors: string[] = [];
  const rows: LayerSkuUpdate[] = [];
  input.forEach((raw, i) => {
    if (!isObject(raw)) {
      errors.push(`SKU ${i + 1}: must be an object.`);
      return;
    }
    const label = typeof raw.materialNo === "string" && raw.materialNo ? `SKU ${raw.materialNo}` : `SKU ${i + 1}`;
    if (typeof raw.materialNo !== "string" || !raw.materialNo) errors.push(`${label}: materialNo is required.`);
    for (const f of ["piecesPerPack", "traysPerPack", "eggsPerTray"] as const) {
      if (!isPositiveInt(raw[f])) errors.push(`${label}: ${f} must be a whole number greater than 0.`);
    }
    const packMixPct = raw.packMixPct ?? null;
    if (packMixPct !== null && !isPct(packMixPct)) errors.push(`${label}: pack mix % must be empty or between 0 and 100.`);
    rows.push({
      materialNo: raw.materialNo as string,
      piecesPerPack: raw.piecesPerPack as number,
      traysPerPack: raw.traysPerPack as number,
      eggsPerTray: raw.eggsPerTray as number,
      packMixPct: packMixPct as number | null,
    });
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: rows };
}

/** Within each grade, pack mix is either empty on every SKU or set on every SKU and totals 100. */
export function validateSkuSet(skus: Pick<LayerSku, "materialNo" | "grade" | "packMixPct">[]): string[] {
  const errors: string[] = [];
  for (const grade of ["table", "grade_c"] as const) {
    const group = skus.filter((s) => s.grade === grade);
    if (!group.length) continue;
    const set = group.filter((s) => s.packMixPct !== null);
    const label = grade === "table" ? "Pack mix of 90001 table eggs" : "Pack mix of 90002 Grade C eggs";
    if (set.length === 0) continue;
    if (set.length < group.length) {
      errors.push(`${label}: set a % for every SKU (${group.map((s) => s.materialNo).join(", ")}), or leave all empty.`);
      continue;
    }
    const total = set.reduce((sum, s) => sum + (s.packMixPct ?? 0), 0);
    if (Math.abs(total - 100) > SUM_TOLERANCE) errors.push(`${label}: must total 100% (now ${total}%).`);
  }
  return errors;
}

const MAX_PREP_DAY = 365;

/** A preparation routing upload: per group, operations with a code, a text and a day (1–365). */
export function validatePrepRouting(input: unknown): Validation<Partial<Record<PrepGroup, Omit<LayerPrepOperation, "group" | "seq">[]>>> {
  if (!isObject(input)) return { ok: false, errors: ["Routing must be an object keyed by group (LR01, LL01)."] };
  const errors: string[] = [];
  const out: Partial<Record<PrepGroup, Omit<LayerPrepOperation, "group" | "seq">[]>> = {};
  for (const [group, ops] of Object.entries(input)) {
    if (group !== "LR01" && group !== "LL01") {
      errors.push(`Unknown group "${group}" — use LR01 (rearing) or LL01 (laying).`);
      continue;
    }
    if (!Array.isArray(ops) || ops.length === 0) {
      errors.push(`${group}: add at least one operation.`);
      continue;
    }
    out[group] = ops.map((raw, i) => {
      const label = `${group} row ${i + 1}`;
      const o = isObject(raw) ? raw : {};
      const opCode = requiredText(o.opCode, `${label} operation code`, 20, errors);
      const text = requiredText(o.text, `${label} text`, 120, errors);
      if (!isIntInRange(o.day, 1, MAX_PREP_DAY)) errors.push(`${label}: day must be a whole number from 1 to ${MAX_PREP_DAY}.`);
      return { opCode, text, day: o.day as number };
    });
  }
  if (!errors.length && Object.keys(out).length === 0) errors.push("No routing groups given.");
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

/** Packaging rows: { skuMaterialNo, component, materialNo, qtyPerPack, unit }[]; material codes may be empty. */
export function validateSkuPackaging(input: unknown): Validation<LayerSkuPackagingInput[]> {
  if (!Array.isArray(input)) return { ok: false, errors: ["Packaging must be a list of rows."] };
  const errors: string[] = [];
  const rows = input.map((raw, i) => {
    const label = `Row ${i + 1}`;
    const o = isObject(raw) ? raw : {};
    const skuMaterialNo = requiredText(o.skuMaterialNo, `${label} SKU`, 20, errors);
    const component = requiredText(o.component, `${label} component`, 60, errors);
    const materialNo = optionalText(o.materialNo, `${label} material no.`, 20, errors);
    const unit = optionalText(o.unit, `${label} unit`, 10, errors) || "PC";
    const orderUnit = optionalText(o.orderUnit, `${label} order unit`, 10, errors) || null;
    const perOrderUnit = o.perOrderUnit ?? null;
    if (perOrderUnit !== null && !(isFiniteNumber(perOrderUnit) && perOrderUnit > 0)) errors.push(`${label}: quantity per order unit must be empty or a number greater than 0.`);
    if ((orderUnit === null) !== (perOrderUnit === null)) errors.push(`${label}: set both the order unit and how much one holds, or leave both empty.`);
    if (!(isFiniteNumber(o.qtyPerPack) && o.qtyPerPack > 0)) errors.push(`${label}: quantity per pack must be a number greater than 0.`);
    return { skuMaterialNo, component, materialNo, qtyPerPack: o.qtyPerPack as number, unit, orderUnit, perOrderUnit: perOrderUnit as number | null };
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: rows };
}

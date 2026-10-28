import type {
  LayerBreedInput,
  LayerBreedStandardRow,
  LayerFarmInput,
  LayerPlacementInput,
  LayerSettingsInput,
} from "./types";

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const MAX_NOTES = 1000;
const MAX_NAME = 100;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPositiveInt(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) > 0;
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

function optionalBoolean(v: unknown, field: string, fallback: boolean, errors: string[]): boolean {
  if (v === undefined) return fallback;
  if (typeof v !== "boolean") errors.push(`${field} must be true or false.`);
  return v === true;
}

export function validateBreedInput(body: unknown): Validation<LayerBreedInput> {
  if (!isObject(body)) return { ok: false, errors: ["Body must be an object."] };
  const errors: string[] = [];
  const name = requiredText(body.name, "name", MAX_NAME, errors);
  const active = optionalBoolean(body.active, "active", true, errors);
  return errors.length ? { ok: false, errors } : { ok: true, value: { name, active } };
}

export function validateFarmInput(body: unknown): Validation<LayerFarmInput> {
  if (!isObject(body)) return { ok: false, errors: ["Body must be an object."] };
  const errors: string[] = [];
  const code = requiredText(body.code, "code", 30, errors);
  const name = requiredText(body.name, "name", MAX_NAME, errors);
  const active = optionalBoolean(body.active, "active", true, errors);
  return errors.length ? { ok: false, errors } : { ok: true, value: { code, name, active } };
}

export function validatePlacementInput(body: unknown): Validation<LayerPlacementInput> {
  if (!isObject(body)) return { ok: false, errors: ["Body must be an object."] };
  const errors: string[] = [];

  if (!isIsoMonday(body.placementWeekStart)) {
    errors.push("placementWeekStart must be the Monday (yyyy-mm-dd) of the ISO placement week.");
  }
  if (!isPositiveInt(body.chicks)) errors.push("chicks must be a whole number greater than 0.");
  const breedId = requiredText(body.breedId, "breedId", 100, errors);
  const farmId = requiredText(body.farmId, "farmId", 100, errors);

  const endOfLayWeek = body.endOfLayWeek ?? null;
  if (endOfLayWeek !== null && !isPositiveInt(endOfLayWeek)) {
    errors.push("endOfLayWeek must be empty or a whole number of at least 1.");
  }

  const notes = body.notes ?? "";
  if (typeof notes !== "string") errors.push("notes must be text.");
  else if (notes.length > MAX_NOTES) errors.push(`notes must be at most ${MAX_NOTES} characters.`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      placementWeekStart: body.placementWeekStart as string,
      chicks: body.chicks as number,
      breedId,
      farmId,
      endOfLayWeek: endOfLayWeek as number | null,
      notes: (notes as string).trim(),
    },
  };
}

export function validateSettingsInput(body: unknown): Validation<LayerSettingsInput> {
  if (!isObject(body)) return { ok: false, errors: ["Body must be an object."] };
  const errors: string[] = [];

  const nonNegative = (field: keyof LayerSettingsInput): number | null => {
    const v = body[field] ?? null;
    if (v !== null && !(Number.isInteger(v) && (v as number) >= 0)) {
      errors.push(`${field} must be empty or a whole number of days (0 or more).`);
    }
    return v as number | null;
  };
  const positive = (field: keyof LayerSettingsInput): number | null => {
    const v = body[field] ?? null;
    if (v !== null && !isPositiveInt(v)) errors.push(`${field} must be empty or a whole number greater than 0.`);
    return v as number | null;
  };

  const value: LayerSettingsInput = {
    prToPoDays: nonNegative("prToPoDays"),
    poToDeliveryDays: nonNegative("poToDeliveryDays"),
    eggsPerTray: positive("eggsPerTray"),
    traysPerCase: positive("traysPerCase"),
  };
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/**
 * A breed standard must be a non-empty table whose age weeks run 1, 2, 3 … with no gaps or
 * duplicates, and whose percentages are within 0–100.
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

    if (!isPositiveInt(ageWeek)) errors.push(`${label}: age week must be a whole number of at least 1.`);
    else if (seen.has(ageWeek)) errors.push(`${label}: age week ${ageWeek} appears more than once.`);
    else seen.add(ageWeek);

    if (!isFiniteNumber(mortalityPct) || mortalityPct < 0 || mortalityPct > 100) {
      errors.push(`${label}: mortality % must be between 0 and 100.`);
    }
    if (!isFiniteNumber(henDayPct) || henDayPct < 0 || henDayPct > 100) {
      errors.push(`${label}: hen-day % must be between 0 and 100.`);
    }
    if (eggWeightG !== null && (!isFiniteNumber(eggWeightG) || eggWeightG <= 0)) {
      errors.push(`${label}: egg weight must be empty or a number greater than 0.`);
    }

    rows.push({
      ageWeek: ageWeek as number,
      mortalityPct: mortalityPct as number,
      henDayPct: henDayPct as number,
      eggWeightG: eggWeightG as number | null,
    });
  });

  if (errors.length) return { ok: false, errors };

  rows.sort((a, b) => a.ageWeek - b.ageWeek);
  const gaps: number[] = [];
  rows.forEach((r, i) => {
    if (r.ageWeek !== i + 1) gaps.push(i + 1);
  });
  if (gaps.length) {
    return {
      ok: false,
      errors: [`Age weeks must start at 1 and be continuous. First missing week: ${gaps[0]}.`],
    };
  }
  return { ok: true, value: rows };
}

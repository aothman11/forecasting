// Run with: npm test   (Node's built-in runner; Node 22.18+ loads the .ts module directly)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { addDays, format, parseISO } from "date-fns";
import {
  addWeeksIso,
  assignFlockNumbers,
  farmAvailability,
  farmStays,
  materialStageFor,
  nextMondayOnOrAfter,
  prepPhases,
  feedStoPlan,
  packagingPlan,
  prepPlansByPlant,
  prepStepOn,
  prepWindow,
  nextFlockNumber,
  ageWeekToCalendarWeek,
  breedStandardNotes,
  depletionAgeError,
  depletionSchedule,
  eggCells,
  farmOverlaps,
  feedStageFor,
  firstLayAgeWeek,
  gradeEggs,
  isoWeekLabel,
  kpis,
  packSkus,
  projectAll,
  projectFlock,
  purchaseSchedule,
  transferAgeError,
  transferSchedule,
  weeklyTotals,
} from "./calc.ts";

/** rows: [mortality %, hen-day %] per age week starting at 1. */
const std = (rows) => rows.map(([mortalityPct, henDayPct], i) => ({ ageWeek: i + 1, mortalityPct, henDayPct, eggWeightG: null }));
/** n weeks: 0 mortality, no lay before `layFrom`, then `hd` %. */
const flat = (n, layFrom = 18, hd = 100, mort = 0) => std(Array.from({ length: n }, (_, i) => [mort, i + 1 >= layFrom ? hd : 0]));

const flock = (over = {}) => ({
  id: "f1",
  placementWeekStart: "2026-11-02",
  chicks: 1000,
  breedId: "B1",
  rearingFarmId: "R1",
  rearingHouses: null,
  layingFarmId: "L1",
  layingHouses: null,
  transferAgeWeek: null,
  depletionAgeWeek: null,
  ...over,
});
const ctx = (over = {}) => ({ defaultTransferAge: 17, defaultDepletionAge: 80, ...over });
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} ≠ ${expected}`);

const DOC_FEED_STAGES = [
  { name: "Starter layer", fromWeek: 0, toWeek: 6 },
  { name: "Grower layer", fromWeek: 7, toWeek: 11 },
  { name: "Developer layer", fromWeek: 12, toWeek: 16 },
  { name: "Pre-layer", fromWeek: 17, toWeek: 18 },
  { name: "Layer-01", fromWeek: 19, toWeek: 36 },
  { name: "Layer-02", fromWeek: 37, toWeek: 68 },
  { name: "Layer-03", fromWeek: 69, toWeek: 100 },
];

describe("mortality compounding", () => {
  test("each week starts with the previous week's survivors", () => {
    const f = projectFlock(flock({ depletionAgeWeek: 80 }), std(Array.from({ length: 80 }, (_, i) => [i < 3 ? 10 : 0, 0])), ctx());
    [1000, 900, 810, 729].forEach((v, i) => close(f.weeks[i].birdsStart, v, `start wk${i + 1}`));
    [900, 810, 729].forEach((v, i) => close(f.weeks[i].birdsEnd, v, `end wk${i + 1}`));
    close(f.weeks[1].avgBirds, 855, "avg wk2");
  });

  test("eggs = average birds × hen-day % × 7 (default base)", () => {
    const f = projectFlock(flock(), std(Array.from({ length: 80 }, (_, i) => [i === 1 ? 2 : 0, i === 1 ? 50 : 0])), ctx());
    close(f.weeks[1].avgBirds, 990, "avg");
    close(f.weeks[1].eggs, 990 * 0.5 * 7, "eggs");
  });

  test("the opening-birds switch uses birds at the start of the week", () => {
    const f = projectFlock(flock(), std(Array.from({ length: 80 }, (_, i) => [i === 1 ? 2 : 0, i === 1 ? 50 : 0])), ctx({ henDayBase: "opening" }));
    close(f.weeks[1].eggs, 1000 * 0.5 * 7, "eggs");
  });
});

describe("transfer week and stage switch", () => {
  test("plant 1260 before the transfer age, 1250 from it; transfer = birds_end(transfer − 1)", () => {
    const s = std(Array.from({ length: 80 }, () => [1, 0]));
    const f = projectFlock(flock(), s, ctx());
    assert.equal(f.weeks[15].plant, "1260");
    assert.equal(f.weeks[16].plant, "1250");
    assert.equal(f.weeks[16].phase, "laying");
    assert.equal(f.weeks[15].farmId, "R1");
    assert.equal(f.weeks[16].farmId, "L1");
    assert.equal(f.transferWeekStart, ageWeekToCalendarWeek("2026-11-02", 17));
    close(f.transferBirds, f.weeks[15].birdsEnd, "transfer birds");
    close(f.transferBirds, 1000 * 0.99 ** 16, "transfer birds value");
  });

  test("a per-flock transfer age overrides the default", () => {
    const f = projectFlock(flock({ transferAgeWeek: 16 }), flat(80), ctx());
    assert.equal(f.transferAge, 16);
    assert.equal(f.weeks[15].plant, "1250");
  });

  test("transfer age outside 10–25 is rejected", () => {
    assert.equal(transferAgeError(17), null);
    assert.ok(transferAgeError(9));
    assert.ok(transferAgeError(26));
  });

  test("no transfer age at all leaves the plant unassigned and flags the setting", () => {
    const f = projectFlock(flock(), flat(80), ctx({ defaultTransferAge: null }));
    assert.equal(f.weeks[0].plant, null);
    assert.equal(f.transferWeekStart, null);
    assert.ok(f.missingSettings.includes("Default transfer age"));
  });
});

describe("start of lay", () => {
  test("first week with hen-day > 0; hens at point of lay are the live birds that week", () => {
    const s = std(Array.from({ length: 80 }, (_, i) => [1, i + 1 >= 19 ? 50 : 0]));
    assert.equal(firstLayAgeWeek(s), 19);
    const f = projectFlock(flock(), s, ctx());
    assert.equal(f.firstLayAgeWeek, 19);
    close(f.hensAtPointOfLay, f.weeks[18].birdsStart, "hens at POL");
  });

  test("a start of lay other than week 20 is flagged on the breed", () => {
    assert.deepEqual(breedStandardNotes(flat(80, 20)), []);
    assert.match(breedStandardNotes(flat(80, 19))[0], /week 19/);
  });
});

describe("feed stages", () => {
  test("document week n maps to age week n + 1", () => {
    assert.equal(feedStageFor(1, DOC_FEED_STAGES), "Starter layer");
    assert.equal(feedStageFor(7, DOC_FEED_STAGES), "Starter layer");
    assert.equal(feedStageFor(8, DOC_FEED_STAGES), "Grower layer");
    assert.equal(feedStageFor(18, DOC_FEED_STAGES), "Pre-layer");
    assert.equal(feedStageFor(20, DOC_FEED_STAGES), "Layer-01");
    assert.equal(feedStageFor(100, DOC_FEED_STAGES), "Layer-03");
  });

  test("each projected week carries its feed stage", () => {
    const f = projectFlock(flock(), flat(80), ctx({ feedStages: DOC_FEED_STAGES }));
    assert.equal(f.weeks[0].feedStage, "Starter layer");
    assert.equal(f.weeks[69].feedStage, "Layer-03");
  });
});

describe("depletion", () => {
  const s = std(Array.from({ length: 100 }, (_, i) => [10 * (i === 79 ? 1 : 0), i + 1 >= 18 ? 90 : 0]));

  test("an override within 79–100 sets the last week; spent hens leave the week after", () => {
    const f = projectFlock(flock({ depletionAgeWeek: 90 }), s, ctx());
    assert.equal(f.weeks.length, 90);
    assert.equal(f.depletionAge, 90);
    close(f.spentHens, f.weeks[89].birdsEnd, "spent hens");
    assert.equal(f.depletionWeekStart, ageWeekToCalendarWeek("2026-11-02", 91));
    const line = depletionSchedule([f])[0];
    assert.equal(line.depletionAge, 90);
    assert.equal(line.farmId, "L1");
  });

  test("depletion ages outside 79–100 are rejected", () => {
    assert.equal(depletionAgeError(79), null);
    assert.equal(depletionAgeError(100), null);
    assert.ok(depletionAgeError(78));
    assert.ok(depletionAgeError(101));
    const f = projectFlock(flock({ depletionAgeWeek: 78 }), s, ctx());
    assert.equal(f.depletionAge, null);
    assert.equal(f.spentHens, null);
    assert.ok(f.warnings.some((w) => /79 to 100/.test(w)));
  });

  test("a depletion age beyond the breed standard is not projected", () => {
    const f = projectFlock(flock({ depletionAgeWeek: 95 }), flat(90), ctx());
    assert.equal(f.depletionAge, null);
    assert.equal(f.weeks.length, 90);
  });

  test("no depletion age at all → projected to the end of the standard, depletion and KPI blank", () => {
    const f = projectFlock(flock(), flat(100), ctx({ defaultDepletionAge: null }));
    assert.equal(f.weeks.length, 100);
    assert.equal(f.spentHens, null);
    assert.equal(f.eggsTo80, null);
    assert.ok(f.missingSettings.includes("Default depletion age"));
    assert.match(f.kpiNote, /Missing setting/);
  });
});

describe("age → calendar week mapping", () => {
  test("age week 1 is the placement week", () => {
    assert.equal(ageWeekToCalendarWeek("2026-11-02", 1), "2026-11-02");
    assert.equal(ageWeekToCalendarWeek("2026-11-02", 2), "2026-11-09");
  });

  test("crosses the year boundary, including ISO week 53", () => {
    const f = projectFlock(flock({ placementWeekStart: "2026-12-21" }), flat(80), ctx());
    assert.deepEqual(f.weeks.slice(0, 3).map((w) => w.weekStart), ["2026-12-21", "2026-12-28", "2027-01-04"]);
    assert.deepEqual(f.weeks.slice(0, 3).map((w) => w.isoWeek), ["2026-W52", "2026-W53", "2027-W01"]);
  });

  test("ISO week-year differs from calendar year at the edges", () => {
    assert.equal(isoWeekLabel("2027-01-01"), "2026-W53");
    assert.equal(isoWeekLabel("2024-12-30"), "2025-W01");
  });
});

describe("grading and packing", () => {
  const skus = [
    { materialNo: "8210132", grade: "table", piecesPerPack: 300, packMixPct: 40 },
    { materialNo: "8210133", grade: "table", piecesPerPack: 300, packMixPct: 40 },
    { materialNo: "8220303", grade: "table", piecesPerPack: 250, packMixPct: 20 },
    { materialNo: "8220301", grade: "grade_c", piecesPerPack: 360, packMixPct: 100 },
  ];

  test("rejects + graded = eggs; 90001 + 90002 = graded", () => {
    const g = gradeEggs(100000, { rejectPct: 2.5, gradeTablePct: 92, gradeCPct: 8 });
    close(g.rejects + g.graded, 100000, "rejects + graded");
    close(g.table + g.gradeC, g.graded, "90001 + 90002");
    close(g.table, 97500 * 0.92, "90001");
  });

  test("packed SKUs share each pool by pack mix and total the pool", () => {
    const g = gradeEggs(100000, { rejectPct: 2.5, gradeTablePct: 92, gradeCPct: 8 });
    const out = packSkus(g, skus);
    const tableEggs = out.filter((s) => s.grade === "table").reduce((s, x) => s + x.eggs, 0);
    close(tableEggs, g.table, "table SKUs total 90001");
    close(out[3].eggs, g.gradeC, "Grade C SKU takes all 90002");
    close(out[2].packs, (g.table * 0.2) / 250, "XL packs");
  });
});

describe("missing settings", () => {
  const f = [flock()];

  test("lead times missing → dates blank with warnings", () => {
    const r = purchaseSchedule(f, { prToPoDays: null, poToDeliveryDays: null }, "2026-10-28");
    assert.equal(r.lines[0].poDate, null);
    assert.equal(r.lines[0].prDate, null);
    assert.equal(r.warnings.length, 2);
  });

  test("only PR → PO missing → PO date still computed; past PR flagged when both set", () => {
    assert.equal(purchaseSchedule(f, { prToPoDays: null, poToDeliveryDays: 14 }, "2026-10-28").lines[0].poDate, "2026-10-19");
    const r = purchaseSchedule(f, { prToPoDays: 7, poToDeliveryDays: 14 }, "2026-10-28");
    assert.equal(r.lines[0].prDate, "2026-10-12");
    assert.equal(r.lines[0].prInPast, true);
    assert.equal(r.lines[0].rearingFarmId, "R1");
  });

  test("grading blanks only what depends on the missing value", () => {
    assert.deepEqual(gradeEggs(1000, { rejectPct: null, gradeTablePct: 90, gradeCPct: 10 }), { rejects: null, graded: null, table: null, gradeC: null });
    const g = gradeEggs(1000, { rejectPct: 10, gradeTablePct: null, gradeCPct: null });
    assert.equal(g.graded, 900);
    assert.equal(g.table, null);
    assert.equal(packSkus(g, [{ materialNo: "8210132", grade: "table", piecesPerPack: 300, packMixPct: 100 }])[0].packs, null);
    assert.equal(packSkus({ table: 900, gradeC: null }, [{ materialNo: "8210132", grade: "table", piecesPerPack: 300, packMixPct: null }])[0].eggs, null);
  });
});

describe("KPI at 80 weeks", () => {
  test("eggs per hen housed = Σ eggs (age ≤ 80) ÷ hens at point of lay; net uses graded eggs", () => {
    const f = projectFlock(flock({ depletionAgeWeek: 90 }), flat(100, 21, 100), ctx());
    close(f.eggsTo80, 1000 * 7 * 60, "eggs to 80");
    const k = kpis([f], { rejectPct: 5 }).flocks[0];
    close(k.eggsPerHenHoused, 420, "eggs per hen");
    close(k.netEggsPerHenHoused, 399, "net eggs per hen");
  });

  test("n/a when depleted before week 80, and net blank without a reject %", () => {
    const early = projectFlock(flock({ depletionAgeWeek: 79 }), flat(100), ctx());
    const k = kpis([early], { rejectPct: null }).flocks[0];
    assert.equal(k.eggsPerHenHoused, null);
    assert.match(k.note, /before week 80/);
    const full = kpis([projectFlock(flock(), flat(100), ctx())], { rejectPct: null }).flocks[0];
    assert.ok(full.eggsPerHenHoused > 0);
    assert.equal(full.netEggsPerHenHoused, null);
  });

  test("per breed pools flocks (Σ eggs ÷ Σ hens)", () => {
    const a = projectFlock(flock({ id: "a", chicks: 1000 }), flat(100, 21, 100), ctx());
    const b = projectFlock(flock({ id: "b", chicks: 3000 }), flat(100, 21, 50), ctx());
    const breed = kpis([a, b], { rejectPct: null }).breeds[0];
    close(breed.eggsPerHenHoused, (1000 * 420 + 3000 * 210) / 4000, "pooled");
  });
});

describe("multiple flocks in the same calendar week", () => {
  const standards = { B1: flat(100, 18, 100), B2: flat(100, 18, 50) };
  const flocks = [
    flock({ id: "a", chicks: 1000 }),
    flock({ id: "b", chicks: 500, layingFarmId: "L2" }),
    flock({ id: "c", chicks: 200, breedId: "B2", placementWeekStart: "2026-11-09" }),
  ];
  const projections = projectAll(flocks, standards, ctx());
  const material = { B1: "60001", B2: "60005" };
  const wk = (t, date) => t.find((w) => w.weekStart === date);
  const at = (age, start = "2026-11-02") => ageWeekToCalendarWeek(start, age);

  test("birds split by plant and summed across flocks", () => {
    const t = weeklyTotals(projections, {}, undefined, material);
    close(wk(t, at(1)).birds1260, 1500, "wk1 in 1260");
    const transfer = wk(t, at(17));
    close(transfer.birds1250, 1500, "a + b in 1250 at age 17");
    close(transfer.birds1260, 200, "c still rearing");
    close(transfer.transferBirds, 1500, "transferring that week");
  });

  test("eggs summed by egg material", () => {
    const t = wk(weeklyTotals(projections, {}, undefined, material), at(19));
    close(t.eggsByMaterial["60001"], 1500 * 7, "60001");
    close(t.eggsByMaterial["60005"], 200 * 0.5 * 7, "60005");
    close(t.eggs, 1500 * 7 + 700, "total");
  });

  test("filters by farm, breed and plant", () => {
    close(wk(weeklyTotals(projections, { farmId: "L2" }), at(19)).eggs, 3500, "farm L2");
    close(wk(weeklyTotals(projections, { breedId: "B2" }), at(19)).eggs, 700, "breed B2");
    close(wk(weeklyTotals(projections, { plant: "1260" }), at(17)).birds1250, 0, "plant 1260 only");
  });

  test("transfers and egg cells per farm", () => {
    const tr = transferSchedule(projections);
    assert.equal(tr.length, 3);
    assert.equal(tr[0].fromFarmId, "R1");
    assert.equal(eggCells(projections, material).filter((c) => c.weekStart === at(19)).length, 3);
  });
});

describe("production-order phases", () => {
  const ages = { preLayFromAge: 16, assetFromAge: 21 };

  test("rearing order 1–15, pre-lay order 16–20, laying (asset) from 21", () => {
    assert.equal(materialStageFor(1, ages), "rearing");
    assert.equal(materialStageFor(15, ages), "rearing");
    assert.equal(materialStageFor(16, ages), "preLay");
    assert.equal(materialStageFor(20, ages), "preLay");
    assert.equal(materialStageFor(21, ages), "laying");
    assert.equal(materialStageFor(100, ages), "laying");
  });

  test("eggs count only from the asset week; point of lay moves with it", () => {
    const s = flat(100, 18, 50);
    const p = projectFlock(flock(), s, ctx({ materialStageAges: ages }));
    assert.equal(p.weeks[17].eggs, 0, "week 18 laid but still in the pre-lay order");
    assert.equal(p.weeks[19].eggs, 0, "week 20 laid but still in the pre-lay order");
    close(p.weeks[20].eggs, 1000 * 0.5 * 7, "week 21 counts");
    assert.equal(p.firstLayAgeWeek, 18, "breed standard still starts lay at 18");
    close(p.hensAtPointOfLay, p.weeks[20].birdsStart, "hens at point of lay = asset week");
    const without = projectFlock(flock(), s, ctx());
    close(without.weeks[17].eggs, 1000 * 0.5 * 7, "without stage ages, week 18 counts");
  });

  test("no stage when an age is not set", () => {
    assert.equal(materialStageFor(20, { ...ages, preLayFromAge: null }), null);
  });

  test("projected weeks and weekly totals carry the phase", () => {
    const p = projectFlock(flock(), flat(100), ctx({ materialStageAges: ages }));
    assert.equal(p.weeks[14].materialStage, "rearing");
    assert.equal(p.weeks[15].materialStage, "preLay");
    const t = weeklyTotals([p]).find((w) => w.weekStart === ageWeekToCalendarWeek("2026-11-02", 18));
    close(t.birdsByStage.preLay, 1000, "pre-lay birds");
    assert.equal(t.flocks[0].materialStage, "preLay");
  });
});

describe("flock numbers", () => {
  test("blanks continue after the highest number in use", () => {
    assert.deepEqual(assignFlockNumbers([null, null], [99, 101]).numbers, [102, 103]);
    assert.equal(nextFlockNumber([101, null, 7]), 102);
    assert.equal(nextFlockNumber([]), 1);
  });

  test("given numbers are kept and blanks skip past them", () => {
    assert.deepEqual(assignFlockNumbers([105, null, 101], [100]).numbers, [105, 106, 101]);
  });

  test("a number used twice in the file is a duplicate", () => {
    assert.deepEqual(assignFlockNumbers([101, 102, 101, null], []).duplicates, [101]);
    assert.deepEqual(assignFlockNumbers([101, 102], [101]).duplicates, []);
  });
});

describe("house preparation (Cage House Prepared)", () => {
  const ops = [
    ...Array.from({ length: 67 }, (_, i) => ({ group: "LR01", opCode: `PRE${String(i + 1).padStart(3, "0")}`, text: i === 0 ? "Rodent control" : "Rest period", day: i + 1 })),
    { group: "LR01", opCode: "PRE067", text: "Lab", day: 67 },
    ...Array.from({ length: 68 }, (_, i) => ({ group: "LL01", opCode: `PRE${String(i + 1).padStart(3, "0")}`, text: "Rest period", day: i + 1 })),
  ];
  const plans = prepPlansByPlant(ops, { LR01: "1260", LL01: "1250" });
  const s = { B1: flat(100, 21, 90) };
  const c = ctx({ defaultTransferAge: 16, defaultDepletionAge: 90 });

  test("routing gives 67 days for rearing and 68 for laying; shared days join their steps", () => {
    assert.equal(plans["1260"].days, 67);
    assert.equal(plans["1250"].days, 68);
    assert.equal(prepStepOn(plans["1260"], 67), "Rest period · Lab");
  });

  test("one operation per day from the Monday the flock leaves; free from the next Monday after", () => {
    assert.deepEqual(prepWindow("2026-11-02", 67), { start: "2026-11-02", lastDay: "2027-01-07", freeFrom: "2027-01-11" });
    assert.deepEqual(prepWindow("2026-11-02", 68), { start: "2026-11-02", lastDay: "2027-01-08", freeFrom: "2027-01-11" });
    assert.equal(nextMondayOnOrAfter("2027-01-11"), "2027-01-11");
  });

  test("rearing farm is prepared from the transfer week, laying farm from the week after depletion", () => {
    const p = projectAll([flock()], s, c);
    const stays = farmStays([flock()], p, plans);
    const rearPrep = stays.find((x) => x.kind === "preparation" && x.plant === "1260");
    const layPrep = stays.find((x) => x.kind === "preparation" && x.plant === "1250");
    assert.equal(rearPrep.from, p[0].transferWeekStart);
    assert.equal(layPrep.from, p[0].depletionWeekStart);
    assert.equal(rearPrep.prep.freeFrom, addWeeksIso(p[0].transferWeekStart, 10));
  });

  test("a flock placed on a farm still in preparation is an overlap; after it is free, none", () => {
    const a = flock({ id: "a" });
    const transfer = projectFlock(a, s.B1, c).transferWeekStart;
    const during = flock({ id: "b", placementWeekStart: addWeeksIso(transfer, 4), layingFarmId: "L2" });
    const after = flock({ id: "c", placementWeekStart: addWeeksIso(transfer, 10), layingFarmId: "L3" });
    const o1 = farmOverlaps([a, during], projectAll([a, during], s, c), {}, plans);
    assert.equal(o1.length, 1);
    assert.equal(o1[0].kind, "preparation");
    assert.deepEqual(o1[0].placementIds, ["a", "b"]);
    assert.equal(farmOverlaps([a, after], projectAll([a, after], s, c), {}, plans).length, 0);
    assert.equal(farmOverlaps([a, during], projectAll([a, during], s, c), {}).length, 0, "no routing → no preparation block");
  });

  test("farm availability: occupied → preparation (with steps) → free", () => {
    const a = flock({ id: "a" });
    const p = projectAll([a], s, c);
    const t = p[0].transferWeekStart;
    const [r1] = farmAvailability(["R1"], farmStays([a], p, plans), plans, { from: "2026-11-02", to: addWeeksIso(t, 11) });
    const at = (iso) => r1.weeks.find((w) => w.weekStart === iso);
    assert.equal(at("2026-11-02").status, "occupied");
    assert.equal(at(t).status, "preparation");
    assert.deepEqual(at(t).prepDays, [1, 7]);
    assert.match(at(t).prepSteps, /Rodent control/);
    assert.equal(at(addWeeksIso(t, 9)).status, "preparation");
    assert.equal(at(addWeeksIso(t, 10)).status, "free");
    assert.equal(r1.freeFrom, addWeeksIso(t, 10));
  });

  test("farm availability: a flock arriving during preparation is flagged as a conflict", () => {
    const a = flock({ id: "a" });
    const t = projectFlock(a, s.B1, c).transferWeekStart;
    const b = flock({ id: "b", placementWeekStart: addWeeksIso(t, 4), layingFarmId: "L2" });
    const p = projectAll([a, b], s, c);
    const [r1] = farmAvailability(["R1"], farmStays([a, b], p, plans), plans, { from: t, to: addWeeksIso(t, 12) });
    const at = (iso) => r1.weeks.find((w) => w.weekStart === iso);
    assert.equal(at(addWeeksIso(t, 3)).status, "preparation");
    assert.equal(at(addWeeksIso(t, 4)).status, "occupied");
    assert.equal(at(addWeeksIso(t, 4)).prepConflict, true);
    assert.equal(at(addWeeksIso(t, 10)).prepConflict, undefined);
  });
});

describe("farm overlap", () => {
  const s = { B1: flat(100) };

  test("two flocks on the same laying farm in the same weeks overlap", () => {
    const flocks = [flock({ id: "a" }), flock({ id: "b", placementWeekStart: "2027-03-01" })];
    const o = farmOverlaps(flocks, projectAll(flocks, s, ctx()), { L1: null });
    assert.ok(o.some((x) => x.farmId === "L1"));
    assert.ok(o.some((x) => x.farmId === "R1") === false);
  });

  test("no overlap when house counts fit the farm together", () => {
    const flocks = [flock({ id: "a", layingHouses: 3 }), flock({ id: "b", layingHouses: 3, placementWeekStart: "2027-03-01" })];
    assert.equal(farmOverlaps(flocks, projectAll(flocks, s, ctx()), { L1: 6 }).length, 0);
    assert.equal(farmOverlaps(flocks, projectAll(flocks, s, ctx()), { L1: 5 }).length, 1);
  });
});

describe("preparation phases", () => {
  test("consecutive days with the same operation text form one phase", () => {
    const ops = [["PRE001", "Rodent control", 1], ["PRE002", "Dry cleaning", 2], ["PRE003", "Dry cleaning", 3], ["PRE004", "Rest period", 4], ["PRE005", "Dry cleaning", 5]]
      .map(([opCode, text, day]) => ({ opCode, text, day }));
    const p = prepPhases(ops);
    assert.deepEqual(p.map((x) => [x.text, x.fromDay, x.toDay]), [["Rodent control", 1, 1], ["Dry cleaning", 2, 3], ["Rest period", 4, 4], ["Dry cleaning", 5, 5]]);
    assert.deepEqual(p[1].opCodes, ["PRE002", "PRE003"]);
  });

  test("different operations on the same day share one phase", () => {
    const p = prepPhases([{ opCode: "PRE066", text: "Rest period", day: 66 }, { opCode: "PRE067", text: "Lab", day: 67 }, { opCode: "PRE067", text: "Rest period - Last Day", day: 67 }]);
    assert.deepEqual(p.map((x) => [x.text, x.fromDay, x.toDay]), [["Rest period", 66, 66], ["Lab · Rest period - Last Day", 67, 67]]);
  });
});

describe("feed STO plan", () => {
  // 1000 chicks, no mortality, 100 g/bird/day from week 1 → 0.7 t per week.
  const s = { B1: flat(100) };
  const feed = { B1: Array.from({ length: 100 }, (_, i) => ({ ageWeek: i + 1, feedGPerDay: 100 })) };
  const stages = DOC_FEED_STAGES.map((x, i) => ({ ...x, materialNo: i === 0 ? "F-START" : "" }));
  const c = ctx({ feedStages: DOC_FEED_STAGES });
  const plan = (flocks, over = {}) =>
    feedStoPlan(projectAll(flocks, s, c), feed, { feedStages: stages, leadDays: 7, truckTons: null, siloByFarm: {}, ...over });

  test("weekly tons = birds × g/day × 7, on the farm the flock is on, STO one week earlier", () => {
    const { lines, gaps } = plan([flock()]);
    assert.equal(gaps.length, 0);
    const first = lines[0];
    assert.equal(first.weekStart, "2026-11-02");
    assert.equal(first.stoDate, "2026-10-26");
    assert.equal(first.farmId, "R1");
    assert.equal(first.plant, "1260");
    assert.equal(first.materialNo, "F-START");
    close(first.tons, 0.7, "tons");
    const p = projectFlock(flock(), s.B1, c);
    assert.equal(lines.find((l) => l.weekStart === p.transferWeekStart).farmId, "L1");
  });

  test("two flocks on one farm, same feed stage, share one STO line", () => {
    const { lines } = plan([flock({ id: "a" }), flock({ id: "b" })]);
    const wk1 = lines.filter((l) => l.weekStart === "2026-11-02");
    assert.equal(wk1.length, 1);
    close(wk1[0].tons, 1.4, "tons");
    assert.deepEqual(wk1[0].placementIds, ["a", "b"]);
  });

  test("trucks round up; silo gives deliveries per week and cover days", () => {
    const { lines } = plan([flock({ chicks: 10000 })], { truckTons: 3, siloByFarm: { R1: 4 } });
    const l = lines[0]; // 7 t this week
    assert.equal(l.trucks, 3);
    assert.equal(l.siloDeliveries, 2);
    assert.equal(l.siloCoverDays, 4);
  });

  test("missing feed intake is reported as a gap, not planned", () => {
    const partial = { B1: feed.B1.map((r) => (r.ageWeek === 3 ? { ...r, feedGPerDay: null } : r)) };
    const r = feedStoPlan(projectAll([flock()], s, c), partial, { feedStages: stages, leadDays: null, truckTons: null, siloByFarm: {} });
    assert.deepEqual(r.gaps, [{ placementId: "f1", reason: "noFeedIntake", ageWeeks: [3] }]);
    assert.equal(r.lines.some((l) => l.weekStart === "2026-11-16"), false);
    assert.equal(r.lines[0].stoDate, null);
  });
});

describe("packaging plan", () => {
  // 1000 hens laying 100% from week 18 → 7000 eggs per week, no rejects, all table grade.
  const s = { B1: flat(100, 18, 100) };
  const proj = projectAll([flock()], s, ctx());
  const grading = { rejectPct: 0, gradeTablePct: 100, gradeCPct: 0 };
  const skus = [
    { materialNo: "S300", grade: "table", piecesPerPack: 300, packMixPct: 50 },
    { materialNo: "S250", grade: "table", piecesPerPack: 250, packMixPct: 50 },
    { materialNo: "GC", grade: "grade_c", piecesPerPack: 360, packMixPct: 100 },
  ];
  const bom = [
    { skuMaterialNo: "S300", component: "Egg tray (30 eggs)", materialNo: "", qtyPerPack: 10, unit: "PC" },
    { skuMaterialNo: "S250", component: "Egg tray (30 eggs)", materialNo: "", qtyPerPack: 25, unit: "PC" },
    { skuMaterialNo: "S300", component: "Outer carton", materialNo: "C1", qtyPerPack: 1, unit: "PC" },
  ];

  test("packs × quantity per pack; shared components add up across SKUs; order lead time", () => {
    const lines = packagingPlan(proj, grading, skus, bom, 14);
    const wk = lines[0].weekStart;
    const tray = lines.find((l) => l.weekStart === wk && l.component.startsWith("Egg tray"));
    // 3500 eggs → 11.67 packs of S300 (116.7 trays) + 14 packs of S250 (350 trays) = 466.7 → 467
    assert.equal(tray.qty, 467);
    close(tray.bySku.S300, 3500 / 300, "S300 packs");
    const carton = lines.find((l) => l.weekStart === wk && l.materialNo === "C1");
    assert.equal(carton.qty, 12);
    assert.equal(tray.orderDate, format(addDays(parseISO(wk), -14), "yyyy-MM-dd"));
    assert.equal(lines.some((l) => l.bySku.GC), false, "no Grade C eggs → no Grade C packaging");
  });

  test("no lines while grading is incomplete", () => {
    assert.equal(packagingPlan(proj, { rejectPct: null, gradeTablePct: 100, gradeCPct: 0 }, skus, bom, null).length, 0);
  });
});

describe("packaging order units", () => {
  const s = { B1: flat(100, 18, 100) };
  const proj = projectAll([flock()], s, ctx()); // 7000 eggs per laying week
  const grading = { rejectPct: 0, gradeTablePct: 100, gradeCPct: 0 };
  const skus = [{ materialNo: "8210132", grade: "table", piecesPerPack: 300, packMixPct: 100 }];
  const bom = [
    { skuMaterialNo: "8210132", component: "Thermal sticker", materialNo: "400600160161", qtyPerPack: 1, unit: "PC", orderUnit: "ROL", perOrderUnit: 1000 },
    { skuMaterialNo: "8210132", component: "Tape", materialNo: "400600120002", qtyPerPack: 1.3, unit: "M", orderUnit: "ROL", perOrderUnit: 1000 },
    { skuMaterialNo: "8210132", component: "Carton", materialNo: "400100020276", qtyPerPack: 1, unit: "PC", orderUnit: null, perOrderUnit: null },
  ];

  test("BOM quantity in the BOM unit, order quantity in rolls", () => {
    const lines = packagingPlan(proj, grading, skus, bom, null);
    const wk = lines[0].weekStart; // 7000 / 300 = 23.33 packs
    const at = (m) => lines.find((l) => l.weekStart === wk && l.materialNo === m);
    assert.equal(at("400600160161").qty, 24);
    close(at("400600160161").orderQty, 0.02, "sticker rolls");
    assert.equal(at("400600120002").qty, 31); // 30.33 m → 31 m
    close(at("400600120002").orderQty, 0.03, "tape rolls");
    assert.equal(at("400100020276").orderQty, null);
  });
});

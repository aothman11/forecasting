// Run with: npm test   (Node's built-in runner; Node 22.18+ loads the .ts module directly)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ageWeekToCalendarWeek,
  eggCells,
  firstLayAgeWeek,
  isoWeekLabel,
  packEggs,
  projectAll,
  projectFlock,
  purchaseSchedule,
  spentHensSchedule,
  weeklyTotals,
} from "./calc.ts";

const std = (rows) => rows.map(([mortalityPct, henDayPct], i) => ({ ageWeek: i + 1, mortalityPct, henDayPct, eggWeightG: null }));
const placement = (over = {}) => ({
  id: "p1",
  placementWeekStart: "2026-11-02",
  chicks: 1000,
  farmId: "F1",
  breedId: "B1",
  endOfLayWeek: null,
  ...over,
});
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: ${actual} ≠ ${expected}`);

describe("mortality compounding", () => {
  test("each week starts with the previous week's survivors", () => {
    const f = projectFlock(placement(), std([[10, 0], [10, 0], [10, 0]]));
    const starts = f.weeks.map((w) => w.birdsStart);
    const ends = f.weeks.map((w) => w.birdsEnd);
    [1000, 900, 810].forEach((v, i) => close(starts[i], v, `start wk${i + 1}`));
    [900, 810, 729].forEach((v, i) => close(ends[i], v, `end wk${i + 1}`));
    close(f.weeks[1].avgBirds, 855, "avg wk2");
  });

  test("eggs = average birds × hen-day % × 7", () => {
    const f = projectFlock(placement(), std([[0, 0], [2, 50]]));
    close(f.weeks[1].avgBirds, 990, "avg");
    close(f.weeks[1].eggs, 990 * 0.5 * 7, "eggs");
  });
});

describe("start of lay detection", () => {
  test("first week with hen-day > 0 starts the laying phase", () => {
    const s = std([[0, 0], [0, 0], [0, 5], [0, 60]]);
    assert.equal(firstLayAgeWeek(s), 3);
    assert.deepEqual(projectFlock(placement(), s).weeks.map((w) => w.phase), ["rearing", "rearing", "laying", "laying"]);
  });

  test("a zero week after lay has started stays in the laying phase", () => {
    const f = projectFlock(placement(), std([[0, 0], [0, 40], [0, 0], [0, 30]]));
    assert.equal(f.weeks[2].phase, "laying");
    assert.equal(f.weeks[2].eggs, 0);
  });

  test("a standard that never lays is all rearing", () => {
    const s = std([[0, 0], [0, 0]]);
    assert.equal(firstLayAgeWeek(s), null);
    assert.ok(projectFlock(placement(), s).weeks.every((w) => w.phase === "rearing"));
  });
});

describe("end of lay", () => {
  const s = std([[10, 0], [10, 50], [10, 50], [10, 50], [10, 50]]);

  test("defaults to the last age week of the standard", () => {
    const f = projectFlock(placement(), s);
    assert.equal(f.endOfLayWeek, 5);
    assert.equal(f.weeks.length, 5);
    assert.equal(f.spentHensWeekStart, "2026-12-07");
  });

  test("an override shortens the flock; spent hens leave the following week", () => {
    const f = projectFlock(placement({ endOfLayWeek: 3 }), s);
    assert.equal(f.weeks.length, 3);
    close(f.spentHens, 729, "spent hens");
    assert.equal(f.spentHensWeekStart, "2026-11-23");
    const line = spentHensSchedule([f])[0];
    assert.equal(line.ageWeek, 4);
    assert.equal(line.isoWeek, "2026-W48");
  });

  test("an override beyond the standard is truncated with a warning", () => {
    const f = projectFlock(placement({ endOfLayWeek: 9 }), s);
    assert.equal(f.endOfLayWeek, 5);
    assert.equal(f.warnings.length, 1);
  });

  test("a breed with no standard cannot be projected", () => {
    const f = projectFlock(placement(), []);
    assert.equal(f.weeks.length, 0);
    assert.equal(f.spentHensWeekStart, null);
    assert.match(f.warnings[0], /no weekly standard/);
  });
});

describe("age → calendar week mapping", () => {
  test("age week 1 is the placement week", () => {
    assert.equal(ageWeekToCalendarWeek("2026-11-02", 1), "2026-11-02");
    assert.equal(ageWeekToCalendarWeek("2026-11-02", 2), "2026-11-09");
  });

  test("crosses the year boundary, including ISO week 53", () => {
    const f = projectFlock(placement({ placementWeekStart: "2026-12-21" }), std([[0, 0], [0, 0], [0, 0]]));
    assert.deepEqual(f.weeks.map((w) => w.weekStart), ["2026-12-21", "2026-12-28", "2027-01-04"]);
    assert.deepEqual(f.weeks.map((w) => w.isoWeek), ["2026-W52", "2026-W53", "2027-W01"]);
  });

  test("ISO week-year differs from calendar year at the edges", () => {
    assert.equal(isoWeekLabel("2027-01-01"), "2026-W53");
    assert.equal(isoWeekLabel("2024-12-30"), "2025-W01");
  });
});

describe("missing settings", () => {
  const p = [placement()];

  test("all lead times missing → dates blank and two warnings", () => {
    const r = purchaseSchedule(p, { prToPoDays: null, poToDeliveryDays: null }, "2026-10-28");
    assert.equal(r.lines[0].poDate, null);
    assert.equal(r.lines[0].prDate, null);
    assert.equal(r.lines[0].prInPast, false);
    assert.equal(r.warnings.length, 2);
  });

  test("only PR → PO missing → PO date still computed", () => {
    const r = purchaseSchedule(p, { prToPoDays: null, poToDeliveryDays: 14 }, "2026-10-28");
    assert.equal(r.lines[0].poDate, "2026-10-19");
    assert.equal(r.lines[0].prDate, null);
    assert.equal(r.warnings.length, 1);
  });

  test("both set → PR before PO before placement, past PR flagged", () => {
    const r = purchaseSchedule(p, { prToPoDays: 7, poToDeliveryDays: 14 }, "2026-10-28");
    assert.equal(r.lines[0].poDate, "2026-10-19");
    assert.equal(r.lines[0].prDate, "2026-10-12");
    assert.equal(r.lines[0].prInPast, true);
    assert.equal(r.warnings.length, 0);
  });

  test("packing blanks only the units that depend on a missing setting", () => {
    assert.deepEqual(packEggs(900, { eggsPerTray: null, traysPerCase: 12 }), { trays: null, cases: null });
    assert.deepEqual(packEggs(900, { eggsPerTray: 30, traysPerCase: null }), { trays: 30, cases: null });
    assert.deepEqual(packEggs(900, { eggsPerTray: 30, traysPerCase: 10 }), { trays: 30, cases: 3 });
  });
});

describe("multiple placements in the same calendar week", () => {
  const s = { B1: std([[0, 0], [0, 100], [0, 100]]), B2: std([[0, 50], [0, 50]]) };
  const flocks = projectAll(
    [
      placement({ id: "a", chicks: 1000 }),
      placement({ id: "b", chicks: 500, farmId: "F2" }),
      placement({ id: "c", chicks: 200, breedId: "B2", placementWeekStart: "2026-11-09" }),
    ],
    s,
  );

  test("eggs and birds sum per week across flocks", () => {
    const t = weeklyTotals(flocks);
    assert.deepEqual(t.map((w) => w.weekStart), ["2026-11-02", "2026-11-09", "2026-11-16"]);
    close(t[1].eggs, 1000 * 7 + 500 * 7 + 200 * 0.5 * 7, "wk2 eggs");
    close(t[0].rearingBirds, 1500, "wk1 rearing");
    close(t[1].layingBirds, 1700, "wk2 laying");
    assert.deepEqual(t[1].flocks.map((f) => f.ageWeek).sort(), [1, 2, 2]);
  });

  test("filters by farm and breed", () => {
    close(weeklyTotals(flocks, { farmId: "F2" })[1].eggs, 3500, "farm F2");
    close(weeklyTotals(flocks, { breedId: "B2" })[0].eggs, 700, "breed B2");
  });

  test("an explicit range includes empty weeks", () => {
    const t = weeklyTotals(flocks, {}, { from: "2026-10-26", to: "2026-11-30" });
    assert.equal(t.length, 6);
    assert.equal(t[0].eggs, 0);
  });

  test("egg cells merge same week × farm × breed", () => {
    const cells = eggCells(flocks).filter((c) => c.weekStart === "2026-11-09");
    assert.equal(cells.length, 3);
    close(cells.reduce((sum, c) => sum + c.eggs, 0), 11200, "total");
  });
});

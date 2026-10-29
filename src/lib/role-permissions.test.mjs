// Run with: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ROLE_LABELS, ROLE_OPTIONS, canCLayer, canEdit, canViewNav } from "./role-permissions.ts";

const ROLES = ["admin", "layer_planner", "sap_project_manager", "sales_planner", "processing_planner", "broiler_planner"];

/** Spec table: Layer Planner / Admin full flock access; master data Admin only; Sales egg output only. */
const EXPECTED = {
  read_data:        { admin: true, layer_planner: true, sap_project_manager: true, sales_planner: false, processing_planner: false, broiler_planner: false },
  write_placements: { admin: true, layer_planner: true, sap_project_manager: true, sales_planner: false, processing_planner: false, broiler_planner: false },
  write_master:     { admin: true, layer_planner: false, sap_project_manager: false, sales_planner: false, processing_planner: false, broiler_planner: false },
  view_egg_output:  { admin: true, layer_planner: true, sap_project_manager: true, sales_planner: true, processing_planner: false, broiler_planner: false },
};

describe("C.Layer data-layer access (enforced by every /api/c-layer route)", () => {
  for (const [action, byRole] of Object.entries(EXPECTED)) {
    for (const role of ROLES) {
      test(`${role} ${byRole[role] ? "may" : "may not"} ${action}`, () => {
        assert.equal(canCLayer(role, action), byRole[role]);
      });
    }
  }

  test("an unknown or empty role gets nothing", () => {
    for (const action of Object.keys(EXPECTED)) {
      assert.equal(canCLayer("", action), false);
      assert.equal(canCLayer("someone_else", action), false);
    }
  });
});

describe("C.Layer navigation", () => {
  test("C.Layer section shown to Admin, SAP PM, Layer Planner and Sales Planner only", () => {
    const shown = ROLES.filter((r) => canViewNav(r, "c_layer"));
    assert.deepEqual(shown, ["admin", "layer_planner", "sap_project_manager", "sales_planner"]);
  });

  test("Layer Planner sees no broiler-chain modules, not even Home", () => {
    for (const key of ["home", "demand_plan", "supply_requirements", "reconciliation", "cop_report", "processing_plan", "breeding_cycle", "step_1", "saved_plans", "product_bom"]) {
      assert.equal(canViewNav("layer_planner", key), false, key);
    }
  });

  test("Layer Planner edits C.Layer flocks and nothing in the broiler chain", () => {
    assert.equal(canEdit("layer_planner", "c_layer_placements"), true);
    for (const module of ["demand_plan", "catching_plan", "processing_plan", "short_term_planning"]) {
      assert.equal(canEdit("layer_planner", module), false, module);
    }
  });

  test("Layer Planner is a selectable role with a label", () => {
    assert.equal(ROLE_LABELS.layer_planner, "Layer Planner");
    assert.ok(ROLE_OPTIONS.some((o) => o.value === "layer_planner"));
  });

  test("existing broiler roles keep their previous navigation", () => {
    assert.equal(canViewNav("sales_planner", "demand_plan"), true);
    assert.equal(canViewNav("broiler_planner", "step_1"), true);
    assert.equal(canViewNav("processing_planner", "processing_plan"), true);
    assert.equal(canViewNav("broiler_planner", "c_layer"), false);
  });
});

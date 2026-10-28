/**
 * Role-Permission configuration — SINGLE SOURCE OF TRUTH.
 *
 * ROLE_MODULES: maps each role to the module keys it can EDIT (write access).
 * All roles can VIEW / navigate to every module; this only controls
 * whether edit controls (buttons, uploads, forms) are enabled.
 *
 * Module keys must match the strings passed to useCanEdit() / <ModuleGate>.
 */

export const ROLE_MODULES: Record<string, string[]> = {
  /** Admin can edit everything — wildcard shortcut */
  admin: ["*"],

  /** Sales Planner owns the demand-side modules */
  sales_planner: [
    "demand_plan",         // M1: Demand Plan
  ],

  /** Processing Planner owns the slaughter / cut-room modules */
  processing_planner: [
    "processing_plan",     // PP: Carcass Requirement
    "broiler_intake",      // BI: Broiler Intake Plan
    "whole_carcass_balance", // WC: Whole Carcass Balance
    "carcass_yield",       // Step 3: Carcass Yield & Grade Split
    "product_family",      // Step 4: Product Family Allocation
    "cut_plan",            // Step 5: FPP Cut Plan
    "plant_processing",    // Step 6: Processing Plan by Plant
    "product_bom",         // Product BOM master data
  ],

  /** Broiler Planner owns live-bird, farm, and placement modules */
  broiler_planner: [
    "catching_plan",            // Step 1: Catching Plan
    "live_bird_forecast",       // Step 2: Live Bird Forecast
    "farm_distribution",        // Step 7: Farm Distribution by Cycle
    "supply_requirements",      // M2: Supply Requirements
    "demand_driven_placement",  // M4: Demand-Driven Placement
    "short_term_planning",      // ST: Short-Term Planning (shared)
  ],

  /**
   * SAP Project Manager — can view and edit every module across
   * demand, processing, and broiler tracks, but does NOT hold the
   * admin wildcard ("*") so cannot access User Management.
   */
  sap_project_manager: [
    // Demand-side (M1–M4)
    "demand_plan",
    "supply_requirements",
    "demand_driven_placement",
    // Processing-plan track
    "processing_plan",
    "broiler_intake",
    "whole_carcass_balance",
    "carcass_yield",
    "product_family",
    "cut_plan",
    "plant_processing",
    "product_bom",
    // Broiler / placement track
    "catching_plan",
    "live_bird_forecast",
    "farm_distribution",
    "short_term_planning",
    // C.Layer (table-egg layers)
    "c_layer_placements",
  ],

  /** Layer Planner owns the C.Layer placement plan (separate value stream from broilers). */
  layer_planner: [
    "c_layer_placements",
  ],
};

/**
 * Human-readable labels for each role.
 * Used in the UI (role badge, User Management table, role selector).
 */
export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  sales_planner: "Sales Planner",
  processing_planner: "Processing Planner",
  broiler_planner: "Broiler Planner",
  sap_project_manager: "SAP Project Manager",
  layer_planner: "Layer Planner",
};

/** Ordered list for dropdowns — admin first, then alphabetical. */
export const ROLE_OPTIONS = [
  { value: "admin",                label: ROLE_LABELS["admin"] },
  { value: "broiler_planner",      label: ROLE_LABELS["broiler_planner"] },
  { value: "layer_planner",        label: ROLE_LABELS["layer_planner"] },
  { value: "processing_planner",   label: ROLE_LABELS["processing_planner"] },
  { value: "sales_planner",        label: ROLE_LABELS["sales_planner"] },
  { value: "sap_project_manager",  label: ROLE_LABELS["sap_project_manager"] },
] as const;

/**
 * ROLE_VISIBLE_NAV — which sidebar nav items each role can SEE.
 * Keys: "home" | "c_layer" | "demand_plan" | "supply_requirements" | "reconciliation" |
 *       "demand_driven_placement" | "cop_report" | "processing_plan" |
 *       "broiler_intake" | "whole_carcass_balance" | "short_term_planning" |
 *       "breeding_cycle" | "step_1"…"step_7" | "saved_plans" | "product_bom"
 * "*" = see everything.
 */
export const ROLE_VISIBLE_NAV: Record<string, string[]> = {
  admin: ["*"],

  /** Sales Planner: demand side only */
  sales_planner: [
    "home",
    "demand_plan",        // M1
    "reconciliation",     // M3 – read-only view of supply vs demand
    "cop_report",         // M5
    "saved_plans",
    "c_layer",            // C.Layer — egg output view only (enforced by C_LAYER_ACCESS)
  ],

  /** Processing Planner: plant / cut-room modules + relevant pipeline steps */
  processing_planner: [
    "home",
    "processing_plan",        // PP
    "broiler_intake",         // BI
    "whole_carcass_balance",  // WC
    "step_3",                 // Carcass Yield
    "step_4",                 // Product Family
    "step_5",                 // Cut Plan
    "step_6",                 // Processing by Plant
    "product_bom",
    "cop_report",
    "saved_plans",
  ],

  /** Broiler Planner: live-bird / placement / farm modules */
  broiler_planner: [
    "home",
    "supply_requirements",        // M2
    "demand_driven_placement",    // M4
    "short_term_planning",        // ST
    "step_1",                     // Catching Plan
    "step_2",                     // Live Bird Forecast
    "step_7",                     // Farm Distribution
    "cop_report",
    "saved_plans",
  ],

  /** SAP PM: everything except admin panel (AdminOnly handles that) */
  sap_project_manager: ["*"],

  /** Layer Planner: C.Layer only — no broiler-chain modules. */
  layer_planner: ["c_layer"],
};

/**
 * C.Layer data-layer access, enforced by the /api/c-layer routes.
 * read_data         — raw placements, breeds, standards, farms, settings
 * write_placements  — create / edit / delete planned placements
 * write_master      — breeds, weekly standards, farms, settings
 * view_egg_output   — the computed egg-output report only
 */
export type CLayerAction = "read_data" | "write_placements" | "write_master" | "view_egg_output";

export const C_LAYER_ACCESS: Record<CLayerAction, string[]> = {
  read_data:        ["admin", "layer_planner", "sap_project_manager"],
  write_placements: ["admin", "layer_planner", "sap_project_manager"],
  write_master:     ["admin"],
  view_egg_output:  ["admin", "layer_planner", "sap_project_manager", "sales_planner"],
};

export function canCLayer(role: string, action: CLayerAction): boolean {
  return C_LAYER_ACCESS[action].includes(role);
}

/** Returns true if the given role can see this nav item in the sidebar. */
export function canViewNav(role: string, key: string): boolean {
  const allowed = ROLE_VISIBLE_NAV[role] ?? [];
  return allowed.includes("*") || allowed.includes(key);
}

/** Returns true if the given role has write access to the given module. */
export function canEdit(role: string, module: string): boolean {
  const modules = ROLE_MODULES[role] ?? [];
  return modules.includes("*") || modules.includes(module);
}

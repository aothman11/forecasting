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
    "short_term_planning", // ST: Short-Term Planning (shared)
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
};

/** Ordered list for dropdowns — admin first, then alphabetical. */
export const ROLE_OPTIONS = [
  { value: "admin",               label: ROLE_LABELS["admin"] },
  { value: "broiler_planner",     label: ROLE_LABELS["broiler_planner"] },
  { value: "processing_planner",  label: ROLE_LABELS["processing_planner"] },
  { value: "sales_planner",       label: ROLE_LABELS["sales_planner"] },
] as const;

/** Returns true if the given role has write access to the given module. */
export function canEdit(role: string, module: string): boolean {
  const modules = ROLE_MODULES[role] ?? [];
  return modules.includes("*") || modules.includes(module);
}

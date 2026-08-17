"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { canEdit } from "@/lib/role-permissions";

/**
 * Returns true if the currently logged-in user has write (edit) access
 * to the given module key (as defined in src/lib/role-permissions.ts).
 *
 * Usage:
 *   const canSave = useCanEdit("demand_plan");
 */
export function useCanEdit(module: string): boolean {
  const user = useAuth();
  if (!user) return false;
  return canEdit(user.role, module);
}

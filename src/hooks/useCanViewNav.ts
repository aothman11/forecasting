"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { canViewNav } from "@/lib/role-permissions";

/**
 * Returns true if the current user's role is allowed to see the given
 * sidebar nav item. Keys are defined in ROLE_VISIBLE_NAV (role-permissions.ts).
 *
 * Usage:
 *   const showBroilerSteps = useCanViewNav("step_1");
 */
export function useCanViewNav(key: string): boolean {
  const user = useAuth();
  if (!user) return false;
  return canViewNav(user.role, key);
}

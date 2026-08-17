"use client";

import { useAuth, type AuthUser } from "@/components/auth/AuthProvider";

/**
 * Returns the authenticated user's identity fields, or null if unauthenticated.
 * Use in client components:  const user = useCurrentUser()
 */
export function useCurrentUser(): AuthUser | null {
  return useAuth();
}

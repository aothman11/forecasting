"use client";

import { createContext, useContext } from "react";
import type { AuthUser } from "@/lib/dal";

/** The shape exposed by the auth context. null = unauthenticated. */
export type { AuthUser };

const AuthContext = createContext<AuthUser | null>(null);

/** Wrap the app in AuthProvider from a Server Component that passes the user down. */
export function AuthProvider({
  user,
  children,
}: {
  user: AuthUser | null;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

/** Low-level hook — returns the current user or null. */
export function useAuth(): AuthUser | null {
  return useContext(AuthContext);
}

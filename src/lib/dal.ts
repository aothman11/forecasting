/**
 * Data Access Layer — centralised session verification for Server Components.
 * Uses React cache() so multiple calls per render are de-duplicated.
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession } from "./session";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** Get the current user from the session cookie, or null if unauthenticated. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await getSession();
  if (!session) return null;
  return {
    id: session.userId,
    name: session.name,
    email: session.email,
    role: session.role,
  };
});

/** Require a valid session — redirects to /login if unauthenticated. */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require admin role — redirects to / if role is insufficient. */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== "admin") redirect("/");
  return user;
}

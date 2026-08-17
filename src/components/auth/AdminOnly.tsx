"use client";

import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Renders children ONLY if the current user is an admin.
 * Renders nothing (null) for any other role.
 *
 * Usage:
 *   <AdminOnly>
 *     <Link href="/admin/users">User Management</Link>
 *   </AdminOnly>
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const user = useAuth();
  if (!user || user.role !== "admin") return null;
  return <>{children}</>;
}

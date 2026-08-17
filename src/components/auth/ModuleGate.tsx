"use client";

import { useCanEdit } from "@/hooks/useCanEdit";

interface ModuleGateProps {
  /** The permission key for this module (from role-permissions.ts). */
  module: string;
  children: React.ReactNode;
  /**
   * Optional custom message shown in tooltip when read-only.
   * Defaults to a generic "read-only" message.
   */
  readOnlyMessage?: string;
}

/**
 * <ModuleGate module="demand_plan">
 *   <button>Save Plan</button>
 * </ModuleGate>
 *
 * If the current user's role does not have write access to `module`, wraps
 * children in a `pointer-events-none opacity-50` container — buttons, inputs,
 * and file uploads inside are fully disabled visually and functionally.
 *
 * Does NOT hide the children — all users can see all modules (read-only).
 */
export function ModuleGate({ module, children, readOnlyMessage }: ModuleGateProps) {
  const canEdit = useCanEdit(module);

  if (canEdit) return <>{children}</>;

  const tip =
    readOnlyMessage ??
    "Your role has read-only access to this module. Contact an admin to request edit permissions.";

  return (
    <span
      className="contents"
      title={tip}
      aria-label={tip}
      style={{ cursor: "not-allowed" }}
    >
      <span
        className="pointer-events-none opacity-40 select-none"
        aria-disabled="true"
        tabIndex={-1}
      >
        {children}
      </span>
    </span>
  );
}

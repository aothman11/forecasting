"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLE_OPTIONS, ROLE_LABELS } from "@/lib/role-permissions";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

// ── Role badge ──────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: "#047836",
    sales_planner: "#C49A1A",
    processing_planner: "#6b2fc4",
    broiler_planner: "#1a6fc4",
  };
  return (
    <span
      className="px-2 py-0.5 text-[10px] font-bold rounded-full text-white"
      style={{ background: colors[role] ?? "#6b7280" }}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

// ── Add / Edit modal ────────────────────────────────────────────────────────
interface ModalProps {
  user?: User;
  onClose: () => void;
  onSaved: (u: User) => void;
}

function UserModal({ user, onClose, onSaved }: ModalProps) {
  const isEdit = !!user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState(user?.role ?? "broiler_planner");
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEdit && !password) {
      setError("Password is required for new users.");
      return;
    }

    startTransition(async () => {
      const body: Record<string, unknown> = { name, email, role, active };
      if (isEdit) body.id = user!.id;
      if (password) body.plainPassword = password;

      const res = await fetch("/api/users", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "An error occurred."); return; }
      onSaved(data as User);
      onClose();
    });
  }

  const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-brand-green";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-neutral-800">
            {isEdit ? "Edit User" : "Add New User"}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} placeholder="Full name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} placeholder="user@awp.com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">
              {isEdit ? "New Password (leave blank to keep current)" : "Password"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isEdit}
              className={inputCls}
              placeholder={isEdit ? "••••••••  (optional)" : "••••••••"}
              autoComplete="new-password"
            />
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 accent-brand-green"
              />
              <label htmlFor="active" className="text-sm text-neutral-700">Active account</label>
            </div>
          )}
          {error && (
            <p className="text-xs text-brand-alert font-medium">⚠ {error}</p>
          )}
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition-colors"
              style={{ background: "#047836" }}
            >
              {pending ? "Saving…" : isEdit ? "Save Changes" : "Add User"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm font-semibold border border-neutral-300 text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main client component ────────────────────────────────────────────────────
export default function UsersClient({ initialUsers }: { initialUsers: User[] }) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [modal, setModal] = useState<"add" | User | null>(null);
  const [deletePending, startDelete] = useTransition();

  function upsert(updated: User) {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === updated.id);
      if (idx === -1) return [...prev, updated];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }

  function handleDeactivate(id: string) {
    if (!confirm("Deactivate this user? They will no longer be able to sign in.")) return;
    startDelete(async () => {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === id ? { ...u, active: false } : u))
        );
      }
    });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-brand-green-dark transition-colors"
            aria-label="Back to app"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to app
          </button>
          <div className="w-px h-5 bg-neutral-200" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold text-neutral-800">User Management</h1>
            <p className="text-xs text-neutral-500 mt-0.5">{users.length} users · Admin only</p>
          </div>
        </div>
        <button
          onClick={() => setModal("add")}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: "#047836" }}
        >
          + Add User
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[var(--border-subtle)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#eaf5ef" }}>
              {["Name", "Email", "Role", "Status", "Actions"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-brand-green-dark">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--border-subtle)] hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-800">{u.name}</td>
                <td className="px-4 py-3 text-neutral-600 text-xs font-mono">{u.email}</td>
                <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.active ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-400"}`}>
                    {u.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setModal(u)}
                      className="text-xs px-2.5 py-1 rounded border border-neutral-300 hover:border-brand-green hover:text-brand-green transition-colors"
                    >
                      Edit
                    </button>
                    {u.active && (
                      <button
                        onClick={() => handleDeactivate(u.id)}
                        disabled={deletePending}
                        className="text-xs px-2.5 py-1 rounded border border-neutral-300 hover:border-brand-alert hover:text-brand-alert transition-colors disabled:opacity-40"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <UserModal
          user={modal === "add" ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={upsert}
        />
      )}
    </>
  );
}

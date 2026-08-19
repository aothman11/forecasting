"use client";

/**
 * SavedPlansPanel — server-persisted plan browser.
 *
 * Fetches plan metadata from /api/plans, lets users save the current working
 * state, load a saved plan (with confirmation), rename, and soft-delete.
 */

import { useEffect, useRef, useState } from "react";
import { usePlanStore } from "@/lib/store";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { SavedPlanFull, SavedPlanMeta } from "@/lib/types";

// ── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── main component ───────────────────────────────────────────────────────────

export function SavedPlansPanel() {
  const collectPlanState = usePlanStore((s) => s.collectPlanState);
  const loadSavedPlan    = usePlanStore((s) => s.loadSavedPlan);
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";

  // ── list state ──────────────────────────────────────────────────────────
  const [plans,   setPlans]   = useState<SavedPlanMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);

  // ── save form ───────────────────────────────────────────────────────────
  const [saveOpen,   setSaveOpen]   = useState(false);
  const [saveName,   setSaveName]   = useState("");
  const [saveDesc,   setSaveDesc]   = useState("");
  const [saving,     setSaving]     = useState(false);
  const [saveErr,    setSaveErr]    = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // ── rename form ─────────────────────────────────────────────────────────
  const [renameId,   setRenameId]   = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameDesc, setRenameDesc] = useState("");
  const [renaming,   setRenaming]   = useState(false);

  // ── load confirmation ───────────────────────────────────────────────────
  const [loadTarget, setLoadTarget] = useState<SavedPlanMeta | null>(null);
  const [loadingId,  setLoadingId]  = useState<string | null>(null);
  const [loadErr,    setLoadErr]    = useState<string | null>(null);

  // ── delete confirmation ─────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<SavedPlanMeta | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // ── success toast ───────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // ── fetch list ──────────────────────────────────────────────────────────
  async function fetchPlans() {
    setLoading(true);
    setListErr(null);
    try {
      const res = await fetch("/api/plans");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setPlans(await res.json());
    } catch (e) {
      setListErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPlans(); }, []);

  // ── open save form ──────────────────────────────────────────────────────
  function openSave() {
    const today = new Date().toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
    setSaveName(`AWP COP Plan — ${today}`);
    setSaveDesc("");
    setSaveErr(null);
    setSaveOpen(true);
    setTimeout(() => nameRef.current?.select(), 50);
  }

  // ── save plan ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!saveName.trim()) { setSaveErr("Name is required."); return; }
    setSaving(true);
    setSaveErr(null);
    try {
      const state = collectPlanState();
      const res = await fetch("/api/plans", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: saveName.trim(), description: saveDesc.trim(), state }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `Server error ${res.status}`);
      }
      setSaveOpen(false);
      showToast("Plan saved ✓");
      fetchPlans();
    } catch (e) {
      setSaveErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── load plan ───────────────────────────────────────────────────────────
  async function handleLoad(plan: SavedPlanMeta) {
    setLoadingId(plan.id);
    setLoadErr(null);
    try {
      const res = await fetch(`/api/plans/${plan.id}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const full: SavedPlanFull = await res.json();
      loadSavedPlan(full.state);
      setLoadTarget(null);
      showToast(`"${plan.name}" loaded ✓`);
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoadingId(null);
    }
  }

  // ── rename ──────────────────────────────────────────────────────────────
  function openRename(plan: SavedPlanMeta) {
    setRenameId(plan.id);
    setRenameName(plan.name);
    setRenameDesc(plan.description);
  }

  async function handleRename() {
    if (!renameId) return;
    setRenaming(true);
    try {
      await fetch(`/api/plans/${renameId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: renameName.trim(), description: renameDesc.trim() }),
      });
      setRenameId(null);
      showToast("Renamed ✓");
      fetchPlans();
    } finally {
      setRenaming(false);
    }
  }

  // ── delete ──────────────────────────────────────────────────────────────
  async function handleDelete(plan: SavedPlanMeta) {
    setDeleting(true);
    try {
      await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      showToast(`"${plan.name}" deleted`);
      fetchPlans();
    } finally {
      setDeleting(false);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 relative">

      {/* ── toast ── */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-brand-green text-white text-xs font-medium px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* ── header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold section-title">Saved Plans</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Full plan snapshots — parameters, placement calendar, demand, farms, BOM, and all module state.
            Plans are stored on the server and shared across all users.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <a
              href="/api/plans/backup"
              download
              title="Download a complete backup of the plans database (admin only)"
              className="text-xs font-medium px-3 py-2 rounded-md border border-[var(--border-subtle)] text-neutral-600 hover:border-brand-green hover:text-brand-green transition-colors flex items-center gap-1.5"
            >
              ⬇ Download Backup
            </a>
          )}
          <button
            onClick={openSave}
            className="text-xs font-semibold px-4 py-2 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors flex items-center gap-2"
          >
            💾 Save Current Plan
          </button>
        </div>
      </div>

      {/* ── inline save form ── */}
      {saveOpen && (
        <div className="border border-brand-green rounded-xl p-5 bg-brand-green-tint space-y-3">
          <div className="text-sm font-semibold text-brand-green-dark">Save current plan snapshot</div>

          <div className="space-y-2">
            <label className="text-xs text-neutral-600 font-medium">Plan name <span className="text-brand-alert">*</span></label>
            <input
              ref={nameRef}
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setSaveOpen(false); }}
              placeholder="e.g. Aligned Plan Q4 2026"
              className="w-full border border-[var(--border-subtle)] rounded-md px-3 py-1.5 text-sm outline-none focus:border-brand-green"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-neutral-600 font-medium">Description (optional)</label>
            <input
              value={saveDesc}
              onChange={(e) => setSaveDesc(e.target.value)}
              placeholder="e.g. Scenario with elevated Q4 demand"
              className="w-full border border-[var(--border-subtle)] rounded-md px-3 py-1.5 text-sm outline-none focus:border-brand-green"
            />
          </div>

          {saveErr && <p className="text-xs text-brand-alert">{saveErr}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs font-semibold px-4 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setSaveOpen(false)}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border-subtle)] text-neutral-600 hover:border-brand-green transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── plan list ── */}
      {loading ? (
        <div className="text-sm text-neutral-400 text-center py-12">Loading plans…</div>
      ) : listErr ? (
        <div className="text-sm text-brand-alert text-center py-12">{listErr}</div>
      ) : plans.length === 0 ? (
        <div className="text-sm text-neutral-400 text-center py-12">
          No saved plans yet. Click <strong>Save Current Plan</strong> to create the first one.
        </div>
      ) : (
        <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-[var(--border-subtle)]">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider hidden md:table-cell">Saved By</th>
                <th className="text-left px-4 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider hidden lg:table-cell">Date</th>
                <th className="text-center px-4 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider w-8">v</th>
                <th className="text-right px-4 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-neutral-50 transition-colors group">
                  <td className="px-4 py-3">
                    {renameId === plan.id ? (
                      <div className="space-y-1.5">
                        <input
                          autoFocus
                          value={renameName}
                          onChange={(e) => setRenameName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenameId(null); }}
                          className="w-full border border-brand-green rounded px-2 py-1 text-sm outline-none"
                        />
                        <input
                          value={renameDesc}
                          onChange={(e) => setRenameDesc(e.target.value)}
                          placeholder="Description (optional)"
                          className="w-full border border-[var(--border-subtle)] rounded px-2 py-1 text-xs outline-none focus:border-brand-green"
                        />
                        <div className="flex gap-2">
                          <button onClick={handleRename} disabled={renaming} className="text-xs font-semibold text-brand-green-dark">
                            {renaming ? "…" : "Save"}
                          </button>
                          <button onClick={() => setRenameId(null)} className="text-xs text-neutral-400">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium text-neutral-800">{plan.name}</div>
                        {plan.description && (
                          <div className="text-xs text-neutral-400 mt-0.5">{plan.description}</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 text-xs hidden md:table-cell whitespace-nowrap">{plan.savedBy}</td>
                  <td className="px-4 py-3 text-neutral-400 text-xs hidden lg:table-cell whitespace-nowrap">{fmtDate(plan.savedAt)}</td>
                  <td className="px-4 py-3 text-center text-xs text-neutral-400">v{plan.version}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Load */}
                      <button
                        onClick={() => setLoadTarget(plan)}
                        disabled={loadingId === plan.id}
                        title="Load this plan into the working state"
                        className="text-xs font-semibold px-2.5 py-1 rounded bg-brand-green-tint text-brand-green-dark hover:bg-brand-green hover:text-white transition-colors disabled:opacity-40"
                      >
                        {loadingId === plan.id ? "…" : "Load"}
                      </button>
                      {/* Rename */}
                      <button
                        onClick={() => openRename(plan)}
                        title="Rename"
                        className="text-xs px-2 py-1 rounded text-neutral-500 hover:text-brand-green hover:bg-neutral-100 transition-colors"
                      >
                        ✎
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => setDeleteTarget(plan)}
                        title="Delete"
                        className="text-xs px-2 py-1 rounded text-neutral-400 hover:text-brand-alert hover:bg-red-50 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Load confirmation dialog ── */}
      {loadTarget && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-base font-bold text-neutral-800">Load Plan</h2>
            <p className="text-sm text-neutral-600">
              Loading <strong>&ldquo;{loadTarget.name}&rdquo;</strong> will replace your current working
              state (parameters, placement, demand, and all module data).
              This cannot be undone — save your current work first if you need it.
            </p>
            {loadErr && <p className="text-xs text-brand-alert">{loadErr}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setLoadTarget(null); setLoadErr(null); }}
                className="text-xs font-medium px-4 py-2 rounded-md border border-[var(--border-subtle)] text-neutral-600 hover:border-brand-green transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleLoad(loadTarget)}
                disabled={loadingId === loadTarget.id}
                className="text-xs font-semibold px-4 py-2 rounded-md bg-brand-green text-white hover:bg-brand-green-dark disabled:opacity-50 transition-colors"
              >
                {loadingId === loadTarget.id ? "Loading…" : "Load Plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation dialog ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-base font-bold text-neutral-800">Delete Plan</h2>
            <p className="text-sm text-neutral-600">
              Are you sure you want to delete <strong>&ldquo;{deleteTarget.name}&rdquo;</strong>?
              This will soft-delete the plan — it can be restored by an admin if needed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-xs font-medium px-4 py-2 rounded-md border border-[var(--border-subtle)] text-neutral-600 hover:border-brand-green transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                disabled={deleting}
                className="text-xs font-semibold px-4 py-2 rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

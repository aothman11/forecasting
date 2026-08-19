"use client";

import { useRef, useState } from "react";
import { usePlanStore } from "@/lib/store";

/**
 * Header-level "Save Plan" button.
 * Collects the full working state and POSTs it to /api/plans so the plan is
 * persisted server-side.  The in-session Scenario Compare snapshots are
 * unaffected — they serve a different purpose (quick metric comparison).
 */
export function SavePlanButton() {
  const collectPlanState = usePlanStore((s) => s.collectPlanState);
  const setSavedPlansOpen = usePlanStore((s) => s.setSavedPlansOpen);
  const setCompareOpen    = usePlanStore((s) => s.setCompareOpen);
  const setDemandOpen     = usePlanStore((s) => s.setDemandOpen);
  const setSupplyOpen     = usePlanStore((s) => s.setSupplyOpen);
  const setReconcileOpen  = usePlanStore((s) => s.setReconcileOpen);
  const setDdpOpen        = usePlanStore((s) => s.setDdpOpen);
  const setReportOpen     = usePlanStore((s) => s.setReportOpen);
  const setHomeOpen       = usePlanStore((s) => s.setHomeOpen);
  const setBomOpen        = usePlanStore((s) => s.setBomOpen);

  const [open,    setOpen]    = useState(false);
  const [label,   setLabel]   = useState("");
  const [desc,    setDesc]    = useState("");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [err,     setErr]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpen() {
    const today = new Date().toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
    setLabel(`AWP COP Plan — ${today}`);
    setDesc("");
    setErr(null);
    setOpen(true);
    setTimeout(() => inputRef.current?.select(), 50);
  }

  async function handleSave() {
    if (!label.trim()) { setErr("Name is required."); return; }
    setSaving(true);
    setErr(null);
    try {
      const state = collectPlanState();
      const res = await fetch("/api/plans", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: label.trim(), description: desc.trim(), state }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      setOpen(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function openSavedPlansPanel() {
    // Close other panels, open Saved Plans
    setCompareOpen(false); setDemandOpen(false); setSupplyOpen(false);
    setReconcileOpen(false); setDdpOpen(false); setReportOpen(false);
    setBomOpen(false); setHomeOpen(false);
    setSavedPlansOpen(true);
  }

  return (
    <div className="relative flex items-center gap-1">
      {!open && (
        <button
          onClick={handleOpen}
          title="Save a full snapshot of the current plan to the server"
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1.5 ${
            saved
              ? "border-brand-green bg-brand-green-tint text-brand-green-dark"
              : "border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green text-neutral-600"
          }`}
        >
          {saved ? <>✓ Saved</> : <>💾 Save Plan</>}
        </button>
      )}

      {/* Quick-access to the Saved Plans panel */}
      {!open && (
        <button
          onClick={openSavedPlansPanel}
          title="Open Saved Plans"
          className="text-xs text-neutral-400 hover:text-brand-green transition-colors px-1"
        >
          ↗
        </button>
      )}

      {/* Inline save form */}
      {open && (
        <div className="absolute right-0 top-8 z-30 bg-white border border-brand-green rounded-xl shadow-lg p-4 w-80 space-y-3">
          <div className="text-xs font-semibold text-brand-green-dark">Save plan to server</div>

          <div>
            <input
              ref={inputRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setOpen(false); }}
              placeholder="Plan name…"
              className="w-full text-xs border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 outline-none focus:border-brand-green"
            />
          </div>
          <div>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full text-xs border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 outline-none focus:border-brand-green"
            />
          </div>

          {err && <p className="text-xs text-brand-alert">{err}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-xs px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] text-neutral-500 hover:border-brand-green"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

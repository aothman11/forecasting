"use client";

import { useMemo, useRef, useState } from "react";
import { cLayerApi, errorLines } from "@/lib/cLayer/api";
import { isoWeekLabel, mondayOf } from "@/lib/cLayer/calc";
import { exportPlacements, parsePlacementsFile } from "@/lib/cLayer/excel";
import type { LayerPlacement } from "@/lib/cLayer/types";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, KpiRow, Notice, btn, btnDanger, btnMuted, btnPrimary, btnText, fmtInt, input, label, todayIso } from "../ui";

interface Draft {
  id?: string;
  weekDate: string;
  chicks: string;
  breedId: string;
  farmId: string;
  endOfLay: string;
  notes: string;
}

const emptyDraft = (): Draft => ({ weekDate: mondayOf(todayIso()), chicks: "", breedId: "", farmId: "", endOfLay: "", notes: "" });

export function PlacementsView({ data, projections, reload, canWritePlacements }: CLayerViewProps) {
  const { breeds, farms, placements, standards } = data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "warn"; lines: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const breedById = useMemo(() => new Map(breeds.map((b) => [b.id, b])), [breeds]);
  const farmById = useMemo(() => new Map(farms.map((f) => [f.id, f])), [farms]);
  const projById = useMemo(() => new Map(projections.map((p) => [p.placementId, p])), [projections]);

  const today = todayIso();
  const totalChicks = placements.reduce((s, p) => s + p.chicks, 0);
  const upcoming = placements.filter((p) => p.placementWeekStart >= mondayOf(today));
  const unprojected = projections.filter((p) => p.weeks.length === 0).length;
  const setupMissing = [
    !breeds.some((b) => b.active) && "no active breed",
    !farms.some((f) => f.active) && "no active farm",
  ].filter(Boolean) as string[];

  const startEdit = (p: LayerPlacement) => {
    setFormErrors([]);
    setDraft({
      id: p.id,
      weekDate: p.placementWeekStart,
      chicks: String(p.chicks),
      breedId: p.breedId,
      farmId: p.farmId,
      endOfLay: p.endOfLayWeek === null ? "" : String(p.endOfLayWeek),
      notes: p.notes,
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setFormErrors([]);
    const body = {
      placementWeekStart: draft.weekDate ? mondayOf(draft.weekDate) : "",
      chicks: Number(draft.chicks),
      breedId: draft.breedId,
      farmId: draft.farmId,
      endOfLayWeek: draft.endOfLay.trim() === "" ? null : Number(draft.endOfLay),
      notes: draft.notes,
    };
    try {
      if (draft.id) await cLayerApi("PATCH", `/placements/${draft.id}`, body);
      else await cLayerApi("POST", "/placements", body);
      setMessage({ tone: "ok", lines: [draft.id ? "Placement updated." : "Placement added."] });
      setDraft(null);
      reload();
    } catch (err) {
      setFormErrors(errorLines(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await cLayerApi("DELETE", `/placements/${id}`);
      setConfirmId(null);
      setMessage({ tone: "ok", lines: ["Placement deleted."] });
      reload();
    } catch (err) {
      setMessage({ tone: "error", lines: errorLines(err) });
    }
  };

  const upload = async (file: File) => {
    setMessage(null);
    try {
      const parsed = parsePlacementsFile(await file.arrayBuffer(), breeds, farms);
      if (parsed.errors.length) {
        setMessage({ tone: "error", lines: ["Nothing was imported. Fix these rows and upload again:", ...parsed.errors] });
        return;
      }
      const res = await cLayerApi<{ created: number; updated: number }>("POST", "/placements/import", { rows: parsed.rows });
      setMessage({
        tone: parsed.notes.length ? "warn" : "ok",
        lines: [`Imported ${file.name}: ${res.created} added, ${res.updated} updated.`, ...parsed.notes],
      });
      reload();
    } catch (err) {
      setMessage({ tone: "error", lines: ["Nothing was imported:", ...errorLines(err)] });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const sorted = [...placements].sort((a, b) => a.placementWeekStart.localeCompare(b.placementWeekStart));
  const draftStdLen = draft?.breedId ? standards[draft.breedId]?.length ?? 0 : 0;

  return (
    <div className="flex flex-col gap-5">
      <KpiRow
        items={[
          { label: "Planned placements", value: String(placements.length), tone: "green" },
          { label: "Total chicks", value: fmtInt(totalChicks), tone: "gold" },
          { label: "Upcoming placements", value: String(upcoming.length), sub: `from ${isoWeekLabel(mondayOf(today))}` },
          {
            label: "Not projectable",
            value: String(unprojected),
            sub: "breed has no weekly standard",
            tone: unprojected ? "alert" : "neutral",
          },
        ]}
      />

      {setupMissing.length > 0 && (
        <Notice lines={[`Set-up needed before placements can be added: ${setupMissing.join(" and ")}. An Admin adds breeds, weekly standards and farms in Standards & Settings.`]} />
      )}
      {message && <Notice tone={message.tone} lines={message.lines} />}

      {draft && (
        <Card title={draft.id ? "Edit placement" : "Add placement"} subtitle="The placement week is the anchor; any date picks its ISO week (Monday start).">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <label className="flex flex-col gap-1">
              <span className={label}>Placement week</span>
              <input type="date" className={input} value={draft.weekDate} onChange={(e) => setDraft({ ...draft, weekDate: e.target.value })} />
              {draft.weekDate && <span className="text-[11px] text-neutral-500">{isoWeekLabel(mondayOf(draft.weekDate))} · Mon {mondayOf(draft.weekDate)}</span>}
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Chicks</span>
              <input type="number" min={1} step={1} className={input} value={draft.chicks} onChange={(e) => setDraft({ ...draft, chicks: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Breed</span>
              <select className={input} value={draft.breedId} onChange={(e) => setDraft({ ...draft, breedId: e.target.value })}>
                <option value="">Select…</option>
                {breeds.filter((b) => b.active || b.id === draft.breedId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Farm</span>
              <select className={input} value={draft.farmId} onChange={(e) => setDraft({ ...draft, farmId: e.target.value })}>
                <option value="">Select…</option>
                {farms.filter((f) => f.active || f.id === draft.farmId).map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>End of lay (age week)</span>
              <input
                type="number"
                min={1}
                step={1}
                className={input}
                placeholder={draftStdLen ? `Breed default: ${draftStdLen}` : "Breed default"}
                value={draft.endOfLay}
                onChange={(e) => setDraft({ ...draft, endOfLay: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Notes</span>
              <input className={input} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
          </div>
          {formErrors.length > 0 && <div className="mt-3"><Notice tone="error" lines={formErrors} /></div>}
          <div className="flex gap-2 mt-4">
            <button className={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : draft.id ? "Save changes" : "Add placement"}</button>
            <button className={btn} onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
          </div>
        </Card>
      )}

      <Card
        title="Planned placements"
        subtitle="One row per planned flock. Projections use the breed's weekly standard."
        actions={
          <>
            {canWritePlacements && !draft && (
              <button className={btnPrimary} onClick={() => { setFormErrors([]); setDraft(emptyDraft()); }} disabled={setupMissing.length > 0}>
                + Add placement
              </button>
            )}
            <button className={btn} onClick={() => exportPlacements(sorted, breeds, farms)}>
              {placements.length ? "Download Excel" : "Download template"}
            </button>
            {canWritePlacements && (
              <>
                <button className={btn} onClick={() => fileRef.current?.click()}>Upload Excel</button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
              </>
            )}
          </>
        }
      >
        {sorted.length === 0 ? (
          <p className="text-sm text-neutral-500 py-6 text-center">No planned placements yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-grid text-sm">
              <thead>
                <tr>
                  <th className="text-left">Placement week</th>
                  <th className="text-right">Chicks</th>
                  <th className="text-left">Breed</th>
                  <th className="text-left">Farm</th>
                  <th className="text-right">First lay</th>
                  <th className="text-right">End of lay</th>
                  <th className="text-right">Spent hens</th>
                  <th className="text-left">Notes</th>
                  <th className="text-left">Last change</th>
                  {canWritePlacements && <th />}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const proj = projById.get(p.id);
                  const breed = breedById.get(p.breedId);
                  const farm = farmById.get(p.farmId);
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="font-medium">{isoWeekLabel(p.placementWeekStart)}</div>
                        <div className="text-[11px] text-neutral-500">Mon {p.placementWeekStart}</div>
                      </td>
                      <td className="text-right tabular-nums">{fmtInt(p.chicks)}</td>
                      <td>{breed?.name ?? "—"}{breed && !breed.active && <span className="ml-1 text-[10px] text-neutral-400">(inactive)</span>}</td>
                      <td>{farm ? `${farm.code} · ${farm.name}` : "—"}</td>
                      <td className="text-right tabular-nums">{proj?.firstLayAgeWeek ? `wk ${proj.firstLayAgeWeek}` : "—"}</td>
                      <td className="text-right tabular-nums">
                        {proj?.endOfLayWeek ? `wk ${proj.endOfLayWeek}` : "—"}
                        {p.endOfLayWeek === null && proj?.endOfLayWeek ? <span className="block text-[10px] text-neutral-400">breed default</span> : null}
                      </td>
                      <td className="text-right tabular-nums">
                        {proj?.spentHensWeekStart ? (
                          <>
                            {fmtInt(proj.spentHens)}
                            <span className="block text-[10px] text-neutral-400">{isoWeekLabel(proj.spentHensWeekStart)}</span>
                          </>
                        ) : "—"}
                      </td>
                      <td className="max-w-[220px] truncate" title={p.notes}>
                        {proj?.warnings.length ? <span className="text-brand-alert mr-1" title={proj.warnings.join(" ")}>⚠</span> : null}
                        {p.notes}
                      </td>
                      <td className="text-[11px] text-neutral-500">{p.updatedBy}<br />{p.updatedAt.slice(0, 10)}</td>
                      {canWritePlacements && (
                        <td className="text-right whitespace-nowrap">
                          {confirmId === p.id ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-xs text-neutral-600">Delete?</span>
                              <button className={btnDanger} onClick={() => remove(p.id)}>Yes</button>
                              <button className={btnMuted} onClick={() => setConfirmId(null)}>No</button>
                            </span>
                          ) : (
                            <>
                              <button className={btnText} onClick={() => startEdit(p)}>Edit</button>
                              <button className={btnDanger} onClick={() => setConfirmId(p.id)}>Delete</button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { cLayerApi, errorLines } from "@/lib/cLayer/api";
import { farmOverlaps, isoWeekLabel, mondayOf, nextFlockNumber } from "@/lib/cLayer/calc";
import { exportPlacements, parsePlacementsFile } from "@/lib/cLayer/excel";
import type { LayerPlacement } from "@/lib/cLayer/types";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, KpiRow, Notice, btn, btnDanger, btnMuted, btnPrimary, btnText, fmtInt, input, label, todayIso } from "../ui";

interface Draft {
  id?: string;
  flockNo: string;
  weekDate: string;
  chicks: string;
  breedId: string;
  rearingFarmId: string;
  rearingHouses: string;
  layingFarmId: string;
  layingHouses: string;
  transferAge: string;
  depletionAge: string;
  notes: string;
}

const emptyDraft = (): Draft => ({
  flockNo: "",
  weekDate: mondayOf(todayIso()),
  chicks: "",
  breedId: "",
  rearingFarmId: "",
  rearingHouses: "",
  layingFarmId: "",
  layingHouses: "",
  transferAge: "",
  depletionAge: "",
  notes: "",
});

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const str = (n: number | null) => (n === null ? "" : String(n));

export function PlacementsView({ data, projections, prepPlans, reload, canWritePlacements }: CLayerViewProps) {
  const { breeds, farms, placements } = data;
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
    !farms.some((f) => f.active && f.plant === "1260") && "no active rearing farm (plant 1260)",
    !farms.some((f) => f.active && f.plant === "1250") && "no active laying farm (plant 1250)",
  ].filter(Boolean) as string[];
  const { defaultTransferAge, defaultDepletionAge } = data.settings;

  const startEdit = (p: LayerPlacement) => {
    setFormErrors([]);
    setDraft({
      id: p.id,
      flockNo: str(p.flockNo),
      weekDate: p.placementWeekStart,
      chicks: String(p.chicks),
      breedId: p.breedId,
      rearingFarmId: p.rearingFarmId,
      rearingHouses: str(p.rearingHouses),
      layingFarmId: p.layingFarmId,
      layingHouses: str(p.layingHouses),
      transferAge: str(p.transferAgeWeek),
      depletionAge: str(p.depletionAgeWeek),
      notes: p.notes,
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setFormErrors([]);
    const body = {
      flockNo: numOrNull(draft.flockNo),
      placementWeekStart: draft.weekDate ? mondayOf(draft.weekDate) : "",
      chicks: Number(draft.chicks),
      breedId: draft.breedId,
      rearingFarmId: draft.rearingFarmId,
      rearingHouses: numOrNull(draft.rearingHouses),
      layingFarmId: draft.layingFarmId,
      layingHouses: numOrNull(draft.layingHouses),
      transferAgeWeek: numOrNull(draft.transferAge),
      depletionAgeWeek: numOrNull(draft.depletionAge),
      notes: draft.notes,
    };
    try {
      if (draft.id) await cLayerApi("PATCH", `/placements/${draft.id}`, body);
      else await cLayerApi("POST", "/placements", body);
      setMessage({ tone: "ok", lines: [draft.id ? "Flock updated." : "Flock added."] });
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
      setMessage({ tone: "ok", lines: ["Flock deleted."] });
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
  const farmOptions = (plant: "1260" | "1250", currentId: string) =>
    farms.filter((f) => f.plant === plant && (f.active || f.id === currentId));

  const overlaps = useMemo(
    () => farmOverlaps(placements, projections, Object.fromEntries(farms.map((f) => [f.id, f.houses])), prepPlans),
    [placements, projections, farms, prepPlans],
  );
  const overlapIds = new Set(overlaps.flatMap((o) => o.placementIds));
  const nextNo = nextFlockNumber(placements.map((p) => p.flockNo));
  const flockLabel = (id: string) => {
    const p = placements.find((x) => x.id === id);
    return p?.flockNo ? `${p.flockNo}` : p ? isoWeekLabel(p.placementWeekStart) : id;
  };
  const overlapLines = overlaps.map((o) => {
    const farm = farmById.get(o.farmId);
    const houses = farm?.houses ? ` (${farm.houses} houses)` : "";
    if (o.kind === "preparation") {
      return `${farm?.code ?? "?"} · ${farm?.plant ?? ""}: flock ${flockLabel(o.placementIds[1])} arrives while the house is still being prepared after flock ${flockLabel(o.placementIds[0])} (${isoWeekLabel(o.fromWeek)} to ${isoWeekLabel(o.toWeek)}). Move it to the farm's free-from week or later.`;
    }
    return `${farm?.code ?? "?"} · ${farm?.plant ?? ""}${houses}: flock ${flockLabel(o.placementIds[0])} and flock ${flockLabel(o.placementIds[1])} are both on this farm from ${isoWeekLabel(o.fromWeek)} to ${isoWeekLabel(o.toWeek)}.`;
  });
  const missing = [...new Set(projections.flatMap((p) => p.missingSettings))];
  const farmTag = (id: string, houses: number | null) => {
    const f = farmById.get(id);
    return (
      <span className="whitespace-nowrap">
        <span className="font-medium">{f?.code ?? "—"}</span>
        <span className="text-[10px] text-neutral-400"> · {f?.plant ?? "?"}</span>
        {houses ? <span className="text-[11px] text-neutral-500"> · {houses} h</span> : null}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <KpiRow
        items={[
          { label: "Planned flocks", value: String(placements.length), tone: "green" },
          { label: "Total DOC", value: fmtInt(totalChicks), tone: "gold" },
          { label: "Upcoming placements", value: String(upcoming.length), sub: `from ${isoWeekLabel(mondayOf(today))}` },
          {
            label: "Farm overlaps",
            value: String(overlaps.length),
            sub: unprojected ? `${unprojected} flock(s) without a breed standard` : "same farm, same weeks",
            tone: overlaps.length || unprojected ? "alert" : "neutral",
          },
        ]}
      />

      {setupMissing.length > 0 && (
        <Notice lines={[`Set-up needed before flocks can be added: ${setupMissing.join(", ")}. An Admin adds breeds, weekly standards and farms in Standards & Settings.`]} />
      )}
      {missing.length > 0 && (
        <Notice lines={[`Missing setting: ${missing.join(", ")}. Weeks and quantities that depend on it are blank until an Admin sets it (or each flock sets its own value).`]} />
      )}
      {overlapLines.length > 0 && <Notice tone="warn" lines={["Farm overlap — check the house assignment and the house preparation period:", ...overlapLines]} />}
      {message && <Notice tone={message.tone} lines={message.lines} />}

      {draft && (
        <Card title={draft.id ? "Edit flock" : "Add flock"} subtitle="The DOC placement week is the anchor; any date picks its ISO week (Monday start). Rearing in plant 1260, laying in plant 1250 from the transfer week.">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <label className="flex flex-col gap-1">
              <span className={label}>Flock no.</span>
              <input
                type="number"
                min={1}
                step={1}
                className={input}
                placeholder={draft.id ? "keep current" : `Next: ${nextNo}`}
                value={draft.flockNo}
                onChange={(e) => setDraft({ ...draft, flockNo: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Placement week</span>
              <input type="date" className={input} value={draft.weekDate} onChange={(e) => setDraft({ ...draft, weekDate: e.target.value })} />
              {draft.weekDate && <span className="text-[11px] text-neutral-500">{isoWeekLabel(mondayOf(draft.weekDate))} · Mon {mondayOf(draft.weekDate)}</span>}
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>DOC chicks</span>
              <input type="number" min={1} step={1} className={input} value={draft.chicks} onChange={(e) => setDraft({ ...draft, chicks: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Breed</span>
              <select className={input} value={draft.breedId} onChange={(e) => setDraft({ ...draft, breedId: e.target.value })}>
                <option value="">Select…</option>
                {breeds.filter((b) => b.active || b.id === draft.breedId).map((b) => <option key={b.id} value={b.id}>{b.name} · {b.eggMaterialNo}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Rearing farm · 1260</span>
              <select className={input} value={draft.rearingFarmId} onChange={(e) => setDraft({ ...draft, rearingFarmId: e.target.value })}>
                <option value="">Select…</option>
                {farmOptions("1260", draft.rearingFarmId).map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Rearing houses</span>
              <input type="number" min={1} step={1} className={input} placeholder="optional" value={draft.rearingHouses} onChange={(e) => setDraft({ ...draft, rearingHouses: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Laying farm · 1250</span>
              <select className={input} value={draft.layingFarmId} onChange={(e) => setDraft({ ...draft, layingFarmId: e.target.value })}>
                <option value="">Select…</option>
                {farmOptions("1250", draft.layingFarmId).map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Laying houses</span>
              <input type="number" min={1} step={1} className={input} placeholder="optional" value={draft.layingHouses} onChange={(e) => setDraft({ ...draft, layingHouses: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Transfer age (wk)</span>
              <input type="number" min={10} max={25} step={1} className={input} placeholder={defaultTransferAge ? `Default: ${defaultTransferAge}` : "Default not set"} value={draft.transferAge} onChange={(e) => setDraft({ ...draft, transferAge: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Depletion age (79–100)</span>
              <input
                type="number"
                min={79}
                max={100}
                step={1}
                className={input}
                placeholder={defaultDepletionAge ? `Default: ${defaultDepletionAge}` : "Default not set"}
                value={draft.depletionAge}
                onChange={(e) => setDraft({ ...draft, depletionAge: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Notes</span>
              <input className={input} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
          </div>
          {formErrors.length > 0 && <div className="mt-3"><Notice tone="error" lines={formErrors} /></div>}
          <div className="flex gap-2 mt-4">
            <button className={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : draft.id ? "Save changes" : "Add flock"}</button>
            <button className={btn} onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
          </div>
        </Card>
      )}

      <Card
        title="Flock plan"
        subtitle="One row per planned DOC placement. Transfer and depletion weeks are projected from the ages and the breed standard."
        actions={
          <>
            {canWritePlacements && !draft && (
              <button className={btnPrimary} onClick={() => { setFormErrors([]); setDraft(emptyDraft()); }} disabled={setupMissing.length > 0}>
                + Add flock
              </button>
            )}
            <button className={btn} onClick={() => exportPlacements(sorted, breeds, farms, projById)}>
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
          <p className="text-sm text-neutral-500 py-6 text-center">No planned flocks yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-grid text-sm">
              <thead>
                <tr>
                  <th className="text-right">Flock</th>
                  <th className="text-left">Placement week</th>
                  <th className="text-right">DOC</th>
                  <th className="text-left">Breed · egg mat.</th>
                  <th className="text-left">Rearing</th>
                  <th className="text-left">Transfer 1260 → 1250</th>
                  <th className="text-left">Laying</th>
                  <th className="text-right">First lay</th>
                  <th className="text-left">Depletion</th>
                  <th className="text-left">Notes</th>
                  <th className="text-left">Last change</th>
                  {canWritePlacements && <th />}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const proj = projById.get(p.id);
                  const breed = breedById.get(p.breedId);
                  const notSet = <span className="text-brand-alert">not set</span>;
                  const isDefault = <span className="text-[10px] text-neutral-400"> · default</span>;
                  const issues = [...(proj?.warnings ?? []), ...(overlapIds.has(p.id) ? ["Shares a farm with another flock, or arrives during house preparation."] : [])];
                  return (
                    <tr key={p.id} className={overlapIds.has(p.id) ? "bg-amber-50" : undefined}>
                      <td className="text-right tabular-nums font-semibold">{p.flockNo ?? "—"}</td>
                      <td>
                        <div className="font-medium">{isoWeekLabel(p.placementWeekStart)}</div>
                        <div className="text-[11px] text-neutral-500">Mon {p.placementWeekStart}</div>
                      </td>
                      <td className="text-right tabular-nums">{fmtInt(p.chicks)}</td>
                      <td>
                        {breed?.name ?? "—"}
                        <span className="text-[11px] text-neutral-500"> · {breed?.eggMaterialNo || "—"}</span>
                        {breed && !breed.active && <span className="ml-1 text-[10px] text-neutral-400">(inactive)</span>}
                      </td>
                      <td>{farmTag(p.rearingFarmId, p.rearingHouses)}</td>
                      <td className="tabular-nums">
                        {proj?.transferWeekStart ? (
                          <>
                            <div>{isoWeekLabel(proj.transferWeekStart)}<span className="text-[11px] text-neutral-500"> · wk {proj.transferAge}</span>{p.transferAgeWeek === null && isDefault}</div>
                            <div className="text-[11px] text-neutral-500">{fmtInt(proj.transferBirds ?? 0)} pullets</div>
                          </>
                        ) : (p.transferAgeWeek ?? defaultTransferAge) ? "—" : notSet}
                      </td>
                      <td>{farmTag(p.layingFarmId, p.layingHouses)}</td>
                      <td className="text-right tabular-nums">{proj?.firstLayAgeWeek ? `wk ${proj.firstLayAgeWeek}` : "—"}</td>
                      <td className="tabular-nums">
                        {proj?.depletionWeekStart ? (
                          <>
                            <div>wk {proj.depletionAge}{p.depletionAgeWeek === null && isDefault}</div>
                            <div className="text-[11px] text-neutral-500">{fmtInt(proj.spentHens ?? 0)} leave {isoWeekLabel(proj.depletionWeekStart)}</div>
                          </>
                        ) : (p.depletionAgeWeek ?? defaultDepletionAge) ? "—" : notSet}
                      </td>
                      <td className="max-w-[220px] truncate" title={[p.notes, ...issues].filter(Boolean).join("\n")}>
                        {issues.length ? <span className="text-brand-alert mr-1" aria-label="Warning">⚠</span> : null}
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

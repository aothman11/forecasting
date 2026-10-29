"use client";

import { useRef, useState } from "react";
import { cLayerApi, errorLines } from "@/lib/cLayer/api";
import { FEED_STAGE_WEEK_OFFSET, breedStandardNotes, firstLayAgeWeek } from "@/lib/cLayer/calc";
import { exportStandards, parseStandardsFile } from "@/lib/cLayer/excel";
import {
  GRADED_MATERIALS,
  LAYER_PLANTS,
  type LayerBreed,
  type LayerFarm,
  type LayerFeedStage,
  type LayerPlant,
  type LayerSettingsInput,
  type LayerSku,
} from "@/lib/cLayer/types";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, Notice, btn, btnDanger, btnMuted, btnPrimary, btnText, fmtDec, input, label } from "../ui";

type Msg = { tone: "ok" | "error" | "warn"; lines: string[] } | null;

type EditableSettingKey = keyof LayerSettingsInput;

const SETTING_FIELDS: { key: EditableSettingKey; label: string; unit: string; step: number }[] = [
  { key: "prToPoDays", label: "PR → PO lead time", unit: "days", step: 1 },
  { key: "poToDeliveryDays", label: "PO → DOC delivery lead time", unit: "days", step: 1 },
  { key: "defaultTransferAge", label: "Default transfer age (1260 → 1250)", unit: "age wk", step: 1 },
  { key: "defaultDepletionAge", label: "Default depletion age (79–100)", unit: "age wk", step: 1 },
  { key: "rejectPct", label: "Reject % at grading", unit: "%", step: 0.1 },
  { key: "gradeTablePct", label: "Graded → 90001 table egg", unit: "%", step: 0.1 },
  { key: "gradeCPct", label: "Graded → 90002 Grade C", unit: "%", step: 0.1 },
];

export function StandardsSettingsView({ data, reload, canWriteMaster }: CLayerViewProps) {
  return (
    <div className="flex flex-col gap-5">
      {!canWriteMaster && <Notice tone="info" lines={["View only — breeds, weekly standards, farms and settings are maintained by an Admin."]} />}
      {/* Remount when the saved settings change so the form never holds values older than the server's. */}
      <SettingsCard key={data.settings.updatedAt ?? "unsaved"} data={data} reload={reload} canEdit={canWriteMaster} />
      <BreedsCard data={data} reload={reload} canEdit={canWriteMaster} />
      <FarmsCard farms={data.farms} reload={reload} canEdit={canWriteMaster} />
      <FeedStagesCard key={JSON.stringify(data.feedStages)} stages={data.feedStages} reload={reload} canEdit={canWriteMaster} />
      <SkusCard key={JSON.stringify(data.skus)} skus={data.skus} reload={reload} canEdit={canWriteMaster} />
    </div>
  );
}

function SettingsCard({ data, reload, canEdit }: { data: CLayerViewProps["data"]; reload: () => void; canEdit: boolean }) {
  const keys = SETTING_FIELDS.map((f) => f.key);
  const [draft, setDraft] = useState<Record<EditableSettingKey, string>>(() =>
    Object.fromEntries(keys.map((k) => [k, data.settings[k] === null ? "" : String(data.settings[k])])) as Record<EditableSettingKey, string>,
  );
  const [msg, setMsg] = useState<Msg>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const body = Object.fromEntries(keys.map((k) => [k, draft[k].trim() === "" ? null : Number(draft[k])]));
      await cLayerApi("PUT", "/settings", body);
      setMsg({ tone: "ok", lines: ["Settings saved."] });
      reload();
    } catch (err) {
      setMsg({ tone: "error", lines: errorLines(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Settings"
      subtitle="No defaults: outputs that need a missing value stay blank with a warning."
      actions={canEdit && <button className={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SETTING_FIELDS.map(({ key: k, label: text, unit, step }) => (
          <label key={k} className="flex flex-col gap-1">
            <span className={label}>{text}</span>
            {canEdit ? (
              <div className="flex items-center gap-2">
                <input type="number" min={0} step={step} className={`${input} w-28`} value={draft[k]} placeholder="not set" onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                <span className="text-xs text-neutral-500">{unit}</span>
              </div>
            ) : (
              <span className="text-sm font-semibold">
                {data.settings[k] === null ? <span className="text-brand-alert">Not set</span> : `${data.settings[k]} ${unit}`}
              </span>
            )}
          </label>
        ))}
      </div>
      {data.settings.updatedBy && (
        <p className="text-[11px] text-neutral-400 mt-3">Last changed by {data.settings.updatedBy} on {data.settings.updatedAt?.slice(0, 10)}</p>
      )}
      {msg && <div className="mt-3"><Notice tone={msg.tone} lines={msg.lines} /></div>}
    </Card>
  );
}

function BreedsCard({ data, reload, canEdit }: { data: CLayerViewProps["data"]; reload: () => void; canEdit: boolean }) {
  const { breeds, standards } = data;
  const [selectedId, setSelectedId] = useState<string | null>(breeds[0]?.id ?? null);
  const [newName, setNewName] = useState("");
  const [newMaterial, setNewMaterial] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string; eggMaterialNo: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = breeds.find((b) => b.id === selectedId) ?? null;
  const rows = selected ? standards[selected.id] ?? [] : [];

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", lines: [ok] });
      reload();
      return true;
    } catch (err) {
      setMsg({ tone: "error", lines: errorLines(err) });
      return false;
    }
  };

  const add = async () => {
    const name = newName.trim();
    const done = await run(
      () => cLayerApi("POST", "/breeds", { name, eggMaterialNo: newMaterial.trim() }),
      `Breed "${name}" added. Upload its weekly standard next.`,
    );
    if (done) {
      setNewName("");
      setNewMaterial("");
    }
  };

  const upload = async (breed: LayerBreed, file: File) => {
    setMsg(null);
    try {
      const parsed = parseStandardsFile(await file.arrayBuffer());
      if (parsed.errors.length) {
        setMsg({ tone: "error", lines: ["Nothing was saved:", ...parsed.errors] });
        return;
      }
      await cLayerApi("PUT", `/breeds/${breed.id}/standards`, { rows: parsed.rows });
      setMsg({ tone: "ok", lines: [`Weekly standard for ${breed.name} replaced: ${parsed.rows.length} age weeks.`] });
      reload();
    } catch (err) {
      setMsg({ tone: "error", lines: ["Nothing was saved:", ...errorLines(err)] });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card title="Breeds & weekly standards" subtitle="Age week 1 = placement week. Start of lay is the first week with hen-day % above 0.">
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-2 min-w-0 flex flex-col gap-3">
          {canEdit && (
            <div className="flex gap-2">
              <input className={`${input} flex-1 min-w-0`} placeholder="New breed name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input className={`${input} w-28`} placeholder="Egg mat. no." value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)} />
              <button className={btnPrimary} onClick={add} disabled={!newName.trim() || !newMaterial.trim()}>Add breed</button>
            </div>
          )}
          {breeds.length === 0 ? (
            <p className="text-sm text-neutral-500 py-4">No breeds yet.</p>
          ) : (
            <table className="data-grid text-sm">
              <thead>
                <tr><th className="text-left">Breed</th><th className="text-right">Weeks</th><th className="text-right">First lay</th>{canEdit && <th />}</tr>
              </thead>
              <tbody>
                {breeds.map((b) => {
                  const std = standards[b.id] ?? [];
                  return (
                    <tr key={b.id} className={b.id === selectedId ? "bg-brand-green-tint" : "cursor-pointer"} onClick={() => setSelectedId(b.id)}>
                      <td>
                        {renaming?.id === b.id ? (
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <input className={`${input} flex-1 min-w-0`} value={renaming.name} autoFocus onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
                            <input className={`${input} w-24`} value={renaming.eggMaterialNo} onChange={(e) => setRenaming({ ...renaming, eggMaterialNo: e.target.value })} />
                          </div>
                        ) : (
                          <>
                            <span className="font-medium">{b.name}</span>
                            <span className="ml-2 text-[11px] text-neutral-500 tabular-nums">{b.eggMaterialNo || "no egg material"}</span>
                            {!b.active && <span className="ml-2 text-[10px] uppercase text-neutral-400">inactive</span>}
                          </>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{std.length || <span className="text-brand-alert">none</span>}</td>
                      <td className="text-right tabular-nums">{std.length ? (firstLayAgeWeek(std) ?? "—") : "—"}</td>
                      {canEdit && (
                        <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {renaming?.id === b.id ? (
                            <>
                              <button className={btnText} onClick={async () => (await run(() => cLayerApi("PATCH", `/breeds/${b.id}`, { name: renaming.name, eggMaterialNo: renaming.eggMaterialNo }), "Breed updated.")) && setRenaming(null)}>Save</button>
                              <button className={btnMuted} onClick={() => setRenaming(null)}>Cancel</button>
                            </>
                          ) : confirmId === b.id ? (
                            <>
                              <span className="text-xs">Delete?</span>
                              <button className={btnDanger} onClick={() => run(() => cLayerApi("DELETE", `/breeds/${b.id}`), "Breed deleted.").then(() => setConfirmId(null))}>Yes</button>
                              <button className={btnMuted} onClick={() => setConfirmId(null)}>No</button>
                            </>
                          ) : (
                            <>
                              <button className={btnText} onClick={() => setRenaming({ id: b.id, name: b.name, eggMaterialNo: b.eggMaterialNo })}>Edit</button>
                              <button className={btnText} onClick={() => run(() => cLayerApi("PATCH", `/breeds/${b.id}`, { active: !b.active }), b.active ? "Breed deactivated." : "Breed activated.")}>
                                {b.active ? "Deactivate" : "Activate"}
                              </button>
                              <button className={btnDanger} onClick={() => setConfirmId(b.id)}>Delete</button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="xl:col-span-3 min-w-0 flex flex-col gap-3">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-700">{selected.name} — weekly standard</div>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => exportStandards(selected.name, rows)}>{rows.length ? "Download Excel" : "Download template"}</button>
                  {canEdit && (
                    <>
                      <button className={btn} onClick={() => fileRef.current?.click()}>Upload Excel</button>
                      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && upload(selected, e.target.files[0])} />
                    </>
                  )}
                </div>
              </div>
              {canEdit && (
                <p className="text-[11px] text-neutral-500">
                  Uploading replaces the whole table. Age weeks must run 1, 2, 3 … without gaps; percentages 0–100. Rows with both percentages blank are ignored.
                </p>
              )}
              {rows.length > 0 && <Notice lines={breedStandardNotes(rows)} />}
              {rows.length === 0 ? (
                <Notice lines={[`${selected.name} has no weekly standard yet — its flocks cannot be projected.`]} />
              ) : (
                <div className="overflow-auto max-h-[420px] border border-[var(--border-subtle)] rounded-lg">
                  <table className="data-grid text-xs">
                    <thead>
                      <tr><th className="text-right">Age wk</th><th className="text-left">Phase</th><th className="text-right">Mortality %</th><th className="text-right">Hen-day %</th><th className="text-right">Egg weight (g)</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const first = firstLayAgeWeek(rows);
                        return (
                          <tr key={r.ageWeek} className={r.ageWeek === first ? "font-semibold" : undefined}>
                            <td className="text-right tabular-nums">{r.ageWeek}</td>
                            <td>{first === null || r.ageWeek < first ? "Rearing" : r.ageWeek === first ? "Start of lay" : "Laying"}</td>
                            <td className="text-right tabular-nums">{fmtDec(r.mortalityPct, 2)}</td>
                            <td className="text-right tabular-nums">{fmtDec(r.henDayPct, 1)}</td>
                            <td className="text-right tabular-nums">{r.eggWeightG === null ? "—" : fmtDec(r.eggWeightG, 1)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-500">Add a breed to maintain its weekly standard.</p>
          )}
        </div>
      </div>
      {msg && <div className="mt-4"><Notice tone={msg.tone} lines={msg.lines} /></div>}
    </Card>
  );
}

function FarmsCard({ farms, reload, canEdit }: { farms: LayerFarm[]; reload: () => void; canEdit: boolean }) {
  const [draft, setDraft] = useState<{ id?: string; code: string; name: string; plant: LayerPlant | ""; houses: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", lines: [ok] });
      reload();
      return true;
    } catch (err) {
      setMsg({ tone: "error", lines: errorLines(err) });
      return false;
    }
  };

  const save = async () => {
    if (!draft) return;
    const body = {
      code: draft.code,
      name: draft.name,
      plant: draft.plant,
      houses: draft.houses.trim() === "" ? null : Number(draft.houses),
    };
    const done = await run(
      () => (draft.id ? cLayerApi("PATCH", `/farms/${draft.id}`, body) : cLayerApi("POST", "/farms", body)),
      draft.id ? "Farm updated." : "Farm added.",
    );
    if (done) setDraft(null);
  };

  return (
    <Card
      title="Layer farms"
      subtitle="Separate from the broiler farm master. Rearing farms are plant 1260, laying farms plant 1250."
      actions={canEdit && !draft && <button className={btnPrimary} onClick={() => setDraft({ code: "", name: "", plant: "", houses: "" })}>+ Add farm</button>}
    >
      {draft && (
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="flex flex-col gap-1"><span className={label}>Code</span><input className={`${input} w-32`} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><span className={label}>Name</span><input className={`${input} w-64`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="flex flex-col gap-1">
            <span className={label}>Plant</span>
            <select className={input} value={draft.plant} onChange={(e) => setDraft({ ...draft, plant: e.target.value as LayerPlant | "" })}>
              <option value="">Select…</option>
              {(Object.keys(LAYER_PLANTS) as LayerPlant[]).map((p) => <option key={p} value={p}>{p} · {LAYER_PLANTS[p]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className={label}>Houses</span><input type="number" min={1} step={1} className={`${input} w-24`} value={draft.houses} placeholder="optional" onChange={(e) => setDraft({ ...draft, houses: e.target.value })} /></label>
          <button className={btnPrimary} onClick={save}>{draft.id ? "Save" : "Add farm"}</button>
          <button className={btn} onClick={() => setDraft(null)}>Cancel</button>
        </div>
      )}
      {farms.length === 0 ? (
        <p className="text-sm text-neutral-500 py-4">No layer farms yet.</p>
      ) : (
        <table className="data-grid text-sm">
          <thead><tr><th className="text-left">Code</th><th className="text-left">Name</th><th className="text-left">Plant</th><th className="text-right">Houses</th><th className="text-left">Status</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {farms.map((f) => (
              <tr key={f.id}>
                <td className="font-medium">{f.code}</td>
                <td>{f.name}</td>
                <td>{f.plant ? `${f.plant} · ${f.plant === "1260" ? "Rearing" : "Laying"}` : <span className="text-brand-alert">not set</span>}</td>
                <td className="text-right tabular-nums">{f.houses ?? "—"}</td>
                <td>{f.active ? "Active" : <span className="text-neutral-400">Inactive</span>}</td>
                {canEdit && (
                  <td className="text-right whitespace-nowrap">
                    {confirmId === f.id ? (
                      <>
                        <span className="text-xs">Delete?</span>
                        <button className={btnDanger} onClick={() => run(() => cLayerApi("DELETE", `/farms/${f.id}`), "Farm deleted.").then(() => setConfirmId(null))}>Yes</button>
                        <button className={btnMuted} onClick={() => setConfirmId(null)}>No</button>
                      </>
                    ) : (
                      <>
                        <button className={btnText} onClick={() => setDraft({ id: f.id, code: f.code, name: f.name, plant: f.plant ?? "", houses: f.houses === null ? "" : String(f.houses) })}>Edit</button>
                        <button className={btnText} onClick={() => run(() => cLayerApi("PATCH", `/farms/${f.id}`, { active: !f.active }), f.active ? "Farm deactivated." : "Farm activated.")}>
                          {f.active ? "Deactivate" : "Activate"}
                        </button>
                        <button className={btnDanger} onClick={() => setConfirmId(f.id)}>Delete</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {msg && <div className="mt-3"><Notice tone={msg.tone} lines={msg.lines} /></div>}
    </Card>
  );
}

type StageDraft = { id?: string; name: string; phase: "rearing" | "laying"; fromWeek: string; toWeek: string; materialNo: string };

function FeedStagesCard({ stages, reload, canEdit }: { stages: LayerFeedStage[]; reload: () => void; canEdit: boolean }) {
  const [rows, setRows] = useState<StageDraft[]>(() =>
    stages.map((s) => ({ id: s.id, name: s.name, phase: s.phase, fromWeek: String(s.fromWeek), toWeek: String(s.toWeek), materialNo: s.materialNo })),
  );
  const [msg, setMsg] = useState<Msg>(null);
  const set = (i: number, patch: Partial<StageDraft>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const ageRange = (r: StageDraft) =>
    r.fromWeek !== "" && r.toWeek !== "" ? `age ${Number(r.fromWeek) + FEED_STAGE_WEEK_OFFSET}–${Number(r.toWeek) + FEED_STAGE_WEEK_OFFSET}` : "";

  const save = async () => {
    setMsg(null);
    try {
      await cLayerApi("PUT", "/feed-stages", {
        stages: rows.map((r) => ({ ...r, fromWeek: Number(r.fromWeek), toWeek: Number(r.toWeek) })),
      });
      setMsg({ tone: "ok", lines: ["Feed stages saved."] });
      reload();
    } catch (err) {
      setMsg({ tone: "error", lines: errorLines(err) });
    }
  };

  return (
    <Card
      title="Feed stages"
      subtitle={`Reference data in the business-process document's week numbering (starts at 0). Document week n = age week n + ${FEED_STAGE_WEEK_OFFSET}. Feed quantities are not planned in v1.`}
      actions={canEdit && (
        <>
          <button className={btn} onClick={() => setRows([...rows, { name: "", phase: "laying", fromWeek: "", toWeek: "", materialNo: "" }])}>+ Add stage</button>
          <button className={btnPrimary} onClick={save}>Save feed stages</button>
        </>
      )}
    >
      <div className="overflow-x-auto">
        <table className="data-grid text-sm">
          <thead>
            <tr>
              <th className="text-left">Stage</th>
              <th className="text-left">Phase</th>
              <th className="text-right">From wk</th>
              <th className="text-right">To wk</th>
              <th className="text-left">Plan age weeks</th>
              <th className="text-left">Feed material no.</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${i}`}>
                {canEdit ? (
                  <>
                    <td><input className={`${input} w-40`} value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
                    <td>
                      <select className={input} value={r.phase} onChange={(e) => set(i, { phase: e.target.value as StageDraft["phase"] })}>
                        <option value="rearing">Rearing</option>
                        <option value="laying">Laying</option>
                      </select>
                    </td>
                    <td className="text-right"><input type="number" min={0} max={100} className={`${input} w-20 text-right`} value={r.fromWeek} onChange={(e) => set(i, { fromWeek: e.target.value })} /></td>
                    <td className="text-right"><input type="number" min={0} max={100} className={`${input} w-20 text-right`} value={r.toWeek} onChange={(e) => set(i, { toWeek: e.target.value })} /></td>
                    <td className="text-xs text-neutral-500">{ageRange(r)}</td>
                    <td><input className={`${input} w-32`} value={r.materialNo} placeholder="blank" onChange={(e) => set(i, { materialNo: e.target.value })} /></td>
                    <td><button className={btnDanger} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button></td>
                  </>
                ) : (
                  <>
                    <td className="font-medium">{r.name}</td>
                    <td className="capitalize">{r.phase}</td>
                    <td className="text-right tabular-nums">{r.fromWeek}</td>
                    <td className="text-right tabular-nums">{r.toWeek}</td>
                    <td className="text-xs text-neutral-500">{ageRange(r)}</td>
                    <td>{r.materialNo || <span className="text-neutral-400">—</span>}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <div className="mt-3"><Notice tone={msg.tone} lines={msg.lines} /></div>}
    </Card>
  );
}

type SkuDraft = { materialNo: string; piecesPerPack: string; traysPerPack: string; eggsPerTray: string; packMixPct: string };

function SkusCard({ skus, reload, canEdit }: { skus: LayerSku[]; reload: () => void; canEdit: boolean }) {
  const [rows, setRows] = useState<SkuDraft[]>(() =>
    skus.map((s) => ({
      materialNo: s.materialNo,
      piecesPerPack: String(s.piecesPerPack),
      traysPerPack: String(s.traysPerPack),
      eggsPerTray: String(s.eggsPerTray),
      packMixPct: s.packMixPct === null ? "" : String(s.packMixPct),
    })),
  );
  const [msg, setMsg] = useState<Msg>(null);
  const set = (i: number, patch: Partial<SkuDraft>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const tableMix = rows.reduce((s, r, i) => s + (skus[i].grade === "table" ? Number(r.packMixPct || 0) : 0), 0);

  const save = async () => {
    setMsg(null);
    try {
      await cLayerApi("PUT", "/skus", {
        skus: rows.map((r) => ({
          materialNo: r.materialNo,
          piecesPerPack: Number(r.piecesPerPack),
          traysPerPack: Number(r.traysPerPack),
          eggsPerTray: Number(r.eggsPerTray),
          packMixPct: r.packMixPct.trim() === "" ? null : Number(r.packMixPct),
        })),
      });
      setMsg({ tone: "ok", lines: ["SKU pack sizes and pack mix saved."] });
      reload();
    } catch (err) {
      setMsg({ tone: "error", lines: errorLines(err) });
    }
  };

  return (
    <Card
      title="Packed SKUs · plant 1250"
      subtitle={`${GRADED_MATERIALS.table.materialNo} table eggs are split across the table-egg SKUs by pack mix (must total 100%). All ${GRADED_MATERIALS.gradeC.materialNo} Grade C eggs go to the Grade C SKU.`}
      actions={canEdit && <button className={btnPrimary} onClick={save}>Save SKUs</button>}
    >
      <div className="overflow-x-auto">
        <table className="data-grid text-sm">
          <thead>
            <tr>
              <th className="text-left">Material</th>
              <th className="text-left">Description</th>
              <th className="text-left">From</th>
              <th className="text-right">Pieces / pack</th>
              <th className="text-right">Trays / pack</th>
              <th className="text-right">Eggs / tray</th>
              <th className="text-right">Pack mix %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const sku = skus[i];
              const mismatch = Number(r.piecesPerPack) !== Number(r.traysPerPack) * Number(r.eggsPerTray);
              const num = (field: keyof SkuDraft) =>
                canEdit ? (
                  <input type="number" min={0} className={`${input} w-20 text-right`} value={r[field]} placeholder="not set" onChange={(e) => set(i, { [field]: e.target.value })} />
                ) : (
                  <span className="tabular-nums">{r[field] || <span className="text-brand-alert">not set</span>}</span>
                );
              return (
                <tr key={r.materialNo}>
                  <td className="font-medium tabular-nums">{r.materialNo}</td>
                  <td className="text-xs">{sku.description}</td>
                  <td className="text-xs">{sku.grade === "table" ? GRADED_MATERIALS.table.materialNo : GRADED_MATERIALS.gradeC.materialNo}</td>
                  <td className="text-right">
                    {num("piecesPerPack")}
                    {mismatch && <span className="block text-[10px] text-brand-alert">≠ trays × eggs</span>}
                  </td>
                  <td className="text-right">{num("traysPerPack")}</td>
                  <td className="text-right">{num("eggsPerTray")}</td>
                  <td className="text-right">{num("packMixPct")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={`text-xs mt-2 ${Math.abs(tableMix - 100) < 1e-6 || tableMix === 0 ? "text-neutral-500" : "text-brand-alert"}`}>
        Table-egg pack mix total: {tableMix}%{tableMix === 0 ? " (not set)" : ""}
      </p>
      {msg && <div className="mt-3"><Notice tone={msg.tone} lines={msg.lines} /></div>}
    </Card>
  );
}

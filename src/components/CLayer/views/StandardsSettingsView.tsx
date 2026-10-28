"use client";

import { useRef, useState } from "react";
import { cLayerApi, errorLines } from "@/lib/cLayer/api";
import { SETTING_LABELS, firstLayAgeWeek, type SettingKey } from "@/lib/cLayer/calc";
import { exportStandards, parseStandardsFile } from "@/lib/cLayer/excel";
import type { LayerBreed, LayerFarm } from "@/lib/cLayer/types";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, Notice, btn, btnDanger, btnMuted, btnPrimary, btnText, fmtDec, input, label } from "../ui";

type Msg = { tone: "ok" | "error" | "warn"; lines: string[] } | null;

const SETTING_HINTS: Record<SettingKey, string> = {
  prToPoDays: "days",
  poToDeliveryDays: "days",
  eggsPerTray: "eggs",
  traysPerCase: "trays",
};

export function StandardsSettingsView({ data, reload, canWriteMaster }: CLayerViewProps) {
  return (
    <div className="flex flex-col gap-5">
      {!canWriteMaster && <Notice tone="info" lines={["View only — breeds, weekly standards, farms and settings are maintained by an Admin."]} />}
      <SettingsCard data={data} reload={reload} canEdit={canWriteMaster} />
      <BreedsCard data={data} reload={reload} canEdit={canWriteMaster} />
      <FarmsCard farms={data.farms} reload={reload} canEdit={canWriteMaster} />
    </div>
  );
}

function SettingsCard({ data, reload, canEdit }: { data: CLayerViewProps["data"]; reload: () => void; canEdit: boolean }) {
  const keys = Object.keys(SETTING_LABELS) as SettingKey[];
  const [draft, setDraft] = useState<Record<SettingKey, string>>(() =>
    Object.fromEntries(keys.map((k) => [k, data.settings[k] === null ? "" : String(data.settings[k])])) as Record<SettingKey, string>,
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
        {keys.map((k) => (
          <label key={k} className="flex flex-col gap-1">
            <span className={label}>{SETTING_LABELS[k]}</span>
            {canEdit ? (
              <div className="flex items-center gap-2">
                <input type="number" min={0} step={1} className={`${input} w-28`} value={draft[k]} placeholder="not set" onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                <span className="text-xs text-neutral-500">{SETTING_HINTS[k]}</span>
              </div>
            ) : (
              <span className="text-sm font-semibold">
                {data.settings[k] === null ? <span className="text-brand-alert">Not set</span> : `${data.settings[k]} ${SETTING_HINTS[k]}`}
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
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
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
    if (await run(() => cLayerApi("POST", "/breeds", { name }), `Breed "${name}" added. Upload its weekly standard next.`)) setNewName("");
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
              <input className={`${input} flex-1`} placeholder="New breed name, e.g. Hy-Line W-80" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <button className={btnPrimary} onClick={add} disabled={!newName.trim()}>Add breed</button>
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
                          <input
                            className={`${input} w-full`}
                            value={renaming.name}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setRenaming({ id: b.id, name: e.target.value })}
                          />
                        ) : (
                          <>
                            <span className="font-medium">{b.name}</span>
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
                              <button className={btnText} onClick={async () => (await run(() => cLayerApi("PATCH", `/breeds/${b.id}`, { name: renaming.name }), "Breed renamed.")) && setRenaming(null)}>Save</button>
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
                              <button className={btnText} onClick={() => setRenaming({ id: b.id, name: b.name })}>Rename</button>
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
              {rows.length === 0 ? (
                <Notice lines={[`${selected.name} has no weekly standard yet — its placements cannot be projected.`]} />
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
  const [draft, setDraft] = useState<{ id?: string; code: string; name: string } | null>(null);
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
    const body = { code: draft.code, name: draft.name };
    const done = await run(
      () => (draft.id ? cLayerApi("PATCH", `/farms/${draft.id}`, body) : cLayerApi("POST", "/farms", body)),
      draft.id ? "Farm updated." : "Farm added.",
    );
    if (done) setDraft(null);
  };

  return (
    <Card
      title="Layer farms"
      subtitle="Separate from the broiler farm master."
      actions={canEdit && !draft && <button className={btnPrimary} onClick={() => setDraft({ code: "", name: "" })}>+ Add farm</button>}
    >
      {draft && (
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="flex flex-col gap-1"><span className={label}>Code</span><input className={`${input} w-32`} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><span className={label}>Name</span><input className={`${input} w-64`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <button className={btnPrimary} onClick={save}>{draft.id ? "Save" : "Add farm"}</button>
          <button className={btn} onClick={() => setDraft(null)}>Cancel</button>
        </div>
      )}
      {farms.length === 0 ? (
        <p className="text-sm text-neutral-500 py-4">No layer farms yet.</p>
      ) : (
        <table className="data-grid text-sm">
          <thead><tr><th className="text-left">Code</th><th className="text-left">Name</th><th className="text-left">Status</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {farms.map((f) => (
              <tr key={f.id}>
                <td className="font-medium">{f.code}</td>
                <td>{f.name}</td>
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
                        <button className={btnText} onClick={() => setDraft({ id: f.id, code: f.code, name: f.name })}>Edit</button>
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

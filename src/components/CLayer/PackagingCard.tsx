"use client";

import { useState } from "react";
import { cLayerApi, errorLines } from "@/lib/cLayer/api";
import type { LayerSku, LayerSkuPackaging } from "@/lib/cLayer/types";
import { Card, Notice, btnDanger, btnPrimary, btnText, input } from "./ui";

type Row = { component: string; materialNo: string; qtyPerPack: string; unit: string; orderUnit: string; perOrderUnit: string };
type Msg = { tone: "ok" | "error"; lines: string[] } | null;

/** Packaging components per packed SKU; AWP enters the SAP material codes here. */
export function PackagingCard({ skus, packaging, reload, canEdit }: { skus: LayerSku[]; packaging: LayerSkuPackaging[]; reload: () => void; canEdit: boolean }) {
  const [rows, setRows] = useState<Record<string, Row[]>>(() =>
    Object.fromEntries(
      skus.map((s) => [
        s.materialNo,
        packaging
          .filter((p) => p.skuMaterialNo === s.materialNo)
          .map((p) => ({
            component: p.component,
            materialNo: p.materialNo,
            qtyPerPack: String(p.qtyPerPack),
            unit: p.unit,
            orderUnit: p.orderUnit ?? "",
            perOrderUnit: p.perOrderUnit === null ? "" : String(p.perOrderUnit),
          })),
      ]),
    ),
  );
  const [msg, setMsg] = useState<Msg>(null);
  const missing = Object.values(rows).flat().filter((r) => !r.materialNo.trim()).length;

  const set = (sku: string, i: number, patch: Partial<Row>) =>
    setRows({ ...rows, [sku]: rows[sku].map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const add = (sku: string) => setRows({ ...rows, [sku]: [...rows[sku], { component: "", materialNo: "", qtyPerPack: "1", unit: "PC", orderUnit: "", perOrderUnit: "" }] });
  const remove = (sku: string, i: number) => setRows({ ...rows, [sku]: rows[sku].filter((_, j) => j !== i) });

  const save = async () => {
    setMsg(null);
    try {
      await cLayerApi("PUT", "/sku-packaging", {
        skus: skus.map((s) => s.materialNo),
        rows: skus.flatMap((s) =>
          rows[s.materialNo].map((r) => ({
            skuMaterialNo: s.materialNo,
            component: r.component.trim(),
            materialNo: r.materialNo.trim(),
            qtyPerPack: Number(r.qtyPerPack),
            unit: r.unit.trim() || "PC",
            orderUnit: r.orderUnit.trim() || null,
            perOrderUnit: r.perOrderUnit.trim() === "" ? null : Number(r.perOrderUnit),
          })),
        ),
      });
      setMsg({ tone: "ok", lines: ["Packaging saved."] });
      reload();
    } catch (err) {
      setMsg({ tone: "error", lines: errorLines(err) });
    }
  };

  return (
    <Card
      title="Packaging per SKU"
      subtitle="Per pack, as in the SAP BOM. Order unit: e.g. ROL = 1000."
      actions={canEdit && <button className={btnPrimary} onClick={save}>Save packaging</button>}
    >
      {msg && <Notice tone={msg.tone} lines={msg.lines} />}
      {missing > 0 && <p className="text-[11px] text-brand-alert mb-2">{missing} component(s) have no material code yet.</p>}
      <div className="grid gap-4 2xl:grid-cols-2">
        {skus.map((s) => (
          <div key={s.materialNo} className="rounded-lg border border-[var(--border-subtle)] p-3 min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-brand-green-dark">{s.materialNo}</span>
                <span className="text-xs text-neutral-500"> · {s.description}</span>
              </div>
              {canEdit && <button className={btnText} onClick={() => add(s.materialNo)}>+ Component</button>}
            </div>
            <div className="overflow-x-auto">
              <table className="data-grid text-xs w-full">
                <thead>
                  <tr>
                    <th className="text-left">Component</th>
                    <th className="text-left">Material no.</th>
                    <th className="text-right">Qty / pack</th>
                    <th className="text-left">BOM unit</th>
                    <th className="text-left" title="Unit it is bought in, e.g. ROL — leave empty if bought in the BOM unit">Order unit</th>
                    <th className="text-right" title="How many BOM units one order unit holds, e.g. 1000 stickers per roll">Per order unit</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {rows[s.materialNo].map((r, i) => (
                    <tr key={i}>
                      {canEdit ? (
                        <>
                          <td><input className={`${input} w-full min-w-36`} value={r.component} onChange={(e) => set(s.materialNo, i, { component: e.target.value })} /></td>
                          <td><input className={`${input} w-28`} value={r.materialNo} placeholder="enter code" onChange={(e) => set(s.materialNo, i, { materialNo: e.target.value })} /></td>
                          <td className="text-right"><input type="number" min={0} step="any" className={`${input} w-20 text-right`} value={r.qtyPerPack} onChange={(e) => set(s.materialNo, i, { qtyPerPack: e.target.value })} /></td>
                          <td><input className={`${input} w-16`} value={r.unit} onChange={(e) => set(s.materialNo, i, { unit: e.target.value })} /></td>
                          <td><input className={`${input} w-16`} value={r.orderUnit} placeholder="—" onChange={(e) => set(s.materialNo, i, { orderUnit: e.target.value })} /></td>
                          <td className="text-right"><input type="number" min={0} step="any" className={`${input} w-20 text-right`} value={r.perOrderUnit} placeholder="—" onChange={(e) => set(s.materialNo, i, { perOrderUnit: e.target.value })} /></td>
                          <td><button className={btnDanger} onClick={() => remove(s.materialNo, i)}>Remove</button></td>
                        </>
                      ) : (
                        <>
                          <td>{r.component}</td>
                          <td>{r.materialNo || <span className="text-brand-alert">not set</span>}</td>
                          <td className="text-right tabular-nums">{r.qtyPerPack}</td>
                          <td>{r.unit}</td>
                          <td>{r.orderUnit || "—"}</td>
                          <td className="text-right tabular-nums">{r.perOrderUnit || "—"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {rows[s.materialNo].length === 0 && (
                    <tr><td colSpan={canEdit ? 7 : 6} className="text-neutral-500">No packaging yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

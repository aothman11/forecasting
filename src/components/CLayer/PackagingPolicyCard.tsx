"use client";

import { useState } from "react";
import { cLayerApi, errorLines } from "@/lib/cLayer/api";
import type { LayerPackagingPolicy, LayerSkuPackaging } from "@/lib/cLayer/types";
import { Card, Notice, btnPrimary, input } from "./ui";

type Draft = { orderEveryWeeks: string; orderMultiple: string; safetyWeeks: string };
type Msg = { tone: "ok" | "error"; lines: string[] } | null;

const str = (n: number | null) => (n === null ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? null : Number(s));

/** How each packaging component is ordered; one row per component name across all SKUs. */
export function PackagingPolicyCard({ packaging, policies, reload, canEdit }: {
  packaging: LayerSkuPackaging[];
  policies: LayerPackagingPolicy[];
  reload: () => void;
  canEdit: boolean;
}) {
  const components = [...new Map(packaging.map((p) => [p.component, p])).values()].sort((a, b) => a.component.localeCompare(b.component));
  const [draft, setDraft] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      components.map((c) => {
        const p = policies.find((x) => x.component === c.component);
        return [c.component, { orderEveryWeeks: str(p?.orderEveryWeeks ?? null), orderMultiple: str(p?.orderMultiple ?? null), safetyWeeks: str(p?.safetyWeeks ?? null) }];
      }),
    ),
  );
  const [msg, setMsg] = useState<Msg>(null);
  const set = (component: string, patch: Partial<Draft>) => setDraft({ ...draft, [component]: { ...draft[component], ...patch } });

  const save = async () => {
    setMsg(null);
    try {
      await cLayerApi("PUT", "/packaging-policy", {
        policies: components
          .map((c) => ({ component: c.component, orderEveryWeeks: num(draft[c.component].orderEveryWeeks), orderMultiple: num(draft[c.component].orderMultiple), safetyWeeks: num(draft[c.component].safetyWeeks) }))
          .filter((p) => p.orderEveryWeeks !== null || p.orderMultiple !== null || p.safetyWeeks !== null),
      });
      setMsg({ tone: "ok", lines: ["Order rules saved."] });
      reload();
    } catch (err) {
      setMsg({ tone: "error", lines: errorLines(err) });
    }
  };

  const field = (component: string, key: keyof Draft, placeholder: string, step: string) =>
    canEdit ? (
      <input type="number" min={0} step={step} className={`${input} w-24 text-right`} value={draft[component][key]} placeholder={placeholder} onChange={(e) => set(component, { [key]: e.target.value })} />
    ) : (
      <span className="tabular-nums">{draft[component][key] || <span className="text-neutral-400">{placeholder}</span>}</span>
    );

  return (
    <Card
      title="Packaging order rules"
      subtitle="Sample values to start with — replace them with your own. Empty = every week, whole units, no safety stock."
      actions={canEdit && <button className={btnPrimary} onClick={save}>Save order rules</button>}
    >
      {msg && <Notice tone={msg.tone} lines={msg.lines} />}
      {components.length === 0 ? (
        <p className="text-sm text-neutral-500">No packaging components yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-grid text-sm">
            <thead>
              <tr>
                <th className="text-left">Component</th>
                <th className="text-left">Unit</th>
                <th className="text-right">Order every (weeks)</th>
                <th className="text-right">Order multiple</th>
                <th className="text-right">Safety stock (weeks)</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.component}>
                  <td className="font-medium">{c.component}</td>
                  <td className="text-neutral-600">{c.orderUnit && c.perOrderUnit ? c.orderUnit : c.unit}</td>
                  <td className="text-right">{field(c.component, "orderEveryWeeks", "1", "1")}</td>
                  <td className="text-right">{field(c.component, "orderMultiple", "1", "any")}</td>
                  <td className="text-right">{field(c.component, "safetyWeeks", "0", "any")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

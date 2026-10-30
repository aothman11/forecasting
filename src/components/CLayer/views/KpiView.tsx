"use client";

import { useMemo } from "react";
import { KPI_AGE_WEEK, isoWeekLabel, kpis } from "@/lib/cLayer/calc";
import type { CLayerViewProps } from "../CLayerPage";
import { Card, KpiRow, Notice, fmtDec, fmtInt } from "../ui";

export function KpiView({ data, projections }: CLayerViewProps) {
  const result = useMemo(() => kpis(projections, data.settings), [projections, data.settings]);
  const placement = new Map(data.placements.map((p) => [p.id, p]));
  const breed = new Map(data.breeds.map((b) => [b.id, b]));
  const farm = new Map(data.farms.map((f) => [f.id, f]));
  const measured = result.flocks.filter((k) => k.eggsPerHenHoused !== null);
  const pooledHens = measured.reduce((s, k) => s + (k.hensAtPointOfLay ?? 0), 0);
  const pooled = pooledHens ? measured.reduce((s, k) => s + (k.eggsTo80 ?? 0), 0) / pooledHens : null;
  const pooledNet =
    pooledHens && data.settings.rejectPct !== null ? measured.reduce((s, k) => s + (k.netEggsTo80 ?? 0), 0) / pooledHens : null;
  const show = (v: number | null) => (v === null ? "n/a" : fmtDec(v, 1));

  return (
    <div className="flex flex-col gap-5">
      <Notice
        tone="info"
        lines={[
          `Eggs per hen housed at ${KPI_AGE_WEEK} weeks = total eggs up to age week ${KPI_AGE_WEEK} ÷ hens at point of lay. The business process document labels it "%", but the formula gives eggs per hen, so it is shown as eggs per hen.`,
          `Eggs count only once the flock is an asset (from age week ${data.settings.assetFromAge ?? "—"}). Hens at point of lay = live birds at the start of the first counted laying week.`,
          "Net eggs = eggs minus rejects (reject % setting). The document does not define net eggs — confirm this definition.",
        ]}
      />
      {data.settings.rejectPct === null && <Notice lines={["Missing setting: Reject %. Net eggs per hen are blank."]} />}
      <KpiRow
        items={[
          { label: "Flocks measured", value: `${measured.length} / ${result.flocks.length}`, sub: `reaching week ${KPI_AGE_WEEK}`, tone: "green" },
          { label: `Eggs / hen housed @${KPI_AGE_WEEK}`, value: show(pooled), sub: "all measured flocks", tone: "gold" },
          { label: `Net eggs / hen @${KPI_AGE_WEEK}`, value: show(pooledNet), sub: data.settings.rejectPct === null ? "reject % not set" : `reject ${data.settings.rejectPct}%` },
          { label: "Hens at point of lay", value: fmtInt(pooledHens), sub: "measured flocks" },
        ]}
      />
      <Card title="By breed" subtitle="Flocks pooled: Σ eggs ÷ Σ hens at point of lay.">
        {result.breeds.length === 0 ? (
          <p className="text-sm text-neutral-500 py-6 text-center">No flock reaches week {KPI_AGE_WEEK} in the projection yet.</p>
        ) : (
          <table className="data-grid text-sm">
            <thead>
              <tr>
                <th className="text-left">Breed · egg material</th>
                <th className="text-right">Flocks</th>
                <th className="text-right">Hens at POL</th>
                <th className="text-right">Eggs / hen housed</th>
                <th className="text-right">Net eggs / hen housed</th>
              </tr>
            </thead>
            <tbody>
              {result.breeds.map((b) => (
                <tr key={b.breedId}>
                  <td>{breed.get(b.breedId)?.name ?? "—"} <span className="text-[11px] text-neutral-500">· {breed.get(b.breedId)?.eggMaterialNo}</span></td>
                  <td className="text-right tabular-nums">{b.flocks}</td>
                  <td className="text-right tabular-nums">{fmtInt(b.hensAtPointOfLay)}</td>
                  <td className="text-right tabular-nums font-semibold">{show(b.eggsPerHenHoused)}</td>
                  <td className="text-right tabular-nums">{show(b.netEggsPerHenHoused)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="By flock">
        {result.flocks.length === 0 ? (
          <p className="text-sm text-neutral-500 py-6 text-center">No planned flocks yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-grid text-sm">
              <thead>
                <tr>
                  <th className="text-right">Flock</th>
                  <th className="text-left">Placement week</th>
                  <th className="text-left">Breed</th>
                  <th className="text-left">Laying farm · 1250</th>
                  <th className="text-right">Hens at POL</th>
                  <th className="text-right">Eggs to wk {KPI_AGE_WEEK}</th>
                  <th className="text-right">Eggs / hen</th>
                  <th className="text-right">Net eggs / hen</th>
                  <th className="text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {result.flocks.map((k) => {
                  const p = placement.get(k.placementId);
                  return (
                    <tr key={k.placementId}>
                      <td className="text-right tabular-nums font-semibold">{p?.flockNo ?? "—"}</td>
                      <td>{p ? isoWeekLabel(p.placementWeekStart) : "—"}</td>
                      <td>{breed.get(k.breedId)?.name ?? "—"}</td>
                      <td>{(p && farm.get(p.layingFarmId)?.code) ?? "—"}</td>
                      <td className="text-right tabular-nums">{k.hensAtPointOfLay === null ? "—" : fmtInt(k.hensAtPointOfLay)}</td>
                      <td className="text-right tabular-nums">{k.eggsTo80 === null ? "—" : fmtInt(k.eggsTo80)}</td>
                      <td className="text-right tabular-nums font-semibold">{show(k.eggsPerHenHoused)}</td>
                      <td className="text-right tabular-nums">{show(k.netEggsPerHenHoused)}</td>
                      <td className="text-xs text-neutral-500">{k.note ?? ""}</td>
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

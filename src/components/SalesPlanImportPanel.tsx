"use client";

import { useMemo, useRef, useState } from "react";
import { usePlanStore } from "@/lib/store";
import { weekStartDate } from "@/lib/calculations";
import { weekLabel } from "@/lib/demandPlan";
import { exportSalesPlanTemplate } from "@/lib/export";
import { CHANNEL_KEYS, CHANNEL_LABELS, PRODUCT_CATEGORY_LABELS } from "@/lib/defaults";
import {
  aggregateSalesPlanByProductChannelWeek,
  autoMapProduct,
  buildFileWeekLabels,
  createProductFromRow,
  deriveProductPrices,
  distinctRowSignatures,
  distinctValues,
  distinctWeeksOfYear,
  getSalesPlanHeaders,
  isSalesPlanFile,
  normalizeChannelKey,
  parseSalesPlan,
  rowSignature,
  salesWeekNumber,
  type RowSignatureGroup,
  type SalesPlanRow,
} from "@/lib/salesPlanImport";
import type { ChannelKey } from "@/lib/types";

const NONE = "none";
const IGNORE = "ignore";

export function SalesPlanImportPanel({ onClose }: { onClose: () => void }) {
  const params = usePlanStore((s) => s.params);
  const demandProducts = usePlanStore((s) => s.demandProducts);
  const setDemandCell = usePlanStore((s) => s.setDemandCell);
  const savedProductMap = usePlanStore((s) => s.salesPlanProductMap);
  const savedChannelMap = usePlanStore((s) => s.salesPlanChannelMap);
  const addDemandProduct = usePlanStore((s) => s.addDemandProduct);
  const updateDemandProduct = usePlanStore((s) => s.updateDemandProduct);
  const setSalesPlanProductMap = usePlanStore((s) => s.setSalesPlanProductMap);
  const setSalesPlanChannelMap = usePlanStore((s) => s.setSalesPlanChannelMap);
  const setSalesPlanCartonRows = usePlanStore((s) => s.setSalesPlanCartonRows);
  const confirmSalesPlan = usePlanStore((s) => s.confirmSalesPlan);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<SalesPlanRow[] | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [productDraft, setProductDraft] = useState<Record<string, string>>({});
  const [channelDraft, setChannelDraft] = useState<Record<string, ChannelKey | typeof IGNORE>>({});
  const [weekAssignment, setWeekAssignment] = useState<Record<number, string>>({});
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  const productsById = useMemo(() => new Map(demandProducts.map((p) => [p.id, p])), [demandProducts]);
  const signatures: RowSignatureGroup[] = useMemo(() => (rows ? distinctRowSignatures(rows) : []), [rows]);
  const channelValues = useMemo(() => (rows ? distinctValues(rows, "channel") : []), [rows]);
  const weeksInFile = useMemo(() => (rows ? distinctWeeksOfYear(rows) : []), [rows]);
  const horizonWeeks = Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      const parsed = parseSalesPlan(buf);
      setRows(parsed);
      setFileName(file.name);
      setFileHeaders(getSalesPlanHeaders(buf));
      setAppliedMessage(null);

      // ── Immediately feed the Processing Plan ─────────────────────────────
      // Save raw carton rows (SKU × plant × ISO week) the moment the file is
      // parsed — no need to click Apply first. The demand plan mapping (product
      // catalog, channels, weeks) still requires Apply, but the Processing Plan
      // gets its carcass-requirement data right away from the same file.
      const cartonRows = parsed
        .filter((r) => r.materialCode && r.grossSalesVolumeCar > 0)
        .map((r) => ({
          week: r.weekOfYear,
          plant: r.plant || "ALL",
          skuCode: r.materialCode,
          skuDescription: r.materialDescription,
          cartons: r.grossSalesVolumeCar,
        }));
      setSalesPlanCartonRows(cartonRows);
      confirmSalesPlan();
      // ─────────────────────────────────────────────────────────────────────

      // Auto-map products: try saved map first, then auto-mapping, then NONE
      const prodDraft: Record<string, string> = {};
      distinctRowSignatures(parsed).forEach((g) => {
        if (savedProductMap[g.signature]) {
          prodDraft[g.signature] = savedProductMap[g.signature];
        } else {
          // Pick a representative row for this signature to run auto-map against
          const rep = parsed.find(
            (r) =>
              r.division === g.division &&
              r.materialCategory === g.materialCategory &&
              r.materialDescription === g.materialDescription &&
              r.size === g.size &&
              r.grading === g.grading
          );
          const matched = rep ? autoMapProduct(rep, demandProducts) : undefined;
          prodDraft[g.signature] = matched?.id ?? NONE;
        }
      });
      setProductDraft(prodDraft);

      // Auto-map channels: try saved map first, then normalizeChannelKey, then IGNORE
      const chDraft: Record<string, ChannelKey | typeof IGNORE> = {};
      distinctValues(parsed, "channel").forEach((v) => {
        chDraft[v] = savedChannelMap[v] ?? normalizeChannelKey(v) ?? IGNORE;
      });
      setChannelDraft(chDraft);

      // Auto-suggest week alignment — match by human label ("Aug W1") to avoid
      // numeric mismatch between the plan's ceil-based weekOfYear and the file's.
      const fileWeeks = distinctWeeksOfYear(parsed);
      const fwLabelsMap = buildFileWeekLabels(parsed);
      // Reverse map: "Aug W1" → weekOfYear
      const labelToFw = new Map<string, number>();
      fwLabelsMap.forEach((label, fw) => labelToFw.set(label, fw));

      const initialAssignment: Record<number, string> = {};
      horizonWeeks.forEach((w) => {
        // weekLabel gives "2026.Aug.W1"; extract "Aug W1"
        const full = weekLabel(w, params.planStartDate);
        const parts = full.split(".");                    // ["2026", "Aug", "W1"]
        const shortLabel = `${parts[1]} ${parts[2]}`;    // "Aug W1"
        const fw = labelToFw.get(shortLabel);
        if (fw !== undefined) {
          initialAssignment[w] = String(fw);
        } else {
          initialAssignment[w] = NONE;
        }
      });
      setWeekAssignment(initialAssignment);
    };
    reader.readAsArrayBuffer(file);
  };

  const productMap = useMemo(
    () => Object.fromEntries(Object.entries(productDraft).filter(([, v]) => v !== NONE)) as Record<string, string>,
    [productDraft]
  );
  const channelMap = useMemo(
    () =>
      Object.fromEntries(Object.entries(channelDraft).filter(([, v]) => v !== IGNORE)) as Record<string, ChannelKey>,
    [channelDraft]
  );

  const { totals, summary } = useMemo(
    () =>
      rows
        ? aggregateSalesPlanByProductChannelWeek(rows, productMap, channelMap, productsById)
        : { totals: new Map<string, number>(), summary: { mappedRows: 0, unmappedRows: 0 } },
    [rows, productMap, channelMap, productsById]
  );

  const totalsByFileWeek = useMemo(() => {
    const byWeek = new Map<number, number>();
    totals.forEach((qty, key) => {
      const weekOfYear = Number(key.split("::")[2]);
      byWeek.set(weekOfYear, (byWeek.get(weekOfYear) ?? 0) + qty);
    });
    return byWeek;
  }, [totals]);

  const fileWeekLabels = useMemo(() => (rows ? buildFileWeekLabels(rows) : new Map<number, string>()), [rows]);

  const matchedCount = Object.values(weekAssignment).filter((v) => v !== NONE).length;

  const autoMappedCount = signatures.filter((g) => productDraft[g.signature] && productDraft[g.signature] !== NONE).length;
  const unmappedSignatures = signatures.filter((g) => !productDraft[g.signature] || productDraft[g.signature] === NONE);
  const autoMappedChannels = channelValues.filter((v) => channelDraft[v] && channelDraft[v] !== IGNORE).length;

  const handleCreateMissingProducts = () => {
    if (!rows) return;
    const newProductDraft = { ...productDraft };
    unmappedSignatures.forEach((g) => {
      // Find a representative row for this signature
      const rep = rows.find((r) => rowSignature(r) === g.signature);
      if (!rep) return;
      const product = createProductFromRow(rep, Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
      addDemandProduct(product);
      newProductDraft[g.signature] = product.id;
    });
    setProductDraft(newProductDraft);
  };

  const applyToHorizon = () => {
    const fileWeekToPlanWeek = new Map<number, number>();
    horizonWeeks.forEach((w) => {
      const assigned = weekAssignment[w];
      if (assigned && assigned !== NONE) fileWeekToPlanWeek.set(Number(assigned), w);
    });

    // Auto-merge orphan file weeks (e.g. Sep W5 when plan only has Sep W4) into
    // the last plan week of the same calendar month so no data is silently dropped.
    const monthLastPlanWeek = new Map<string, number>(); // "Sep" → last planWeek in Sep
    horizonWeeks.forEach((w) => {
      const parts = weekLabel(w, params.planStartDate).split(".");
      monthLastPlanWeek.set(parts[1], w); // repeated set keeps the highest (last) week
    });
    weeksInFile.forEach((fw) => {
      if (fileWeekToPlanWeek.has(fw)) return;
      const label = fileWeekLabels.get(fw);
      if (!label) return;
      const month = label.split(" ")[0]; // "Sep"
      const target = monthLastPlanWeek.get(month);
      if (target !== undefined) fileWeekToPlanWeek.set(fw, target);
    });

    // Accumulate into plan cells first (multiple file weeks can share one plan week)
    const planCellTotals = new Map<string, number>();
    totals.forEach((qty, key) => {
      const [productId, channel, weekOfYearStr] = key.split("::");
      const planWeek = fileWeekToPlanWeek.get(Number(weekOfYearStr));
      if (planWeek === undefined) return;
      const planKey = `${productId}::${channel}::${planWeek}`;
      planCellTotals.set(planKey, (planCellTotals.get(planKey) ?? 0) + qty);
    });

    let appliedCells = 0;
    planCellTotals.forEach((qty, planKey) => {
      const [productId, channel, planWeekStr] = planKey.split("::");
      setDemandCell(productId, channel as ChannelKey, Number(planWeekStr), Math.round(qty * 100) / 100);
      appliedCells++;
    });

    // Derive selling prices from the file's Gross Sales Value (SAR) column: Σ value ÷ Σ qty.
    const derivedPrices = rows ? deriveProductPrices(rows, productMap, productsById) : {};
    let pricedProducts = 0;
    Object.entries(derivedPrices).forEach(([productId, price]) => {
      updateDemandProduct(productId, { pricePerUnit: price });
      pricedProducts++;
    });

    // ── Processing Plan feed ──────────────────────────────────────────────────
    // Save raw carton rows (SKU × plant × ISO week) so the Processing Plan can
    // explode them through the BOM without a second file upload.
    if (rows) {
      const cartonRows = rows
        .filter((r) => r.materialCode && r.grossSalesVolumeCar > 0)
        .map((r) => ({
          week: r.weekOfYear,
          plant: r.plant || "ALL",   // fall back to "ALL" if no Plnt column in file
          skuCode: r.materialCode,
          skuDescription: r.materialDescription,
          cartons: r.grossSalesVolumeCar,
        }));
      setSalesPlanCartonRows(cartonRows);
      confirmSalesPlan();
    }
    // ─────────────────────────────────────────────────────────────────────────

    setSalesPlanProductMap({ ...savedProductMap, ...productMap });
    setSalesPlanChannelMap({ ...savedChannelMap, ...channelMap });
    setAppliedMessage(
      `Applied ${appliedCells} product/channel/week cells across ${fileWeekToPlanWeek.size} matched weeks.` +
        (pricedProducts > 0 ? ` Prices updated for ${pricedProducts} products from Gross Sales Value (SAR).` : "")
    );
  };

  return (
    <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-white shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-brand-green-dark">Import Sales Plan (SAP export)</div>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">✕</button>
      </div>

      {!rows ? (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
          >
            Choose File (.xlsx / .csv)
          </button>
          <button
            onClick={() => exportSalesPlanTemplate(new Date(params.planStartDate).getFullYear())}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green transition-colors"
          >
            Download Template
          </button>
          <span className="text-xs text-neutral-400">
            Upload your filled template — products and channels are matched automatically.
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && isSalesPlanFile(file)) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <>
          {/* File summary */}
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <span className="text-neutral-500">
              <span className="font-medium text-neutral-700">{rows.length.toLocaleString()}</span> rows from{" "}
              <span className="font-medium">{fileName}</span>
            </span>
            <span className={weeksInFile.length > 0 ? "text-brand-green-dark font-medium" : "text-brand-alert font-medium"}>
              {weeksInFile.length > 0
                ? `${weeksInFile.length} weeks found (${weeksInFile[0]}–${weeksInFile[weeksInFile.length - 1]})`
                : "⚠ No weeks detected"}
            </span>
            <span className="text-brand-green-dark font-medium">
              ✓ {autoMappedCount}/{signatures.length} products auto-matched
            </span>
            <span className={autoMappedChannels < channelValues.length ? "text-amber-600 font-medium" : "text-brand-green-dark font-medium"}>
              {autoMappedChannels === channelValues.length
                ? `✓ ${autoMappedChannels} channels matched`
                : `⚠ ${channelValues.length - autoMappedChannels} channels need review`}
            </span>
          </div>

          {weeksInFile.length === 0 && fileHeaders.length > 0 && (
            <div className="text-[11px] bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              <div className="font-semibold text-amber-800">Columns detected in your file:</div>
              <div className="text-amber-700 break-all">{fileHeaders.join(" · ")}</div>
              <div className="text-amber-600 mt-1">
                The parser looks for a column matching <code className="bg-amber-100 px-1 rounded">Week No. in 2026</code> or <code className="bg-amber-100 px-1 rounded">Week No. in Month</code>. Share the exact column name above so it can be matched.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Products */}
            <div>
              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                Products
              </div>

              {/* Auto-matched summary */}
              {autoMappedCount > 0 && (
                <div className="text-[11px] text-brand-green-dark bg-brand-green-tint rounded-md px-3 py-1.5 mb-2">
                  ✓ {autoMappedCount} row type{autoMappedCount !== 1 ? "s" : ""} matched automatically
                </div>
              )}

              {/* Unmatched only */}
              {unmappedSignatures.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-amber-700">
                      {unmappedSignatures.length} row type{unmappedSignatures.length !== 1 ? "s" : ""} not in catalog
                    </span>
                    <button
                      onClick={handleCreateMissingProducts}
                      className="text-[11px] font-medium px-2 py-1 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
                    >
                      + Create all as products
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {unmappedSignatures.map((g) => (
                      <div key={g.signature} className="rounded-md border border-[var(--border-subtle)] p-2 bg-neutral-50/50">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0">
                            {g.materialCode && (
                              <div className="text-[10px] font-mono text-neutral-400 leading-tight">{g.materialCode}</div>
                            )}
                            <div className="text-[11px] font-medium text-neutral-700 truncate" title={g.materialDescription}>
                              {g.materialDescription || `${g.materialCategory} ${g.size} ${g.grading}`.trim()}
                            </div>
                            <div className="text-[10px] text-neutral-400 flex gap-2 mt-0.5">
                              {g.weightOfCarton > 0 && <span>{g.weightOfCarton} kg/ctn</span>}
                              {g.totalGsvCar > 0 && <span>{Math.round(g.totalGsvCar).toLocaleString()} CAR</span>}
                              {g.totalGsvUom > 0 && <span>{Math.round(g.totalGsvUom).toLocaleString()} UoM</span>}
                            </div>
                          </div>
                          <select
                            value={productDraft[g.signature] ?? NONE}
                            onChange={(e) => setProductDraft({ ...productDraft, [g.signature]: e.target.value })}
                            className="border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-xs shrink-0 max-w-[180px]"
                          >
                            <option value={NONE}>Ignore</option>
                            {(["wholeChicken", "cuts", "fpp", "eggs"] as const).map((cat) => (
                              <optgroup key={cat} label={PRODUCT_CATEGORY_LABELS[cat]}>
                                {demandProducts
                                  .filter((p) => p.category === cat)
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-neutral-400">All product types matched — no manual input needed.</div>
              )}

              {/* Show all matched (collapsed / toggle) */}
              {autoMappedCount > 0 && (
                <details className="mt-2">
                  <summary className="text-[11px] text-neutral-400 cursor-pointer hover:text-neutral-600 select-none">
                    Show all {signatures.length} matched rows
                  </summary>
                  <div className="space-y-1 mt-1.5 max-h-48 overflow-y-auto pr-1">
                    {signatures
                      .filter((g) => productDraft[g.signature] && productDraft[g.signature] !== NONE)
                      .map((g) => {
                        const product = productsById.get(productDraft[g.signature]);
                        return (
                          <div key={g.signature} className="flex items-center justify-between gap-2 text-[11px]">
                            <div className="min-w-0">
                              {g.materialCode && <div className="text-[10px] font-mono text-neutral-400">{g.materialCode}</div>}
                              <span className="truncate text-neutral-500" title={g.signature}>
                                {g.materialDescription || `${g.division} / ${g.materialCategory} / ${g.size} / ${g.grading}`.trim()}
                              </span>
                            </div>
                            <span className="text-brand-green-dark shrink-0">→ {product?.name ?? "—"}</span>
                          </div>
                        );
                      })}
                  </div>
                </details>
              )}
            </div>

            {/* Channels */}
            <div>
              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                Channels
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {channelValues.map((v) => (
                  <div key={v} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-neutral-600" title={v}>{v}</span>
                    <select
                      value={channelDraft[v] ?? IGNORE}
                      onChange={(e) =>
                        setChannelDraft({ ...channelDraft, [v]: e.target.value as ChannelKey | typeof IGNORE })
                      }
                      className={`border rounded px-1.5 py-0.5 text-xs shrink-0 ${
                        channelDraft[v] && channelDraft[v] !== IGNORE
                          ? "border-brand-green text-brand-green-dark"
                          : "border-[var(--border-subtle)]"
                      }`}
                    >
                      <option value={IGNORE}>Ignore</option>
                      {CHANNEL_KEYS.map((ck) => (
                        <option key={ck} value={ck}>
                          {CHANNEL_LABELS[ck]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {channelValues.length === 0 && <div className="text-xs text-neutral-400">No channels found.</div>}
              </div>
            </div>
          </div>

          {/* Week alignment */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                Plan Week ↔ File Week Alignment
              </div>
              <span className="text-xs text-neutral-400">
                {matchedCount} of {horizonWeeks.length} weeks matched
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto border border-[var(--border-subtle)] rounded-lg">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="bg-[var(--brand-green-tint)] text-[10px] uppercase tracking-wide text-brand-green-dark sticky top-0">
                    <th className="text-left px-2 py-1.5">Plan Week</th>
                    <th className="text-left px-2 py-1.5">File Week</th>
                    <th className="text-right px-2 py-1.5">Total (t)</th>
                  </tr>
                </thead>
                <tbody>
                  {horizonWeeks.map((w) => {
                    const assigned = weekAssignment[w] ?? NONE;
                    const total = assigned !== NONE ? totalsByFileWeek.get(Number(assigned)) : undefined;
                    return (
                      <tr key={w} className="border-t border-[var(--border-subtle)]">
                        <td className="px-2 py-1 text-[11px] whitespace-nowrap">{weekLabel(w, params.planStartDate)}</td>
                        <td className="px-2 py-1">
                          <select
                            value={assigned}
                            onChange={(e) => setWeekAssignment({ ...weekAssignment, [w]: e.target.value })}
                            className="border border-[var(--border-subtle)] rounded px-1 py-0.5 text-xs"
                          >
                            <option value={NONE}>—</option>
                            {weeksInFile.map((fw) => (
                              <option key={fw} value={fw}>
                                {fileWeekLabels.get(fw) ?? `Wk ${fw}`}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1 text-right">{total !== undefined ? total.toFixed(2) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={applyToHorizon}
              disabled={matchedCount === 0}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors disabled:opacity-40"
            >
              Apply to {matchedCount} Matched Week{matchedCount !== 1 ? "s" : ""}
            </button>
            <button
              onClick={() => { setRows(null); setFileName(null); setAppliedMessage(null); }}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green transition-colors"
            >
              Load Different File
            </button>
            {summary.mappedRows > 0 && (
              <span className="text-xs text-neutral-400">
                {summary.mappedRows.toLocaleString()} rows mapped · {summary.unmappedRows.toLocaleString()} ignored
              </span>
            )}
          </div>

          {appliedMessage && (
            <div className="text-xs text-brand-green-dark bg-brand-green-tint rounded-md px-3 py-1.5">
              ✓ {appliedMessage}
            </div>
          )}
        </>
      )}
    </div>
  );
}

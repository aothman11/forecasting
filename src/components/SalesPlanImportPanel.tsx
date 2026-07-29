"use client";

import { useMemo, useRef, useState } from "react";
import { usePlanStore } from "@/lib/store";
import { weekStartDate } from "@/lib/calculations";
import { exportSalesPlanTemplate } from "@/lib/export";
import { CHANNEL_KEYS, CHANNEL_LABELS, PRODUCT_CATEGORY_LABELS } from "@/lib/defaults";
import {
  aggregateSalesPlanByProductChannelWeek,
  autoMapProduct,
  createProductFromRow,
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
  const setSalesPlanProductMap = usePlanStore((s) => s.setSalesPlanProductMap);
  const setSalesPlanChannelMap = usePlanStore((s) => s.setSalesPlanChannelMap);

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

      // Auto-suggest week alignment
      const fileWeeks = distinctWeeksOfYear(parsed);
      const initialAssignment: Record<number, string> = {};
      horizonWeeks.forEach((w) => {
        const suggested = salesWeekNumber(weekStartDate(params.planStartDate, w));
        initialAssignment[w] = fileWeeks.includes(suggested) ? String(suggested) : NONE;
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

    let appliedCells = 0;
    totals.forEach((qty, key) => {
      const [productId, channel, weekOfYearStr] = key.split("::");
      const planWeek = fileWeekToPlanWeek.get(Number(weekOfYearStr));
      if (planWeek === undefined) return;
      setDemandCell(productId, channel as ChannelKey, planWeek, Math.round(qty * 100) / 100);
      appliedCells++;
    });

    setSalesPlanProductMap({ ...savedProductMap, ...productMap });
    setSalesPlanChannelMap({ ...savedChannelMap, ...channelMap });
    setAppliedMessage(`Applied ${appliedCells} product/channel/week cells across ${fileWeekToPlanWeek.size} matched weeks.`);
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
                  <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                    {unmappedSignatures.map((g) => (
                      <div key={g.signature} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-neutral-600" title={g.signature}>
                          {g.materialDescription || `${g.materialCategory} ${g.size} ${g.grading}`.trim()}{" "}
                          <span className="text-neutral-400">({g.rowCount})</span>
                        </span>
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
                            <span className="truncate text-neutral-500" title={g.signature}>
                              {g.materialDescription || `${g.division} / ${g.materialCategory} / ${g.size} / ${g.grading}`.trim()}
                            </span>
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
                    <th className="text-right px-2 py-1.5">Total Mapped (t)</th>
                  </tr>
                </thead>
                <tbody>
                  {horizonWeeks.map((w) => {
                    const assigned = weekAssignment[w] ?? NONE;
                    const total = assigned !== NONE ? totalsByFileWeek.get(Number(assigned)) : undefined;
                    return (
                      <tr key={w} className="border-t border-[var(--border-subtle)]">
                        <td className="px-2 py-1">W{w}</td>
                        <td className="px-2 py-1">
                          <select
                            value={assigned}
                            onChange={(e) => setWeekAssignment({ ...weekAssignment, [w]: e.target.value })}
                            className="border border-[var(--border-subtle)] rounded px-1 py-0.5 text-xs"
                          >
                            <option value={NONE}>—</option>
                            {weeksInFile.map((fw) => (
                              <option key={fw} value={fw}>Wk {fw}</option>
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

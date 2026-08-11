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
import type { ChannelKey, DemandPlanQty } from "@/lib/types";

const NONE = "none";
const IGNORE = "ignore";

// ── Archive helpers ──────────────────────────────────────────────────────────

function computeProductTotals(demandQty: DemandPlanQty): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [key, qty] of Object.entries(demandQty)) {
    const productId = key.split("::")[0];
    totals.set(productId, (totals.get(productId) ?? 0) + qty);
  }
  return totals;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Component ────────────────────────────────────────────────────────────────

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
  const archivedPlans = usePlanStore((s) => s.archivedPlans);
  const saveCurrentPlanToArchive = usePlanStore((s) => s.saveCurrentPlanToArchive);
  const deleteArchivedPlan = usePlanStore((s) => s.deleteArchivedPlan);

  // ── tab ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"import" | "archive">("import");

  // ── import state ────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<SalesPlanRow[] | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [productDraft, setProductDraft] = useState<Record<string, string>>({});
  const [channelDraft, setChannelDraft] = useState<Record<string, ChannelKey | typeof IGNORE>>({});
  const [weekAssignment, setWeekAssignment] = useState<Record<number, string>>({});
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);
  const [orphanSummary, setOrphanSummary] = useState<{
    merged: { fileWeek: number; label: string; targetPlanWeek: number; qty: number }[];
    dropped: { fileWeek: number; label: string; qty: number }[];
  } | null>(null);

  // ── archive / save state ─────────────────────────────────────────────────
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [savedConfirm, setSavedConfirm] = useState(false);

  // ── compare state ────────────────────────────────────────────────────────
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  // ── derived import values ────────────────────────────────────────────────
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
      setShowSaveForm(false);
      setSavedConfirm(false);

      const aggMap = new Map<string, { week: number; plant: string; skuCode: string; skuDescription: string; cartons: number }>();
      for (const r of parsed) {
        if (!r.materialCode || r.grossSalesVolumeCar <= 0) continue;
        const key = `${r.weekOfYear}::${r.plant || "ALL"}::${r.materialCode}`;
        const cur = aggMap.get(key);
        if (cur) { cur.cartons += r.grossSalesVolumeCar; }
        else { aggMap.set(key, { week: r.weekOfYear, plant: r.plant || "ALL", skuCode: r.materialCode, skuDescription: r.materialDescription, cartons: r.grossSalesVolumeCar }); }
      }
      setSalesPlanCartonRows([...aggMap.values()]);
      confirmSalesPlan();

      const prodDraft: Record<string, string> = {};
      distinctRowSignatures(parsed).forEach((g) => {
        if (savedProductMap[g.signature]) {
          prodDraft[g.signature] = savedProductMap[g.signature];
        } else {
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

      const chDraft: Record<string, ChannelKey | typeof IGNORE> = {};
      distinctValues(parsed, "channel").forEach((v) => {
        chDraft[v] = savedChannelMap[v] ?? normalizeChannelKey(v) ?? IGNORE;
      });
      setChannelDraft(chDraft);

      const fileWeeks = distinctWeeksOfYear(parsed);
      const fwLabelsMap = buildFileWeekLabels(parsed);
      const labelToFw = new Map<string, number>();
      fwLabelsMap.forEach((label, fw) => labelToFw.set(label, fw));

      const initialAssignment: Record<number, string> = {};
      horizonWeeks.forEach((w) => {
        const full = weekLabel(w, params.planStartDate);
        const parts = full.split(".");
        const shortLabel = `${parts[1]} ${parts[2]}`;
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
    const autoMergedFileWeeks = new Set<number>();

    horizonWeeks.forEach((w) => {
      const assigned = weekAssignment[w];
      if (assigned && assigned !== NONE) fileWeekToPlanWeek.set(Number(assigned), w);
    });

    const monthLastPlanWeek = new Map<string, number>();
    horizonWeeks.forEach((w) => {
      const parts = weekLabel(w, params.planStartDate).split(".");
      monthLastPlanWeek.set(parts[1], w);
    });
    weeksInFile.forEach((fw) => {
      if (fileWeekToPlanWeek.has(fw)) return;
      const label = fileWeekLabels.get(fw);
      if (!label) return;
      const month = label.split(" ")[0];
      const target = monthLastPlanWeek.get(month);
      if (target !== undefined) {
        fileWeekToPlanWeek.set(fw, target);
        autoMergedFileWeeks.add(fw);
      }
    });

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

    const derivedPrices = rows ? deriveProductPrices(rows, productMap, productsById) : {};
    let pricedProducts = 0;
    Object.entries(derivedPrices).forEach(([productId, price]) => {
      updateDemandProduct(productId, { pricePerUnit: price });
      pricedProducts++;
    });

    setSalesPlanProductMap({ ...savedProductMap, ...productMap });
    setSalesPlanChannelMap({ ...savedChannelMap, ...channelMap });
    setAppliedMessage(
      `Applied ${appliedCells} product/channel/week cells across ${fileWeekToPlanWeek.size} matched weeks.` +
        (pricedProducts > 0 ? ` Prices updated for ${pricedProducts} products from Gross Sales Value (SAR).` : "")
    );

    const mergedItems: { fileWeek: number; label: string; targetPlanWeek: number; qty: number }[] = [];
    const droppedItems: { fileWeek: number; label: string; qty: number }[] = [];
    weeksInFile.forEach((fw) => {
      const label = fileWeekLabels.get(fw) ?? `Wk ${fw}`;
      const qty = totalsByFileWeek.get(fw) ?? 0;
      if (autoMergedFileWeeks.has(fw)) {
        mergedItems.push({ fileWeek: fw, label, targetPlanWeek: fileWeekToPlanWeek.get(fw)!, qty });
      } else if (!fileWeekToPlanWeek.has(fw)) {
        droppedItems.push({ fileWeek: fw, label, qty });
      }
    });
    setOrphanSummary(
      mergedItems.length > 0 || droppedItems.length > 0
        ? { merged: mergedItems, dropped: droppedItems }
        : null
    );
  };

  const handleSaveToArchive = () => {
    const label = saveLabel.trim() || `Plan ${new Date().toLocaleDateString("en-GB")}`;
    saveCurrentPlanToArchive(label);
    setSaveLabel("");
    setShowSaveForm(false);
    setSavedConfirm(true);
    setTimeout(() => setSavedConfirm(false), 3000);
  };

  // ── compare logic ─────────────────────────────────────────────────────────
  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev
    );
    setShowCompare(false);
  };

  const comparePlans = archivedPlans.filter((p) => compareIds.includes(p.id));
  const planATotals = comparePlans[0] ? computeProductTotals(comparePlans[0].demandQty) : null;
  const planBTotals = comparePlans[1] ? computeProductTotals(comparePlans[1].demandQty) : null;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-white shadow-sm space-y-4">
      {/* Header + tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-brand-green-dark">Sales Plan</div>
          <div className="flex rounded-md border border-[var(--border-subtle)] overflow-hidden text-xs">
            {(["import", "archive"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? "bg-brand-green text-white"
                    : "hover:bg-[var(--brand-green-tint)] text-neutral-600"
                }`}
              >
                {tab === "archive" ? `Archive (${archivedPlans.length})` : "Import"}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">✕</button>
      </div>

      {/* ── IMPORT TAB ── */}
      {activeTab === "import" && (
        <>
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
                  <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">Products</div>
                  {autoMappedCount > 0 && (
                    <div className="text-[11px] text-brand-green-dark bg-brand-green-tint rounded-md px-3 py-1.5 mb-2">
                      ✓ {autoMappedCount} row type{autoMappedCount !== 1 ? "s" : ""} matched automatically
                    </div>
                  )}
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
                                        <option key={p.id} value={p.id}>{p.name}</option>
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
                  <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">Channels</div>
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
                            <option key={ck} value={ck}>{CHANNEL_LABELS[ck]}</option>
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
                                  <option key={fw} value={fw}>{fileWeekLabels.get(fw) ?? `Wk ${fw}`}</option>
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
                  onClick={() => { setRows(null); setFileName(null); setAppliedMessage(null); setShowSaveForm(false); setSavedConfirm(false); }}
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
                <div className="text-xs text-brand-green-dark bg-brand-green-tint rounded-md px-3 py-2 space-y-2">
                  <div>✓ {appliedMessage}</div>

                  {/* Save to Archive */}
                  {!showSaveForm && !savedConfirm && (
                    <button
                      onClick={() => { setShowSaveForm(true); setSaveLabel(fileName?.replace(/\.[^.]+$/, "") ?? ""); }}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-brand-green text-brand-green-dark hover:bg-brand-green hover:text-white transition-colors"
                    >
                      📁 Save to Archive
                    </button>
                  )}
                  {showSaveForm && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        value={saveLabel}
                        onChange={(e) => setSaveLabel(e.target.value)}
                        placeholder="Label for this plan…"
                        className="text-xs border border-[var(--border-subtle)] rounded px-2 py-1 min-w-0 flex-1"
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveToArchive(); if (e.key === "Escape") setShowSaveForm(false); }}
                        autoFocus
                      />
                      <button
                        onClick={handleSaveToArchive}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors whitespace-nowrap"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setShowSaveForm(false)}
                        className="text-[11px] text-neutral-400 hover:text-neutral-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {savedConfirm && (
                    <div className="text-[11px] text-brand-green-dark font-medium">📁 Saved to Archive</div>
                  )}
                </div>
              )}

              {orphanSummary && (orphanSummary.merged.length > 0 || orphanSummary.dropped.length > 0) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-1.5">
                  {orphanSummary.merged.length > 0 && (
                    <div>
                      <span className="font-semibold">
                        {orphanSummary.merged.length} file week{orphanSummary.merged.length !== 1 ? "s" : ""} auto-merged
                      </span>{" "}
                      (absorbed into the last plan week of the same month):
                      <ul className="mt-1 space-y-0.5 pl-3 list-disc">
                        {orphanSummary.merged.map((m) => (
                          <li key={m.fileWeek}>
                            <span className="font-mono">{m.label}</span> →{" "}
                            <span className="font-mono">{weekLabel(m.targetPlanWeek, params.planStartDate)}</span>
                            {" "}({m.qty.toFixed(2)} t added to target week)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {orphanSummary.dropped.length > 0 && (
                    <div>
                      <span className="font-semibold text-red-700">
                        {orphanSummary.dropped.length} file week{orphanSummary.dropped.length !== 1 ? "s" : ""} had no matching plan week and were dropped:
                      </span>
                      <ul className="mt-1 space-y-0.5 pl-3 list-disc text-red-700">
                        {orphanSummary.dropped.map((d) => (
                          <li key={d.fileWeek}>
                            <span className="font-mono">{d.label}</span> — {d.qty.toFixed(2)} t discarded.
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── ARCHIVE TAB ── */}
      {activeTab === "archive" && (
        <div className="space-y-3">
          {archivedPlans.length === 0 ? (
            <div className="text-xs text-neutral-400 py-6 text-center">
              No plans archived yet. Import a sales plan, apply it, then click <strong>Save to Archive</strong>.
            </div>
          ) : (
            <>
              {compareIds.length === 2 && !showCompare && (
                <button
                  onClick={() => setShowCompare(true)}
                  className="w-full text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
                >
                  Compare Selected Plans
                </button>
              )}
              {compareIds.length > 0 && (
                <div className="text-[11px] text-neutral-400">
                  {compareIds.length === 1 ? "Select one more plan to compare." : ""}
                  {compareIds.length === 2 && !showCompare ? "" : ""}
                  <button onClick={() => { setCompareIds([]); setShowCompare(false); }} className="ml-2 text-brand-alert hover:underline">
                    Clear selection
                  </button>
                </div>
              )}

              {/* Plan list */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {[...archivedPlans].reverse().map((plan) => {
                  const isSelected = compareIds.includes(plan.id);
                  const isDisabled = compareIds.length === 2 && !isSelected;
                  return (
                    <div
                      key={plan.id}
                      className={`rounded-lg border p-3 flex items-center gap-3 ${
                        isSelected ? "border-brand-green bg-brand-green-tint" : "border-[var(--border-subtle)] bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={() => toggleCompare(plan.id)}
                        className="accent-[var(--brand-green)] shrink-0"
                        title="Select for comparison"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-neutral-800 truncate">{plan.label}</div>
                        <div className="text-[10px] text-neutral-400 mt-0.5">
                          {formatDate(plan.savedAt)} · {plan.totalQty.toFixed(1)} total qty
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${plan.label}" from archive?`)) {
                            deleteArchivedPlan(plan.id);
                            setCompareIds((prev) => prev.filter((x) => x !== plan.id));
                            setShowCompare(false);
                          }
                        }}
                        className="text-neutral-300 hover:text-brand-alert text-sm shrink-0 transition-colors"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Compare view */}
              {showCompare && comparePlans.length === 2 && planATotals && planBTotals && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-neutral-700">Side-by-side comparison</div>
                    <button onClick={() => setShowCompare(false)} className="text-[11px] text-neutral-400 hover:text-neutral-700">
                      Hide
                    </button>
                  </div>

                  {/* Column headers */}
                  <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 px-2">
                    <div>Product</div>
                    <div className="text-right truncate" title={comparePlans[0].label}>{comparePlans[0].label}</div>
                    <div className="text-right truncate" title={comparePlans[1].label}>{comparePlans[1].label}</div>
                    <div className="text-right">Diff</div>
                  </div>

                  <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
                    <div className="max-h-72 overflow-y-auto">
                      {(["wholeChicken", "cuts", "fpp", "eggs"] as const).map((cat) => {
                        const catProducts = demandProducts.filter((p) => p.category === cat);
                        if (catProducts.length === 0) return null;
                        const catRows = catProducts.map((p) => {
                          const a = planATotals.get(p.id) ?? 0;
                          const b = planBTotals.get(p.id) ?? 0;
                          const diff = b - a;
                          if (a === 0 && b === 0) return null;
                          return { p, a, b, diff };
                        }).filter(Boolean) as { p: typeof catProducts[0]; a: number; b: number; diff: number }[];
                        if (catRows.length === 0) return null;
                        return (
                          <div key={cat}>
                            <div className="bg-[var(--brand-green-tint)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-green-dark">
                              {PRODUCT_CATEGORY_LABELS[cat]}
                            </div>
                            {catRows.map(({ p, a, b, diff }) => (
                              <div
                                key={p.id}
                                className="grid grid-cols-4 gap-1 px-3 py-1.5 text-xs border-t border-[var(--border-subtle)] tabular-nums hover:bg-neutral-50"
                              >
                                <div className="truncate text-neutral-700" title={p.name}>{p.name}</div>
                                <div className="text-right text-neutral-600">{a.toFixed(1)}</div>
                                <div className="text-right text-neutral-600">{b.toFixed(1)}</div>
                                <div className={`text-right font-medium ${diff > 0 ? "text-brand-green-dark" : diff < 0 ? "text-brand-alert" : "text-neutral-400"}`}>
                                  {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

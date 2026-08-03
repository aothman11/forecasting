"use client";

import { useState } from "react";
import { usePlanStore } from "@/lib/store";
import { categoryTotal, channelRevenue, getDemandCell, groupWeeksByMonth, slugifyProductName } from "@/lib/demandPlan";
import { CHANNEL_KEYS, CHANNEL_LABELS, EGG_TRAYS_PER_CARTON, PRODUCT_CATEGORY_LABELS } from "@/lib/defaults";
import { exportDemandPlanToExcel } from "@/lib/export";
import { DemandPlanMatrix } from "./DemandPlanMatrix";
import { SalesPlanImportPanel } from "./SalesPlanImportPanel";
import type { ChannelKey, ProductCategory } from "@/lib/types";

const CATEGORY_OPTIONS: { value: ProductCategory | "all"; label: string }[] = [
  { value: "all", label: "All Categories" },
  { value: "wholeChicken", label: "Whole Chicken" },
  { value: "cuts", label: "Cuts" },
  { value: "fpp", label: "FPP" },
  { value: "eggs", label: "Eggs" },
];

const CATEGORY_META: Record<ProductCategory, { icon: string; borderCls: string; valueCls: string; badgeCls: string }> = {
  wholeChicken: { icon: "🐔", borderCls: "border-l-blue-400",   valueCls: "text-blue-700",   badgeCls: "bg-blue-50 text-blue-600 border-blue-200" },
  cuts:         { icon: "🔪", borderCls: "border-l-orange-400", valueCls: "text-orange-700", badgeCls: "bg-orange-50 text-orange-600 border-orange-200" },
  fpp:          { icon: "⚙️",  borderCls: "border-l-violet-400", valueCls: "text-violet-700", badgeCls: "bg-violet-50 text-violet-600 border-violet-200" },
  eggs:         { icon: "🥚", borderCls: "border-l-amber-400",  valueCls: "text-amber-700",  badgeCls: "bg-amber-50 text-amber-600 border-amber-200" },
};

export function DemandForecast() {
  const params = usePlanStore((s) => s.params);
  const demandProducts = usePlanStore((s) => s.demandProducts);
  const demandQty = usePlanStore((s) => s.demandQty);
  const setDemandCell = usePlanStore((s) => s.setDemandCell);
  const addDemandProduct = usePlanStore((s) => s.addDemandProduct);
  const updateDemandProduct = usePlanStore((s) => s.updateDemandProduct);
  const removeDemandProduct = usePlanStore((s) => s.removeDemandProduct);
  const bulkAdjustDemandPlan = usePlanStore((s) => s.bulkAdjustDemandPlan);
  const copyDemandWeekForwardAction = usePlanStore((s) => s.copyDemandWeekForwardAction);
  const clearDemandPlan = usePlanStore((s) => s.clearDemandPlan);

  const [viewMode, setViewMode] = useState<"weekly" | "monthly">("weekly");
  const [channel, setChannel] = useState<ChannelKey | "ALL">("ALL");
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const [newCategory, setNewCategory] = useState<ProductCategory>("cuts");
  const [newName, setNewName] = useState("");
  const [newGrade, setNewGrade] = useState<"A" | "B">("A");
  const [newWeight, setNewWeight] = useState(900);
  const [newFreshFrozen, setNewFreshFrozen] = useState<"fresh" | "frozen">("fresh");
  const [newYieldPct, setNewYieldPct] = useState(10);
  const [newPrice, setNewPrice] = useState(0);
  const [pricesOpen, setPricesOpen] = useState(false);

  const [adjustCategory, setAdjustCategory] = useState<ProductCategory | "all">("all");
  const [adjustWeekStart, setAdjustWeekStart] = useState(1);
  const [adjustWeekEnd, setAdjustWeekEnd] = useState(params.planningHorizonWeeks);
  const [adjustPct, setAdjustPct] = useState(5);

  const [copyFrom, setCopyFrom] = useState(1);
  const [copyTo, setCopyTo] = useState(2);

  const weeks = Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1);
  const monthGroups = groupWeeksByMonth(weeks, params.planStartDate);

  const CARTON_KG: Partial<Record<ProductCategory, number>> = { wholeChicken: 15, cuts: 15, fpp: 10 };

  const toCar = (cat: ProductCategory, qty: number) =>
    cat === "eggs" ? Math.round(qty / EGG_TRAYS_PER_CARTON) : Math.round((qty * 1000) / CARTON_KG[cat]!);

  const categoryTotals = (["wholeChicken", "cuts", "fpp", "eggs"] as ProductCategory[]).map((cat) => {
    const qty = categoryTotal(demandProducts, demandQty, cat, channel, weeks);
    return { cat, qty, display: `${toCar(cat, qty).toLocaleString()} CAR` };
  });
  const totalCar = categoryTotals.reduce((s, { cat, qty }) => s + toCar(cat, qty), 0);
  const totalRevenue = channelRevenue(demandProducts, demandQty, channel, weeks);
  const revenueByChannel = CHANNEL_KEYS.map((ch) => ({
    ch,
    revenue: channelRevenue(demandProducts, demandQty, ch, weeks),
  }));
  const anyPrices = demandProducts.some((p) => (p.pricePerUnit ?? 0) > 0);

  const fmtSar = (n: number) =>
    Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : Math.round(n).toLocaleString();

  const handleAddProduct = () => {
    if (!newName.trim()) return;
    const id = `${newCategory}-${slugifyProductName(newName)}-${Date.now().toString(36)}`;
    const pricePerUnit = newPrice > 0 ? newPrice : undefined;
    if (newCategory === "wholeChicken") {
      addDemandProduct({
        id,
        category: "wholeChicken",
        name: newName.trim(),
        grade: newGrade,
        weightBucketG: newWeight,
        freshFrozen: newFreshFrozen,
        unit: "ton",
        pricePerUnit,
      });
    } else if (newCategory === "fpp") {
      addDemandProduct({ id, category: "fpp", name: newName.trim(), yieldPct: newYieldPct / 100, unit: "ton", pricePerUnit });
    } else if (newCategory === "eggs") {
      addDemandProduct({ id, category: "eggs", name: newName.trim(), unit: "tray", pricePerUnit });
    } else {
      addDemandProduct({ id, category: "cuts", name: newName.trim(), unit: "ton", pricePerUnit });
    }
    setNewName("");
    setAddOpen(false);
  };

  const handleAdjust = () => {
    const productIds =
      adjustCategory === "all"
        ? demandProducts.map((p) => p.id)
        : demandProducts.filter((p) => p.category === adjustCategory).map((p) => p.id);
    bulkAdjustDemandPlan({
      productIds,
      channel,
      weekStart: adjustWeekStart,
      weekEnd: adjustWeekEnd,
      pctChange: adjustPct / 100,
    });
    setAdjustOpen(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold section-title">Demand Plan</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Weekly demand by product and sales channel, in tons (eggs in trays). The starting point for the supply
          plan.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {/* Revenue — gold accent */}
        <div className="rounded-xl border border-[var(--border-subtle)] border-l-4 border-l-amber-400 bg-white shadow-sm p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Revenue</span>
            <span className="text-lg leading-none">💰</span>
          </div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums leading-tight">
            {anyPrices ? fmtSar(totalRevenue) : "—"}
          </div>
          <div className="text-[11px] text-neutral-400 font-medium">
            {anyPrices ? `SAR · ${channel === "ALL" ? "all channels" : CHANNEL_LABELS[channel]}` : "set prices to see value"}
          </div>
        </div>
        {/* Total demand — green accent */}
        <div className="rounded-xl border border-[var(--border-subtle)] border-l-4 border-l-brand-green bg-white shadow-sm p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total Demand</span>
            <span className="text-lg leading-none">📊</span>
          </div>
          <div className="text-2xl font-bold text-brand-green-dark tabular-nums leading-tight">
            {totalCar.toLocaleString()}
          </div>
          <div className="text-[11px] text-neutral-400 font-medium">CAR · all categories</div>
        </div>

        {/* Per-category cards */}
        {categoryTotals.map(({ cat, qty }) => {
          const meta = CATEGORY_META[cat];
          const cars = toCar(cat, qty);
          const pct = totalCar > 0 ? Math.round((cars / totalCar) * 100) : 0;
          return (
            <div key={cat} className={`rounded-xl border border-[var(--border-subtle)] border-l-4 ${meta.borderCls} bg-white shadow-sm p-4 flex flex-col gap-1.5`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  {PRODUCT_CATEGORY_LABELS[cat]}
                </span>
                <span className="text-lg leading-none">{meta.icon}</span>
              </div>
              <div className={`text-2xl font-bold tabular-nums leading-tight ${meta.valueCls}`}>
                {cars.toLocaleString()}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-400 font-medium">CAR</span>
                {pct > 0 && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${meta.badgeCls}`}>
                    {pct}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* View toggle */}
        <div className="inline-flex items-center bg-neutral-100 rounded-lg p-0.5 gap-0.5 text-xs font-medium">
          <button
            onClick={() => setViewMode("weekly")}
            className={`px-3.5 py-1.5 rounded-md transition-all ${viewMode === "weekly" ? "bg-white shadow text-brand-green-dark font-semibold" : "text-neutral-500 hover:text-neutral-700"}`}
          >
            Weekly
          </button>
          <button
            onClick={() => setViewMode("monthly")}
            className={`px-3.5 py-1.5 rounded-md transition-all ${viewMode === "monthly" ? "bg-white shadow text-brand-green-dark font-semibold" : "text-neutral-500 hover:text-neutral-700"}`}
          >
            Monthly
          </button>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setAddOpen((v) => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${addOpen ? "border-brand-green text-brand-green-dark bg-brand-green-tint" : "border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green"}`}
        >
          Add Product
        </button>
        <button
          onClick={() => setPricesOpen((v) => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${pricesOpen ? "border-brand-green text-brand-green-dark bg-brand-green-tint" : "border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green"}`}
        >
          💰 Prices
        </button>
        <button
          onClick={() => setCopyOpen((v) => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${copyOpen ? "border-brand-green text-brand-green-dark bg-brand-green-tint" : "border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green"}`}
        >
          Copy Week Forward
        </button>
        <button
          onClick={() => setAdjustOpen((v) => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${adjustOpen ? "border-brand-green text-brand-green-dark bg-brand-green-tint" : "border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green"}`}
        >
          % Adjust
        </button>
        <button
          onClick={() => setImportOpen((v) => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${importOpen ? "border-brand-green text-brand-green-dark bg-brand-green-tint" : "border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green"}`}
        >
          Import Sales Plan
        </button>
        <button
          onClick={() => exportDemandPlanToExcel(demandProducts, demandQty, weeks)}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
        >
          Export Demand Plan
        </button>
        <div className="border-l border-[var(--border-subtle)] h-5 mx-1 self-center" />
        <button
          onClick={() => {
            if (confirm("Clear all demand quantities? This will zero every product/channel/week cell. This cannot be undone.")) {
              clearDemandPlan();
            }
          }}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
        >
          🗑 Delete Plan
        </button>
      </div>

      {addOpen && (
        <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-white shadow-sm space-y-2">
          <div className="text-sm font-semibold text-brand-green-dark">Add Product</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs text-neutral-600">
              Category
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as ProductCategory)}
                className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs"
              >
                <option value="wholeChicken">Whole Chicken</option>
                <option value="cuts">Cuts</option>
                <option value="fpp">FPP</option>
                <option value="eggs">Eggs</option>
              </select>
            </label>
            <label className="flex flex-col text-xs text-neutral-600">
              Name
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Seasoned Wings"
                className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs w-48"
              />
            </label>
            {newCategory === "wholeChicken" && (
              <>
                <label className="flex flex-col text-xs text-neutral-600">
                  Grade
                  <select value={newGrade} onChange={(e) => setNewGrade(e.target.value as "A" | "B")} className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs">
                    <option value="A">A</option>
                    <option value="B">B</option>
                  </select>
                </label>
                <label className="flex flex-col text-xs text-neutral-600">
                  Weight (g)
                  <input
                    type="number"
                    step={50}
                    value={newWeight}
                    onChange={(e) => setNewWeight(Number(e.target.value))}
                    className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs w-20"
                  />
                </label>
                <label className="flex flex-col text-xs text-neutral-600">
                  Fresh / Frozen
                  <select
                    value={newFreshFrozen}
                    onChange={(e) => setNewFreshFrozen(e.target.value as "fresh" | "frozen")}
                    className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs"
                  >
                    <option value="fresh">Fresh</option>
                    <option value="frozen">Frozen</option>
                  </select>
                </label>
              </>
            )}
            {newCategory === "fpp" && (
              <label className="flex flex-col text-xs text-neutral-600">
                Yield % (from FPP input)
                <input
                  type="number"
                  step={1}
                  value={newYieldPct}
                  onChange={(e) => setNewYieldPct(Number(e.target.value))}
                  className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs w-20"
                />
              </label>
            )}
            <label className="flex flex-col text-xs text-neutral-600">
              Price (SAR/{newCategory === "eggs" ? "tray" : "ton"})
              <input
                type="number"
                min={0}
                step={100}
                value={newPrice}
                onChange={(e) => setNewPrice(Number(e.target.value))}
                className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs w-24"
              />
            </label>
            <button onClick={handleAddProduct} className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors">
              Add
            </button>
          </div>
        </div>
      )}

      {pricesOpen && (
        <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-white shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-brand-green-dark">Product Prices (SAR per ton · eggs per tray)</div>
            <span className="text-[11px] text-neutral-400">Used to compute revenue by channel</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 max-h-72 overflow-y-auto pr-1">
            {(["wholeChicken", "cuts", "fpp", "eggs"] as const).map((cat) => (
              <div key={cat}>
                <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mt-2 mb-1">
                  {PRODUCT_CATEGORY_LABELS[cat]}
                </div>
                {demandProducts
                  .filter((p) => p.category === cat)
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-xs py-0.5">
                      <span className="truncate text-neutral-600">{p.name}</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={p.pricePerUnit ?? 0}
                        onChange={(e) => updateDemandProduct(p.id, { pricePerUnit: Number(e.target.value) || undefined })}
                        className="w-24 text-right border border-[var(--border-subtle)] rounded px-1.5 py-0.5 tabular-nums shrink-0"
                      />
                    </div>
                  ))}
              </div>
            ))}
          </div>
          {anyPrices && (
            <div className="border-t border-[var(--border-subtle)] pt-2">
              <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
                Revenue by Channel (full horizon)
              </div>
              <div className="flex flex-wrap gap-2">
                {revenueByChannel
                  .filter((r) => r.revenue > 0)
                  .sort((a, b) => b.revenue - a.revenue)
                  .map(({ ch, revenue }) => (
                    <span key={ch} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
                      {CHANNEL_LABELS[ch]}
                      <strong className="tabular-nums">{fmtSar(revenue)} SAR</strong>
                    </span>
                  ))}
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-brand-green-tint border border-brand-green/30 text-brand-green-dark font-semibold">
                  Total <strong className="tabular-nums">{fmtSar(revenueByChannel.reduce((s, r) => s + r.revenue, 0))} SAR</strong>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {copyOpen && (
        <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-white shadow-sm flex flex-wrap items-end gap-3">
          <div className="text-sm font-semibold text-brand-green-dark w-full">
            Copy Week Forward ({channel === "ALL" ? "all channels" : CHANNEL_LABELS[channel]})
          </div>
          <label className="flex flex-col text-xs text-neutral-600">
            From week
            <select value={copyFrom} onChange={(e) => setCopyFrom(Number(e.target.value))} className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs">
              {weeks.map((w) => (
                <option key={w} value={w}>
                  W{w}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-neutral-600">
            To week
            <select value={copyTo} onChange={(e) => setCopyTo(Number(e.target.value))} className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs">
              {weeks.map((w) => (
                <option key={w} value={w}>
                  W{w}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              copyDemandWeekForwardAction(channel, copyFrom, copyTo);
              setCopyOpen(false);
            }}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
          >
            Copy
          </button>
        </div>
      )}

      {adjustOpen && (
        <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-white shadow-sm flex flex-wrap items-end gap-3">
          <div className="text-sm font-semibold text-brand-green-dark w-full">
            % Adjust ({channel === "ALL" ? "all channels" : CHANNEL_LABELS[channel]})
          </div>
          <label className="flex flex-col text-xs text-neutral-600">
            Category
            <select value={adjustCategory} onChange={(e) => setAdjustCategory(e.target.value as ProductCategory | "all")} className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs">
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-neutral-600">
            From week
            <select value={adjustWeekStart} onChange={(e) => setAdjustWeekStart(Number(e.target.value))} className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs">
              {weeks.map((w) => (
                <option key={w} value={w}>
                  W{w}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-neutral-600">
            To week
            <select value={adjustWeekEnd} onChange={(e) => setAdjustWeekEnd(Number(e.target.value))} className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs">
              {weeks.map((w) => (
                <option key={w} value={w}>
                  W{w}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-neutral-600">
            % change
            <input
              type="number"
              step={1}
              value={adjustPct}
              onChange={(e) => setAdjustPct(Number(e.target.value))}
              className="border border-[var(--border-subtle)] rounded px-2 py-1 text-xs w-20"
            />
          </label>
          <button onClick={handleAdjust} className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors">
            Apply
          </button>
        </div>
      )}

      {importOpen && <SalesPlanImportPanel onClose={() => setImportOpen(false)} />}

      {viewMode === "weekly" && (
        <>
          <div className="flex items-center gap-1 pb-px border-b border-[var(--border-subtle)] overflow-x-auto">
            {(["ALL", ...CHANNEL_KEYS] as const).map((c) => (
              <button
                key={c}
                onClick={() => setChannel(c)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px whitespace-nowrap transition-all ${
                  channel === c
                    ? "border-brand-green text-brand-green-dark bg-brand-green-tint/60 font-semibold"
                    : "border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {c === "ALL" ? "All Channels" : CHANNEL_LABELS[c]}
              </button>
            ))}
          </div>
          <DemandPlanMatrix
            products={demandProducts}
            qty={demandQty}
            channel={channel}
            weeks={weeks}
            planStartDate={params.planStartDate}
            onCellChange={channel !== "ALL" ? (productId, week, value) => setDemandCell(productId, channel, week, value) : undefined}
            onRemoveProduct={removeDemandProduct}
          />
        </>
      )}

      {viewMode === "monthly" && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-brand-green-tint border-b border-[var(--border-subtle)]">
                <th className="sticky left-0 bg-brand-green-tint text-left px-3 py-2 font-semibold text-brand-green-dark whitespace-nowrap z-10 min-w-[160px]">
                  Product
                </th>
                {monthGroups.map(({ monthLabel }) => (
                  <th key={monthLabel} className="text-right px-3 py-2 font-semibold text-brand-green-dark whitespace-nowrap min-w-[90px]">
                    {monthLabel}
                  </th>
                ))}
                <th className="text-right px-3 py-2 font-semibold text-brand-green-dark whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody>
              {(["wholeChicken", "cuts", "fpp", "eggs"] as const).map((cat) => {
                const catProducts = demandProducts.filter((p) => p.category === cat);
                if (catProducts.length === 0) return null;
                const catMonthTotals = monthGroups.map(({ weeks: mw }) =>
                  catProducts.reduce((s, p) => s + mw.reduce((ws, w) => ws + getDemandCell(demandQty, p.id, channel, w), 0), 0)
                );
                const catTotal = catMonthTotals.reduce((s, v) => s + v, 0);
                return [
                  <tr key={`cat-${cat}`} className="border-b border-[var(--border-subtle)] bg-neutral-50">
                    <td colSpan={monthGroups.length + 2} className="px-3 py-1.5 font-semibold text-brand-green-dark uppercase tracking-wider text-[10px]">
                      {PRODUCT_CATEGORY_LABELS[cat]}
                    </td>
                  </tr>,
                  ...catProducts.map((p) => {
                    const monthVals = monthGroups.map(({ weeks: mw }) =>
                      mw.reduce((s, w) => s + getDemandCell(demandQty, p.id, channel, w), 0)
                    );
                    const rowTotal = monthVals.reduce((s, v) => s + v, 0);
                    return (
                      <tr key={p.id} className="border-b border-[var(--border-subtle)] hover:bg-neutral-50">
                        <td className="sticky left-0 bg-white px-3 py-2 text-neutral-700 z-10">{p.name}</td>
                        {monthVals.map((v, i) => (
                          <td key={i} className="px-3 py-2 text-right tabular-nums">
                            {v > 0 ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : <span className="text-neutral-300">—</span>}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-green-dark">
                          {rowTotal > 0 ? rowTotal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : <span className="text-neutral-300">—</span>}
                        </td>
                      </tr>
                    );
                  }),
                  <tr key={`subtotal-${cat}`} className="border-b-2 border-brand-green/20 bg-brand-green-tint/40">
                    <td className="sticky left-0 bg-brand-green-tint/40 px-3 py-1.5 font-semibold text-brand-green-dark z-10">Subtotal</td>
                    {catMonthTotals.map((v, i) => (
                      <td key={i} className="px-3 py-1.5 text-right tabular-nums font-semibold text-brand-green-dark">
                        {v > 0 ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : <span className="text-neutral-300">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right tabular-nums font-bold text-brand-green-dark">
                      {catTotal > 0 ? catTotal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : <span className="text-neutral-300">—</span>}
                    </td>
                  </tr>,
                ];
              })}
              <tr className="bg-neutral-50 font-semibold">
                <td className="sticky left-0 bg-neutral-50 px-3 py-2 font-bold text-neutral-700 z-10">Grand Total</td>
                {monthGroups.map(({ weeks: mw }, i) => {
                  const v = demandProducts.reduce((s, p) => s + mw.reduce((ws, w) => ws + getDemandCell(demandQty, p.id, channel, w), 0), 0);
                  return (
                    <td key={i} className="px-3 py-2 text-right tabular-nums font-bold text-neutral-800">
                      {v > 0 ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : <span className="text-neutral-300">—</span>}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right tabular-nums font-bold text-brand-green-dark">
                  {demandProducts.reduce((s, p) => s + weeks.reduce((ws, w) => ws + getDemandCell(demandQty, p.id, channel, w), 0), 0)
                    .toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-[11px] text-neutral-400 px-3 py-2">
            Monthly view is read-only. Switch to Weekly to edit values. Units: tons (eggs in trays).
          </p>
        </div>
      )}
    </div>
  );
}

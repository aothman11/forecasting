"use client";

import { useState } from "react";
import { usePlanStore } from "@/lib/store";
import { categoryTotal, slugifyProductName } from "@/lib/demandPlan";
import { CHANNEL_KEYS, CHANNEL_LABELS, EGG_TRAYS_PER_CARTON, PRODUCT_CATEGORY_LABELS } from "@/lib/defaults";
import { exportDemandPlanToExcel } from "@/lib/export";
import { SummaryCard } from "./shared/SummaryCard";
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

export function DemandForecast() {
  const params = usePlanStore((s) => s.params);
  const demandProducts = usePlanStore((s) => s.demandProducts);
  const demandQty = usePlanStore((s) => s.demandQty);
  const setDemandCell = usePlanStore((s) => s.setDemandCell);
  const addDemandProduct = usePlanStore((s) => s.addDemandProduct);
  const removeDemandProduct = usePlanStore((s) => s.removeDemandProduct);
  const bulkAdjustDemandPlan = usePlanStore((s) => s.bulkAdjustDemandPlan);
  const copyDemandWeekForwardAction = usePlanStore((s) => s.copyDemandWeekForwardAction);

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

  const [adjustCategory, setAdjustCategory] = useState<ProductCategory | "all">("all");
  const [adjustWeekStart, setAdjustWeekStart] = useState(1);
  const [adjustWeekEnd, setAdjustWeekEnd] = useState(params.planningHorizonWeeks);
  const [adjustPct, setAdjustPct] = useState(5);

  const [copyFrom, setCopyFrom] = useState(1);
  const [copyTo, setCopyTo] = useState(2);

  const weeks = Array.from({ length: params.planningHorizonWeeks }, (_, i) => i + 1);

  const CARTON_KG: Partial<Record<ProductCategory, number>> = { wholeChicken: 15, cuts: 15, fpp: 10 };

  const toCar = (cat: ProductCategory, qty: number) =>
    cat === "eggs" ? Math.round(qty / EGG_TRAYS_PER_CARTON) : Math.round((qty * 1000) / CARTON_KG[cat]!);

  const categoryTotals = (["wholeChicken", "cuts", "fpp", "eggs"] as ProductCategory[]).map((cat) => {
    const qty = categoryTotal(demandProducts, demandQty, cat, channel, weeks);
    return { cat, qty, display: `${toCar(cat, qty).toLocaleString()} CAR` };
  });
  const totalCar = categoryTotals.reduce((s, { cat, qty }) => s + toCar(cat, qty), 0);

  const handleAddProduct = () => {
    if (!newName.trim()) return;
    const id = `${newCategory}-${slugifyProductName(newName)}-${Date.now().toString(36)}`;
    if (newCategory === "wholeChicken") {
      addDemandProduct({
        id,
        category: "wholeChicken",
        name: newName.trim(),
        grade: newGrade,
        weightBucketG: newWeight,
        freshFrozen: newFreshFrozen,
        unit: "ton",
      });
    } else if (newCategory === "fpp") {
      addDemandProduct({ id, category: "fpp", name: newName.trim(), yieldPct: newYieldPct / 100, unit: "ton" });
    } else if (newCategory === "eggs") {
      addDemandProduct({ id, category: "eggs", name: newName.trim(), unit: "tray" });
    } else {
      addDemandProduct({ id, category: "cuts", name: newName.trim(), unit: "ton" });
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

      <div className="flex flex-wrap items-end gap-3">
        <SummaryCard label="Total Demand" value={`${totalCar.toLocaleString()} CAR`} accent="green" />
        {categoryTotals.map(({ cat, display }) => (
          <SummaryCard key={cat} label={PRODUCT_CATEGORY_LABELS[cat]} value={display} />
        ))}

        <div className="flex-1" />

        <button
          onClick={() => setAddOpen((v) => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${addOpen ? "border-brand-green text-brand-green-dark bg-brand-green-tint" : "border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green"}`}
        >
          Add Product
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
            <button onClick={handleAddProduct} className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand-green text-white hover:bg-brand-green-dark transition-colors">
              Add
            </button>
          </div>
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

      <div className="flex gap-1 border-b border-[var(--border-subtle)] overflow-x-auto">
        {(["ALL", ...CHANNEL_KEYS] as const).map((c) => (
          <button
            key={c}
            onClick={() => setChannel(c)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              channel === c ? "border-brand-green text-brand-green-dark" : "border-transparent text-neutral-500 hover:text-neutral-800"
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
        onCellChange={channel !== "ALL" ? (productId, week, value) => setDemandCell(productId, channel, week, value) : undefined}
        onRemoveProduct={removeDemandProduct}
      />
    </div>
  );
}

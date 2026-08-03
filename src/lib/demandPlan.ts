import { CHANNEL_KEYS } from "./defaults";
import type {
  ChannelKey,
  DemandPlanQty,
  DemandProduct,
  FrozenStockWeek,
  ProductCategory,
  ProductFamilyWeek,
} from "./types";

export function demandCellKey(productId: string, channel: ChannelKey, week: number): string {
  return `${productId}::${channel}::${week}`;
}

export function parseDemandCellKey(key: string): { productId: string; channel: ChannelKey; week: number } {
  const [productId, channel, weekStr] = key.split("::");
  return { productId, channel: channel as ChannelKey, week: Number(weekStr) };
}

export function getDemandQty(qty: DemandPlanQty, productId: string, channel: ChannelKey, week: number): number {
  return qty[demandCellKey(productId, channel, week)] ?? 0;
}

export function getDemandQtyAllChannels(qty: DemandPlanQty, productId: string, week: number): number {
  return CHANNEL_KEYS.reduce((s, ch) => s + getDemandQty(qty, productId, ch, week), 0);
}

export function getDemandCell(qty: DemandPlanQty, productId: string, channel: ChannelKey | "ALL", week: number): number {
  return channel === "ALL" ? getDemandQtyAllChannels(qty, productId, week) : getDemandQty(qty, productId, channel, week);
}

/** Sum of one product's quantity across the given weeks, for a channel or "ALL" channels combined. */
export function productRowTotal(
  qty: DemandPlanQty,
  productId: string,
  channel: ChannelKey | "ALL",
  weeks: number[]
): number {
  return weeks.reduce((s, w) => s + getDemandCell(qty, productId, channel, w), 0);
}

export function categoryTotal(
  products: DemandProduct[],
  qty: DemandPlanQty,
  category: ProductCategory,
  channel: ChannelKey | "ALL",
  weeks: number[]
): number {
  return products
    .filter((p) => p.category === category)
    .reduce((s, p) => s + productRowTotal(qty, p.id, channel, weeks), 0);
}

export function grandTotal(
  products: DemandProduct[],
  qty: DemandPlanQty,
  channel: ChannelKey | "ALL",
  weeks: number[]
): number {
  return products.reduce((s, p) => s + productRowTotal(qty, p.id, channel, weeks), 0);
}

export interface BulkAdjustOptions {
  productIds: string[];
  channel: ChannelKey | "ALL";
  weekStart: number;
  weekEnd: number;
  pctChange: number; // e.g. 0.05 for +5%
}

/** Applies a % change to every matching cell. Returns a new map (immutable). */
export function bulkAdjustDemand(qty: DemandPlanQty, opts: BulkAdjustOptions): DemandPlanQty {
  const channels = opts.channel === "ALL" ? CHANNEL_KEYS : [opts.channel];
  const next = { ...qty };
  for (const productId of opts.productIds) {
    for (const channel of channels) {
      for (let w = opts.weekStart; w <= opts.weekEnd; w++) {
        const key = demandCellKey(productId, channel, w);
        const current = next[key] ?? 0;
        next[key] = Math.round(current * (1 + opts.pctChange) * 100) / 100;
      }
    }
  }
  return next;
}

/** Copies every product's quantity from one week to another, for a channel or all channels. */
export function copyDemandWeekForward(
  qty: DemandPlanQty,
  products: DemandProduct[],
  channel: ChannelKey | "ALL",
  fromWeek: number,
  toWeek: number
): DemandPlanQty {
  const channels = channel === "ALL" ? CHANNEL_KEYS : [channel];
  const next = { ...qty };
  for (const p of products) {
    for (const ch of channels) {
      next[demandCellKey(p.id, ch, toWeek)] = qty[demandCellKey(p.id, ch, fromWeek)] ?? 0;
    }
  }
  return next;
}

// ─── Revenue (SAR) ────────────────────────────────────────────────────────────

/** Revenue of one product across the given weeks for a channel (or ALL): qty × pricePerUnit. */
export function productRowRevenue(
  products: DemandProduct[],
  qty: DemandPlanQty,
  productId: string,
  channel: ChannelKey | "ALL",
  weeks: number[]
): number {
  const price = products.find((p) => p.id === productId)?.pricePerUnit ?? 0;
  return productRowTotal(qty, productId, channel, weeks) * price;
}

export function channelRevenue(
  products: DemandProduct[],
  qty: DemandPlanQty,
  channel: ChannelKey | "ALL",
  weeks: number[]
): number {
  return products.reduce((s, p) => s + productRowTotal(qty, p.id, channel, weeks) * (p.pricePerUnit ?? 0), 0);
}

export function categoryRevenue(
  products: DemandProduct[],
  qty: DemandPlanQty,
  category: ProductCategory,
  channel: ChannelKey | "ALL",
  weeks: number[]
): number {
  return products
    .filter((p) => p.category === category)
    .reduce((s, p) => s + productRowTotal(qty, p.id, channel, weeks) * (p.pricePerUnit ?? 0), 0);
}

// ─── Frozen stock rollforward ─────────────────────────────────────────────────

/**
 * Weekly frozen WC stock balance: opening + frozen production − frozen WC demand.
 * Demand comes from wholeChicken products flagged freshFrozen === "frozen" (tons → kg).
 */
export function computeFrozenStock(
  family: ProductFamilyWeek[],
  products: DemandProduct[],
  qty: DemandPlanQty,
  weeks: number[],
  openingFrozenStockKg: number
): FrozenStockWeek[] {
  const famByWeek = new Map(family.map((f) => [f.week, f]));
  const frozenProducts = products.filter((p) => p.category === "wholeChicken" && p.freshFrozen === "frozen");
  const rows: FrozenStockWeek[] = [];
  let opening = openingFrozenStockKg;
  for (const week of weeks) {
    const producedFrozenKg = famByWeek.get(week)?.wcFrozenKg ?? 0;
    const frozenDemandKg =
      frozenProducts.reduce((s, p) => s + getDemandQtyAllChannels(qty, p.id, week), 0) * 1000;
    const closingKg = opening + producedFrozenKg - frozenDemandKg;
    rows.push({ week, openingKg: opening, producedFrozenKg, frozenDemandKg, closingKg });
    opening = closingKg;
  }
  return rows;
}

// ─── Align sales plan to production (supply-first S&OP) ──────────────────────

/**
 * Adjusts the sales plan to what production can actually deliver: for every
 * category × week where demand exceeds available supply, all channel cells of
 * that category are scaled down pro-rata to the supply. Weeks with surplus are
 * left untouched (the surplus shows up in frozen stock / reconciliation).
 * `supplyTonsByCategoryWeek` keys are `${category}::${week}`, values in tons.
 */
export function alignDemandToSupply(
  products: DemandProduct[],
  qty: DemandPlanQty,
  weeks: number[],
  supplyTonsByCategoryWeek: Record<string, number>
): { next: DemandPlanQty; adjustedCells: number; adjustedWeeks: number } {
  const next = { ...qty };
  let adjustedCells = 0;
  const touchedWeeks = new Set<number>();

  for (const category of ["wholeChicken", "cuts", "fpp"] as const) {
    const catProducts = products.filter((p) => p.category === category);
    for (const week of weeks) {
      const demandTons = catProducts.reduce((s, p) => s + getDemandQtyAllChannels(qty, p.id, week), 0);
      const supplyTons = supplyTonsByCategoryWeek[`${category}::${week}`] ?? 0;
      if (demandTons <= 0 || supplyTons >= demandTons) continue;
      const ratio = supplyTons / demandTons;
      for (const p of catProducts) {
        for (const ch of CHANNEL_KEYS) {
          const key = demandCellKey(p.id, ch, week);
          const current = next[key] ?? 0;
          if (current > 0) {
            next[key] = Math.round(current * ratio * 100) / 100;
            adjustedCells++;
          }
        }
      }
      touchedWeeks.add(week);
    }
  }
  return { next, adjustedCells, adjustedWeeks: touchedWeeks.size };
}

// ─── Week → Calendar Month helpers ───────────────────────────────────────────

/** Returns "YYYY-MM" for the calendar month that contains week W's start date. */
export function weekToMonthKey(week: number, planStartDate: string): string {
  const d = new Date(planStartDate);
  d.setDate(d.getDate() + (week - 1) * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Returns a human-readable label e.g. "Aug 2026". */
export function weekToMonthLabel(week: number, planStartDate: string): string {
  const d = new Date(planStartDate);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Returns a week label in the format "YYYY.MMM.Wk" where Wk is the ordinal
 * week within its calendar month (1-indexed).
 * e.g. week starting Aug 7 → "2026.Aug.W1", Aug 14 → "2026.Aug.W2"
 */
export function weekLabel(week: number, planStartDate: string): string {
  const monthKey = weekToMonthKey(week, planStartDate);
  // Count how many weeks (1..week) share this same month
  let wom = 0;
  for (let w = 1; w <= week; w++) {
    if (weekToMonthKey(w, planStartDate) === monthKey) wom++;
  }
  const d = new Date(planStartDate);
  d.setDate(d.getDate() + (week - 1) * 7);
  const mmm = d.toLocaleDateString("en-US", { month: "short" });
  return `${d.getFullYear()}.${mmm}.W${wom}`;
}

/** Groups an array of week numbers into calendar months, in order. */
export function groupWeeksByMonth(
  weeks: number[],
  planStartDate: string
): { monthKey: string; monthLabel: string; weeks: number[] }[] {
  const map = new Map<string, { monthKey: string; monthLabel: string; weeks: number[] }>();
  for (const w of weeks) {
    const key = weekToMonthKey(w, planStartDate);
    if (!map.has(key)) {
      map.set(key, { monthKey: key, monthLabel: weekToMonthLabel(w, planStartDate), weeks: [] });
    }
    map.get(key)!.weeks.push(w);
  }
  return Array.from(map.values());
}

export function slugifyProductName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `product-${Date.now()}`
  );
}

import { CHANNEL_KEYS } from "./defaults";
import type { ChannelKey, DemandPlanQty, DemandProduct, ProductCategory } from "./types";

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

export function slugifyProductName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `product-${Date.now()}`
  );
}

// What each card normally does, from Viseca's authorization history (approved purchases only).
// Aggregated here once; the cumulative *_before columns of the CSV are not reused (CASE_NOTES §2).
import { readCsv } from "../pack.js";

export interface CardHistory {
  hasHistory: boolean;
  merchantCounts: Map<string, number>; // merchant_id -> approved purchases on this card
  devices: Set<string>;
  countries: Set<string>;
  hourCounts: number[]; // 24 buckets, Swiss local time
  purchases: number;
}

const rows = readCsv("authorization_history.csv").filter((r) => r.status === "approved" && r.transaction_type === "purchase");

const byCard = new Map<string, CardHistory>();
/** Approved purchases per merchant across the whole platform (used for lookalike checks). */
export const platformMerchantCounts = new Map<string, number>();
/** Merchant names seen in history, by id. */
export const historyMerchantNames = new Map<string, string>();

export function swissHour(iso: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hour12: false }).format(new Date(iso))) % 24;
}

export function swissWeekday(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", weekday: "long" }).format(new Date(iso)).toLowerCase();
}

export function swissDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

for (const r of rows) {
  let h = byCard.get(r.card_id);
  if (!h) {
    h = { hasHistory: true, merchantCounts: new Map(), devices: new Set(), countries: new Set(), hourCounts: Array(24).fill(0), purchases: 0 };
    byCard.set(r.card_id, h);
  }
  h.purchases++;
  h.merchantCounts.set(r.merchant_id, (h.merchantCounts.get(r.merchant_id) ?? 0) + 1);
  if (r.customer_device_id) h.devices.add(r.customer_device_id);
  if (r.merchant_country) h.countries.add(r.merchant_country);
  h.hourCounts[swissHour(r.timestamp)]++;
  platformMerchantCounts.set(r.merchant_id, (platformMerchantCounts.get(r.merchant_id) ?? 0) + 1);
  historyMerchantNames.set(r.merchant_id, r.merchant_name);
}

const EMPTY: CardHistory = { hasHistory: false, merchantCounts: new Map(), devices: new Set(), countries: new Set(), hourCounts: Array(24).fill(0), purchases: 0 };

export function cardHistory(cardId: string): CardHistory {
  return byCard.get(cardId) ?? EMPTY;
}

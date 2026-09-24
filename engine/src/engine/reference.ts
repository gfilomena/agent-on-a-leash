// Viseca's reference data (catalogue, shops, cards, accounts, customers), saved from
// GET /v1/reference-data into engine/reference/ so the engine also works offline.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface CatalogueItem {
  item_id: string;
  item_name: string;
  item_category: string;
  item_description: string;
  unit_price_min_chf: number;
  unit_price_typical_chf: number;
  unit_price_max_chf: number;
}

export interface ShopRecord {
  merchant_id: string;
  merchant_name: string;
  merchant_category: string;
  merchant_mcc: string;
  merchant_country: string;
  merchant_city: string;
  availability: string;
  recurring_capable: string;
}

export interface CardRecord {
  card_id: string;
  account_id: string;
  status: string;
  expires_on: string;
  online_enabled: string;
  international_enabled: string;
}

export interface AccountRecord {
  account_id: string;
  customer_id: string;
  status: string;
  per_transaction_limit_chf: string;
  monthly_limit_chf: string;
}

const file = fileURLToPath(new URL("../../reference/reference-data.json", import.meta.url));
const tables = JSON.parse(readFileSync(file, "utf8")).tables;

const num = (v: unknown) => Number(v);

export const catalogue = new Map<string, CatalogueItem>(
  tables.items.map((i: any) => [
    i.item_id,
    { ...i, unit_price_min_chf: num(i.unit_price_min_chf), unit_price_typical_chf: num(i.unit_price_typical_chf), unit_price_max_chf: num(i.unit_price_max_chf) },
  ]),
);
export const shops = new Map<string, ShopRecord>(tables.merchants.map((m: any) => [m.merchant_id, m]));
export const cards = new Map<string, CardRecord>(tables.cards.map((c: any) => [c.card_id, c]));
export const accounts = new Map<string, AccountRecord>(tables.accounts.map((a: any) => [a.account_id, a]));
export const customers = new Map<string, any>(tables.customers.map((c: any) => [c.customer_id, c]));

/** Plain words for Viseca's category codes, for customer-facing sentences. */
const CATEGORY_WORDS: Record<string, string> = {
  groceries: "groceries",
  household: "household items",
  clothing: "clothing",
  electronics: "electronics",
  sporting_goods: "sports goods",
  books: "books",
  cosmetics: "cosmetics",
  dining: "restaurants",
  food_delivery: "food delivery",
  fuel: "fuel",
  gift_card: "gift cards",
  home_improvement: "home improvement",
  hotel: "hotels",
  membership: "memberships",
  photography: "photography",
  subscriptions: "subscriptions",
  transport: "transport",
  travel: "travel",
  sustainable_goods: "sustainable goods",
  entertainment: "entertainment",
  health: "health",
  kids_family: "kids and family",
  pet_care: "pet care",
  software: "software",
};
export const categoryWords = (code: string) => CATEGORY_WORDS[code] ?? code.replace(/_/g, " ");

/** For "X is …" sentences: "a membership", "a gift card", "groceries". */
const CATEGORY_NOUN: Record<string, string> = {
  household: "a household item", sporting_goods: "sports goods", dining: "a restaurant meal", food_delivery: "a food delivery", fuel: "fuel",
  gift_card: "a gift card", home_improvement: "a home improvement item", hotel: "a hotel stay", membership: "a membership", photography: "photography gear",
  subscriptions: "a subscription", transport: "transport", travel: "travel", books: "a book",
};
export const categoryNoun = (code: string) => CATEGORY_NOUN[code] ?? categoryWords(code);

const COUNTRY_NAMES: Record<string, string> = {
  CH: "Switzerland", AT: "Austria", DE: "Germany", FR: "France", GB: "the United Kingdom", IT: "Italy", NL: "the Netherlands", US: "the United States",
};
export const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;

export const itemName = (id: string) => catalogue.get(id)?.item_name ?? id;

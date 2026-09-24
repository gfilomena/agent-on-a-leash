// Warning signs that apply to every policy, whatever the customer wrote (PLAN.md principles):
// they never block on their own and never approve; they follow the customer's "when unsure"
// choice. Bank checks (the card and account themselves) do block: the bank would refuse anyway.
// Split-order, amount-consistency, re-quote and bank checks follow ideas from Giuseppe's engine.
import { money, roundHalfEven, FX_TO_CHF } from "../money.js";
import type { AuthorizationEvent } from "../types.js";
import { cardHistory, platformMerchantCounts, swissHour } from "./history.js";
import { itemSignature, type PastPurchase } from "./memory.js";
import { accounts, cards, countryName, shops } from "./reference.js";
import type { Check } from "./rules.js";
import { findInstructions } from "./shoptext.js";

export interface ProtectionContext {
  event: AuthorizationEvent;
  past: PastPurchase[];
  /** Shops the customer approved in Compass for this card: they asked about them once already. */
  customerApprovedShops: Set<string>;
  /** The customer asked to watch for someone else driving the session. */
  watchSession: boolean;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

const warn = (id: string, label: string, detail: string, message: string, reason: string, weight: number, quote?: string): Check & { quote?: string } =>
  ({ id: `warning:${id}`, label, result: "unknown", detail, message, reason, weight, kind: "warning", quote });
const fine = (id: string, label: string, detail: string): Check => ({ id: `warning:${id}`, label, result: "pass", detail, message: "", reason: "", weight: 99, kind: "warning" });

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
const similarity = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return x && y ? 1 - levenshtein(x, y) / Math.max(x.length, y.length) : 0;
};

const ago = (fromIso: string, toIso: string) => {
  const m = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MIN);
  return m < 90 ? `${m} minutes` : `${Math.round(m / 60)} hours`;
};

/** Instructions hidden in shop text: flagged, quoted to the customer as ignored, never followed. */
function shopText(ctx: ProtectionContext): Check[] {
  const a = ctx.event.authorization;
  const findings = [
    ...a.items.flatMap((l) => findInstructions(l.line_no, `${l.item_name}. ${l.item_details}`)),
    ...findInstructions(0, a.purchase_description),
  ];
  if (!findings.length) return [fine("shop_text", "Shop text", "no hidden instructions")];
  const reasons = [...new Set(findings.map((f) => f.reason))];
  return [
    warn("shop_text", "Shop text", `tried to give instructions (${reasons.join("; ")}), ignored`,
      `the shop's text tried to give your agent instructions (it ${reasons[0]}), which I ignored`, "merchant_text_manipulation", 5, findings[0].excerpt),
  ];
}

/** A different shop whose name imitates a well-known one (CASE_NOTES §2). */
function lookalike(ctx: ProtectionContext): Check[] {
  const a = ctx.event.authorization;
  const id = a.merchant.merchant_id;
  // The customer already accepted this seller, or uses it: no need to warn again.
  if (ctx.customerApprovedShops.has(id)) return [];
  const own = (cardHistory(a.card_id).merchantCounts.get(id) ?? 0) + ctx.past.filter((p) => p.status === "approved" && p.merchant_id === id).length;
  if (own >= 2) return [];
  const mine = platformMerchantCounts.get(id) ?? 0;
  let best: { name: string; sim: number; known: boolean } | null = null;
  for (const [otherId, shop] of shops) {
    if (otherId === id) continue;
    const popular = platformMerchantCounts.get(otherId) ?? 0;
    if (popular < 5 || popular <= mine) continue;
    const sim = similarity(a.merchant.merchant_name, shop.merchant_name);
    if (sim >= 0.85 && (!best || sim > best.sim)) best = { name: shop.merchant_name, sim, known: (cardHistory(a.card_id).merchantCounts.get(otherId) ?? 0) > 0 };
  }
  if (!best) return [];
  return [
    warn("lookalike", "Seller identity", `name imitates ${best.name}`,
      `“${a.merchant.merchant_name}” looks like ${best.known ? "your shop" : "the well-known shop"} “${best.name}”, but it's a different seller`, "lookalike_merchant", 6),
  ];
}

/** Same shop, same items, same price shortly after an approved or waiting order. */
function duplicate(ctx: ProtectionContext): Check[] {
  const a = ctx.event.authorization;
  const sig = itemSignature(ctx.event);
  const t = Date.parse(a.timestamp);
  const twin = [...ctx.past].reverse().find(
    (p) => (p.status === "approved" || p.status === "pending") && p.merchant_id === a.merchant.merchant_id && p.item_signature === sig &&
      Math.abs(p.billing_amount_chf - a.billing_amount_chf) <= Math.max(0.01, 0.01 * a.billing_amount_chf) &&
      t - Date.parse(p.timestamp) < 24 * HOUR && t >= Date.parse(p.timestamp) && p.authorization_id !== a.related_authorization_id,
  );
  if (!twin) return [];
  return [
    warn("duplicate", "Possible duplicate", `same shop, items and price as an order ${ago(twin.timestamp, a.timestamp)} earlier`,
      `this looks like a repeat of the order ${twin.status === "approved" ? "approved" : "waiting for you"} ${ago(twin.timestamp, a.timestamp)} earlier (same shop, same items, same price)`, "possible_duplicate", 7),
  ];
}

/** Two quick orders at one shop that together go over the per-order limit. */
function splitOrder(ctx: ProtectionContext): Check[] {
  const a = ctx.event.authorization;
  const limits = (ctx.event.mandate.hard_rules ?? [])
    .filter((r) => r.field === "authorization.billing_amount_chf" && r.scope !== "period" && typeof r.value === "number")
    .map((r) => roundHalfEven((r.value as number) * (FX_TO_CHF[r.currency ?? "CHF"] ?? 1)));
  if (!limits.length) return [];
  const limit = Math.min(...limits);
  const t = Date.parse(a.timestamp);
  const recent = ctx.past.filter(
    (p) => (p.status === "approved" || p.status === "pending") && p.merchant_id === a.merchant.merchant_id && t - Date.parse(p.timestamp) <= 10 * MIN && t >= Date.parse(p.timestamp),
  );
  if (!recent.length) return [];
  const together = roundHalfEven(recent.reduce((s, p) => s + p.billing_amount_chf, 0) + a.billing_amount_chf);
  if (together <= limit || a.billing_amount_chf > limit) return [];
  return [
    warn("split_order", "Possible split order", `${recent.length + 1} orders at ${a.merchant.merchant_name} within 10 minutes total ${money(together)}`,
      `together with your order ${ago(recent.at(-1)!.timestamp, a.timestamp)} earlier, this adds up to ${money(together)}, over your ${money(limit)} per-order limit, so it may be one order split in two`, "possible_split_order", 8),
  ];
}

/** A new quote linked to an earlier order: fine if that one was declined, risky if it is still open. */
function relatedOrder(ctx: ProtectionContext): Check[] {
  const a = ctx.event.authorization;
  if (!a.related_authorization_id) return [];
  const st = a.related_authorization_status;
  if (st === "declined" || st === "cancelled") return [fine("related", "Updated quote", "replaces an earlier order that was not paid")];
  return [
    warn("related", "Updated quote", `linked to an earlier order that is ${st ?? "in an unknown state"}`,
      `this replaces an earlier order that is ${st === "approved" ? "already approved" : "still open"}, so paying both could charge you twice`, "related_order_open", 7),
  ];
}

/** The price must add up: lines + delivery = amount, and amount × fixed rate = CHF billed. */
function amounts(ctx: ProtectionContext): Check[] {
  const a = ctx.event.authorization;
  const rate = FX_TO_CHF[a.currency];
  const lines = roundHalfEven(a.items.reduce((s, l) => s + l.unit_price * l.quantity, 0));
  const billedOk = rate !== undefined && Math.abs(roundHalfEven(a.amount * rate) - a.billing_amount_chf) <= 0.01;
  const cartOk = Math.abs(roundHalfEven(lines + a.delivery_fee) - a.amount) <= 0.01;
  if (billedOk && cartOk) return [fine("amounts", "Price adds up", "items + delivery = total")];
  return [
    warn("amounts", "Price adds up", billedOk ? "items + delivery ≠ total" : "CHF amount doesn't match the fixed rate",
      billedOk ? `the items and delivery don't add up to the ${money(a.amount, a.currency)} charged` : `the CHF amount doesn't match ${money(a.amount, a.currency)} at the fixed rate`, "amount_inconsistent", 9),
  ];
}

/** Someone else driving the agent? New device, night, new country, bursts. Stricter when the customer asked. */
function session(ctx: ProtectionContext): Check[] {
  const a = ctx.event.authorization;
  const hist = cardHistory(a.card_id);
  const approvedHere = ctx.past.filter((p) => p.status === "approved");
  const knownDevices = new Set([...hist.devices, ...approvedHere.map((p) => p.device)]);
  const knownCountries = new Set([...hist.countries, ...approvedHere.map((p) => shops.get(p.merchant_id)?.merchant_country ?? "")]);
  const signals: string[] = [];
  if (knownDevices.size && !knownDevices.has(a.customer_device_id)) signals.push("a new device");
  const hour = swissHour(a.timestamp);
  if (hist.hasHistory && hour < 6 && hist.hourCounts[hour] === 0) signals.push(`an unusual hour (${String(hour).padStart(2, "0")}:00)`);
  if (knownCountries.size && !knownCountries.has(a.merchant.merchant_country)) signals.push(`a shop in ${countryName(a.merchant.merchant_country)}`);
  const knownShops = new Set([...hist.merchantCounts.keys(), ...approvedHere.map((p) => p.merchant_id), ...ctx.customerApprovedShops]);
  if (knownShops.size && !knownShops.has(a.merchant.merchant_id)) signals.push("a shop you haven't used before");
  const burst = a.recent_attempt_count_10m;
  if (burst >= 2) signals.push(`${burst + 1} attempts within 10 minutes`);
  const needed = ctx.watchSession ? 2 : 3;
  if (signals.length < needed && !(ctx.watchSession && burst >= 2)) {
    return [fine("session", "Session", signals.length ? `mild signals: ${signals.join(", ")}` : "looks like your usual activity")];
  }
  return [
    warn("session", "Session", signals.join(", "), `this doesn't look like your usual activity (${signals.join(", ")}), so someone else may be using your agent`, "unusual_session", 4),
  ];
}

/** The card and account themselves (Viseca reference data). The bank would refuse these anyway. */
function bank(ctx: ProtectionContext): Check[] {
  const a = ctx.event.authorization;
  const card = cards.get(a.card_id);
  if (!card) return [];
  const fail = (detail: string, message: string, reason: string): Check => ({ id: `bank:${reason}`, label: "Card and bank limits", result: "fail", detail, message, reason, weight: 3, kind: "bank" });
  const day = a.timestamp.slice(0, 10);
  if (card.status !== "active") return [fail(`card is ${card.status}`, `your card is ${card.status}`, "card_inactive")];
  if (card.expires_on && day >= card.expires_on) return [fail("card expired", "your card has expired", "card_expired")];
  if (card.international_enabled === "false" && a.merchant.merchant_country !== "CH")
    return [fail("payments abroad switched off", `payments abroad are switched off on your card, and ${a.merchant.merchant_name} is in ${countryName(a.merchant.merchant_country)}`, "card_international_disabled")];
  if (card.online_enabled === "false" && a.channel === "ecommerce") return [fail("online payments switched off", "online payments are switched off on your card", "card_online_disabled")];
  const acc = accounts.get(card.account_id);
  const perPayment = acc ? Number(acc.per_transaction_limit_chf) : NaN;
  if (Number.isFinite(perPayment) && a.billing_amount_chf > perPayment)
    return [fail(`over the bank's ${money(perPayment)} per-payment limit`, `${money(a.billing_amount_chf)} is over your bank's ${money(perPayment)} per-payment limit`, "issuer_transaction_limit")];
  return [{ id: "bank:ok", label: "Card and bank limits", result: "pass", detail: Number.isFinite(perPayment) ? `card active, bank limit ${money(perPayment)} per payment` : "card active", message: "", reason: "", weight: 99, kind: "bank" }];
}

export function protections(ctx: ProtectionContext): Check[] {
  return [...bank(ctx), ...shopText(ctx), ...lookalike(ctx), ...duplicate(ctx), ...splitOrder(ctx), ...relatedOrder(ctx), ...amounts(ctx), ...session(ctx)];
}

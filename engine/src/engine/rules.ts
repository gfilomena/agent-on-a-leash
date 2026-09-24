// Checks every customer rule against the structured facts of a purchase.
// Every check is pass / fail / unknown; unknown is never permission (CLAUDE.md rules 2, 5, 6).
import { money, roundHalfEven, toChf } from "../money.js";
import type { AuthorizationEvent, CartLine, MandateRule } from "../types.js";
import { cardHistory, swissDay, swissHour, swissWeekday } from "./history.js";
import type { PastPurchase } from "./memory.js";
import { categoryNoun, categoryWords, countryName, itemName } from "./reference.js";
import { readProductFacts } from "./shoptext.js";

export type Result = "pass" | "fail" | "unknown";

export interface Check {
  id: string;
  /** Short plain label, e.g. "Price per order". */
  label: string;
  result: Result;
  /** Plain detail for the facts list, e.g. "CHF 215.00 is over your CHF 200 limit". */
  detail: string;
  /** Sentence used when this check explains the verdict (lower case start, no verdict word). */
  message: string;
  /** Machine reason code, never shown to the customer. */
  reason: string;
  /** Lower = explains the verdict first. */
  weight: number;
}

export interface RuleContext {
  event: AuthorizationEvent;
  /** Earlier purchases in this run, oldest first. */
  past: PastPurchase[];
  /** Shops the customer approved in Compass for this card. */
  customerApprovedShops: Set<string>;
}

const DAY = 86_400_000;
const lc = (v: unknown) => String(v).toLowerCase();
const list = (v: MandateRule["value"]) => (Array.isArray(v) ? v : [String(v)]).map(String);
const quote = (s: string) => `“${s}”`;
/** "shoes" are, "voucher" is. */
const isAre = (name: string) => (/[^s]s$/i.test(name) ? "are" : "is");
const isntArent = (name: string) => (/[^s]s$/i.test(name) ? "aren't" : "isn't");
const joinWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);

function compareNumber(actual: number, op: MandateRule["operator"], expected: number): boolean {
  const a = roundHalfEven(actual);
  const b = roundHalfEven(expected);
  switch (op) {
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    case ">=": return a >= b;
    case "=": return a === b;
    case "!=": return a !== b;
    default: return false;
  }
}

function compareText(actual: string, op: MandateRule["operator"], expected: MandateRule["value"]): boolean | undefined {
  const values = list(expected).map(lc);
  if (op === "in") return values.includes(lc(actual));
  if (op === "not_in") return !values.includes(lc(actual));
  if (op === "=") return values.includes(lc(actual));
  if (op === "!=") return !values.includes(lc(actual));
  return undefined; // < > on text: not a meaningful rule
}

const limitWords = (op: MandateRule["operator"]) => (op === "<" ? "below" : op === "<=" ? "at most" : op === ">=" ? "at least" : op === ">" ? "more than" : op === "=" ? "exactly" : "not");

/** Lines the customer asked for: those matching the item/category "in" rules (all lines if none). */
export function requestedLines(event: AuthorizationEvent): CartLine[] {
  const rules = event.mandate.hard_rules ?? [];
  const idRules = rules.filter((r) => r.field === "items.item_id" && r.operator === "in");
  const catRules = rules.filter((r) => r.field === "items.item_category" && r.operator === "in");
  return event.authorization.items.filter(
    (l) => idRules.every((r) => list(r.value).includes(l.item_id)) && catRules.every((r) => list(r.value).map(lc).includes(lc(l.item_category))),
  );
}

export function evaluateRule(rule: MandateRule, index: number, ctx: RuleContext): Check {
  const a = ctx.event.authorization;
  const shop = a.merchant.merchant_name;
  const id = `rule:${index}`;
  const make = (label: string, result: Result, detail: string, message: string, reason: string, weight: number): Check => ({ id, label, result, detail, message, reason, weight });
  const unknownField = () =>
    make("Rule Compass can't read", "unknown", `Compass can't check the rule on "${rule.field}" yet`, `one of your rules can't be checked automatically yet`, "rule_not_understood", 90);

  switch (rule.field) {
    case "authorization.billing_amount_chf": {
      if (typeof rule.value !== "number") return unknownField();
      const ruleCur = rule.currency ?? "CHF";
      if (rule.scope === "period") {
        const days = rule.period_days ?? 30;
        const t = Date.parse(a.timestamp);
        const earlier = ctx.past.filter((p) => p.status === "approved" && Date.parse(p.timestamp) > t - days * DAY && Date.parse(p.timestamp) <= t);
        const spent = roundHalfEven(earlier.reduce((s, p) => s + p.billing_amount_chf, 0));
        const total = roundHalfEven(spent + a.billing_amount_chf);
        const limit = toChf(rule.value, ruleCur);
        const ok = compareNumber(total, rule.operator, limit);
        const label = `${days}-day total`;
        return ok
          ? make(label, "pass", `${money(total)} of ${money(limit)} in the last ${days} days, this order included`, "", "", 50)
          : make(label, "fail", `this order would bring the ${days}-day total to ${money(total)}, ${limitWords(rule.operator)} ${money(limit)} allowed`,
              `this ${money(a.billing_amount_chf)} order would bring your ${days}-day total to ${money(total)}, over your ${money(limit)} limit`, "period_limit_exceeded", 11);
      }
      // Same currency as the rule: compare the charged amount directly (no rounding through CHF).
      const sameCurrency = ruleCur !== "CHF" && ruleCur === a.currency;
      const actual = sameCurrency ? a.amount : a.billing_amount_chf;
      const limit = sameCurrency ? rule.value : toChf(rule.value, ruleCur);
      const cur = sameCurrency ? a.currency : "CHF";
      const charged = a.currency === "CHF" ? money(a.billing_amount_chf) : `${money(a.amount, a.currency)} (${money(a.billing_amount_chf)})`;
      const limitText = ruleCur === cur ? money(limit, cur) : `${money(rule.value, ruleCur)} (${money(limit)})`;
      const ok = compareNumber(actual, rule.operator, limit);
      return ok
        ? make("Price per order", "pass", `${charged}, limit ${limitText}, delivery included`, "", "", 50)
        : make("Price per order", "fail", `${charged} is over your ${limitText} limit`, `${charged} at ${shop} is over your ${limitText} limit`, "amount_over_limit", 10);
    }

    case "authorization.orders_same_day": {
      if (typeof rule.value !== "number") return unknownField();
      const day = swissDay(a.timestamp);
      const earlier = ctx.past.filter((p) => p.status === "approved" && swissDay(p.timestamp) === day).length;
      const ok = compareNumber(earlier + 1, rule.operator, rule.value);
      return ok
        ? make("Orders per day", "pass", `${earlier === 0 ? "first" : `order ${earlier + 1}`} of the day`, "", "", 50)
        : make("Orders per day", "fail", `${earlier} order(s) already approved that day`, `you already had ${earlier === 1 ? "an order" : `${earlier} orders`} that day, and you allow ${rule.value} a day`, "daily_order_limit", 14);
    }

    case "authorization.currency":
    case "authorization.channel":
    case "authorization.fulfillment_method": {
      const key = rule.field.split(".")[1] as "currency" | "channel" | "fulfillment_method";
      const actual = String(a[key]);
      const ok = compareText(actual, rule.operator, rule.value);
      if (ok === undefined) return unknownField();
      const label = { currency: "Currency", channel: "How it's bought", fulfillment_method: "Delivery" }[key];
      const words = (v: string) => ({ ecommerce: "online", in_store: "in a shop", mobile_wallet: "mobile wallet", recurring: "a recurring payment", delivery: "delivery", pickup: "pickup", digital: "digital" } as Record<string, string>)[v] ?? v;
      return ok
        ? make(label, "pass", words(actual), "", "", 50)
        : make(label, "fail", `${words(actual)}, not ${joinWords(list(rule.value).map(words))}`, `this order is ${words(actual)}, not ${joinWords(list(rule.value).map(words))} as you asked`, `${key}_not_allowed`, 30);
    }

    case "authorization.order_returnable":
    case "authorization.order_cancellable": {
      const key = rule.field.split(".")[1] as "order_returnable" | "order_cancellable";
      const actual = a[key];
      const label = key === "order_returnable" ? "Can be returned" : "Refundable (can be cancelled)";
      const verb = key === "order_returnable" ? "returned" : "cancelled for a refund";
      if (actual === "unknown" || actual === "not_applicable")
        return make(label, "unknown", `the shop doesn't say whether it can be ${verb}`, `the shop doesn't say whether this can be ${verb}`, `${key}_unknown`, 60);
      const ok = compareText(actual, rule.operator, rule.value);
      if (ok === undefined) return unknownField();
      return ok
        ? make(label, "pass", actual === "true" ? `yes, it can be ${verb}` : `no`, "", "", 50)
        : make(label, "fail", actual === "true" ? `it can be ${verb}` : `it can't be ${verb}`, `this order can't be ${verb}, and you asked for that`, `${key}_not_met`, 22);
    }

    case "authorization.return_window_days": {
      if (typeof rule.value !== "number") return unknownField();
      const label = `Returns for ${rule.value} days or more`;
      if (a.order_returnable === "false")
        return make(label, "fail", "the order can't be returned", "this order can't be returned", "not_returnable", 20);
      if (a.order_returnable === "not_applicable")
        return make(label, "unknown", "returns don't apply to this kind of order", "returns don't apply to this kind of order", "returns_not_applicable", 60);
      const facts = requestedLines(ctx.event).map((l) => readProductFacts(l.item_details));
      const known = facts.filter((f) => f.returnDays !== undefined).map((f) => f.returnDays!);
      if (!known.length || known.length < facts.length)
        return make(label, "unknown", "the shop doesn't say how long you can return it", "the shop doesn't say how long you can return this", "return_window_unknown", 60);
      const days = Math.min(...known);
      const ok = compareNumber(days, rule.operator, rule.value);
      if (ok) return make(label, "pass", `${days} days`, "", "", 50);
      return days === 0
        ? make(label, "fail", "final sale, no returns", "this is a final sale, so it can't be returned", "final_sale", 20)
        : make(label, "fail", `only ${days} days`, `returns are only possible for ${days} days, and you asked for at least ${rule.value}`, "return_window_too_short", 20);
    }

    case "authorization.delivery_within_days": {
      if (typeof rule.value !== "number") return unknownField();
      const label = `Delivery within ${rule.value} days`;
      if (a.fulfillment_method !== "delivery" || !a.delivery_by)
        return make(label, "unknown", "no delivery date given", "the shop doesn't give a delivery date", "delivery_date_unknown", 60);
      const days = Math.ceil((Date.parse(a.delivery_by) - Date.parse(a.timestamp)) / DAY);
      const ok = compareNumber(days, rule.operator, rule.value);
      return ok
        ? make(label, "pass", `arrives in ${days} day(s)`, "", "", 50)
        : make(label, "fail", `arrives in ${days} days`, `it would only arrive in ${days} days`, "delivery_too_slow", 25);
    }

    case "authorization.local_hour": {
      if (typeof rule.value !== "number") return unknownField();
      const h = swissHour(a.timestamp);
      const ok = compareNumber(h, rule.operator, rule.value);
      const at = `${String(h).padStart(2, "0")}:00 Swiss time`;
      return ok
        ? make("Time of day", "pass", `placed around ${at}`, "", "", 50)
        : make("Time of day", "fail", `placed around ${at}`, `this order was placed around ${at}, outside the hours you allow`, "outside_allowed_hours", 16);
    }

    case "authorization.local_weekday": {
      const day = swissWeekday(a.timestamp);
      const ok = compareText(day, rule.operator, rule.value);
      if (ok === undefined) return unknownField();
      const Day = day.charAt(0).toUpperCase() + day.slice(1);
      const weekend = rule.operator === "not_in" && list(rule.value).map(lc).sort().join() === "saturday,sunday";
      return ok
        ? make(weekend ? "Not at the weekend" : "Days allowed", "pass", Day, "", "", 50)
        : make(weekend ? "Not at the weekend" : "Days allowed", "fail", `placed on a ${Day}`,
            weekend ? `this order is on a ${Day}, and you said never at the weekend` : `this order is on a ${Day}, a day you don't allow`, "day_not_allowed", 15);
    }

    case "authorization.recent_attempt_count_10m": {
      if (typeof rule.value !== "number") return unknownField();
      const n = a.recent_attempt_count_10m;
      const ok = compareNumber(n, rule.operator, rule.value);
      return ok
        ? make("Attempts in 10 minutes", "pass", `${n} earlier attempt(s)`, "", "", 50)
        : make("Attempts in 10 minutes", "fail", `${n} earlier attempts in 10 minutes`, `your agent tried ${n + 1} purchases within 10 minutes`, "too_many_attempts", 17);
    }

    case "merchant.merchant_category": {
      const cat = a.merchant.merchant_category;
      const ok = compareText(cat, rule.operator, rule.value);
      if (ok === undefined) return unknownField();
      const wanted = joinWords(list(rule.value).map(categoryWords));
      const label = rule.operator === "not_in" ? `Not a ${wanted} shop` : `A ${wanted} shop`;
      return ok
        ? make(label, "pass", `${shop} is a ${categoryWords(cat)} shop`, "", "", 50)
        : make(label, "fail", `${shop} is a ${categoryWords(cat)} shop`,
            rule.operator === "not_in" ? `${shop} is a ${categoryWords(cat)} shop, which you don't allow` : `${shop} is a ${categoryWords(cat)} shop, not a ${wanted} shop`, "merchant_category_not_allowed", 24);
    }

    case "merchant.merchant_country":
    case "merchant.merchant_city": {
      const isCountry = rule.field === "merchant.merchant_country";
      const actual = isCountry ? a.merchant.merchant_country : a.merchant.merchant_city;
      const ok = compareText(actual, rule.operator, rule.value);
      if (ok === undefined) return unknownField();
      const name = (v: string) => (isCountry ? countryName(v) : v);
      const label = isCountry ? "Shop country" : "Shop city";
      return ok
        ? make(label, "pass", `${shop} is in ${name(actual)}`, "", "", 50)
        : make(label, "fail", `${shop} is in ${name(actual)}`,
            rule.operator === "not_in" ? `${shop} is in ${name(actual)}, which you don't allow` : `${shop} is in ${name(actual)}, not ${joinWords(list(rule.value).map(name))}`, isCountry ? "merchant_country_not_allowed" : "merchant_city_not_allowed", 26);
    }

    case "merchant.prior_approved_purchases": {
      if (typeof rule.value !== "number") return unknownField();
      const hist = cardHistory(a.card_id);
      const mid = a.merchant.merchant_id;
      const inRun = ctx.past.filter((p) => p.status === "approved" && p.merchant_id === mid).length;
      const count = (hist.merchantCounts.get(mid) ?? 0) + inRun + (ctx.customerApprovedShops.has(mid) && inRun === 0 ? 1 : 0);
      const label = rule.value >= 2 ? "A shop you use regularly" : "A shop you've used before";
      // No history for this card: a new shop is unknown, not wrong. Ask once; approving it makes it known.
      if (!hist.hasHistory && count === 0)
        return make(label, "unknown", `first purchase at ${shop}`, `this is the first purchase at ${shop}, so I'm asking you once`, "first_purchase_at_shop", 55);
      const ok = compareNumber(count, rule.operator, rule.value);
      return ok
        ? make(label, "pass", `${count} earlier purchase${count === 1 ? "" : "s"} at ${shop}`, "", "", 50)
        : make(label, "fail", count === 0 ? `never bought from ${shop}` : `only ${count} earlier purchase at ${shop}`,
            count === 0 ? `you've never bought from ${shop}, and you asked for ${rule.value >= 2 ? "a shop you use regularly" : "shops you've used before"}` : `you've only bought from ${shop} once, and you asked for a shop you use regularly`,
            "unfamiliar_merchant", 27);
    }

    case "items.item_category":
    case "items.item_id": {
      const byId = rule.field === "items.item_id";
      const values = list(rule.value);
      const bad = ctx.event.authorization.items.filter((l) => !compareText(byId ? l.item_id : l.item_category, rule.operator, rule.value));
      const wanted = byId ? joinWords(values.map(itemName)) : joinWords(values.map(categoryWords));
      const label = rule.operator === "not_in" ? `No ${wanted}` : byId ? `Only ${wanted}` : `Only ${wanted}`;
      if (!bad.length) return make(label, "pass", `${a.items.length} of ${a.items.length} item${a.items.length === 1 ? "" : "s"}`, "", "", 50);
      const first = bad[0];
      const extras = bad.length < a.items.length && rule.operator === "in"; // some lines are what was asked, others are add-ons
      const message =
        rule.operator === "not_in"
          ? `the basket has ${quote(first.item_name)}, which you excluded`
          : extras
            ? `the basket also has ${bad.map((l) => quote(l.item_name)).join(", ")}, which you didn't ask for`
            : byId
              ? `${quote(first.item_name)} ${isntArent(first.item_name)} what you asked for (${itemName(values[0])})`
              : `${quote(first.item_name)} ${isAre(first.item_name)} ${categoryNoun(first.item_category)}, and you allow only ${wanted}`;
      const reason = rule.operator === "not_in" ? "item_excluded" : extras ? "unrequested_addon" : byId ? "item_not_requested" : "item_category_not_allowed";
      return make(label, "fail", `${bad.map((l) => quote(l.item_name)).join(", ")} not allowed`, message, reason, 12);
    }

    case "items.quantity":
    case "items.quantity_total": {
      if (typeof rule.value !== "number") return unknownField();
      const lines = ctx.event.authorization.items;
      const total = rule.field === "items.quantity_total" ? lines.reduce((s, l) => s + l.quantity, 0) : Math.max(...lines.map((l) => l.quantity));
      const ok = compareNumber(total, rule.operator, rule.value);
      const label = `${limitWords(rule.operator).replace(/^./, (c) => c.toUpperCase())} ${rule.value} item${rule.value === 1 ? "" : "s"}`;
      return ok
        ? make(label, "pass", `${total} item${total === 1 ? "" : "s"}`, "", "", 50)
        : make(label, "fail", `${total} items`, `the basket has ${total} items, and you asked for ${limitWords(rule.operator)} ${rule.value}`, "quantity_exceeded", 13);
    }

    case "items.size": {
      const wanted = String(rule.value).toUpperCase();
      const label = `Size ${wanted}`;
      const lines = requestedLines(ctx.event);
      if (!lines.length) return make(label, "unknown", "no requested item in the basket", "no item in the basket is the one you asked for", "size_unknown", 60);
      const sized = lines.map((l) => ({ l, size: readProductFacts(l.item_details).size }));
      const missing = sized.filter((s) => !s.size);
      const wrong = sized.filter((s) => s.size && !compareText(s.size, rule.operator, [wanted]));
      if (wrong.length)
        return make(label, "fail", `size ${wrong[0].size}`, `${quote(wrong[0].l.item_name)} ${isAre(wrong[0].l.item_name)} size ${wrong[0].size}, and you asked for ${wanted}`, "size_mismatch", 18);
      if (missing.length) return make(label, "unknown", "the shop doesn't state the size", "the shop doesn't state the size", "size_unknown", 58);
      return make(label, "pass", `size ${sized[0].size}`, "", "", 50);
    }

    case "basket.unrequested_lines": {
      if (typeof rule.value !== "number") return unknownField();
      const hasProductRule = (ctx.event.mandate.hard_rules ?? []).some((r) => (r.field === "items.item_id" || r.field === "items.item_category") && r.operator === "in");
      if (!hasProductRule)
        return make("Nothing added", "unknown", "no product defined to compare with", "I can't tell what you asked for, so I can't check for extras", "unrequested_unknown", 70);
      const requested = new Set(requestedLines(ctx.event));
      const extra = ctx.event.authorization.items.filter((l) => !requested.has(l));
      const ok = compareNumber(extra.length, rule.operator, rule.value);
      return ok
        ? make("Nothing added", "pass", "only what you asked for", "", "", 50)
        : make("Nothing added", "fail", `also ${extra.map((l) => quote(l.item_name)).join(", ")}`, `the basket also has ${extra.map((l) => quote(l.item_name)).join(", ")}, which you didn't ask for`, "unrequested_addon", 12);
    }

    default:
      return unknownField();
  }
}

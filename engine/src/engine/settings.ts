// Security settings (Controls): a spending limit and allowed regions. They apply on top of every
// policy, whatever the chat request says, and are decoupled from policies (not sent to Viseca as
// rules; they appear in every decision's evidence). Calendar periods in Swiss time, on the
// purchase's own (simulated) date, like every other time window (CLAUDE.md rule 7).
import { money } from "../money.js";
import type { AuthorizationEvent } from "../types.js";
import { swissDay } from "./history.js";
import { countryName } from "./reference.js";
import type { Check } from "./rules.js";

export type Period = "day" | "week" | "month";
export type Region = "switzerland" | "europe" | "global";

export interface SecuritySettings {
  spendingLimit: { on: boolean; amount: number; period: Period };
  region: Region;
  /** Real time of the last "Reset spending" (demo tool): only purchases received after it count. */
  spendingSince?: string;
  updatedAt?: string;
}

export const DEFAULT_SETTINGS: SecuritySettings = { spendingLimit: { on: false, amount: 500, period: "month" }, region: "global" };

/** Approved agent spending that counts toward the limit (purchase time + CHF). */
export interface Spent {
  timestamp: string;
  amountChf: number;
}

// Switzerland shares the franc and the payment system with Liechtenstein.
const SWITZERLAND = ["CH", "LI"];
// EU 27 + Iceland, Liechtenstein, Norway + Switzerland, United Kingdom + Andorra, Monaco, San Marino, Vatican City (Jules, 2026-09-25).
const EUROPE = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "CH", "GB", "AD", "MC", "SM", "VA",
];
export const REGION_COUNTRIES: Record<Exclude<Region, "global">, string[]> = { switzerland: SWITZERLAND, europe: EUROPE };
const REGION_WORD: Record<Region, string> = { switzerland: "Switzerland", europe: "Europe", global: "Global" };

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
/** Plain country name for lists ("Germany", "United Kingdom"). */
export const countryLabel = (code: string) => displayNames.of(code) ?? code;
/** For sentences ("the United States"): our own names first. */
const inCountry = (code: string) => (countryName(code) !== code ? countryName(code) : countryLabel(code));

// ---------- calendar periods (Swiss time) ----------
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
const utcDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOf(new Date(utcDate(ymd).getTime() + n * 86_400_000));

/** The calendar period a purchase falls in: its first day, and the day it resets. */
export function periodOf(iso: string, period: Period): { start: string; next: string } {
  const day = swissDay(iso);
  if (period === "day") return { start: day, next: addDays(day, 1) };
  if (period === "week") {
    const monday = addDays(day, -((utcDate(day).getUTCDay() + 6) % 7));
    return { start: monday, next: addDays(monday, 7) };
  }
  const start = `${day.slice(0, 7)}-01`;
  const d = utcDate(start);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { start, next: ymdOf(d) };
}

/** "in September", "in the week of 31 August", "on 5 September". */
export function periodPhrase(p: { start: string }, period: Period): string {
  if (period === "month") return `in ${monthFmt.format(utcDate(p.start))}`;
  if (period === "week") return `in the week of ${dayFmt.format(utcDate(p.start))}`;
  return `on ${dayFmt.format(utcDate(p.start))}`;
}

/** "resets on 1 October", "resets on Monday 7 September", "resets at midnight". */
export function resetPhrase(p: { next: string }, period: Period): string {
  if (period === "day") return "resets at midnight";
  if (period === "week") return `resets on Monday ${dayFmt.format(utcDate(p.next))}`;
  return `resets on ${dayFmt.format(utcDate(p.next))}`;
}

const ADJ: Record<Period, string> = { day: "daily", week: "weekly", month: "monthly" };

/** Spent in the purchase's own calendar period, before it (its own amount not included). */
export function spentInPeriod(iso: string, period: Period, spent: Spent[]): number {
  const p = periodOf(iso, period);
  const t = Date.parse(iso);
  return spent.filter((s) => Date.parse(s.timestamp) <= t && periodOf(s.timestamp, period).start === p.start).reduce((sum, s) => sum + s.amountChf, 0);
}

/** The settings' checks for one purchase: none when a setting is off (it restricts nothing). */
export function settingsChecks(event: AuthorizationEvent, s: SecuritySettings, spent: Spent[]): Check[] {
  const a = event.authorization;
  const shop = a.merchant.merchant_name;
  const checks: Check[] = [];
  const make = (id: string, label: string, result: Check["result"], detail: string, message: string, reason: string, weight: number): Check =>
    ({ id: `setting:${id}`, label, result, detail, message, reason, weight, kind: "setting" });

  if (s.region !== "global") {
    const code = (a.merchant.merchant_country ?? "").trim().toUpperCase();
    const label = `Only shops in ${REGION_WORD[s.region]}`;
    if (!code)
      checks.push(make("region", label, "unknown", "the shop's country isn't known", `the shop's country isn't known, and your region setting is ${REGION_WORD[s.region]}`, "region_unknown", 58));
    else if (REGION_COUNTRIES[s.region].includes(code)) checks.push(make("region", label, "pass", `${shop} is in ${inCountry(code)}`, "", "", 50));
    else
      checks.push(make("region", label, "fail", `${shop} is in ${inCountry(code)}, outside ${REGION_WORD[s.region]}`,
        `${shop} is in ${inCountry(code)}, and your region setting is ${REGION_WORD[s.region]}`, "region_not_allowed", 9));
  }

  if (s.spendingLimit.on) {
    const { amount: limit, period } = s.spendingLimit;
    const p = periodOf(a.timestamp, period);
    const total = Math.round((spentInPeriod(a.timestamp, period, spent) + a.billing_amount_chf) * 100) / 100;
    const label = `Spending limit, ${money(limit)} ${ADJ[period]}`;
    checks.push(
      total <= limit
        ? make("spending", label, "pass", `${money(total)} of ${money(limit)} ${periodPhrase(p, period)}, this order included`, "", "", 50)
        : make("spending", label, "fail", `this order would bring you to ${money(total)} of ${money(limit)} ${periodPhrase(p, period)}`,
            `this ${money(a.billing_amount_chf)} order would bring your ${ADJ[period]} spending to ${money(total)}, over your ${money(limit)} limit`, "spending_limit_exceeded", 11),
    );
  }
  return checks;
}

/** What Controls shows under the limit: spending in the period of the agent's most recent purchase. */
export function usage(s: SecuritySettings, spent: Spent[], latestIso: string | null) {
  const ref = latestIso ?? new Date().toISOString();
  const { period, amount } = s.spendingLimit;
  const p = periodOf(ref, period);
  const inPeriod = spent.filter((x) => periodOf(x.timestamp, period).start === p.start).reduce((sum, x) => sum + x.amountChf, 0);
  return { spentChf: Math.round(inPeriod * 100) / 100, limitChf: amount, period: periodPhrase(p, period), resets: resetPhrase(p, period) };
}

/** Validates a change from the app. Throws a plain message on bad input. */
export function applyChange(current: SecuritySettings, change: { spendingLimit?: Partial<SecuritySettings["spendingLimit"]>; region?: string }): SecuritySettings {
  const next: SecuritySettings = { ...current, spendingLimit: { ...current.spendingLimit } };
  if (change.region !== undefined) {
    if (!["switzerland", "europe", "global"].includes(change.region)) throw new Error("Pick Switzerland, Europe or Global.");
    next.region = change.region as Region;
  }
  const l = change.spendingLimit;
  if (l) {
    if (l.on !== undefined) next.spendingLimit.on = l.on === true;
    if (l.period !== undefined) {
      if (!["day", "week", "month"].includes(l.period)) throw new Error("Pick daily, weekly or monthly.");
      next.spendingLimit.period = l.period;
    }
    if (l.amount !== undefined) {
      const n = Math.round(Number(l.amount) * 100) / 100;
      if (!Number.isFinite(n) || n <= 0 || n > 100_000) throw new Error("Enter an amount between CHF 1 and CHF 100,000.");
      next.spendingLimit.amount = n;
    }
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

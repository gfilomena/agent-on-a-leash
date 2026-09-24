// Fixed synthetic FX rates and Viseca's rounding (two decimals, half-even).
import { readCsv } from "./pack.js";

export const FX_TO_CHF: Record<string, number> = Object.fromEntries(
  readCsv("fx_rates.csv").map((r) => [r.from_currency, Number(r.rate)]),
);

export function roundHalfEven(x: number): number {
  const scaled = Math.round(x * 100 * 1e6) / 1e6; // drop float noise first
  const floor = Math.floor(scaled);
  const isHalf = Math.abs(scaled - floor - 0.5) < 1e-9;
  const cents = isHalf ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(scaled);
  return cents / 100;
}

/** Convert with the row's own currency (never the shop's country). */
export function toChf(amount: number, currency: string): number {
  const rate = FX_TO_CHF[currency];
  if (rate === undefined) throw new Error(`No FX rate for ${currency}`);
  return roundHalfEven(amount * rate);
}

export function formatMoney(amount: number, currency = "CHF"): string {
  return `${currency} ${amount.toFixed(2)}`;
}

const swiss = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** For customer sentences: "CHF 1’147.95", and "CHF 200" for round amounts. */
export function money(amount: number, currency = "CHF"): string {
  const text = swiss.format(roundHalfEven(amount));
  return `${currency} ${text.endsWith(".00") ? text.slice(0, -3) : text}`;
}

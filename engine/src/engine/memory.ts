// What the engine remembers about earlier purchases in the same run (rolling limits,
// orders per day, shops the customer approved). Updated after every decision and answer.
import type { AuthorizationEvent } from "../types.js";

export type Outcome = "approved" | "declined" | "pending" | "expired";

export interface PastPurchase {
  authorization_id: string;
  timestamp: string; // simulated purchase time
  merchant_id: string;
  merchant_name: string;
  billing_amount_chf: number;
  item_signature: string;
  device: string;
  status: Outcome;
}

export const itemSignature = (e: AuthorizationEvent) =>
  e.authorization.items.map((l) => `${l.item_id}x${l.quantity}`).sort().join("+");

export function toPast(e: AuthorizationEvent, status: Outcome): PastPurchase {
  const a = e.authorization;
  return {
    authorization_id: a.authorization_id,
    timestamp: a.timestamp,
    merchant_id: a.merchant.merchant_id,
    merchant_name: a.merchant.merchant_name,
    billing_amount_chf: a.billing_amount_chf,
    item_signature: itemSignature(e),
    device: a.customer_device_id,
    status,
  };
}

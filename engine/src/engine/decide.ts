// The decision: rules first (code), then warning signs. A broken rule blocks; anything unknown
// follows the customer's "when unsure" choice (ask by default, decline if they chose that).
// Unknown is never a yes, and nothing turns a failed rule into an approval.
import { money } from "../money.js";
import type { AuthorizationEvent, EngineDecision } from "../types.js";
import type { PastPurchase } from "./memory.js";
import { evaluateRule, type Check } from "./rules.js";

export interface DecideInput {
  event: AuthorizationEvent;
  /** Earlier purchases in the same run, oldest first. */
  past: PastPurchase[];
  /** Shops the customer approved in Compass for this card. */
  customerApprovedShops?: Set<string>;
  /** Revoked in Compass (Viseca may still deliver purchases for it). */
  policyRevoked?: boolean;
}

export interface Decision extends EngineDecision {
  checks: Check[];
  /** Engine time, milliseconds. */
  ms: number;
}

const status = (label: string, detail: string, message: string, reason: string): Check => ({ id: `status:${reason}`, label, result: "fail", detail, message, reason, weight: 0 });

export function decide(input: DecideInput): Decision {
  const started = performance.now();
  const { event } = input;
  const a = event.authorization;
  const checks: Check[] = [];

  // Permission itself: a revoked policy or an inactive card never buys anything.
  if (input.policyRevoked || event.mandate.status !== "active")
    checks.push(status("Policy active", "the policy was revoked", "this policy was revoked, so your agent may not buy with it", "policy_revoked"));
  if (a.authority_status !== "active" || a.card_status_at_attempt !== "active")
    checks.push(status("Card active", "the card or the agent's permission is not active", "your card or your agent's permission is not active", "card_or_authority_inactive"));

  const ctx = { event, past: input.past, customerApprovedShops: input.customerApprovedShops ?? new Set<string>() };
  (event.mandate.hard_rules ?? []).forEach((rule, i) => checks.push(evaluateRule(rule, i, ctx)));

  const fails = checks.filter((c) => c.result === "fail").sort((x, y) => x.weight - y.weight);
  const unknowns = checks.filter((c) => c.result === "unknown").sort((x, y) => x.weight - y.weight);
  const declineWhenUnsure = event.mandate.uncertainty_policy === "decline";

  let decision: EngineDecision["decision"];
  let customer_message: string;
  if (fails.length) {
    decision = "decline";
    customer_message = `Blocked: ${fails[0].message}.`;
  } else if (unknowns.length) {
    decision = declineWhenUnsure ? "decline" : "step_up";
    customer_message = declineWhenUnsure
      ? `Blocked because you chose "decline when unsure": ${unknowns[0].message}.`
      : `Needs review: ${unknowns[0].message}.`;
  } else {
    decision = "approve";
    const first = a.items[0]?.item_name ?? "your order";
    const what = a.items.length > 1 ? `${first} and ${a.items.length - 1} more` : first;
    const charged = a.currency === "CHF" ? money(a.billing_amount_chf) : `${money(a.amount, a.currency)} (${money(a.billing_amount_chf)})`;
    customer_message = `Approved: ${what} from ${a.merchant.merchant_name} for ${charged}, within all your rules.`;
  }

  const reasons = [...new Set([...fails, ...unknowns].map((c) => c.reason))];
  return {
    decision,
    reason_codes: reasons.length ? reasons : ["within_policy"],
    customer_message,
    evidence: checks.map((c) => ({ check: c.label, result: c.result, detail: c.detail })),
    checks,
    ms: Math.round((performance.now() - started) * 100) / 100,
  };
}

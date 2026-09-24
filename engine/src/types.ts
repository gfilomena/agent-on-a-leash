// Shapes of Viseca's purchase event (schemas/authorization_event.schema.json) and of our answers.

export type Verdict = "approve" | "decline" | "step_up";
export type Term = "true" | "false" | "unknown" | "not_applicable";
export type CheckResult = "pass" | "fail" | "unknown";

export interface Merchant {
  merchant_id: string;
  merchant_name: string;
  merchant_category: string;
  merchant_mcc: string;
  merchant_country: string;
  merchant_city: string;
  availability: string;
  recurring_capable: "true" | "false";
}

export interface CartLine {
  line_no: number;
  item_id: string;
  item_name: string;
  item_category: string;
  quantity: number;
  unit_price: number;
  currency: string;
  item_details: string;
}

export interface MandateRule {
  field: string;
  operator: "<" | "<=" | "=" | "!=" | ">" | ">=" | "in" | "not_in";
  value: number | string | string[];
  currency?: string | null;
  scope?: "purchase" | "period" | null;
  period_days?: number | null;
}

export interface Authorization {
  authorization_id: string;
  source_authorization_id: string;
  scenario_id: string;
  replay_order: number;
  mandate_id: string;
  profile_id: string;
  card_id: string;
  initiator_type: "agent";
  merchant: Merchant;
  timestamp: string;
  amount: number;
  currency: string;
  billing_amount_chf: number;
  items_subtotal: number;
  delivery_fee: number;
  channel: string;
  customer_device_id: string;
  authority_status: string;
  card_status_at_attempt: string;
  spend_in_period_before_chf: number | null;
  recent_attempt_count_10m: number;
  fulfillment_method: string;
  delivery_by: string | null;
  order_returnable: Term;
  order_cancellable: Term;
  related_authorization_id: string | null;
  related_authorization_status: "pending" | "approved" | "declined" | "cancelled" | null;
  purchase_description: string;
  items: CartLine[];
}

export interface RecentAuthorization {
  authorization_id: string;
  timestamp: string;
  merchant_id: string;
  billing_amount_chf: number;
  status: "approved" | "declined" | "pending" | "cancelled";
}

export interface AuthorizationEvent {
  type: "authorization.request";
  request_id: string;
  deadline_at: string;
  authorization: Authorization;
  mandate: {
    mandate_id: string;
    status: string;
    customer_id: string;
    card_id: string;
    instruction: string;
    hard_rules: MandateRule[];
    uncertainty_policy: "ask" | "decline" | "approve";
    profile_id: string;
  };
  context: {
    approved_spend_in_period_chf: number | null;
    recent_authorizations: RecentAuthorization[];
  };
  runtime: {
    received_at: string;
    history_window_minutes: number;
    context_basis: "run_decisions_and_scenario_timestamps";
  };
}

export interface Evidence {
  check: string;
  result: CheckResult;
  detail: string;
}

export interface EngineDecision {
  decision: Verdict;
  reason_codes: string[];
  customer_message: string;
  evidence: Evidence[];
}

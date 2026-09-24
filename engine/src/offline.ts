// Rebuilds live-style purchase events, so the engine can be tested without the API:
// from the data pack (technical_details.md, section 3) or from recorded live runs (engine/recordings/).
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { groupBy, indexBy, readCsv, type Row } from "./pack.js";
import { roundHalfEven } from "./money.js";
import type { Authorization, AuthorizationEvent, CartLine, RecentAuthorization, Verdict } from "./types.js";

const merchants = indexBy(readCsv("merchants.csv"), "merchant_id");
const authorities = indexBy(readCsv("scenario_authorities.csv"), "authority_id");
const cartLines = groupBy(readCsv("purchase_attempt_items.csv"), "authorization_id");

export interface StoryInfo {
  scenarioId: string;
  name: string;
  instruction: string;
  customerId: string;
  cardId: string;
  profileId: string;
}

export interface PackStory extends StoryInfo {
  attempts: Row[];
}

export interface RecordedStory extends StoryInfo {
  purchases: AuthorizationEvent[];
}

export function loadPackStories(): PackStory[] {
  const attempts = groupBy(readCsv("purchase_attempts.csv"), "scenario_id");
  return readCsv("scenario_catalogue.csv").map((s) => {
    const rows = (attempts.get(s.scenario_id) ?? []).sort((a, b) => Number(a.replay_order) - Number(b.replay_order));
    const authority = authorities.get(rows[0].authority_id)!;
    return {
      scenarioId: s.scenario_id,
      name: s.scenario_name,
      instruction: s.cardholder_instruction,
      customerId: authority.customer_id,
      cardId: authority.card_id,
      profileId: `PROFILE_${authority.authority_id}`,
      attempts: rows,
    };
  });
}

export const RECORDINGS_DIR = fileURLToPath(new URL("../recordings/", import.meta.url));

/** Live stories saved by recording mode (npm run record). */
export function loadRecordedStories(): RecordedStory[] {
  return readdirSync(RECORDINGS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const r = JSON.parse(readFileSync(RECORDINGS_DIR + f, "utf8"));
      const m = r.purchases[0].mandate;
      return { scenarioId: r.scenario_id, name: r.scenario_name, instruction: r.instruction, customerId: m.customer_id, cardId: m.card_id, profileId: m.profile_id, purchases: r.purchases };
    });
}

const orNull = (v: string) => (v === "" ? null : v);
let nextLocalId = 1;
let nextMandateId = 1;

/** A local stand-in for one Viseca run: live-style ids, and memory of our own decisions. */
export class OfflineRun {
  private liveIds = new Map<string, string>(); // AU... -> this run's live id
  private past: { auth: AuthorizationEvent["authorization"]; status: RecentAuthorization["status"] }[] = [];
  readonly mandate: AuthorizationEvent["mandate"];

  constructor(readonly story: StoryInfo, rules: Pick<AuthorizationEvent["mandate"], "hard_rules" | "uncertainty_policy"> = { hard_rules: [], uncertainty_policy: "ask" }) {
    this.mandate = {
      mandate_id: `TM_LOCAL_${nextMandateId++}`,
      status: "active",
      customer_id: story.customerId,
      card_id: story.cardId,
      instruction: story.instruction,
      ...rules,
      profile_id: story.profileId,
    };
  }

  /** A recorded live purchase, re-wrapped with this run's policy and our own decision memory. */
  eventFromRecorded(recorded: AuthorizationEvent, now = new Date()): AuthorizationEvent {
    const auth: Authorization = { ...recorded.authorization, mandate_id: this.mandate.mandate_id, profile_id: this.mandate.profile_id };
    // The recording declined everything; a linked purchase must show OUR earlier decision instead.
    const related = this.past.find((p) => p.auth.authorization_id === auth.related_authorization_id);
    if (related) auth.related_authorization_status = related.status;
    return this.wrap(auth, now);
  }

  buildEvent(row: Row, now = new Date()): AuthorizationEvent {
    const liveId = `LOCAL${String(nextLocalId++).padStart(6, "0")}`;
    this.liveIds.set(row.authorization_id, liveId);
    const m = merchants.get(row.merchant_id)!;
    const timestamp = row.timestamp;

    const items: CartLine[] = (cartLines.get(row.authorization_id) ?? [])
      .sort((a, b) => Number(a.line_no) - Number(b.line_no))
      .map((l) => ({
        line_no: Number(l.line_no),
        item_id: l.item_id,
        item_name: l.item_name,
        item_category: l.item_category,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        currency: l.currency,
        item_details: l.item_details,
      }));

    const authorization: Authorization = {
      authorization_id: liveId,
      source_authorization_id: row.authorization_id,
      scenario_id: row.scenario_id,
      replay_order: Number(row.replay_order),
      mandate_id: this.mandate.mandate_id,
      profile_id: this.mandate.profile_id,
      card_id: row.card_id,
      initiator_type: "agent",
      merchant: {
        merchant_id: m.merchant_id,
        merchant_name: m.merchant_name,
        merchant_category: m.merchant_category,
        merchant_mcc: m.merchant_mcc,
        merchant_country: m.merchant_country,
        merchant_city: m.merchant_city,
        availability: m.availability,
        recurring_capable: m.recurring_capable as "true" | "false",
      },
      timestamp,
      amount: Number(row.amount),
      currency: row.currency,
      billing_amount_chf: Number(row.billing_amount_chf),
      items_subtotal: Number(row.items_subtotal),
      delivery_fee: Number(row.delivery_fee),
      channel: row.channel,
      customer_device_id: row.customer_device_id,
      authority_status: row.authority_status,
      card_status_at_attempt: row.card_status_at_attempt,
      spend_in_period_before_chf: row.spend_in_period_before_chf === "" ? null : Number(row.spend_in_period_before_chf),
      recent_attempt_count_10m: Number(row.recent_attempt_count_10m),
      fulfillment_method: row.fulfillment_method,
      delivery_by: orNull(row.delivery_by),
      order_returnable: row.order_returnable as any,
      order_cancellable: row.order_cancellable as any,
      // Viseca rewrites the related id to the live id of that run; we do the same.
      related_authorization_id: row.related_authorization_id ? (this.liveIds.get(row.related_authorization_id) ?? null) : null,
      related_authorization_status: orNull(row.related_authorization_status) as any,
      purchase_description: row.purchase_description,
      items,
    };
    return this.wrap(authorization, now);
  }

  private wrap(authorization: Authorization, now: Date): AuthorizationEvent {
    const t = Date.parse(authorization.timestamp);
    const recent = this.past
      .filter((p) => {
        const pt = Date.parse(p.auth.timestamp);
        return pt >= t - 10 * 60_000 && pt < t;
      })
      .map((p) => ({
        authorization_id: p.auth.authorization_id,
        timestamp: p.auth.timestamp,
        merchant_id: p.auth.merchant.merchant_id,
        billing_amount_chf: p.auth.billing_amount_chf,
        status: p.status,
      }));

    const approvedSpend = roundHalfEven(
      this.past.filter((p) => p.status === "approved").reduce((sum, p) => sum + p.auth.billing_amount_chf, 0),
    );

    return {
      type: "authorization.request",
      request_id: `req_${authorization.authorization_id}`,
      deadline_at: new Date(now.getTime() + 8_000).toISOString(),
      authorization,
      mandate: this.mandate,
      context: { approved_spend_in_period_chf: approvedSpend, recent_authorizations: recent },
      runtime: {
        received_at: now.toISOString(),
        history_window_minutes: 10,
        context_basis: "run_decisions_and_scenario_timestamps",
      },
    };
  }

  record(event: AuthorizationEvent, verdict: Verdict) {
    const status = verdict === "approve" ? "approved" : verdict === "decline" ? "declined" : "pending";
    this.past.push({ auth: event.authorization, status });
  }
}

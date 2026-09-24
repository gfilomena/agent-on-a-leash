// The Viseca worker: takes purchases from the queue and answers each one in time, exactly once.
//
// Learned live (step 3): while a purchase waits for the customer, /next keeps handing it out
// again, instantly. That is normal: we must not answer it a second time (only /resolve may
// follow a step_up), and we must not poll in a tight loop.
import { config } from "./config.js";
import type { AuthorizationEvent, EngineDecision, Evidence } from "./types.js";
import type { ApiResult } from "./viseca.js";

export interface QueueApi {
  nextRequest(waitSeconds?: number): Promise<ApiResult>;
  postDecision(authorizationId: string, body: unknown): Promise<ApiResult>;
  authorizations(): Promise<ApiResult>;
}

export interface Handled {
  ev: AuthorizationEvent;
  runId: string; // the run this purchase belongs to (the queue is shared by all our runs)
  adopted: boolean; // arrived already answered by an earlier session, waiting for the customer
  d: EngineDecision;
  receivedAt: number;
  answeredAt: number;
  accepted: boolean;
  evidenceFormat: EvidenceFormat | null;
  refusal: { status: number; body: unknown } | null;
  redeliveries: number;
  posts: number; // decision POSTs sent for this purchase (format retries included)
}

type EvidenceFormat = "objects" | "strings" | "none";

/** Thrown when continuing would mean looping: the caller stops and shows the message. */
export class WorkerStuck extends Error {}

const MAX_REDELIVERIES = 3; // of a purchase whose answer Viseca did not accept
const WAITING_FOR_CUSTOMER = /step_up/i; // Viseca's status while the customer decides: "pending_step_up"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const evidenceText = (e: Evidence) => `${e.check}: ${e.result} (${e.detail})`;

export class Worker {
  readonly handled = new Map<string, Handled>();
  private evidenceFormat: EvidenceFormat | null = null;

  constructor(
    private api: QueueApi,
    private decide: (ev: AuthorizationEvent) => EngineDecision,
    private opts: {
      humanWindowMs: number;
      log: (kind: string, data: unknown) => void;
      onAnswered: (h: Handled) => void;
      onAdopted?: (h: Handled) => void;
      engineVersion?: string;
    },
  ) {}

  /** One poll of the queue. Throws WorkerStuck instead of looping. */
  async pollOnce(): Promise<"idle" | "answered" | "redelivered"> {
    const r = await this.api.nextRequest(25).catch((err: unknown) => ({ status: 0, ok: false, data: String(err), ms: 0 }));
    if (r.status === 204) return "idle";
    if (!r.ok) {
      this.opts.log("poll_error", r);
      await sleep(1000);
      return "idle";
    }
    const envelope = r.data;
    const ev = envelope?.data as AuthorizationEvent;
    const id: string = ev?.authorization?.authorization_id ?? envelope?.authorization_id;
    const known = this.handled.get(id);
    if (known) {
      await this.redelivered(known, envelope);
      return "redelivered";
    }
    this.opts.log("purchase_received", envelope);
    if (WAITING_FOR_CUSTOMER.test(String(envelope?.status))) {
      // Answered by an earlier session and waiting for the customer: only /resolve may follow.
      this.adopt(ev, envelope);
      return "redelivered";
    }
    await this.answer(ev, envelope?.run_id);
    return "answered";
  }

  private adopt(ev: AuthorizationEvent, envelope: any) {
    const now = Date.now();
    const d: EngineDecision = { decision: "step_up", reason_codes: [], customer_message: "", evidence: [] };
    const h: Handled = { ev, d, runId: envelope?.run_id, adopted: true, receivedAt: now, answeredAt: now, accepted: true, evidenceFormat: null, refusal: null, redeliveries: 0, posts: 0 };
    this.handled.set(ev.authorization.authorization_id, h);
    this.opts.log("adopted", { id: ev.authorization.authorization_id, run_id: envelope?.run_id, status: envelope?.status });
    this.opts.onAdopted?.(h);
  }

  private async answer(ev: AuthorizationEvent, runId: string) {
    const receivedAt = Date.now();
    const d = this.decide(ev);
    const h: Handled = { ev, d, runId, adopted: false, receivedAt, answeredAt: 0, accepted: false, evidenceFormat: null, refusal: null, redeliveries: 0, posts: 0 };
    this.handled.set(ev.authorization.authorization_id, h);
    await this.post(h);
    this.opts.onAnswered(h);
  }

  /** Sends our answer. Tries evidence as objects, then strings, then none (format unknown until tested). */
  private async post(h: Handled) {
    const id = h.ev.authorization.authorization_id;
    const base = { authorization_id: id, decision: h.d.decision, reason_codes: h.d.reason_codes, customer_message: h.d.customer_message, engine_version: this.opts.engineVersion ?? config.engineVersion };
    const formats: EvidenceFormat[] = this.evidenceFormat ? [this.evidenceFormat] : ["objects", "strings", "none"];
    for (const fmt of formats) {
      const body = fmt === "objects" ? { ...base, evidence: h.d.evidence } : fmt === "strings" ? { ...base, evidence: h.d.evidence.map(evidenceText) } : base;
      h.posts++;
      const r = await this.api.postDecision(id, body);
      this.opts.log("decision_posted", { fmt, body, status: r.status, response: r.data });
      h.answeredAt = Date.now();
      if (r.ok) {
        h.accepted = true;
        h.evidenceFormat = this.evidenceFormat = fmt;
        h.refusal = null;
        return;
      }
      h.refusal = { status: r.status, body: r.data };
      if (r.status !== 400 && r.status !== 422) return; // not a format problem: don't try other formats
    }
  }

  private async redelivered(h: Handled, envelope: any) {
    h.redeliveries++;
    const name = `${h.ev.authorization.merchant.merchant_name} (${h.ev.authorization.authorization_id})`;

    if (h.accepted) {
      // Viseca already has our answer: never send a second one.
      const status = await this.platformStatus(h, envelope?.status);
      this.opts.log("redelivered", { id: h.ev.authorization.authorization_id, envelope_status: envelope?.status, platform_status: status, n: h.redeliveries });
      if (WAITING_FOR_CUSTOMER.test(status)) {
        const overdueMs = Date.now() - (h.answeredAt + this.opts.humanWindowMs + 60_000);
        if (overdueMs > 0) {
          throw new WorkerStuck(`Viseca still hands out ${name} although the customer window closed more than a minute ago (status "${status}").`);
        }
        await sleep(1000); // calm polling while the customer decides
        return;
      }
      if (h.redeliveries >= MAX_REDELIVERIES) {
        throw new WorkerStuck(`Viseca delivered ${name} ${h.redeliveries} times although it accepted our answer (its status: "${status}").`);
      }
      await sleep(1000);
      return;
    }

    // Our answer was never accepted.
    this.opts.log("redelivered_unanswered", { id: h.ev.authorization.authorization_id, envelope_status: envelope?.status, n: h.redeliveries, refusal: h.refusal });
    if (h.redeliveries >= MAX_REDELIVERIES) {
      throw new WorkerStuck(
        `Viseca refused our answer for ${name} and sent it again ${h.redeliveries} times. Last refusal: HTTP ${h.refusal?.status} ${JSON.stringify(h.refusal?.body)}`,
      );
    }
    if (Date.now() < Date.parse(h.ev.deadline_at)) await this.post(h);
    await sleep(1000);
  }

  /** Viseca's own status for a purchase: from the envelope when it says more than "awaiting_decision", else from the list. */
  private async platformStatus(h: Handled, envelopeStatus: unknown): Promise<string> {
    if (typeof envelopeStatus === "string" && envelopeStatus !== "awaiting_decision") return envelopeStatus;
    const r = await this.api.authorizations();
    const list: any[] = Array.isArray(r.data) ? r.data : (r.data?.authorizations ?? []);
    const record = list.find((x) => x.authorization_id === h.ev.authorization.authorization_id);
    return String(record?.status ?? envelopeStatus ?? "unknown");
  }
}

/** Purchases Viseca has not closed yet (from any of our runs). */
export async function unfinishedPurchases(api: QueueApi): Promise<any[]> {
  const r = await api.authorizations();
  const list: any[] = Array.isArray(r.data) ? r.data : (r.data?.authorizations ?? []);
  return list.filter((x) => /awaiting|step_up/i.test(String(x.status)));
}

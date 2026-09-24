// The live side: the one worker for our team key, the customer's answers, and expired reviews.
import { config } from "./config.js";
import type { Decision } from "./engine/decide.js";
import { decideWithAi } from "./engine/itemcheck.js";
import { itemSignature, type PastPurchase } from "./engine/memory.js";
import type { Spent } from "./engine/settings.js";
import { approvedShopsFor, approveShop, policyByMandate, save, securitySettings, state, type PurchaseRecord } from "./state.js";
import type { AuthorizationEvent } from "./types.js";
import { viseca } from "./viseca.js";
import { Worker, WorkerStuck, type Handled } from "./worker.js";

export const live = {
  running: false,
  humanWindowMs: 120_000,
  lastError: null as string | null,
  stories: [] as { id: string; name: string; instruction: string; purchases: number }[],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Earlier purchases under the same policy, as the engine's memory (oldest first, simulated time). */
function memoryFor(mandateId: string, excludeId: string): PastPurchase[] {
  return state.purchases
    .filter((p) => p.mandateId === mandateId && p.id !== excludeId)
    .sort((a, b) => Date.parse(a.simTime) - Date.parse(b.simTime))
    .map((p) => ({
      authorization_id: p.id,
      timestamp: p.simTime,
      merchant_id: p.shop.id,
      merchant_name: p.shop.name,
      billing_amount_chf: p.amountChf,
      item_signature: p.itemSignature,
      device: p.device,
      status: p.status === "expired" ? "declined" : p.status,
    }));
}

/** Approved agent spending through Compass, across all policies, since the last "Reset spending" (for the spending limit). */
export function liveSpent(excludeId?: string): Spent[] {
  const since = securitySettings().spendingSince;
  return state.purchases
    .filter((p) => p.status === "approved" && p.id !== excludeId && (!since || p.receivedAt >= since))
    .map((p) => ({ timestamp: p.simTime, amountChf: p.amountChf }));
}

/** Deadline is 8 s from queueing (deadline_at); keep 1.5 s for sending the answer (CLAUDE.md rule 3). */
const DEADLINE_MARGIN_MS = 1500;

export async function decideLive(event: AuthorizationEvent): Promise<Decision> {
  const policy = policyByMandate(event.mandate.mandate_id);
  const budgetMs = Math.min(6000, Date.parse(event.deadline_at) - Date.now() - DEADLINE_MARGIN_MS);
  return decideWithAi(
    {
      event,
      past: memoryFor(event.mandate.mandate_id, event.authorization.authorization_id),
      customerApprovedShops: approvedShopsFor(event.authorization.card_id),
      policyRevoked: policy?.status === "revoked",
      watchSession: policy?.watchSession ?? false,
      guidance: policy?.guidance ?? [],
      settings: { settings: securitySettings(), spent: liveSpent(event.authorization.authorization_id) },
    },
    { budgetMs },
  );
}

const decisions = new Map<string, Decision>(); // full engine output, kept until the purchase is stored

function store(h: Handled, runId: string) {
  const a = h.ev.authorization;
  const d = decisions.get(a.authorization_id)!;
  decisions.delete(a.authorization_id);
  const record: PurchaseRecord = {
    id: a.authorization_id,
    runId,
    mandateId: a.mandate_id,
    policyId: policyByMandate(a.mandate_id)?.id,
    scenarioId: a.scenario_id,
    cardId: a.card_id,
    replayOrder: a.replay_order,
    verdict: d.decision,
    status: !h.accepted ? "pending" : d.decision === "approve" ? "approved" : d.decision === "decline" ? "declined" : "pending",
    answeredBy: "compass",
    message: d.customer_message,
    reasonCodes: d.reason_codes,
    checks: d.checks,
    ignoredText: d.ignoredText,
    shop: { id: a.merchant.merchant_id, name: a.merchant.merchant_name, country: a.merchant.merchant_country, category: a.merchant.merchant_category },
    items: a.items.map((l) => ({ name: l.item_name, quantity: l.quantity, category: l.item_category })),
    amount: a.amount,
    currency: a.currency,
    amountChf: a.billing_amount_chf,
    simTime: a.timestamp,
    itemSignature: itemSignature(h.ev),
    device: a.customer_device_id,
    receivedAt: new Date(h.receivedAt).toISOString(),
    answeredAt: new Date(h.answeredAt).toISOString(),
    deadlineAt: h.ev.deadline_at,
    engineMs: d.ms,
    answerMs: h.answeredAt - h.receivedAt,
    accepted: h.accepted,
    refusal: h.refusal ? `HTTP ${h.refusal.status}` : undefined,
  };
  state.purchases = state.purchases.filter((p) => p.id !== record.id).concat(record);
  save();
}

/** Viseca's team settings and live test stories (never hard-coded). */
export async function loadBootstrap() {
  const boot = await viseca.bootstrap().catch(() => null);
  if (!boot?.ok) return false;
  live.humanWindowMs = boot.data.limits.step_up_timeout_seconds * 1000;
  live.stories = boot.data.scenarios.map((s: any) => ({ id: s.scenario_id, name: s.scenario_name, instruction: s.cardholder_instruction, purchases: s.event_count }));
  return true;
}

/** The worker: runs for the engine's whole life, answers every purchase once, in time. */
export async function startWorker() {
  if (process.env.WORKER === "off") {
    console.log("Worker off (WORKER=off): this engine will not take purchases from Viseca.");
    return;
  }
  const worker = new Worker(viseca, async (ev) => {
    const d = await decideLive(ev);
    decisions.set(ev.authorization.authorization_id, d);
    return d;
  }, {
    humanWindowMs: live.humanWindowMs,
    engineVersion: config.engineVersion,
    log: () => {},
    onAnswered: (h) => store(h, h.runId),
  });
  live.running = true;
  console.log(`Worker on: answering Viseca purchases (customer window ${live.humanWindowMs / 1000} s).`);
  void syncLoop();
  while (true) {
    try {
      await worker.pollOnce();
      live.lastError = null;
    } catch (err) {
      live.lastError = err instanceof Error ? err.message : String(err);
      console.error(`Worker: ${live.lastError}`);
      await sleep(err instanceof WorkerStuck ? 5000 : 1000);
    }
  }
}

/** Every few seconds: learn what Viseca did with purchases still waiting (expired reviews). */
async function syncLoop() {
  while (true) {
    await sleep(4000);
    const waiting = state.purchases.filter((p) => p.status === "pending");
    if (!waiting.length) continue;
    const r = await viseca.authorizations().catch(() => null);
    const list: any[] = r && Array.isArray(r.data) ? r.data : [];
    let changed = false;
    for (const p of waiting) {
      const remote = list.find((x) => x.authorization_id === p.id);
      if (!remote || /awaiting|step_up/i.test(String(remote.status))) continue;
      const expired = (remote.reason_codes ?? []).includes("step_up_expired") || remote.decision_source === "timeout";
      p.status = expired ? "expired" : remote.status === "approved" ? "approved" : "declined";
      p.answeredBy = expired ? "viseca" : p.answeredBy;
      p.resolvedAt = remote.finalized_at ?? new Date().toISOString();
      if (expired) p.finalNote = "Expired: you didn't answer in time, so it wasn't bought.";
      changed = true;
    }
    if (changed) save();
  }
}

/** The customer's own answer to a purchase waiting in the Inbox. Only a real answer is ever sent. */
export async function answerPurchase(id: string, approve: boolean): Promise<{ ok: boolean; message: string }> {
  const p = state.purchases.find((x) => x.id === id);
  if (!p) return { ok: false, message: "This purchase isn't known." };
  if (p.status !== "pending") return { ok: false, message: "This purchase has already been decided." };
  const decision = approve ? "approve" : "decline";
  const r = await viseca.resolve(id, {
    decision,
    customer_message: approve ? "The customer approved this purchase in Compass." : "The customer declined this purchase in Compass.",
    evidence: [{ check: "customer", result: "pass", detail: `The customer ${approve ? "approved" : "declined"} it in the Compass app` }],
  });
  if (!r.ok) {
    const late = Date.now() > Date.parse(p.answeredAt) + live.humanWindowMs;
    if (late) {
      p.status = "expired";
      p.answeredBy = "viseca";
      p.finalNote = "Expired: you didn't answer in time, so it wasn't bought.";
      save();
      return { ok: false, message: "Too late: the answer window closed, so it wasn't bought." };
    }
    return { ok: false, message: "Viseca didn't accept the answer. Please try again." };
  }
  p.status = approve ? "approved" : "declined";
  p.answeredBy = "you";
  p.resolvedAt = new Date().toISOString();
  if (approve) approveShop(p.cardId, p.shop.id);
  save();
  return { ok: true, message: approve ? "Approved. Your agent can go ahead." : "Declined. Your agent won't buy it." };
}

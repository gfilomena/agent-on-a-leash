// Policies: the customer's sentence → draft (AI + code checks) → one-tap answers → confirm at
// Viseca (sentence sent word for word) → optional Viseca test story → revoke.
import { randomUUID } from "node:crypto";
import { AMOUNT, compileRequest, describeRule, isPriceQuestion } from "./compiler.js";
import { live } from "./live.js";
import { save, state, type Policy } from "./state.js";
import { viseca } from "./viseca.js";

export class PolicyError extends Error {}

export async function createDraft(instruction: string): Promise<Policy> {
  const text = instruction.trim();
  if (text.length < 3) throw new PolicyError("Tell me what your agent may buy.");
  const d = await compileRequest(text).catch(() => {
    throw new PolicyError("I couldn't read that right now. Please try again in a moment.");
  });
  const policy: Policy = {
    id: `P-${randomUUID().slice(0, 8)}`,
    instruction: text,
    title: d.title,
    hard_rules: d.hard_rules,
    uncertainty_policy: d.uncertainty_policy,
    guidance: d.guidance,
    explanations: d.explanations,
    notUnderstood: d.notUnderstood,
    watchSession: d.watchSession,
    status: "draft",
    createdAt: new Date().toISOString(),
    questions: d.questions,
  };
  state.policies.push(policy);
  save();
  return policy;
}

const find = (id: string) => {
  const p = state.policies.find((x) => x.id === id);
  if (!p) throw new PolicyError("This policy doesn't exist.");
  return p;
};

/** A one-tap answer to a follow-up question. A price answer becomes a rule; anything else guidance. */
export function answerQuestion(id: string, question: string, answer: string): Policy {
  const p = find(id);
  if (p.status !== "draft") throw new PolicyError("This policy is already confirmed.");
  const amount = answer.match(AMOUNT);
  const isPrice = isPriceQuestion(question);
  if (isPrice && !amount) throw new PolicyError("Please pick an amount: a price limit is required.");
  if (isPrice && amount) {
    const rule = { field: "authorization.billing_amount_chf", operator: "<=" as const, value: Number(amount[2].replace(",", ".")), currency: amount[1].toUpperCase(), scope: "purchase" as const };
    p.hard_rules.push(rule);
    p.explanations.push({ text: describeRule(rule), source: answer });
  } else {
    p.guidance.push(`${question.replace(/\?$/, "")}: ${answer}`);
  }
  p.questions = (p.questions ?? []).filter((q) => q.text !== question);
  save();
  return p;
}

/** The customer confirmed: create and confirm the mandate at Viseca, then start the matching test story. */
export async function confirmPolicy(id: string, whenUnsure: "ask" | "decline"): Promise<Policy> {
  const p = find(id);
  if (p.status !== "draft") throw new PolicyError("This policy is already confirmed.");
  if (!p.hard_rules.some((r) => r.field === "authorization.billing_amount_chf" && r.scope === "purchase"))
    throw new PolicyError("Please set a maximum price per order first.");
  p.uncertainty_policy = whenUnsure;

  const draft = await viseca.createMandate({
    instruction: p.instruction,
    hard_rules: p.hard_rules,
    uncertainty_policy: p.uncertainty_policy,
    guidance: [...p.guidance, ...(p.watchSession ? ["Pause when the session looks like someone else is using the agent."] : [])],
    open_questions: p.notUnderstood,
  });
  if (!draft.ok || !draft.data?.draft_id) throw new PolicyError("Viseca didn't accept the policy. Please try again.");
  const confirmed = await viseca.confirmMandate(draft.data.draft_id);
  if (!confirmed.ok || !confirmed.data?.mandate_id) throw new PolicyError("Viseca didn't confirm the policy. Please try again.");

  p.draftId = draft.data.draft_id;
  p.mandateId = confirmed.data.mandate_id;
  p.status = "active";
  p.confirmedAt = new Date().toISOString();
  delete p.questions;

  // The sentence is one of Viseca's test stories: start it, so the (simulated) agent starts shopping.
  const story = live.stories.find((s) => s.instruction.trim() === p.instruction.trim());
  if (story && live.running) {
    const run = await viseca.startRun(story.id, p.mandateId!);
    if (run.ok && run.data?.run_id) {
      p.scenarioId = story.id;
      p.runId = run.data.run_id;
    }
  }
  save();
  return p;
}

export async function revokePolicy(id: string): Promise<Policy> {
  const p = find(id);
  if (p.status !== "active") throw new PolicyError("This policy isn't active.");
  if (p.mandateId) {
    const r = await viseca.revokeMandate(p.mandateId);
    if (!r.ok && r.status !== 404 && r.status !== 409) throw new PolicyError("Viseca didn't accept the revocation. Please try again.");
  }
  // From now on the engine blocks anything that still arrives for it (engine: policyRevoked).
  p.status = "revoked";
  p.revokedAt = new Date().toISOString();
  save();
  return p;
}

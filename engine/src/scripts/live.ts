// Step 3: one live run end to end. The customer's answer is typed by a real person in the terminal.
// Usage: npm run live -- SCEN0101         Rehearsal without Viseca: npm run live -- --dry
import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { decide } from "../decide.js";
import { formatMoney } from "../money.js";
import { eventErrors } from "../schema.js";
import type { AuthorizationEvent, EngineDecision, Evidence } from "../types.js";
import { viseca } from "../viseca.js";
import { makeFakeViseca } from "./fake-viseca.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const scenarioId = args.find((a) => !a.startsWith("--")) ?? "SCEN0101";
const api: Pick<typeof viseca, keyof ReturnType<typeof makeFakeViseca>> = dry ? makeFakeViseca(15_000) : viseca;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const c = { green: "\x1b[32m", amber: "\x1b[33m", red: "\x1b[31m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m" };
const say = (s = "") => console.log(s);

// Everything that happens is kept for later analysis (no secrets in here).
const log: { at: string; kind: string; data: unknown }[] = [];
const note = (kind: string, data: unknown) => log.push({ at: new Date().toISOString(), kind, data });
function saveLog() {
  const dir = fileURLToPath(new URL("../../data/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const file = `${dir}live-${scenarioId}-${dry ? "dry-" : ""}${Date.now()}.json`;
  writeFileSync(file, JSON.stringify(log, null, 2));
  return file;
}
function stop(message: string, code = 1): never {
  say(message);
  say(`  Log saved: ${saveLog()}`);
  process.exit(code);
}

// ---------- keyboard: one question at a time ----------
let currentQuestion: ((key: string) => boolean) | null = null;
const scriptedKeys: string[] = []; // piped input (rehearsals): keys wait for their question
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (buf) => {
    const key = buf.toString().toLowerCase();
    if (key === "\u0003") process.exit(130); // Ctrl-C
    if (currentQuestion?.(key)) currentQuestion = null; // stray keys are ignored
  });
} else {
  createInterface({ input: process.stdin }).on("line", (line) => {
    const key = line.trim().toLowerCase().slice(0, 1);
    if (currentQuestion?.(key)) currentQuestion = null;
    else scriptedKeys.push(key);
  });
}
function askKey(keys: string[]): Promise<string> {
  const early = scriptedKeys.shift();
  if (early && keys.includes(early)) return Promise.resolve(early);
  return new Promise((resolve) => {
    currentQuestion = (k) => (keys.includes(k) ? (resolve(k), true) : false);
  });
}

// ---------- setup: policy, confirmation, run ----------
const boot = await api.bootstrap();
const scenario = boot.data?.scenarios?.find((s: any) => s.scenario_id === scenarioId);
if (!scenario) {
  say(`✕ Story ${scenarioId} not found. Run "npm run connect" to list the live stories.`);
  process.exit(1);
}
const humanWindowMs = boot.data.limits.step_up_timeout_seconds * 1000;

const policy = {
  instruction: scenario.cardholder_instruction,
  hard_rules: [{ field: "authorization.billing_amount_chf", operator: "<=", value: 20, currency: "CHF", scope: "purchase" }],
  uncertainty_policy: "ask",
  guidance: [],
  open_questions: [],
};

say(`${c.bold}${dry ? "REHEARSAL (nothing is sent to Viseca) · " : ""}Live test: ${scenario.scenario_name}${c.reset}`);
say(`\nTest policy`);
say(`  Customer's words (sent word for word): "${policy.instruction}"`);
say(`  Rule: total price at most CHF 20 per purchase`);
say(`  When unsure: ask me`);
say(`  ${c.dim}Compass's real checks come later. For this test, every purchase comes to you.${c.reset}`);
if (!process.stdin.isTTY) say(`${c.dim}(Type the letter, then press Enter.)${c.reset}`);
say(`\nConfirm this policy?  [y] yes   [n] no`);
if ((await askKey(["y", "n"])) === "n") {
  say("Not confirmed. Nothing was created.");
  process.exit(0);
}

const draft = await api.createMandate(policy);
note("mandate_created", draft);
const draftId = draft.data?.draft_id ?? draft.data?.mandate?.draft_id;
if (!draft.ok || !draftId) stop(`✕ Viseca refused the policy (HTTP ${draft.status}): ${JSON.stringify(draft.data)}`);
const confirmed = await api.confirmMandate(draftId);
note("mandate_confirmed", confirmed);
const mandateId = confirmed.data?.mandate_id ?? confirmed.data?.mandate?.mandate_id;
if (!confirmed.ok || !mandateId) stop(`✕ Confirmation refused (HTTP ${confirmed.status}): ${JSON.stringify(confirmed.data)}`);
say(`✓ Policy confirmed at Viseca`);

// ---------- worker: keeps answering purchases, even while the customer is thinking ----------
type Pending = { ev: AuthorizationEvent; d: EngineDecision; decidedAt: number; settled: boolean; outcome?: string };
const decided = new Map<string, Pending>();
const customerQueue: Pending[] = [];
const arrivals: { n: number; at: number; openCustomerQuestions: number }[] = [];
let runStartedAt = 0;
let received = 0;
let evidenceFormat: "objects" | "strings" | "none" | null = null;
let finished = false;

const evidenceText = (e: Evidence) => `${e.check}: ${e.result} (${e.detail})`;

async function postDecision(id: string, d: EngineDecision) {
  const base = { authorization_id: id, decision: d.decision, reason_codes: d.reason_codes, customer_message: d.customer_message, engine_version: config.engineVersion };
  const formats = evidenceFormat ? [evidenceFormat] : (["objects", "strings", "none"] as const);
  let last: any = null;
  for (const fmt of formats) {
    const body = fmt === "objects" ? { ...base, evidence: d.evidence } : fmt === "strings" ? { ...base, evidence: d.evidence.map(evidenceText) } : base;
    const r = await api.postDecision(id, body);
    note("decision_posted", { fmt, body, status: r.status, response: r.data });
    last = { ...r, fmt };
    if (r.ok) {
      evidenceFormat = fmt;
      return last;
    }
    if (r.status !== 400 && r.status !== 422) return last; // not a format problem: don't retry
  }
  return last;
}

async function handle(envelope: any) {
  const gotAt = Date.now();
  const ev = envelope.data as AuthorizationEvent;
  const a = ev.authorization;
  note("purchase_received", envelope);

  if (decided.has(a.authorization_id)) {
    say(`  ↻ The same purchase was delivered again. Sending the saved answer; it is not counted twice.`);
    await postDecision(a.authorization_id, decided.get(a.authorization_id)!.d);
    return;
  }
  received++;
  arrivals.push({ n: received, at: gotAt, openCustomerQuestions: [...decided.values()].filter((p) => !p.settled).length });

  const errors = eventErrors(ev);
  const d = decide(ev);
  const posted = await postDecision(a.authorization_id, d);
  const answeredMs = Date.now() - gotAt;
  const leftMs = Date.parse(ev.deadline_at) - Date.now();
  const pending: Pending = { ev, d, decidedAt: Date.now(), settled: d.decision !== "step_up" };
  decided.set(a.authorization_id, pending);

  const money = a.currency === "CHF" ? formatMoney(a.billing_amount_chf) : `${formatMoney(a.amount, a.currency)} = ${formatMoney(a.billing_amount_chf)}`;
  say(`\n${c.bold}Purchase ${received} of ${scenario.event_count}${c.reset}  ${a.merchant.merchant_name} · ${money}`);
  say(`  ${errors.length ? `${c.red}✕ format problems: ${errors.join("; ")}${c.reset}` : "✓ matches Viseca's format"}`);
  if (posted?.ok) {
    const verdict = { approve: "Approved", step_up: "Needs review", decline: "Blocked" }[d.decision];
    say(`  ✓ Compass answered "${verdict}" in ${secs(answeredMs)} (${secs(leftMs)} before the deadline) · evidence sent as ${posted.fmt}`);
    if (d.decision === "step_up") customerQueue.push(pending);
  } else {
    say(`  ${c.red}✕ Viseca refused our answer (HTTP ${posted?.status}): ${JSON.stringify(posted?.data)}${c.reset}`);
    pending.settled = true;
  }
}

async function worker() {
  while (!finished) {
    const r = await api.nextRequest(25).catch((err: unknown) => ({ status: 0, ok: false, data: String(err), ms: 0 }));
    if (r.status === 204) continue;
    if (!r.ok) {
      note("poll_error", r);
      say(`  ! Waiting for purchases failed (HTTP ${r.status}), retrying`);
      await sleep(1000);
      continue;
    }
    await handle(r.data);
  }
}

// ---------- the customer: one question at a time ----------
async function findStatus(id: string) {
  const r = await api.authorizations();
  const list: any[] = Array.isArray(r.data) ? r.data : (r.data?.authorizations ?? r.data?.items ?? []);
  const mine = list.find((x) => x.authorization_id === id) ?? null;
  note("status_check", { id, record: mine, raw: mine ? undefined : r.data });
  return mine;
}

async function watchExpiry(p: Pending) {
  const id = p.ev.authorization.authorization_id;
  const closesAt = p.decidedAt + humanWindowMs;
  await sleep(Math.max(0, closesAt - Date.now()) + 5_000);
  let record = await findStatus(id);
  say(`\n${c.bold}After the customer window closed${c.reset} (purchase at ${p.ev.authorization.merchant.merchant_name}):`);
  say(`  Viseca now reports: ${JSON.stringify(record)}`);
  if (record && /pending|step_up/i.test(JSON.stringify(record))) {
    await sleep(30_000);
    record = await findStatus(id);
    say(`  30 s later: ${JSON.stringify(record)}`);
  }
  p.outcome = `expired → ${JSON.stringify(record)}`;
  p.settled = true;
}

const expiryWatches: Promise<void>[] = [];

async function customer() {
  while (!finished) {
    const p = customerQueue.shift();
    if (!p) {
      await sleep(200);
      continue;
    }
    const a = p.ev.authorization;
    const left = () => Math.max(0, Math.round((p.decidedAt + humanWindowMs - Date.now()) / 1000));
    say(`\n${c.amber}┌ Needs your answer${c.reset}`);
    say(`${c.amber}│${c.reset} ${a.merchant.merchant_name} · ${formatMoney(a.billing_amount_chf)}`);
    for (const l of a.items) say(`${c.amber}│${c.reset}   ${l.quantity}× ${l.item_name} (${formatMoney(l.unit_price, l.currency)})`);
    say(`${c.amber}│${c.reset} Why: ${p.d.customer_message}`);
    say(`${c.amber}└${c.reset} [a] Approve   [d] Decline   [s] Let it expire (to see what Viseca does)   · ${left()} s left`);

    const reminder = setInterval(() => say(`  … ${left()} s left`), 30_000);
    const key = await Promise.race([askKey(["a", "d", "s"]), sleep(p.decidedAt + humanWindowMs - Date.now()).then(() => "timeout")]);
    clearInterval(reminder);
    currentQuestion = null;

    if (key === "a" || key === "d") {
      const decision = key === "a" ? "approve" : "decline";
      const body = {
        decision,
        customer_message: `The customer ${decision === "approve" ? "approved" : "declined"} this purchase in Compass.`,
        evidence: evidenceFormat === "strings" ? ["customer: answered in the Compass app"] : evidenceFormat === "none" ? [] : [{ check: "customer", result: "pass", detail: "Answered in the Compass app" }],
      };
      const r = await api.resolve(a.authorization_id, body);
      note("resolved", { body, status: r.status, response: r.data });
      say(r.ok ? `  ✓ Your answer (${decision}) was accepted by Viseca` : `  ${c.red}✕ Viseca refused your answer (HTTP ${r.status}): ${JSON.stringify(r.data)}${c.reset}`);
      p.outcome = `${decision} by customer → HTTP ${r.status}`;
      p.settled = true;
    } else {
      say(`  ${key === "s" ? "OK, letting it expire." : "No answer in time."} Compass will check what Viseca does once the window closes (~${left() + 5} s).`);
      expiryWatches.push(watchExpiry(p));
    }
  }
}

void worker();
void customer();

const run = await api.startRun(scenarioId, mandateId);
note("run_started", run);
const runId = run.data?.run_id;
if (!run.ok || !runId) stop(`✕ Viseca refused to start the run (HTTP ${run.status}): ${JSON.stringify(run.data)}`);
runStartedAt = Date.now();
say(`✓ Run started · waiting for purchases…`);

// ---------- wait until every purchase is answered and settled (never forever) ----------
const giveUpAt = Date.now() + 8 * 60_000;
let lastRunCheck = Date.now();
while (received < scenario.event_count || [...decided.values()].some((p) => !p.settled)) {
  await sleep(500);
  if (Date.now() > giveUpAt) {
    say(`\n${c.red}! Stopped waiting after 8 minutes (${received} of ${scenario.event_count} purchases received).${c.reset}`);
    break;
  }
  if (received < scenario.event_count && Date.now() - lastRunCheck > 15_000) {
    lastRunCheck = Date.now();
    const state = await api.getRun(runId);
    note("run_progress", state);
    if (/complete|finish|done|fail|cancel|expire/i.test(String(state.data?.status)) && [...decided.values()].every((p) => p.settled)) {
      say(`\n  Viseca says the run is "${state.data?.status}" after ${received} of ${scenario.event_count} purchases.`);
      break;
    }
  }
}
await Promise.all(expiryWatches);
finished = true;

const runState = await api.getRun(runId);
note("run_final", runState);
const feed = await api.events(0);
note("event_feed", feed);

say(`\n${c.bold}Summary${c.reset}`);
say(`  Evidence format Viseca accepted: ${evidenceFormat}`);
for (const r of arrivals) {
  say(`  Purchase ${r.n} arrived ${secs(r.at - runStartedAt)} after the run started` + (r.openCustomerQuestions ? `, while ${r.openCustomerQuestions} earlier purchase(s) still waited for the customer` : ""));
}
for (const p of decided.values()) say(`  ${p.ev.authorization.merchant.merchant_name}: ${p.outcome ?? p.d.decision}`);
say(`  Run status: ${JSON.stringify(runState.data)}`);
say(`\n  Full log saved: ${saveLog()}`);
process.exit(0);

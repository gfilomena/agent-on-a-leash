// Step 3: one live run end to end. The customer's answer is typed by a real person in the terminal.
// Usage: npm run live -- SCEN0101
// Rehearsals (nothing sent to Viseca): npm run live -- --dry    |  --dry-refuse (Viseca refuses every answer)
import { appendFileSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { decide } from "../decide.js";
import { formatMoney } from "../money.js";
import { eventErrors } from "../schema.js";
import { viseca } from "../viseca.js";
import { unfinishedPurchases, Worker, WorkerStuck, type Handled } from "../worker.js";
import { makeFakeViseca } from "./fake-viseca.js";

const args = process.argv.slice(2);
const refuse = args.includes("--dry-refuse");
const dry = refuse || args.includes("--dry");
const scenarioId = args.find((a) => !a.startsWith("--")) ?? "SCEN0101";
const api = dry ? makeFakeViseca(15_000, { refuseDecisions: refuse }) : viseca;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const c = { green: "\x1b[32m", amber: "\x1b[33m", red: "\x1b[31m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m" };
const say = (s = "") => console.log(s);

// ---------- log: written line by line, so Ctrl+C never loses it (no secrets in here) ----------
const logDir = fileURLToPath(new URL("../../data/", import.meta.url));
mkdirSync(logDir, { recursive: true });
const logFile = `${logDir}live-${scenarioId}-${dry ? "dry-" : ""}${Date.now()}.jsonl`;
const note = (kind: string, data: unknown) => appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), kind, data }) + "\n");

function stop(message: string, code = 1): never {
  say(message);
  say(`  Log: ${logFile}`);
  note("stopped", { message, code });
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
    if (key === "\u0003") stop("\nStopped with Ctrl+C.", 130);
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

// ---------- setup: policy, confirmation ----------
const boot = await api.bootstrap();
const scenario = boot.data?.scenarios?.find((s: any) => s.scenario_id === scenarioId);
if (!scenario) stop(`✕ Story ${scenarioId} not found. Run "npm run connect" to list the live stories.`);
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
if ((await askKey(["y", "n"])) === "n") stop("Not confirmed. Nothing was created.", 0);

const draft = await api.createMandate(policy);
note("mandate_created", draft);
const draftId = draft.data?.draft_id ?? draft.data?.mandate?.draft_id;
if (!draft.ok || !draftId) stop(`✕ Viseca refused the policy (HTTP ${draft.status}): ${JSON.stringify(draft.data)}`);
const confirmed = await api.confirmMandate(draftId);
note("mandate_confirmed", confirmed);
const mandateId = confirmed.data?.mandate_id ?? confirmed.data?.mandate?.mandate_id;
if (!confirmed.ok || !mandateId) stop(`✕ Confirmation refused (HTTP ${confirmed.status}): ${JSON.stringify(confirmed.data)}`);
say(`✓ Policy confirmed at Viseca`);

// ---------- worker: answers each purchase once, waits calmly while the customer decides ----------
const customerQueue: Handled[] = [];
const outcomes = new Map<string, string>(); // authorization id -> final result, once known
const arrivals: { n: number; at: number }[] = [];
let runStartedAt = 0;
let finished = false;

const worker = new Worker(api, decide, {
  humanWindowMs,
  log: note,
  onAdopted: (h) => {
    say(`\n  ${c.dim}A purchase from an earlier run (${h.ev.authorization.merchant.merchant_name}) is still waiting for its customer window to close. It is not answered again.${c.reset}`);
  },
  onAnswered: (h) => {
    const a = h.ev.authorization;
    // The queue is shared by all our runs: only purchases under this policy belong to this test.
    const own = a.mandate_id === mandateId;
    if (own) arrivals.push({ n: arrivals.length + 1, at: h.receivedAt });
    const errors = eventErrors(h.ev);
    const money = a.currency === "CHF" ? formatMoney(a.billing_amount_chf) : `${formatMoney(a.amount, a.currency)} = ${formatMoney(a.billing_amount_chf)}`;
    const title = own ? `Purchase ${arrivals.length} of ${scenario.event_count}` : `From an earlier run (not counted)`;
    say(`\n${c.bold}${title}${c.reset}  ${a.merchant.merchant_name} · ${money}`);
    say(`  ${errors.length ? `${c.red}✕ format problems: ${errors.join("; ")}${c.reset}` : "✓ matches Viseca's format"}`);
    if (h.accepted) {
      const verdict = { approve: "Approved", step_up: "Needs review", decline: "Blocked" }[h.d.decision];
      const leftMs = Date.parse(h.ev.deadline_at) - h.answeredAt;
      say(`  ✓ Compass answered "${verdict}" in ${secs(h.answeredAt - h.receivedAt)} (${secs(leftMs)} before the deadline) · evidence sent as ${h.evidenceFormat}`);
      if (h.d.decision === "step_up") customerQueue.push(h);
      else outcomes.set(a.authorization_id, h.d.decision);
    } else {
      say(`  ${c.red}✕ Viseca refused our answer (HTTP ${h.refusal?.status}): ${JSON.stringify(h.refusal?.body)}${c.reset}`);
    }
  },
});

async function workerLoop() {
  while (!finished) {
    try {
      await worker.pollOnce();
    } catch (err) {
      if (err instanceof WorkerStuck) stop(`\n${c.red}✕ Stopped instead of looping: ${err.message}${c.reset}`);
      throw err;
    }
  }
}

// ---------- the customer: one question at a time ----------
async function platformRecord(id: string) {
  const r = await api.authorizations();
  const list: any[] = Array.isArray(r.data) ? r.data : (r.data?.authorizations ?? []);
  return list.find((x) => x.authorization_id === id) ?? null;
}

async function watchExpiry(h: Handled) {
  const id = h.ev.authorization.authorization_id;
  await sleep(Math.max(0, h.answeredAt + humanWindowMs - Date.now()));
  // Viseca closes expired reviews on its own schedule: check every 5 s, for up to 90 s.
  for (let i = 0; i < 18; i++) {
    const record = await platformRecord(id);
    note("status_check", { id, record });
    if (record && !/step_up|awaiting/i.test(record.status)) {
      say(`\n${c.bold}After the customer window closed${c.reset} (${h.ev.authorization.merchant.merchant_name}): Viseca set it to "${record.status}"` +
        (record.reason_codes?.length ? ` (${record.reason_codes.join(", ")})` : "") +
        (record.decision?.customer_message ? `: "${record.decision.customer_message}"` : ""));
      outcomes.set(id, `expired → ${record.status}`);
      return;
    }
    await sleep(5_000);
  }
  outcomes.set(id, "expired → Viseca had not closed it after 90 s");
}

const expiryWatches: Promise<void>[] = [];

async function customerLoop() {
  while (!finished) {
    const h = customerQueue.shift();
    if (!h) {
      await sleep(200);
      continue;
    }
    const a = h.ev.authorization;
    const left = () => Math.max(0, Math.round((h.answeredAt + humanWindowMs - Date.now()) / 1000));
    say(`\n${c.amber}┌ Needs your answer${c.reset}`);
    say(`${c.amber}│${c.reset} ${a.merchant.merchant_name} · ${formatMoney(a.billing_amount_chf)}`);
    for (const l of a.items) say(`${c.amber}│${c.reset}   ${l.quantity}× ${l.item_name} (${formatMoney(l.unit_price, l.currency)})`);
    say(`${c.amber}│${c.reset} Why: ${h.d.customer_message}`);
    say(`${c.amber}└${c.reset} [a] Approve   [d] Decline   [s] Let it expire (to see what Viseca does)   · ${left()} s left`);

    const reminder = setInterval(() => say(`  … ${left()} s left`), 30_000);
    const key = await Promise.race([askKey(["a", "d", "s"]), sleep(h.answeredAt + humanWindowMs - Date.now()).then(() => "timeout")]);
    clearInterval(reminder);
    currentQuestion = null;

    if (key === "a" || key === "d") {
      const decision = key === "a" ? "approve" : "decline";
      const body = {
        decision,
        customer_message: `The customer ${decision === "approve" ? "approved" : "declined"} this purchase in Compass.`,
        evidence: [{ check: "customer", result: "pass", detail: "Answered in the Compass app" }],
      };
      const r = await api.resolve(a.authorization_id, body);
      note("resolved", { body, status: r.status, response: r.data });
      say(r.ok ? `  ✓ Your answer (${decision}) was accepted by Viseca` : `  ${c.red}✕ Viseca refused your answer (HTTP ${r.status}): ${JSON.stringify(r.data)}${c.reset}`);
      outcomes.set(a.authorization_id, `${decision} by customer (HTTP ${r.status})`);
    } else {
      say(`  ${key === "s" ? "OK, letting it expire." : "No answer in time."} Watching what Viseca does once the window closes (in ${left()} s).`);
      expiryWatches.push(watchExpiry(h));
    }
  }
}

void workerLoop();
void customerLoop();

// Never start while earlier purchases are open: they would mix into this test.
for (let waitedMs = 0; ; waitedMs += 5_000) {
  const open = await unfinishedPurchases(api);
  if (open.length === 0) break;
  if (waitedMs === 0) say(`  Waiting for ${open.length} purchase(s) from earlier runs to close first (at most ~2.5 min)…`);
  if (waitedMs > 4 * 60_000) stop(`✕ Earlier purchases are still open after 4 minutes: ${open.map((x) => `${x.authorization_id} ${x.status}`).join(", ")}`);
  await sleep(5_000);
}

const run = await api.startRun(scenarioId, mandateId);
note("run_started", run);
const runId = run.data?.run_id;
if (!run.ok || !runId) stop(`✕ Viseca refused to start the run (HTTP ${run.status}): ${JSON.stringify(run.data)}`);
runStartedAt = Date.now();
say(`✓ Run started · waiting for purchases…`);

// ---------- done when Viseca says the run is completed (never wait forever) ----------
const giveUpAt = Date.now() + 12 * 60_000;
let runState = run;
while (true) {
  await sleep(dry ? 1_000 : 5_000);
  runState = await api.getRun(runId);
  note("run_progress", runState);
  if (/complete|finish|fail|cancel/i.test(String(runState.data?.status)) && customerQueue.length === 0) break;
  if (Date.now() > giveUpAt) {
    say(`\n${c.red}! Stopped waiting after 12 minutes (Viseca still says "${runState.data?.status}").${c.reset}`);
    break;
  }
}
await Promise.all(expiryWatches);
finished = true;

say(`\n${c.bold}Summary${c.reset}`);
const all = [...worker.handled.values()];
say(`  Evidence format Viseca accepted: ${all.find((h) => h.accepted)?.evidenceFormat ?? "none accepted"}`);
for (const r of arrivals) say(`  Purchase ${r.n} arrived ${secs(r.at - runStartedAt)} after the run started`);
for (const h of all) {
  const a = h.ev.authorization;
  say(`  ${a.merchant.merchant_name} ${formatMoney(a.billing_amount_chf)}: ${outcomes.get(a.authorization_id) ?? h.d.decision} · answer sent ${h.posts}× · handed out again ${h.redeliveries}× while waiting`);
}
say(`  Viseca's run status: ${runState.data?.status}`);
say(`  Log: ${logFile}`);
note("summary", { runState: runState.data });
process.exit(0);

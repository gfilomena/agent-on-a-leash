// Recording mode: runs Viseca's live stories once, declines every purchase (clearly labelled as a
// test recording, never an approval, never an invented customer answer) and saves every purchase
// in engine/recordings/ for offline testing.
// Usage: npm run record                   all live stories not recorded yet
//        npm run record -- SCEN0135        one story
//        npm run record -- --dry           rehearsal against the fake (nothing sent to Viseca)
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatMoney } from "../money.js";
import { eventErrors } from "../schema.js";
import type { AuthorizationEvent, EngineDecision } from "../types.js";
import { viseca } from "../viseca.js";
import { unfinishedPurchases, Worker, WorkerStuck } from "../worker.js";
import { makeFakeViseca } from "./fake-viseca.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const only = args.filter((a) => !a.startsWith("--"));
const api = dry ? makeFakeViseca(15_000) : viseca;

const RECORDING: EngineDecision = {
  decision: "decline",
  reason_codes: ["test_recording"],
  customer_message: "Test run to collect data, not a real decision",
  evidence: [{ check: "recording", result: "unknown", detail: "Recording mode: every purchase is declined so the story can be saved for offline testing." }],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const c = { green: "\x1b[32m", red: "\x1b[31m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m" };
const say = (s = "") => console.log(s);

const dataDir = fileURLToPath(new URL("../../data/", import.meta.url));
const recDir = fileURLToPath(new URL(dry ? "../../data/recordings-dry/" : "../../recordings/", import.meta.url));
mkdirSync(dataDir, { recursive: true });
mkdirSync(recDir, { recursive: true });
const logFile = `${dataDir}record-${dry ? "dry-" : ""}${Date.now()}.jsonl`;
const note = (kind: string, data: unknown) => appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), kind, data }) + "\n");
function stop(message: string): never {
  say(`${c.red}${message}${c.reset}\n  Log: ${logFile}`);
  note("stopped", { message });
  process.exit(1);
}

const boot = await api.bootstrap();
const stories: any[] = (boot.data?.scenarios ?? []).filter((s: any) =>
  only.length ? only.includes(s.scenario_id) : dry || !existsSync(`${recDir}${s.scenario_id}.json`),
);
if (!stories.length) stop("Nothing to record: every live story already has a recording (pass a story id to record one again).");

// One worker for the whole session; purchases are filed under their own policy.
const byMandate = new Map<string, AuthorizationEvent[]>();
let finished = false;
const worker = new Worker(api, () => RECORDING, {
  humanWindowMs: boot.data.limits.step_up_timeout_seconds * 1000,
  engineVersion: "recording-mode",
  log: note,
  onAnswered: (h) => {
    const a = h.ev.authorization;
    const list = byMandate.get(a.mandate_id);
    if (!list) {
      say(`  ${c.dim}Purchase from an earlier run (${a.merchant.merchant_name}) declined as a test recording, not saved.${c.reset}`);
      return;
    }
    list.push(h.ev);
    const errors = eventErrors(h.ev);
    const money = a.currency === "CHF" ? formatMoney(a.billing_amount_chf) : `${formatMoney(a.amount, a.currency)} = ${formatMoney(a.billing_amount_chf)}`;
    const ms = h.answeredAt - h.receivedAt;
    const status = !h.accepted ? `${c.red}refused (HTTP ${h.refusal?.status})${c.reset}` : `declined (test) in ${(ms / 1000).toFixed(2)} s`;
    say(`  #${String(a.replay_order).padEnd(3)}${a.merchant.merchant_name.slice(0, 22).padEnd(23)}${money.padEnd(28)}${String(a.items.length).padStart(2)} line(s)  ${status}${errors.length ? `  ${c.red}✕ format: ${errors[0]}${c.reset}` : ""}`);
  },
});

void (async () => {
  while (!finished) {
    try {
      await worker.pollOnce();
    } catch (err) {
      if (err instanceof WorkerStuck) stop(`✕ Stopped instead of looping: ${err.message}`);
      throw err;
    }
  }
})();

async function waitForCleanQueue() {
  for (let waitedMs = 0; ; waitedMs += 3_000) {
    const open = await unfinishedPurchases(api);
    if (open.length === 0) return;
    if (waitedMs === 0) say(`  Waiting for ${open.length} purchase(s) from earlier runs to close first…`);
    if (waitedMs > 4 * 60_000) stop(`✕ Earlier purchases still open after 4 minutes: ${open.map((x) => `${x.authorization_id} ${x.status}`).join(", ")}`);
    await sleep(3_000);
  }
}

say(`${c.bold}${dry ? "REHEARSAL · " : ""}Recording ${stories.length} live stor${stories.length === 1 ? "y" : "ies"}: every purchase is declined and labelled "test_recording"${c.reset}`);
const results: string[] = [];

for (const s of stories) {
  say(`\n${c.bold}${s.scenario_id} · ${s.scenario_name}${c.reset} (${s.event_count} purchases)`);
  say(`  ${c.dim}"${s.cardholder_instruction}"${c.reset}`);
  await waitForCleanQueue();

  const draft = await api.createMandate({
    instruction: s.cardholder_instruction,
    hard_rules: [],
    uncertainty_policy: "decline",
    guidance: ["Test recording run: Compass declines every purchase to collect data. Not a customer policy."],
    open_questions: [],
  });
  note("mandate_created", draft);
  const draftId = draft.data?.draft_id;
  if (!draft.ok || !draftId) stop(`✕ Viseca refused the test policy (HTTP ${draft.status}): ${JSON.stringify(draft.data)}`);
  const confirmed = await api.confirmMandate(draftId);
  note("mandate_confirmed", confirmed);
  const mandateId = confirmed.data?.mandate_id;
  if (!confirmed.ok || !mandateId) stop(`✕ Confirmation refused (HTTP ${confirmed.status}): ${JSON.stringify(confirmed.data)}`);
  byMandate.set(mandateId, []);

  const run = await api.startRun(s.scenario_id, mandateId);
  note("run_started", run);
  const runId = run.data?.run_id;
  if (!run.ok || !runId) stop(`✕ Viseca refused to start the run (HTTP ${run.status}): ${JSON.stringify(run.data)}`);

  const giveUpAt = Date.now() + 5 * 60_000;
  let state = run;
  while (true) {
    await sleep(1_000);
    state = await api.getRun(runId);
    note("run_progress", state);
    if (/complete|finish|fail|cancel/i.test(String(state.data?.status))) break;
    if (Date.now() > giveUpAt) stop(`✕ ${s.scenario_id}: run not completed after 5 minutes (status "${state.data?.status}")`);
  }

  const purchases = byMandate.get(mandateId)!;
  const refused = [...worker.handled.values()].filter((h) => h.ev.authorization.mandate_id === mandateId && !h.accepted).length;
  writeFileSync(
    `${recDir}${s.scenario_id}.json`,
    JSON.stringify(
      {
        scenario_id: s.scenario_id,
        scenario_name: s.scenario_name,
        instruction: s.cardholder_instruction,
        event_count: s.event_count,
        recorded_at: new Date().toISOString(),
        run_id: runId,
        mandate_id: mandateId,
        note: "Recording mode: every purchase was declined as a test recording, so context and related statuses reflect that. Not an answer key.",
        purchases,
      },
      null,
      2,
    ) + "\n",
  );
  const ok = purchases.length === s.event_count && refused === 0;
  const line = `${ok ? "✓" : "✕"} ${s.scenario_id} ${s.scenario_name}: ${purchases.length}/${s.event_count} purchases saved, ${refused} refused, run ${state.data?.status}`;
  results.push(line);
  say(`  ${ok ? c.green : c.red}${line}${c.reset}`);
}

finished = true;
say(`\n${c.bold}Done${c.reset}`);
for (const r of results) say(`  ${r}`);
say(`  Recordings: ${recDir}\n  Log: ${logFile}`);
process.exit(results.every((r) => r.startsWith("✓")) ? 0 : 1);

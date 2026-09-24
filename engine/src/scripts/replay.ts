// Step 2+: feed purchases to the engine, story by story, in order, one line per purchase.
// Usage: npm run replay [-- SCEN0002]      the data pack's 45 purchases
//        npm run replay -- --live [SCEN0135]  the 111 recorded live purchases (engine/recordings/)
import { decide } from "../decide.js";
import { formatMoney, toChf } from "../money.js";
import { loadPackStories, loadRecordedStories, OfflineRun, type StoryInfo } from "../offline.js";
import { eventErrors } from "../schema.js";
import type { AuthorizationEvent, Verdict } from "../types.js";

const live = process.argv.includes("--live");
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
// Events are built one at a time: each one's context depends on our earlier decisions.
type Source = { story: StoryInfo; items: ((run: OfflineRun) => AuthorizationEvent)[] };
const sources: Source[] = (
  live
    ? loadRecordedStories().map((s) => ({ story: s, items: s.purchases.map((p) => (run: OfflineRun) => run.eventFromRecorded(p)) }))
    : loadPackStories().map((s) => ({ story: s, items: s.attempts.map((row) => (run: OfflineRun) => run.buildEvent(row)) }))
).filter((s) => !only || s.story.scenarioId === only);

const color = { approve: "\x1b[32m", step_up: "\x1b[33m", decline: "\x1b[31m", dim: "\x1b[2m", reset: "\x1b[0m" };
const label: Record<Verdict, string> = { approve: "Approved", step_up: "Needs review", decline: "Blocked" };
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s).padEnd(n);

let total = 0;
let valid = 0;
let fxOk = 0;
const problems: string[] = [];

console.log(live ? "Recorded live stories (engine/recordings/)" : "Data pack stories");
for (const { story, items } of sources) {
  console.log(`\n${story.scenarioId} · ${story.name}`);
  console.log(`${color.dim}"${story.instruction}"${color.reset}`);
  const run = new OfflineRun(story);

  for (const next of items) {
    const event = next(run);
    const a = event.authorization;
    total++;

    const errors = eventErrors(event);
    if (errors.length === 0) valid++;
    else problems.push(`${story.scenarioId} #${a.replay_order}: ${errors.join("; ")}`);

    // Our own conversion must give the same CHF amount as Viseca's.
    const ourChf = toChf(a.amount, a.currency);
    if (ourChf === a.billing_amount_chf) fxOk++;
    else problems.push(`${story.scenarioId} #${a.replay_order}: we convert to CHF ${ourChf}, Viseca says ${a.billing_amount_chf}`);

    const d = decide(event);
    run.record(event, d.decision);

    const money =
      a.currency === "CHF"
        ? formatMoney(a.billing_amount_chf)
        : `${formatMoney(a.amount, a.currency)} = ${formatMoney(a.billing_amount_chf)}`;
    console.log(
      `  #${String(a.replay_order).padEnd(3)}${cut(a.merchant.merchant_name, 24)}${cut(money, 28)}` +
        `${color[d.decision]}${label[d.decision].padEnd(14)}${color.reset}${d.customer_message}`,
    );
  }
}

console.log(`\n${valid}/${total} purchases match Viseca's format ${valid === total ? "✓" : "✕"}`);
console.log(`${fxOk}/${total} CHF amounts match our own conversion ${fxOk === total ? "✓" : "✕"}`);
for (const p of problems) console.log(`  ✕ ${p}`);
process.exit(problems.length ? 1 : 0);

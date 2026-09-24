// Feed purchases to the engine, story by story, in order, one line per purchase.
// Usage: npm run replay [-- SCEN0002]             the data pack's 45 purchases
//        npm run replay -- --live [SCEN0135]      the 111 recorded live purchases (engine/recordings/)
//        add --approve-reviews                     offline only: a simulated customer approves every review
//        add --why                                 show every check under each purchase
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decide } from "../engine/decide.js";
import { toPast, type PastPurchase } from "../engine/memory.js";
import { formatMoney, toChf } from "../money.js";
import { loadPackStories, loadRecordedStories, OfflineRun, type StoryInfo } from "../offline.js";
import { eventErrors } from "../schema.js";
import type { AuthorizationEvent, MandateRule, Verdict } from "../types.js";

const args = process.argv.slice(2);
const live = args.includes("--live");
const approveReviews = args.includes("--approve-reviews");
const why = args.includes("--why");
const only = args.find((a) => !a.startsWith("--"));

const policies: Record<string, { hard_rules: MandateRule[]; uncertainty_policy: "ask" | "decline"; local?: { watch_session?: boolean } }> = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../policies/test-policies.json", import.meta.url)), "utf8"),
).policies;

// Events are built one at a time: each one's context depends on our earlier decisions.
type Source = { story: StoryInfo; items: ((run: OfflineRun) => AuthorizationEvent)[] };
const sources: Source[] = (
  live
    ? loadRecordedStories().map((s) => ({ story: s, items: s.purchases.map((p) => (run: OfflineRun) => run.eventFromRecorded(p)) }))
    : loadPackStories().map((s) => ({ story: s, items: s.attempts.map((row) => (run: OfflineRun) => run.buildEvent(row)) }))
).filter((s) => !only || s.story.scenarioId === only);

const color = { approve: "\x1b[32m", step_up: "\x1b[33m", decline: "\x1b[31m", dim: "\x1b[2m", reset: "\x1b[0m" };
const label: Record<Verdict, string> = { approve: "Approved", step_up: "Needs review", decline: "Blocked" };
const mark = { pass: "✓", fail: "✕", unknown: "?" } as const;
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s).padEnd(n);

let total = 0;
let valid = 0;
let fxOk = 0;
let slowest = 0;
const tally: Record<Verdict, number> = { approve: 0, step_up: 0, decline: 0 };
const problems: string[] = [];

console.log(`${live ? "Recorded live stories" : "Data pack stories"} · test rule sets from engine/policies/${approveReviews ? " · simulated customer approves every review" : ""}`);
for (const { story, items } of sources) {
  const policy = policies[story.scenarioId];
  console.log(`\n${story.scenarioId} · ${story.name}`);
  console.log(`${color.dim}"${story.instruction}"${color.reset}`);
  if (!policy) {
    console.log(`  (no test rule set for this story)`);
    continue;
  }
  const run = new OfflineRun(story, { hard_rules: policy.hard_rules, uncertainty_policy: policy.uncertainty_policy });
  const past: PastPurchase[] = [];
  const customerApprovedShops = new Set<string>();

  for (const next of items) {
    const event = next(run);
    const a = event.authorization;
    total++;

    const errors = eventErrors(event);
    if (errors.length === 0) valid++;
    else problems.push(`${story.scenarioId} #${a.replay_order}: ${errors.join("; ")}`);
    if (toChf(a.amount, a.currency) === a.billing_amount_chf) fxOk++;
    else problems.push(`${story.scenarioId} #${a.replay_order}: CHF conversion differs from Viseca's`);

    const d = decide({ event, past, customerApprovedShops, watchSession: policy.local?.watch_session });
    slowest = Math.max(slowest, d.ms);
    tally[d.decision]++;

    // What happens next: approvals count; reviews stay pending unless the simulated customer approves.
    let outcome = d.decision === "approve" ? "approved" : d.decision === "decline" ? "declined" : "pending";
    if (d.decision === "step_up" && approveReviews) {
      outcome = "approved";
      customerApprovedShops.add(a.merchant.merchant_id);
    }
    past.push(toPast(event, outcome as PastPurchase["status"]));
    run.record(event, outcome === "approved" ? "approve" : outcome === "declined" ? "decline" : "step_up");

    const money = a.currency === "CHF" ? formatMoney(a.billing_amount_chf) : `${formatMoney(a.amount, a.currency)} = ${formatMoney(a.billing_amount_chf)}`;
    const youApproved = d.decision === "step_up" && approveReviews ? `${color.dim} → you approved${color.reset}` : "";
    console.log(`  #${String(a.replay_order).padEnd(3)}${cut(a.merchant.merchant_name, 22)}${cut(money, 26)}${color[d.decision]}${label[d.decision].padEnd(13)}${color.reset}${d.customer_message}${youApproved}`);
    if (why) for (const c of d.checks.filter((c) => c.kind === "rule" || c.result !== "pass")) console.log(`${color.dim}        ${mark[c.result]} ${c.label}: ${c.detail}${color.reset}`);
  }
}

console.log(`\n${total} purchases: ${tally.approve} approved, ${tally.step_up} need review, ${tally.decline} blocked · slowest decision ${slowest.toFixed(2)} ms`);
console.log(`${valid}/${total} match Viseca's format ${valid === total ? "✓" : "✕"} · ${fxOk}/${total} CHF amounts match our conversion ${fxOk === total ? "✓" : "✕"}`);
for (const p of problems) console.log(`  ✕ ${p}`);
process.exit(problems.length ? 1 : 0);

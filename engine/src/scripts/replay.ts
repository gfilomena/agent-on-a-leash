// Feed purchases to the engine, story by story, in order, one line per purchase.
// Usage: npm run replay [-- SCEN0002]             the data pack's 45 purchases
//        npm run replay -- --live [SCEN0135]      the 111 recorded live purchases (engine/recordings/)
//        add --approve-reviews                     offline only: a simulated customer approves every review
//        add --why                                 show every check under each purchase
//        add --ai [--model gpt-4.1-mini]           with the AI item check (step 14): stories run in parallel,
//                                                  every verdict the AI changed is listed, and none may be looser
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decide, type Decision } from "../engine/decide.js";
import { toPast, type PastPurchase } from "../engine/memory.js";
import { formatMoney, toChf } from "../money.js";
import { loadPackStories, loadRecordedStories, OfflineRun, type StoryInfo } from "../offline.js";
import { eventErrors } from "../schema.js";
import type { AuthorizationEvent, MandateRule, Verdict } from "../types.js";

const args = process.argv.slice(2);
const live = args.includes("--live");
const approveReviews = args.includes("--approve-reviews");
const why = args.includes("--why");
const withAi = args.includes("--ai");
// The AI part needs the keys in .env: loaded only with --ai, so the plain replay works offline.
const ai = withAi ? await import("../engine/itemcheck.js") : null;
const model = args.includes("--model") ? args[args.indexOf("--model") + 1] : ai?.itemCheckModel;
const only = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--model");

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
const aiTimes: number[] = [];
const changed: string[] = [];
let loosened = 0;
let aiFailures = 0;

console.log(`${live ? "Recorded live stories" : "Data pack stories"} · test rule sets from engine/policies/${approveReviews ? " · simulated customer approves every review" : ""}${withAi ? ` · AI item check with ${model}` : ""}`);
// Stories are independent: with the AI they run in parallel, each printing its own block in order.
const blocks = await Promise.all(sources.map(async ({ story, items }) => {
  const lines: string[] = [];
  const say = (line: string) => lines.push(line);
  const policy = policies[story.scenarioId];
  say(`\n${story.scenarioId} · ${story.name}`);
  say(`${color.dim}"${story.instruction}"${color.reset}`);
  if (!policy) {
    say(`  (no test rule set for this story)`);
    return lines;
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

    const input = { event, past, customerApprovedShops, watchSession: policy.local?.watch_session };
    const code = decide(input);
    let d: Decision = code;
    if (withAi) {
      d = await ai!.decideWithAi(input, { budgetMs: 6000, model });
      if (d.aiMs !== undefined) aiTimes.push(d.aiMs);
      if (d.checks.some((c) => c.reason === "ai_check_unavailable")) aiFailures++;
      if (d.decision !== code.decision) {
        if (d.decision === "approve") loosened++;
        changed.push(`${story.scenarioId} #${a.replay_order} ${a.merchant.merchant_name}: ${label[code.decision]} → ${label[d.decision]} · ${d.customer_message}`);
      }
    }
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
    say(`  #${String(a.replay_order).padEnd(3)}${cut(a.merchant.merchant_name, 22)}${cut(money, 26)}${color[d.decision]}${label[d.decision].padEnd(13)}${color.reset}${d.customer_message}${youApproved}`);
    if (why) for (const c of d.checks.filter((c) => c.kind === "rule" || c.kind === "ai" || c.result !== "pass")) say(`${color.dim}        ${mark[c.result]} ${c.kind === "ai" ? "AI · " : ""}${c.label}: ${c.detail}${color.reset}`);
  }
  return lines;
}));
for (const block of blocks) console.log(block.join("\n"));

console.log(`\n${total} purchases: ${tally.approve} approved, ${tally.step_up} need review, ${tally.decline} blocked · slowest decision ${slowest.toFixed(2)} ms`);
console.log(`${valid}/${total} match Viseca's format ${valid === total ? "✓" : "✕"} · ${fxOk}/${total} CHF amounts match our conversion ${fxOk === total ? "✓" : "✕"}`);
for (const p of problems) console.log(`  ✕ ${p}`);
if (withAi) {
  const sorted = [...aiTimes].sort((x, y) => x - y);
  const at = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
  console.log(`\nAI item check (${model}): ${aiTimes.length} checks · median ${(at(0.5) / 1000).toFixed(2)} s · 95% under ${(at(0.95) / 1000).toFixed(2)} s · slowest ${((sorted.at(-1) ?? 0) / 1000).toFixed(2)} s · not available ${aiFailures}×`);
  console.log(`Verdicts the AI changed: ${changed.length} · made looser: ${loosened}${loosened ? " ✕" : " ✓"}`);
  for (const c of changed) console.log(`  ${c}`);
}
process.exit(problems.length || loosened ? 1 : 0);

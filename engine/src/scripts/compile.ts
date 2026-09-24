// Step 9 check: the AI turns each story sentence into rules (it never sees purchases); then every
// purchase is decided twice, with the AI's rules and with the hand-written test rule sets.
// Usage: npm run compile [-- SCEN0124] [--model gpt-4.1-mini] [--quiet]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileRequest, compilerModel, type PolicyDraft } from "../compiler.js";
import { decide } from "../engine/decide.js";
import { toPast, type PastPurchase } from "../engine/memory.js";
import { loadPackStories, loadRecordedStories, OfflineRun, type StoryInfo } from "../offline.js";
import type { AuthorizationEvent, MandateRule } from "../types.js";

const args = process.argv.slice(2);
const model = args.includes("--model") ? args[args.indexOf("--model") + 1] : undefined;
const quiet = args.includes("--quiet");
const only = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--model");

const tests: Record<string, { hard_rules: MandateRule[]; uncertainty_policy: "ask" | "decline"; local?: { watch_session?: boolean } }> = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../policies/test-policies.json", import.meta.url)), "utf8"),
).policies;

type Story = { story: StoryInfo; items: ((run: OfflineRun) => AuthorizationEvent)[] };
const stories: Story[] = [
  ...loadPackStories().map((s) => ({ story: s as StoryInfo, items: s.attempts.map((row) => (run: OfflineRun) => run.buildEvent(row)) })),
  ...loadRecordedStories().map((s) => ({ story: s as StoryInfo, items: s.purchases.map((p) => (run: OfflineRun) => run.eventFromRecorded(p)) })),
].filter((s) => !only || s.story.scenarioId === only);

function verdicts(story: Story, rules: MandateRule[], unsure: "ask" | "decline", watchSession: boolean): string[] {
  const run = new OfflineRun(story.story, { hard_rules: rules, uncertainty_policy: unsure });
  const past: PastPurchase[] = [];
  return story.items.map((next) => {
    const event = next(run);
    const d = decide({ event, past, watchSession });
    past.push(toPast(event, d.decision === "approve" ? "approved" : d.decision === "decline" ? "declined" : "pending"));
    run.record(event, d.decision);
    return d.decision;
  });
}

const dim = "\x1b[2m", reset = "\x1b[0m", red = "\x1b[31m", green = "\x1b[32m";
let same = 0, total = 0, slowest = 0;
console.log(`Model: ${model ?? compilerModel}\n`);

for (const s of stories) {
  let draft: PolicyDraft;
  try {
    draft = await compileRequest(s.story.instruction, { model });
  } catch (err) {
    console.log(`${s.story.scenarioId}: ${red}AI unavailable: ${(err as Error).message}${reset}`);
    continue;
  }
  slowest = Math.max(slowest, draft.ms);
  const test = tests[s.story.scenarioId];
  const mine = verdicts(s, draft.hard_rules, draft.uncertainty_policy, draft.watchSession);
  const theirs = test ? verdicts(s, test.hard_rules, test.uncertainty_policy, test.local?.watch_session ?? false) : [];
  const agree = mine.filter((v, i) => v === theirs[i]).length;
  same += agree;
  total += mine.length;

  console.log(`${s.story.scenarioId} · "${draft.title}" · ${(draft.ms / 1000).toFixed(1)} s · same verdict as the test rules on ${agree}/${mine.length} purchases`);
  if (!quiet) {
    console.log(`${dim}  "${s.story.instruction}"${reset}`);
    draft.explanations.forEach((e, i) => console.log(`  • ${e.text}   ${dim}${JSON.stringify(draft.hard_rules[i])}${reset}`));
    for (const g of draft.guidance) console.log(`  ~ ${g}`);
    console.log(`  When unsure: ${draft.uncertainty_policy === "ask" ? "ask me" : "decline"}${draft.watchSession ? " · watching the session" : ""}`);
    for (const q of draft.questions) console.log(`  ? ${q.text}  [${q.options.join(" | ")}]`);
    for (const n of draft.notUnderstood) console.log(`  ${red}! I may not have understood: ${n}${reset}`);
    mine.forEach((v, i) => v !== theirs[i] && console.log(`  ${red}≠ purchase #${i + 1}: AI rules → ${v}, test rules → ${theirs[i]}${reset}`));
    console.log();
  }
}
console.log(`\n${green}Same verdict on ${same}/${total} purchases${reset} · slowest compile ${(slowest / 1000).toFixed(1)} s`);

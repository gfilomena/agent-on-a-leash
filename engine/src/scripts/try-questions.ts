// Step 9b check: follow-up questions for free sentences, and what each answer (tapped or typed) adds.
// Nothing is sent to Viseca. Usage: npm run questions [-- "your sentence" ...]
import { compileRequest, describeRule, readTypedAnswer, type FollowUpOption } from "../compiler.js";

const sentences = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "I want a pack of 6 white socks size 42 from Adidas",
      "Buy me running shoes, max CHF 150",
      "Book a hotel for 2 nights, at most CHF 300",
      "Buy a new computer monitor under CHF 400",
      "Order a winter jacket",
    ];
const show = (o: FollowUpOption) => (o.rule ? `rule: ${describeRule(o.rule)}` : o.note ? `note: ${o.note}` : "nothing (no preference)");

for (const s of sentences) {
  const d = await compileRequest(s);
  console.log(`\n"${s}"  · ${(d.ms / 1000).toFixed(1)} s`);
  d.explanations.forEach((e) => console.log(`  • ${e.text}`));
  d.guidance.forEach((g) => console.log(`  ~ ${g}`));
  for (const q of d.questions) {
    console.log(`  ? ${q.text}${q.required ? " (required)" : " (can skip)"}`);
    for (const o of q.options) console.log(`      ${o.label} → ${show(o)}`);
  }
}

// Typed "Other" answers, against the questions of the last sentences.
const typed: [string, string][] = [
  ["Order a winter jacket", "1'000"],
  ["Order a winter jacket", "EU size L"],
  ["Buy me running shoes, max CHF 150", "44.5"],
  ["Book a hotel for 2 nights, at most CHF 300", "Zurich"],
  ["Book a hotel for 2 nights, at most CHF 300", "3 to 5 October"],
];
console.log("\nTyped answers:");
for (const [s, answer] of typed) {
  const d = await compileRequest(s);
  for (const q of d.questions) {
    const started = performance.now();
    const o = await readTypedAnswer(s, q, answer);
    console.log(`  "${q.text}" + "${answer}" → ${show(o)}  (${Math.round(performance.now() - started)} ms)`);
  }
}

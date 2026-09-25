// Short titles for Viseca's test requests in the chat, written by the AI from each sentence.
// Viseca's own story names say what each test checks ("Connection check"), so the customer never sees them
// (only "Behind the scenes" does). Saved per sentence, never per story id; without the AI the chat shows the sentence alone.
import { askJson } from "./ai.js";
import { compilerModel } from "./compiler.js";
import { save, state } from "./state.js";

/** Raise when the instructions below change: the saved titles are then written again. */
const VERSION = 3;

const SYSTEM = `You write titles for shopping requests shown as suggestions in a banking app. The full request is shown under the title.
For each numbered request, write a title of 2 to 4 words naming what the customer wants bought, the way a person would say it (e.g. "Running shoes", "Flowers for Mum", "Wine from Italy"). Never a list of keywords, never the word "only".
Leave out prices, limits and shop conditions: the request below the title shows them.
Every title must be different. Add no detail to a request that is already different from the others. When two requests are about the same kind of thing, add ONE detail to each, the one that best tells them apart, joined with a small word: "in size 43", "from Germany". Never two details.
Sentence case, plain words, no full stop. Use only what the request says.
Never mention testing, checks, security, fraud, sessions or manipulation.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titles"],
  properties: {
    titles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["request", "title"],
        properties: { request: { type: "integer", description: "The request's number" }, title: { type: "string" } },
      },
    },
  },
};

/** A title the customer may see, or null: short, plain, and never about the test behind it. */
function clean(raw: string): string | null {
  const title = raw.trim().replace(/[.!]+$/, "");
  const words = title.split(/\s+/).length;
  if (!title || words > 6 || title.length > 40) return null;
  if (/\b(test|check|scenario|manipulat\w*|fraud|session)\b/i.test(title)) return null;
  return title;
}

export const storyTitle = (instruction: string) => (state.storyTitles?.version === VERSION ? state.storyTitles.titles[instruction] : null) ?? null;

/** Writes the missing titles in one AI call (so they can be told apart) and saves them. Never throws. */
export async function titleStories(stories: { instruction: string }[]) {
  if (state.storyTitles?.version !== VERSION) state.storyTitles = { version: VERSION, titles: {} };
  const titles = state.storyTitles.titles;
  const missing = [...new Set(stories.map((s) => s.instruction))].filter((i) => !titles[i]);
  if (missing.length === 0) return;
  const res = await askJson<{ titles: { request: number; title: string }[] }>({
    system: SYSTEM,
    user: missing.map((instruction, n) => `${n + 1}. ${instruction}`).join("\n"),
    schemaName: "request_titles",
    schema: SCHEMA,
    timeoutMs: 20_000,
    model: compilerModel,
  });
  if (!res.data) {
    console.log(`Chat titles: AI not available (${res.error}); the chat shows the sentences only.`);
    return;
  }
  for (const t of res.data.titles) {
    const instruction = missing[t.request - 1];
    const title = clean(t.title);
    if (instruction && title) titles[instruction] = title;
  }
  save();
  console.log(`Chat titles: ${Object.keys(titles).length} ready (${res.ms} ms).`);
}

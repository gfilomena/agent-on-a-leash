// One place for AI calls: strict JSON answers, a hard time limit, and null on any failure
// (callers then fall back to their safe outcome). The keys never leave the engine.
// Two providers with the same (OpenAI-compatible) API: OpenAI, and Apertus, the Swiss open model (via Swisscom).
// With Apertus selected, a refused, failed, malformed or late Apertus answer is asked again from OpenAI
// in the time left, and marked as a fallback ("Behind the scenes" shows it). Reading a request stays on OpenAI.
import OpenAI from "openai";
import { config } from "./config.js";

export type AiProvider = "openai" | "apertus";

export const aiModel = config.openaiModel ?? "gpt-4.1-mini";
export const apertusModel = config.apertusModel;
const openai = config.openaiKey ? new OpenAI({ apiKey: config.openaiKey, maxRetries: 0 }) : null;
const apertus = config.apertusKey && config.apertusBaseUrl ? new OpenAI({ apiKey: config.apertusKey, baseURL: config.apertusBaseUrl, maxRetries: 0 }) : null;

// The engine sets the saved choice at start; tools can pick one with AI_PROVIDER=apertus (and AI_FALLBACK=off to measure Apertus alone).
let provider: AiProvider = process.env.AI_PROVIDER === "apertus" && apertus ? "apertus" : "openai";
const fallbackOn = process.env.AI_FALLBACK !== "off";

export const aiAvailable = () => openai !== null || apertus !== null;
export const apertusAvailable = () => apertus !== null;
export const aiProvider = () => provider;
export function setAiProvider(p: AiProvider) {
  if (p === "apertus" && !apertus) throw new Error("Apertus isn't set up on this engine (no key in .env).");
  provider = p;
}

export interface AiResult<T> {
  data: T | null;
  ms: number;
  error?: string;
}

/** The last AI calls, for "Behind the scenes": which AI answered, how fast, and why a fallback happened. */
export interface AiCall {
  at: string;
  task: string;
  provider: AiProvider;
  model: string;
  ms: number;
  ok: boolean;
  /** With Apertus selected: why OpenAI answered this one, in plain words ("Apertus busy (rate limit)"); null = no note. */
  note: string | null;
}
export const aiCalls: AiCall[] = [];
/** Every AI call since the engine started, by who answered ("Apertus", "OpenAI · Apertus busy (rate limit)"…). */
export const aiTally: Record<string, number> = {};

const TASKS: Record<string, string> = {
  item_check: "AI item check",
  wallet_policy: "Reading a request",
  typed_answer: "Reading a typed answer",
  request_titles: "Chat titles",
  agent_proposal: "Test agent's proposal",
};

/** Too slow on Apertus (reading a request: 13.7 s to 55 s+ and a gateway timeout, OpenAI 3–4 s; measured 2026-09-25): OpenAI even with Apertus selected. */
const OPENAI_ONLY: Record<string, string> = { wallet_policy: "Stays on OpenAI (too slow on Apertus)" };
/** Apertus gets at most this long, then OpenAI answers in the time left (Jules: a pitch lasts a minute, no long waits). */
const APERTUS_MAX_MS = 5000;
/** Apertus limits output tokens per minute (12,500) and books each call's maximum answer length up front:
 *  without a cap that is ~4,000 tokens, so only 3 calls a minute pass. Our Apertus answers need a few hundred. */
const APERTUS_MAX_OUTPUT = 1000;

type AskOpts = { system: string; user: string; schemaName: string; schema: object; timeoutMs: number; model?: string; temperature?: number };
type Attempt<T> = AiResult<T> & { status?: number };

/** Asks for JSON matching `schema`: OpenAI, or Apertus with OpenAI as fallback. Never throws. */
export async function askJson<T>(opts: AskOpts): Promise<AiResult<T>> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const openaiModel = opts.model ?? aiModel;

  if (provider === "apertus" && apertus && !OPENAI_ONLY[opts.schemaName]) {
    // Apertus gets at most 5 s and 60% of the time limit; OpenAI gets the rest if Apertus doesn't answer.
    const limit = fallbackOn && openai ? Math.min(APERTUS_MAX_MS, Math.round(opts.timeoutMs * 0.6)) : opts.timeoutMs;
    const first = await once<T>(apertus, apertusModel, opts, limit);
    if (first.data || !fallbackOn || !openai) return logged(opts, "apertus", apertusModel, { ...first, ms: elapsed() }, null);
    const why = whyNotApertus(first);
    const left = opts.timeoutMs - elapsed();
    if (left < 500) return logged<T>(opts, "apertus", apertusModel, { data: null, ms: elapsed(), error: "no time left for OpenAI" }, why);
    const second = await once<T>(openai, openaiModel, opts, left);
    return logged(opts, "openai", openaiModel, { ...second, ms: elapsed() }, `${why}, OpenAI answered`);
  }

  if (!openai) return { data: null, ms: 0, error: "no OpenAI key" };
  const note = provider === "apertus" ? (OPENAI_ONLY[opts.schemaName] ?? null) : null;
  return logged(opts, "openai", openaiModel, { ...(await once<T>(openai, openaiModel, opts, opts.timeoutMs)), ms: elapsed() }, note);
}

/** One call to one provider. The answer must have the exact shape asked for, or it counts as no answer. */
async function once<T>(client: OpenAI, model: string, opts: AskOpts, timeoutMs: number): Promise<Attempt<T>> {
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  // GPT-5 models reason before answering and take no temperature: ask for the least reasoning (fastest).
  const reasoning = /^(gpt-5|o\d)/.test(model);
  try {
    const res = await client.chat.completions.create(
      {
        model,
        ...(reasoning ? { reasoning_effort: (/^gpt-5(-|$)/.test(model) ? "minimal" : "none") as "minimal" } : { temperature: opts.temperature ?? 0 }),
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        ...(client === apertus ? { max_tokens: APERTUS_MAX_OUTPUT } : {}),
        response_format: { type: "json_schema", json_schema: { name: opts.schemaName, schema: opts.schema as Record<string, unknown>, strict: true } },
      },
      { timeout: Math.max(1, timeoutMs) },
    );
    const choice = res.choices[0];
    if (!choice?.message?.content || choice.finish_reason !== "stop") return { data: null, ms: ms(), error: `no usable answer (${choice?.finish_reason})` };
    const data = JSON.parse(choice.message.content);
    if (!fits(opts.schema, data)) return { data: null, ms: ms(), error: "answer not in the requested shape" };
    return { data: data as T, ms: ms() };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    return { data: null, ms: ms(), status, error: err instanceof Error ? err.message.slice(0, 200) : "unknown error" };
  }
}

function whyNotApertus(a: Attempt<unknown>): string {
  if (a.status === 429) return "Apertus busy (rate limit)";
  if (a.status === 401 || a.status === 403) return "Apertus key refused";
  if (/timed? ?out/i.test(a.error ?? "")) return "Apertus too slow";
  if (a.error === "answer not in the requested shape") return "Apertus answer not usable";
  return "Apertus unavailable";
}

function logged<T>(opts: AskOpts, p: AiProvider, model: string, r: AiResult<T>, note: string | null): AiResult<T> {
  aiCalls.push({ at: new Date().toISOString(), task: TASKS[opts.schemaName] ?? "AI", provider: p, model, ms: r.ms, ok: !!r.data, note });
  if (aiCalls.length > 30) aiCalls.shift();
  const key = `${p === "apertus" ? "Apertus" : "OpenAI"}${r.data ? "" : " (no answer)"}${note ? ` · ${note.replace(/, OpenAI answered$/, "")}` : ""}`;
  aiTally[key] = (aiTally[key] ?? 0) + 1;
  if (note && provider === "apertus" && p === "openai" && !OPENAI_ONLY[opts.schemaName]) console.log(`AI: ${note} (${TASKS[opts.schemaName] ?? opts.schemaName}, ${r.ms} ms).`);
  return note && !r.data ? { ...r, error: `${note}; ${r.error}` } : r;
}

/** Does `value` match our JSON schemas (object, array, enum, type or [type, "null"])? Checks what strict mode guarantees. */
function fits(schema: any, value: unknown): boolean {
  if (!schema || typeof schema !== "object") return true;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  const types: string[] = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length && !types.some((t) => isType(t, value))) return false;
  if (value && typeof value === "object" && !Array.isArray(value) && schema.properties) {
    const obj = value as Record<string, unknown>;
    if ((schema.required ?? []).some((k: string) => !(k in obj))) return false;
    return Object.entries(schema.properties).every(([k, s]) => !(k in obj) || fits(s, obj[k]));
  }
  if (Array.isArray(value) && schema.items) return value.every((v) => fits(schema.items, v));
  return true;
}

function isType(t: string, v: unknown): boolean {
  switch (t) {
    case "null": return v === null;
    case "object": return !!v && typeof v === "object" && !Array.isArray(v);
    case "array": return Array.isArray(v);
    case "string": return typeof v === "string";
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "integer": return Number.isInteger(v);
    case "boolean": return typeof v === "boolean";
    default: return true;
  }
}

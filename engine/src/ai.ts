// One place for OpenAI calls: strict JSON answers, a hard time limit, and null on any failure
// (callers then fall back to their safe outcome). The key never leaves the engine.
import OpenAI from "openai";
import { config } from "./config.js";

export const aiModel = config.openaiModel ?? "gpt-4.1-mini";
const client = config.openaiKey ? new OpenAI({ apiKey: config.openaiKey, maxRetries: 0 }) : null;

export const aiAvailable = () => client !== null;

export interface AiResult<T> {
  data: T | null;
  ms: number;
  error?: string;
}

/** Asks for JSON matching `schema` (OpenAI structured outputs, strict). Never throws. */
export async function askJson<T>(opts: { system: string; user: string; schemaName: string; schema: object; timeoutMs: number; model?: string; temperature?: number }): Promise<AiResult<T>> {
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  if (!client) return { data: null, ms: 0, error: "no OpenAI key" };
  try {
    const res = await client.chat.completions.create(
      {
        model: opts.model ?? aiModel,
        temperature: opts.temperature ?? 0,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: { type: "json_schema", json_schema: { name: opts.schemaName, schema: opts.schema as Record<string, unknown>, strict: true } },
      },
      { timeout: opts.timeoutMs },
    );
    const choice = res.choices[0];
    if (!choice?.message?.content || choice.finish_reason !== "stop") return { data: null, ms: ms(), error: `no usable answer (${choice?.finish_reason})` };
    return { data: JSON.parse(choice.message.content) as T, ms: ms() };
  } catch (err) {
    return { data: null, ms: ms(), error: err instanceof Error ? err.message.slice(0, 200) : "unknown error" };
  }
}

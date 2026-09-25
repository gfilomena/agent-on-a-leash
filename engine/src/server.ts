// Compass engine: the small REST API for the app, and the Viseca worker.
// Listens on this laptop only; changes are accepted only from our own app (piece 7).
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { compilerModel, isAmountQuestion } from "./compiler.js";
import { live, answerPurchase, liveSpent, loadBootstrap, startWorker } from "./live.js";
import { aiCalls, aiModel, aiProvider, apertusAvailable, apertusModel, setAiProvider, type AiProvider } from "./ai.js";
import { apiLog } from "./apilog.js";
import { applyChange, countryLabel, REGION_COUNTRIES, usage } from "./engine/settings.js";
import { money } from "./money.js";
import { answerQuestion, confirmPolicy, createDraft, PolicyError, revokePolicy, type Answer } from "./policies.js";
import { shops } from "./engine/reference.js";
import { save, securitySettings, state, type Policy, type PurchaseRecord } from "./state.js";
import { storyTitle, titleStories } from "./storytitles.js";
import { propose, tryCatalogue, tryPurchase } from "./tryout.js";
import type { Check } from "./engine/rules.js";

// Safety net for the demo: a stray async error is logged, never allowed to stop the engine (and its Viseca worker).
// Other crashes still stop it: e.g. a second engine that can't get the port must exit, or two workers would share the queue.
process.on("unhandledRejection", (err) => console.error("Engine: unhandled async error (kept running):", err));

const PORT = Number(process.env.PORT ?? process.env.ENGINE_PORT ?? 8787);
const HOST = process.env.ENGINE_HOST ?? "127.0.0.1";
const ALLOWED_ORIGINS = (process.env.APP_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173").split(",").map((s) => s.trim());

const app = new Hono();

// Another website must never be able to approve a purchase in the customer's name.
app.use("/api/*", async (c, next) => {
  const origin = c.req.header("origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return c.json({ error: "Not allowed from this site." }, 403);
  await next();
});

// ---------- views: what the app shows (plain words, no codes or ids to display) ----------
const storyName = (scenarioId?: string) => live.stories.find((s) => s.id === scenarioId)?.name;

/** Facts shown to the customer: every rule and bank check; warning signs only when they found something (and shop text always). */
const checksView = (checks: Check[]) =>
  checks.filter((c) => c.kind !== "warning" || c.result !== "pass" || c.label === "Shop text").map((c) => ({ label: c.label, result: c.result, detail: c.detail, kind: c.kind }));

function purchaseView(p: PurchaseRecord) {
  const policy = state.policies.find((x) => x.id === p.policyId);
  const what = p.items.length > 1 ? `${p.items[0].name} and ${p.items.length - 1} more` : (p.items[0]?.name ?? "the order");
  const charged = p.currency === "CHF" ? money(p.amountChf) : `${money(p.amount, p.currency)} (${money(p.amountChf)})`;
  const sentence =
    p.status === "expired" ? (p.finalNote ?? "Expired: you didn't answer in time, so it wasn't bought.")
    : p.answeredBy === "you" ? `${p.status === "approved" ? "Approved" : "Declined"} by you: ${what} from ${p.shop.name} for ${charged}.`
    : p.message;
  return {
    id: p.id,
    display: p.status === "pending" ? "step_up" : p.status === "approved" ? "approve" : p.status === "expired" ? "expired" : "decline",
    status: p.status,
    answeredBy: p.answeredBy,
    sentence,
    reviewReason: p.verdict === "step_up" ? p.message : null,
    shop: p.shop.name,
    items: p.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name)),
    amountChf: p.amountChf,
    original: p.currency === "CHF" ? null : { amount: p.amount, currency: p.currency },
    at: p.receivedAt,
    decidedInMs: p.engineMs,
    answerMs: p.answerMs,
    waitingUntil: p.status === "pending" ? Date.parse(p.answeredAt) + live.humanWindowMs : null,
    checks: checksView(p.checks),
    ignoredText: p.ignoredText,
    story: storyName(p.scenarioId) ?? null,
    policyTitle: policy?.title ?? null,
  };
}

function policyView(p: Policy) {
  const run = p.runId ? state.purchases.filter((x) => x.runId === p.runId) : [];
  const story = live.stories.find((s) => s.id === p.scenarioId);
  return {
    id: p.id,
    title: p.title,
    instruction: p.instruction,
    rules: p.explanations.map((e) => e.text),
    guidance: p.guidance,
    notUnderstood: p.notUnderstood,
    questions: (p.questions ?? []).map((q) => ({ text: q.text, required: q.required, amount: isAmountQuestion(q), options: q.options.map((o) => o.label) })),
    whenUnsure: p.uncertainty_policy,
    watchSession: p.watchSession,
    status: p.status,
    createdAt: p.createdAt,
    confirmedAt: p.confirmedAt ?? null,
    revokedAt: p.revokedAt ?? null,
    story: story ? { name: story.name, title: storyTitle(story.instruction), total: story.purchases, received: run.length, finished: run.length >= story.purchases || !!p.runFinished } : null,
  };
}

app.get("/api/health", (c) => c.json({ ok: true, service: "compass-engine" }));

/** Security settings for Controls: the values, spending in the period of the agent's latest purchase, the region lists. */
function settingsView() {
  const s = securitySettings();
  const latest = state.purchases.reduce<string | null>((m, p) => (!m || p.simTime > m ? p.simTime : m), null);
  return {
    spendingLimit: s.spendingLimit,
    region: s.region,
    usage: s.spendingLimit.on ? usage(s, liveSpent(), latest) : null,
    countries: {
      switzerland: REGION_COUNTRIES.switzerland.map(countryLabel).sort(),
      europe: REGION_COUNTRIES.europe.map(countryLabel).sort(),
    },
  };
}

app.get("/api/snapshot", (c) => {
  const approvedShopNames = [...new Set(Object.values(state.approvedShops).flat())].map((id) => shops.get(id)?.merchant_name ?? id).sort();
  return c.json({
    version: state.version,
    engine: { worker: live.running, lastError: live.lastError, compilerModel, humanWindowSeconds: live.humanWindowMs / 1000 },
    stories: live.stories.map((s) => ({ id: s.id, name: s.name, title: storyTitle(s.instruction), instruction: s.instruction, purchases: s.purchases })),
    policies: state.policies.filter((p) => p.status !== "draft").map(policyView).reverse(),
    purchases: [...state.purchases].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)).map(purchaseView),
    approvedShops: approvedShopNames,
    settings: settingsView(),
    viseca: { calls: [...apiLog.calls].reverse().slice(0, 30), listening: apiLog.listening, lastContactAt: apiLog.lastContactAt },
    ai: aiView(),
  });
});

/** Which AI answers (Behind the scenes): OpenAI, or Apertus with OpenAI as fallback. */
function aiView() {
  return {
    provider: aiProvider(),
    apertusAvailable: apertusAvailable(),
    models: { openai: `${compilerModel} / ${aiModel}`, apertus: apertusModel },
    calls: [...aiCalls].reverse().slice(0, 20),
  };
}

app.post("/api/ai", async (c) => {
  const { provider } = await c.req.json().catch(() => ({}));
  if (provider !== "openai" && provider !== "apertus") return c.json({ error: "Pick OpenAI or Apertus." }, 400);
  try {
    setAiProvider(provider as AiProvider);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Couldn't switch the AI." }, 400);
  }
  state.aiProvider = provider;
  save();
  return c.json(aiView());
});

// Security settings: applied from the next decision, for every policy. The app asks the customer before loosening.
app.post("/api/settings", async (c) => {
  const change = await c.req.json().catch(() => ({}));
  try {
    state.settings = applyChange(securitySettings(), change ?? {});
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Please check the settings." }, 400);
  }
  save();
  return c.json(settingsView());
});

// Demo tool ("Behind the scenes"): Viseca's stories replay the same dates, so earlier runs' spending would count again.
app.post("/api/settings/reset-spending", (c) => {
  state.settings = { ...securitySettings(), spendingSince: new Date().toISOString() };
  save();
  return c.json(settingsView());
});

// ---------- actions ----------
const fail = (err: unknown) => ({ error: err instanceof PolicyError ? err.message : "Something went wrong. Please try again." });

app.post("/api/policies", async (c) => {
  const { instruction } = await c.req.json().catch(() => ({ instruction: "" }));
  try {
    return c.json(policyView(await createDraft(String(instruction ?? ""))));
  } catch (err) {
    return c.json(fail(err), 400);
  }
});

app.post("/api/policies/:id/answer", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const answer: Answer = body.skip === true ? { skip: true } : typeof body.typed === "string" ? { typed: body.typed } : { option: String(body.option ?? "") };
  try {
    return c.json(policyView(await answerQuestion(c.req.param("id"), String(body.question ?? ""), answer)));
  } catch (err) {
    return c.json(fail(err), 400);
  }
});

app.post("/api/policies/:id/confirm", async (c) => {
  const { whenUnsure } = await c.req.json().catch(() => ({}));
  try {
    return c.json(policyView(await confirmPolicy(c.req.param("id"), whenUnsure === "decline" ? "decline" : "ask")));
  } catch (err) {
    return c.json(fail(err), 400);
  }
});

app.post("/api/policies/:id/revoke", async (c) => {
  try {
    return c.json(policyView(await revokePolicy(c.req.param("id"))));
  } catch (err) {
    return c.json(fail(err), 400);
  }
});

app.post("/api/purchases/:id/answer", async (c) => {
  const { approve } = await c.req.json().catch(() => ({}));
  const r = await answerPurchase(c.req.param("id"), approve === true);
  return c.json(r, r.ok ? 200 : 409);
});

// ---------- "Try a purchase" (step 14b): simulated agent, real engine, nothing sent to Viseca ----------
app.get("/api/tryout/catalogue", (c) => c.json(tryCatalogue()));

app.post("/api/tryout/propose", async (c) => {
  const { policyId, avoid } = await c.req.json().catch(() => ({}));
  try {
    return c.json(await propose(String(policyId ?? ""), Array.isArray(avoid) ? avoid.map(String).slice(-10) : []));
  } catch (err) {
    return c.json(fail(err), 400);
  }
});

app.post("/api/tryout/buy", async (c) => {
  const { policyId, proposal, whenUnsure } = await c.req.json().catch(() => ({}));
  try {
    const { decision: d, event, policy } = await tryPurchase(String(policyId ?? ""), proposal ?? {}, whenUnsure === "decline" ? "decline" : whenUnsure === "ask" ? "ask" : undefined);
    const a = event.authorization;
    return c.json({
      id: a.authorization_id,
      display: d.decision,
      status: d.decision === "approve" ? "approved" : d.decision === "decline" ? "declined" : "pending",
      answeredBy: "compass",
      sentence: d.customer_message,
      reviewReason: d.decision === "step_up" ? d.customer_message : null,
      shop: a.merchant.merchant_name,
      items: a.items.map((l) => l.item_name),
      amountChf: a.billing_amount_chf,
      original: a.currency === "CHF" ? null : { amount: a.amount, currency: a.currency },
      at: a.timestamp,
      decidedInMs: d.ms,
      answerMs: 0,
      waitingUntil: null,
      checks: checksView(d.checks),
      ignoredText: d.ignoredText,
      story: null,
      policyTitle: policy.title,
    });
  } catch (err) {
    return c.json(fail(err), 400);
  }
});

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  console.log(`Compass engine on http://${HOST}:${PORT} (accepts changes only from ${ALLOWED_ORIGINS.join(", ")})`);
});

// The saved AI choice (Apertus only if this engine has its key; otherwise OpenAI).
if (state.aiProvider === "apertus" && apertusAvailable()) setAiProvider("apertus");

await loadBootstrap();
void startWorker();
void titleStories(live.stories);

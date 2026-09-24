// Compass engine: the small REST API for the app, and the Viseca worker.
// Listens on this laptop only; changes are accepted only from our own app (piece 7).
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { compilerModel } from "./compiler.js";
import { live, answerPurchase, loadBootstrap, startWorker } from "./live.js";
import { money } from "./money.js";
import { answerQuestion, confirmPolicy, createDraft, PolicyError, revokePolicy } from "./policies.js";
import { shops } from "./engine/reference.js";
import { state, type Policy, type PurchaseRecord } from "./state.js";

const PORT = Number(process.env.ENGINE_PORT ?? 8787);
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
    checks: p.checks.filter((c) => c.kind !== "warning" || c.result !== "pass" || c.label === "Shop text").map((c) => ({ label: c.label, result: c.result, detail: c.detail, kind: c.kind })),
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
    questions: p.questions ?? [],
    whenUnsure: p.uncertainty_policy,
    watchSession: p.watchSession,
    status: p.status,
    createdAt: p.createdAt,
    confirmedAt: p.confirmedAt ?? null,
    revokedAt: p.revokedAt ?? null,
    story: story ? { name: story.name, total: story.purchases, received: run.length } : null,
  };
}

app.get("/api/health", (c) => c.json({ ok: true, service: "compass-engine" }));

app.get("/api/snapshot", (c) => {
  const approvedShopNames = [...new Set(Object.values(state.approvedShops).flat())].map((id) => shops.get(id)?.merchant_name ?? id).sort();
  return c.json({
    version: state.version,
    engine: { worker: live.running, lastError: live.lastError, compilerModel, humanWindowSeconds: live.humanWindowMs / 1000 },
    stories: live.stories.map((s) => ({ id: s.id, name: s.name, instruction: s.instruction, purchases: s.purchases })),
    policies: state.policies.filter((p) => p.status !== "draft").map(policyView).reverse(),
    purchases: [...state.purchases].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)).map(purchaseView),
    approvedShops: approvedShopNames,
  });
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
  const { question, answer } = await c.req.json().catch(() => ({}));
  try {
    return c.json(policyView(answerQuestion(c.req.param("id"), String(question ?? ""), String(answer ?? ""))));
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

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  console.log(`Compass engine on http://${HOST}:${PORT} (accepts changes only from ${ALLOWED_ORIGINS.join(", ")})`);
});

await loadBootstrap();
void startWorker();

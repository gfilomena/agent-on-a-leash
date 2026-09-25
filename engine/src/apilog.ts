// The "Viseca API" log in "Behind the scenes": every call this engine makes to Viseca, live, in plain words next to
// the real endpoint and status, so anyone watching sees the traffic (and Viseca can match it to its own logs).
// Memory only, last 50 calls. Quiet calls (queue checks that found nothing, a waiting purchase handed out again,
// background status syncs) are not listed; they only keep "last contact" fresh. Never holds the key or a request body.
import { money } from "./money.js";

export interface ApiCall {
  at: string;
  method: string;
  path: string;
  status: number;
  /** null for the queue's long poll: its time is waiting, not Viseca's speed. */
  ms: number | null;
  ok: boolean;
  label: string;
}

export const apiLog = {
  calls: [] as ApiCall[],
  /** A queue check is open right now: Viseca hands over the next purchase the moment it exists. */
  listening: false,
  lastContactAt: null as string | null,
};

const shopOf = new Map<string, string>(); // purchase id → shop name, for "Answer sent: LensTrail…"
const VERDICT: Record<string, string> = { approve: "Approved", decline: "Blocked", step_up: "Needs review" };
const QUEUE = "/v1/decision-requests/next";

export const isQueuePoll = (path: string) => path.startsWith(QUEUE);

/** What the customer-side story is, in plain words; null = a quiet call (not listed). */
function label(method: string, path: string, status: number, body: any, data: any): string | null {
  const route = path.split("?")[0];
  const id = route.split("/")[3] ?? "";
  if (isQueuePoll(path)) {
    if (status === 204) return null;
    const a = data?.data?.authorization;
    if (!a) return "Checked Viseca's queue";
    if (shopOf.has(a.authorization_id)) return null; // handed out again while it waits for the customer
    shopOf.set(a.authorization_id, a.merchant?.merchant_name ?? "a shop");
    return `Purchase received: ${a.merchant?.merchant_name ?? "a shop"}, ${money(a.amount, a.currency)}`;
  }
  if (route === "/v1/bootstrap") return data?.scenarios?.length ? `Loaded Viseca's ${data.scenarios.length} test requests` : "Loaded Viseca's test requests";
  if (route === "/v1/reference-data") return "Loaded Viseca's shops and products";
  if (route === "/v1/mandates" && method === "POST") return "Policy sent to Viseca as a draft";
  if (route.endsWith("/confirm")) return "Policy confirmed at Viseca";
  if (route.startsWith("/v1/mandates/") && method === "PATCH") return "Policy tightened at Viseca";
  if (route.startsWith("/v1/mandates/") && method === "DELETE") return "Policy revoked at Viseca";
  if (route === "/v1/scenario-runs" && method === "POST") return "Story started: Viseca's agent is shopping";
  if (route.endsWith("/decision")) return `Answer sent${shopOf.has(id) ? ` for ${shopOf.get(id)}` : ""}: ${VERDICT[body?.decision] ?? body?.decision}`;
  if (route.endsWith("/resolve")) return `Customer's answer sent${shopOf.has(id) ? ` for ${shopOf.get(id)}` : ""}: ${body?.decision === "approve" ? "Approved" : "Declined"}`;
  if (method === "GET") return null; // status reads and syncs in the background
  return `${method} call to Viseca`;
}

/** Called by the Viseca client after every call (status 0 = no answer at all). Never throws: the log must not break a call. */
export function recordCall(c: { method: string; path: string; status: number; ms: number; body?: unknown; data?: unknown }) {
  try {
    add(c);
  } catch (err) {
    console.error("Viseca API log:", err);
  }
}

function add(c: { method: string; path: string; status: number; ms: number; body?: unknown; data?: unknown }) {
  const ok = c.status >= 200 && c.status < 300;
  apiLog.lastContactAt = new Date().toISOString();
  const text = label(c.method, c.path, c.status, c.body, c.data);
  if (text === null && (ok || (c.method === "GET" && c.status === 404))) return; // "not found" to a status read is an answer, not a failure
  apiLog.calls.push({
    at: apiLog.lastContactAt,
    method: c.method,
    path: c.path,
    status: c.status,
    ms: isQueuePoll(c.path) ? null : c.ms,
    ok,
    label: ok ? text! : `${c.status === 0 ? "No answer from Viseca" : "Refused by Viseca"} · ${text ?? "Status check"}`,
  });
  if (apiLog.calls.length > 50) apiLog.calls.shift();
}

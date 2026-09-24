// Thin client for Viseca's hackathon API (see viseca-2026-main/technical_details.md).
import { config } from "./config.js";

export type ApiResult<T = any> = { status: number; ok: boolean; data: T | null; ms: number };

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; timeoutMs?: number; auth?: boolean } = {},
): Promise<ApiResult<T>> {
  const started = performance.now();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) headers.Authorization = `Bearer ${config.teamKey}`;
  const res = await fetch(config.baseUrl + path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, ok: res.ok, data, ms: Math.round(performance.now() - started) };
}

export const viseca = {
  health: () => api("/healthz", { auth: false }),
  bootstrap: () => api("/v1/bootstrap"),
  referenceData: () => api("/v1/reference-data"),

  createMandate: (body: unknown) => api("/v1/mandates", { method: "POST", body }),
  confirmMandate: (draftId: string) =>
    api(`/v1/mandates/${draftId}/confirm`, { method: "POST", body: { confirmed: true } }),
  getMandate: (id: string) => api(`/v1/mandates/${id}`),
  patchMandate: (id: string, body: unknown) => api(`/v1/mandates/${id}`, { method: "PATCH", body }),
  revokeMandate: (id: string) => api(`/v1/mandates/${id}`, { method: "DELETE" }),

  startRun: (scenarioId: string, mandateId: string) =>
    api("/v1/scenario-runs", { method: "POST", body: { scenario_id: scenarioId, mandate_id: mandateId } }),
  getRun: (runId: string) => api(`/v1/scenario-runs/${runId}`),

  // Long poll: 200 = envelope with the purchase in `data`, 204 = nothing yet.
  nextRequest: (waitSeconds = 25) =>
    api(`/v1/decision-requests/next?wait=${waitSeconds}`, { timeoutMs: (waitSeconds + 10) * 1000 }),
  postDecision: (authorizationId: string, body: unknown) =>
    api(`/v1/authorizations/${authorizationId}/decision`, { method: "POST", body }),
  resolve: (authorizationId: string, body: unknown) =>
    api(`/v1/authorizations/${authorizationId}/resolve`, { method: "POST", body }),

  authorizations: () => api("/v1/authorizations"),
  events: (since = 0) => api(`/v1/events?since=${since}`),
};

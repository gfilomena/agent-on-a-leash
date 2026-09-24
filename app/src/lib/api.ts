// The app talks only to the Compass engine, through /api (never to Viseca or the AI).
import type { Policy, Snapshot } from "./types";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string; message?: string }).error ?? (data as { message?: string }).message ?? "Something went wrong. Please try again.");
  return data as T;
}

export const api = {
  snapshot: () => call<Snapshot>("/snapshot"),
  draft: (instruction: string) => call<Policy>("/policies", { instruction }),
  answer: (policyId: string, question: string, answer: string) => call<Policy>(`/policies/${policyId}/answer`, { question, answer }),
  confirm: (policyId: string, whenUnsure: "ask" | "decline") => call<Policy>(`/policies/${policyId}/confirm`, { whenUnsure }),
  revoke: (policyId: string) => call<Policy>(`/policies/${policyId}/revoke`, {}),
  answerPurchase: (purchaseId: string, approve: boolean) => call<{ ok: boolean; message: string }>(`/purchases/${purchaseId}/answer`, { approve }),
};

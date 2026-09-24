// Stand-in for Viseca used by `npm run live -- --dry`: rehearses the flow without creating anything real.
// Mimics what we observed live on 2026-09-24:
// - the next purchase is only created once the previous one is final;
// - while a purchase waits for the customer, /next hands it out again, instantly;
// - an unanswered review is declined by Viseca ("step_up_expired") shortly after the window.
import { loadPackStories, OfflineRun } from "../offline.js";
import type { AuthorizationEvent } from "../types.js";
import type { ApiResult } from "../viseca.js";

const res = <T>(data: T, status = 200): Promise<ApiResult<T>> =>
  Promise.resolve({ status, ok: status < 300, data, ms: 5 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeFakeViseca(humanWindowMs: number, opts: { refuseDecisions?: boolean } = {}) {
  const story = loadPackStories().find((s) => s.scenarioId === "SCEN0001")!;
  const run = new OfflineRun(story);
  const rows = story.attempts.slice(0, 2);
  const auths: { ev: AuthorizationEvent; status: string; reason?: string }[] = [];
  let started = false;
  let runMandateId = "";
  const current = () => auths[auths.length - 1];
  const isFinal = (s: string) => ["approved", "declined"].includes(s);

  return {
    bootstrap: () =>
      res({
        scenarios: [{ scenario_id: "SCEN0101", scenario_name: "Connection check (rehearsal)", cardholder_instruction: story.instruction, event_count: rows.length }],
        limits: { decision_timeout_seconds: 8, step_up_timeout_seconds: humanWindowMs / 1000, long_poll_max_seconds: 25 },
      }),
    createMandate: (body: any) => res({ draft_id: "DRAFT_DRY", ...body }),
    confirmMandate: () => res({ mandate_id: "TM_DRY", status: "active" }),
    startRun: (_scenarioId: string, mandateId: string) => {
      started = true;
      runMandateId = mandateId; // like Viseca: every purchase carries the run's policy id
      return res({ run_id: "RUN_DRY", status: "running" });
    },
    getRun: () => {
      const done = auths.length === rows.length && auths.every((a) => isFinal(a.status));
      return res({ run_id: "RUN_DRY", status: done ? "completed" : "running", delivered_event_count: auths.length });
    },
    nextRequest: async () => {
      if (started && (!current() || isFinal(current().status)) && auths.length < rows.length) {
        const ev = run.buildEvent(rows[auths.length]);
        ev.authorization.mandate_id = ev.mandate.mandate_id = runMandateId;
        run.record(ev, "step_up");
        auths.push({ ev, status: "awaiting_decision" });
      }
      const open = current();
      if (!open || isFinal(open.status)) {
        await sleep(300);
        return { status: 204, ok: true, data: null, ms: 300 };
      }
      // Undecided or waiting for the customer: handed out again, instantly (as observed live).
      return res({ run_id: "RUN_DRY", type: "authorization.request", authorization_id: open.ev.authorization.authorization_id, status: open.status, data: open.ev });
    },
    postDecision: (id: string, body: any) => {
      const a = auths.find((x) => x.ev.authorization.authorization_id === id);
      if (opts.refuseDecisions) return res({ error: { code: "invalid_decision", message: "Rehearsal: decision refused on purpose" } }, 422);
      if (!a || a.status !== "awaiting_decision") return res({ error: { code: "already_decided" } }, 409);
      a.status = body.decision === "step_up" ? "pending_step_up" : body.decision === "approve" ? "approved" : "declined";
      if (a.status === "pending_step_up") {
        setTimeout(() => {
          if (a.status === "pending_step_up") Object.assign(a, { status: "declined", reason: "step_up_expired" });
        }, humanWindowMs + 3_000);
      }
      return res({ authorization_id: id, status: a.status });
    },
    resolve: (id: string, body: any) => {
      const a = auths.find((x) => x.ev.authorization.authorization_id === id);
      if (!a || a.status !== "pending_step_up") return res({ error: { code: "not_pending" } }, 409);
      a.status = body.decision === "approve" ? "approved" : "declined";
      return res({ authorization_id: id, status: a.status });
    },
    authorizations: () =>
      res(auths.map((a) => ({ authorization_id: a.ev.authorization.authorization_id, status: a.status, reason_codes: a.reason ? [a.reason] : [] }))),
    events: () => res({ since: 0, next_cursor: 0, events: [] }),
  };
}

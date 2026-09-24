// Stand-in for Viseca used by `npm run live -- --dry`: rehearses the flow without creating anything real.
import { loadPackStories, OfflineRun } from "../offline.js";
import type { ApiResult } from "../viseca.js";

const ok = <T>(data: T, status = 200): Promise<ApiResult<T>> => Promise.resolve({ status, ok: true, data, ms: 5 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeFakeViseca(humanWindowMs: number) {
  const story = loadPackStories().find((s) => s.scenarioId === "SCEN0001")!;
  const run = new OfflineRun(story);
  const rows = story.attempts.slice(0, 2);
  const status = new Map<string, string>();
  let started = false;
  let delivered = 0;
  let waitingForDecision = false;

  return {
    bootstrap: () =>
      ok({
        scenarios: [{ scenario_id: "SCEN0101", scenario_name: "Connection check (dry run)", cardholder_instruction: story.instruction, event_count: rows.length }],
        limits: { decision_timeout_seconds: 8, step_up_timeout_seconds: humanWindowMs / 1000, long_poll_max_seconds: 25 },
      }),
    createMandate: (body: any) => ok({ draft_id: "DRAFT_DRY", ...body }),
    confirmMandate: () => ok({ mandate_id: "TM_DRY", status: "active" }),
    startRun: () => {
      started = true;
      return ok({ run_id: "RUN_DRY", status: "running" });
    },
    getRun: () => ok({ run_id: "RUN_DRY", status: delivered === rows.length ? "completed" : "running", delivered }),
    nextRequest: async () => {
      await sleep(500);
      if (!started || waitingForDecision || delivered >= rows.length) return { status: 204, ok: true, data: null, ms: 500 };
      const event = run.buildEvent(rows[delivered++]);
      run.record(event, "step_up");
      status.set(event.authorization.authorization_id, "pending_decision");
      waitingForDecision = true;
      return { status: 200, ok: true, data: { run_id: "RUN_DRY", event_id: `EV${delivered}`, type: "authorization.request", authorization_id: event.authorization.authorization_id, status: "pending", occurred_at: event.runtime.received_at, data: event }, ms: 500 };
    },
    postDecision: (id: string, body: any) => {
      waitingForDecision = false;
      status.set(id, body.decision === "step_up" ? "pending_customer" : body.decision);
      setTimeout(() => status.get(id) === "pending_customer" && status.set(id, "expired (dry run)"), humanWindowMs);
      return ok({ authorization_id: id, accepted: true });
    },
    resolve: (id: string, body: any) => {
      status.set(id, body.decision === "approve" ? "approved" : "declined");
      return ok({ authorization_id: id, status: status.get(id) });
    },
    authorizations: () => ok([...status].map(([authorization_id, s]) => ({ authorization_id, status: s }))),
    events: () => ok({ since: 0, next_cursor: 0, events: [] }),
  };
}

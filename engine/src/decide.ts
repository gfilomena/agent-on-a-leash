// The decision engine. For now a placeholder that asks the customer every time (plan steps 2–3).
import type { AuthorizationEvent, EngineDecision } from "./types.js";

export function decide(_event: AuthorizationEvent): EngineDecision {
  return {
    decision: "step_up",
    reason_codes: ["engine_not_ready"],
    customer_message: "Needs review: Compass can't check purchases on its own yet.",
    evidence: [{ check: "engine", result: "unknown", detail: "Placeholder engine: every purchase goes to the customer." }],
  };
}

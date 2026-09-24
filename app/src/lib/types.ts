// What the app shows. Filled with sample data in the design preview (step 4), by the engine later.

export type Verdict = "approve" | "step_up" | "decline";
export type CheckResult = "pass" | "fail" | "unknown";

export interface Check {
  label: string;
  result: CheckResult;
  detail?: string;
}

export interface Decision {
  id: string;
  verdict: Verdict;
  /** One plain sentence, verdict first. */
  sentence: string;
  shop: string;
  items: string[];
  amountChf: number;
  /** Set when the shop charged in another currency. */
  original?: { amount: number; currency: string };
  at: string;
  decidedInMs: number;
  checks: Check[];
  /** Shop text that tried to give instructions; shown struck through, never followed. */
  ignoredText?: string;
  /** Who gave the final answer. */
  answeredBy?: "compass" | "you";
  /** Waiting in the Inbox until this time (ms since epoch). */
  waitingUntil?: number;
  expired?: boolean;
}

export interface Policy {
  id: string;
  instruction: string;
  rules: string[];
  whenUnsure: "ask" | "decline";
  status: "active" | "revoked";
  confirmedAt: string;
}

export interface Story {
  id: string;
  name: string;
  instruction: string;
  purchases: number;
}

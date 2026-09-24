// What the engine sends the app (GET /api/snapshot). Plain words only: no codes or ids to display.

export type Display = "approve" | "step_up" | "decline" | "expired";
export type CheckResult = "pass" | "fail" | "unknown";

export interface Check {
  label: string;
  result: CheckResult;
  detail: string;
  kind: "rule" | "warning" | "bank" | "status";
}

export interface Purchase {
  id: string;
  display: Display;
  status: "approved" | "declined" | "pending" | "expired";
  answeredBy: "compass" | "you" | "viseca";
  /** One plain sentence, verdict first. */
  sentence: string;
  /** Why Compass asked (kept after the customer answered). */
  reviewReason: string | null;
  shop: string;
  items: string[];
  amountChf: number;
  original: { amount: number; currency: string } | null;
  at: string;
  decidedInMs: number;
  answerMs: number;
  /** Answer before this time (ms since epoch), while waiting. */
  waitingUntil: number | null;
  checks: Check[];
  /** Shop text that tried to give instructions: shown struck through, never followed. */
  ignoredText: string[];
  story: string | null;
  policyTitle: string | null;
}

export interface Policy {
  id: string;
  title: string;
  instruction: string;
  rules: string[];
  guidance: string[];
  notUnderstood: string[];
  questions: { text: string; options: string[] }[];
  whenUnsure: "ask" | "decline";
  watchSession: boolean;
  status: "draft" | "active" | "revoked";
  createdAt: string;
  confirmedAt: string | null;
  revokedAt: string | null;
  story: { name: string; total: number; received: number } | null;
}

export interface Story {
  id: string;
  name: string;
  instruction: string;
  purchases: number;
}

export interface Snapshot {
  version: number;
  engine: { worker: boolean; lastError: string | null; compilerModel: string; humanWindowSeconds: number };
  stories: Story[];
  policies: Policy[];
  purchases: Purchase[];
  approvedShops: string[];
}

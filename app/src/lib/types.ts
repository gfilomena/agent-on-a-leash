// What the engine sends the app (GET /api/snapshot). Plain words only: no codes or ids to display.

export type Display = "approve" | "step_up" | "decline" | "expired";
export type CheckResult = "pass" | "fail" | "unknown";

export interface Check {
  label: string;
  result: CheckResult;
  detail: string;
  /** ai = one of the customer's requirements judged by the AI item check; setting = the security settings in Controls. */
  kind: "rule" | "ai" | "setting" | "warning" | "bank" | "status";
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
  /** Follow-up questions still open. Required ones can't be skipped; amount = the answer is a price. */
  questions: { text: string; required: boolean; amount: boolean; options: string[] }[];
  whenUnsure: "ask" | "decline";
  watchSession: boolean;
  status: "draft" | "active" | "revoked";
  createdAt: string;
  confirmedAt: string | null;
  revokedAt: string | null;
  /** finished = every purchase arrived, or Viseca reports the run as over (some may never have reached us). */
  story: { name: string; title: string | null; total: number; received: number; finished: boolean } | null;
}

/** "Try a purchase": what the simulated agent may pick from (Viseca's products and shops). */
export interface TryCatalogue {
  products: { id: string; name: string; category: string; typicalChf: number }[];
  shops: { id: string; name: string; category: string; city: string; country: string; currency: string }[];
}

/** A proposal the customer can change before "Let the agent buy". Price in the shop's currency, delivery included. */
export interface TryProposal {
  id: string;
  productId: string;
  shopId: string;
  price: number;
  shopText: string;
}

export interface Story {
  id: string;
  /** Viseca's name for the test (what it checks): "Behind the scenes" only, never the customer app. */
  name: string;
  /** Short title written by the AI from the sentence; null = show the sentence alone. */
  title: string | null;
  instruction: string;
  purchases: number;
}

export type Period = "day" | "week" | "month";
export type Region = "switzerland" | "europe" | "global";

/** Security settings (Controls): on top of every policy, decoupled from policies. */
export interface Settings {
  spendingLimit: { on: boolean; amount: number; period: Period };
  region: Region;
  /** Spending in the period of the agent's latest purchase (only while the limit is on). */
  usage: { spentChf: number; limitChf: number; period: string; resets: string } | null;
  /** Plain country names per region, for "See countries". */
  countries: { switzerland: string[]; europe: string[] };
}

export type SettingsChange = { spendingLimit?: Partial<Settings["spendingLimit"]>; region?: Region };

export interface Snapshot {
  version: number;
  engine: { worker: boolean; lastError: string | null; compilerModel: string; humanWindowSeconds: number };
  stories: Story[];
  policies: Policy[];
  purchases: Purchase[];
  approvedShops: string[];
  /** Missing until the engine has the security settings. */
  settings?: Settings;
  /** Every call the engine made to Viseca, newest first ("Behind the scenes" only). */
  viseca?: { calls: VisecaCall[]; listening: boolean; lastContactAt: string | null };
}

export interface VisecaCall {
  at: string;
  method: string;
  path: string;
  /** 0 = Viseca did not answer at all. */
  status: number;
  /** null for the queue check: its time is waiting, not Viseca's speed. */
  ms: number | null;
  ok: boolean;
  label: string;
}

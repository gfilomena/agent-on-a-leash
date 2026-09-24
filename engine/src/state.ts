// The engine's saved memory: policies, every purchase with its decision, shops the customer
// approved. Written to engine/data/state.json after every change, so a restart during the demo
// loses nothing (CLAUDE.md: decisions and the spend ledger must survive a restart).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FollowUp } from "./compiler.js";
import type { TryoutRecord } from "./tryout.js";
import { DEFAULT_SETTINGS, type SecuritySettings } from "./engine/settings.js";
import type { Check } from "./engine/rules.js";
import type { MandateRule, Verdict } from "./types.js";

export interface Policy {
  id: string;
  /** Viseca's ids once created / confirmed there. */
  draftId?: string;
  mandateId?: string;
  instruction: string;
  title: string;
  hard_rules: MandateRule[];
  uncertainty_policy: "ask" | "decline";
  guidance: string[];
  explanations: { text: string; source: string }[];
  notUnderstood: string[];
  watchSession: boolean;
  status: "draft" | "active" | "revoked";
  createdAt: string;
  confirmedAt?: string;
  revokedAt?: string;
  /** The Viseca test story started for this policy, if its sentence is one. */
  scenarioId?: string;
  runId?: string;
  /** Follow-up questions still open while this is a draft. */
  questions?: FollowUp[];
}

export type PurchaseStatus = "approved" | "declined" | "pending" | "expired";

export interface PurchaseRecord {
  id: string; // live authorization id
  runId: string;
  mandateId: string;
  policyId?: string;
  scenarioId: string;
  cardId: string;
  replayOrder: number;
  verdict: Verdict; // the engine's answer
  status: PurchaseStatus; // where it ended
  answeredBy: "compass" | "you" | "viseca";
  message: string;
  reasonCodes: string[];
  checks: Check[];
  ignoredText: string[];
  shop: { id: string; name: string; country: string; category: string };
  items: { name: string; quantity: number; category: string }[];
  amount: number;
  currency: string;
  amountChf: number;
  simTime: string; // the purchase's own (simulated) time
  itemSignature: string;
  device: string;
  receivedAt: string; // real clock
  answeredAt: string;
  deadlineAt: string;
  engineMs: number;
  answerMs: number; // received → answer accepted by Viseca
  accepted: boolean;
  refusal?: string;
  resolvedAt?: string;
  finalNote?: string;
}

export interface State {
  policies: Policy[];
  purchases: PurchaseRecord[];
  /** card id → shop ids the customer approved in Compass (ask once per new shop). */
  approvedShops: Record<string, string[]>;
  /** "Try a purchase" tests (step 14b): a separate lane, never sent to Viseca. */
  tryouts?: TryoutRecord[];
  /** Security settings (Controls): on top of every policy. Missing = defaults (limit off, global). */
  settings?: SecuritySettings;
  version: number;
}

const dir = fileURLToPath(new URL("../data/", import.meta.url));
const file = `${dir}state.json`;

function load(): State {
  if (!existsSync(file)) return { policies: [], purchases: [], approvedShops: {}, version: 0 };
  return JSON.parse(readFileSync(file, "utf8"));
}

export const state: State = load();

/** Save after every change (write to a temp file, then rename: never a half-written file). */
export function save() {
  state.version++;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 1));
  renameSync(`${file}.tmp`, file);
}

export function resetState() {
  state.policies = [];
  state.purchases = [];
  state.approvedShops = {};
  save();
}

export const securitySettings = (): SecuritySettings => state.settings ?? DEFAULT_SETTINGS;

export const policyByMandate = (mandateId: string) => state.policies.find((p) => p.mandateId === mandateId);
export const approvedShopsFor = (cardId: string) => new Set(state.approvedShops[cardId] ?? []);
export function approveShop(cardId: string, shopId: string) {
  const list = new Set(state.approvedShops[cardId] ?? []);
  list.add(shopId);
  state.approvedShops[cardId] = [...list];
}

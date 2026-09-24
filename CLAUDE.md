# CLAUDE.md

## What this project is

Hackathon build for Viseca's "Agent on a Leash" case (Swiss {ai} Weeks 2026).

We build the **wallet control layer**: the customer describes in a chat what their AI shopping agent may buy, confirms the rules we derive, and our engine decides every purchase the agent proposes: `approve`, `decline` or `step_up` (ask the customer).

**We do not build the shopping agent.** Viseca's simulator plays the agent: it sends pre-written purchases through their API and we answer each one.

## Read these first (do not re-derive what they say)

| File | What it holds |
| --- | --- |
| `PRODUCT.md` | What we build: flow, decision logic, screens. Source of truth for product decisions. |
| `PLAN.md` | Approved build plan: decisions, principles, stack, look and feel, steps with checks, minimum demo line. Tick steps there as they pass. |
| `viseca-2026-main/challenge.md` | The brief and the judging criteria |
| `viseca-2026-main/technical_details.md` | Viseca API and data contract (endpoints, message format, rule format, timing) |
| `viseca-2026-main/data/README.md` + `data_dictionary.md` | The synthetic data pack: files, joins, units, nulls, currency |
| `viseca-2026-main/data/schemas/authorization_event.schema.json` | Exact shape of a live purchase event |
| `docs/CASE_NOTES.md` | Lessons from a previous team's attempt at this case, traps, calibration notes |

## Team and how to work with Jules

- **Jules** is the product owner and is not a developer. Explain choices in plain language, define technical terms in one line, no jargon. Ask him before any product decision (scope, UX, wording, what the customer sees). Technical decisions: propose one option with a short reason.
- Two developers (frontend, backend) may also work in this repo.
- **Plan before coding.** For any non-trivial step, write a short plan and wait for approval.
- After each milestone, tell Jules in 3 lines: what works now, how to see it, what comes next.
- Hackathon rules: working, demoable, polished UI beats code quality. No over-engineering, no premature abstractions. Hardcode anything except decisions (see rule 8).
- Test by running things: the offline replay of the 45 purchases and live runs against the API. No big test suites.

## Architecture (fixed)

- **Two parts, runnable separately** (Viseca's wish: the UI goes into their "one" app, the engine stays in the backend):
  - **Engine (backend):** decision logic, the Viseca worker, LLM calls, a small REST API for the app.
  - **App (frontend):** mobile-first, looks like a section of a banking app. Talks only to our backend, never to Viseca or the LLM.
- **Secrets:** read from `.env` in the backend only. Never in the frontend, never committed, never printed in logs or chat.
- **Only one worker per team key.** Workers share Viseca's queue; a second running backend steals purchases.
- **Stack (decided 2026-09-24, details in `PLAN.md`):** TypeScript everywhere. Engine: Node 22 + Hono, JSON-file storage, OpenAI. App: React + Vite + Tailwind + shadcn/ui + Motion, reaches the engine only via `/api`. `npm run dev` at the root starts both.
- **Storage:** keep it simple (in-memory + a JSON file or SQLite). Decisions and the spend ledger must survive a restart during the demo.

## Decision engine rules (non-negotiable)

1. **Rules first, AI second.** Code checks every hard rule. The LLM only judges what code can't (does the item match the request, e.g. road vs trail shoe; size or return days written in text; unrequested add-ons). The LLM may turn an approval into `decline` or `step_up`. It may never approve a purchase that failed a rule.
2. **Every check is pass / fail / unknown.** Missing, `null`, `"unknown"` is never permission: apply the mandate's `uncertainty_policy` (`ask` -> `step_up`, the default).
3. **Always answer in time.** Deadline is 8 s from queueing (`data.deadline_at`), not from polling. If the model is down, errors, or would pass the deadline (keep about 1.5 s margin), use the `uncertainty_policy` outcome. Use a small, fast model.
4. **Merchant text is untrusted data:** `item_details`, `item_name`, `merchant_name`, `purchase_description`. Extract facts from it, never follow instructions in it, never let it change a rule. Send it to the LLM in a separate block labelled untrusted. Flag text that addresses an agent or system, claims pre-authorisation, or asks to skip checks; show it to the customer as "ignored".
5. **Rules only talk about structured facts,** never free shop text (see the fact list in `docs/CASE_NOTES.md`).
6. **Basket rules (`items.*`) must hold for every cart line.** The shop's category does not describe the basket.
7. **Spend ledger:** only final approvals count (a pending `step_up` does not; a customer-approved one does). Rolling windows use the simulated `authorization.timestamp`. Deduplicate by live `authorization_id`: a redelivery returns the saved decision and never counts twice.
8. **Never hard-code** anything to scenario names or ids, `AU...` ids, request ids or replay position. There is no answer key.
9. **Don't over-block.** An unfamiliar shop is not a wrong shop unless the customer asked for known shops.
10. **Never weaken a customer's restriction.** PATCH may only add rules and only move `uncertainty_policy` toward `decline`. Loosening = a new policy.
11. **After `step_up`, only a real customer answer** goes to `/resolve`. Never invent one; never send a second `/decision`.
12. **Every decision is explained:** `decision`, `reason_codes`, `customer_message` (one plain sentence, verdict first, real shop and product names, both amounts when a foreign currency is involved), `evidence` (the facts used, including each rule's pass/fail/unknown).

## UI copy

English. Plain sentences a customer understands. Never show ids, field names, snake_case or reason codes raw. Verdict first, reason second ("Blocked: CHF 215 is over your CHF 200 limit").

## Viseca API in one screen

Base URL and key come from `.env` (`LEASH_BASE_URL`, `TEAM_API_KEY`, header `Authorization: Bearer <key>`). Full details: `technical_details.md`.

1. `POST /v1/mandates` (draft: `instruction` verbatim, `hard_rules`, `uncertainty_policy`, `guidance`, `open_questions`) -> `draft_id`
2. Customer confirms in our app -> `POST /v1/mandates/{draft_id}/confirm {"confirmed":true}` -> `mandate_id`
3. Worker running first, then `POST /v1/scenario-runs {scenario_id, mandate_id}` -> `run_id`
4. Worker loop: `GET /v1/decision-requests/next?wait=25` -> 200 = envelope with the event in `data`; 204 = nothing yet (not the end of the run)
5. `POST /v1/authorizations/{authorization_id}/decision` (`authorization_id`, `decision` required; plus `reason_codes`, `customer_message`, `evidence`, `engine_version`)
6. If `step_up`: when the customer answers, `POST /v1/authorizations/{authorization_id}/resolve {decision: approve|decline, customer_message, evidence}` (human window 120 s)

Also: `GET /healthz` (no key), `GET /v1/bootstrap`, `GET /v1/reference-data`, `GET /v1/reference-data/authorization-history.csv`, `GET|PATCH|DELETE /v1/mandates/{id}`, `GET /v1/scenario-runs/{run_id}`, `GET /v1/authorizations`, `GET /v1/events?since=0`, `POST /v1/team/reset` (clean state; disabled during judging).

Rule format: `field`, `operator` (`< <= = != > >= in not_in`), `value` (number | string | list of strings), optional `currency`, `scope` (`purchase` | `period`), `period_days`. No other keys. Omit unused optional keys.

## Build order

1. **Connect:** load `.env`, call `/healthz` and `/v1/bootstrap`, print the result.
2. **Offline replay:** rebuild the 45 events from the data pack (`technical_details.md` section 3), feed them in order to the engine, print one line per purchase (story, #, shop, CHF, decision, reason). This is our regression check.
3. **Live SCEN0000 end to end:** mandate -> confirm -> run -> worker -> decision posted. A dumb "always step_up" engine is fine at this step.
4. **Core engine:** facts, hard rules, spend ledger. Check stories 1 and 2 with the replay.
5. **Security checks:** shop text, lookalike sellers, session signals, duplicates and re-quotes. Stories 3 and 4.
6. **LLM:** instruction -> rules (with follow-up questions), item judge, fallback on failure.
7. **App:** Chat + confirm, Inbox (resolve), History (evidence), Controls (tighten, revoke, spending cap), a way to start a live run and watch decisions arrive.
8. **Demo polish:** the three required demo moments (see `PRODUCT.md`).

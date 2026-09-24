# Product description

## 1. What we build

A **wallet control layer** for Viseca's "one" app. The customer tells their AI shopping agent what to buy in a chat. Our system turns that into rules the customer confirms, then checks every purchase the agent proposes and **approves**, **declines** or **asks the customer**.

| Part | Job |
| --- | --- |
| App (frontend) | Everything the customer sees and does |
| Engine (backend) | Decides each purchase in under 8 seconds, talks to Viseca's API |

**We do not build the shopping agent.** Viseca's simulator plays the agent and sends us the purchases. In the app we present it as "your agent".

## 2. User flow

**Setup (once per shopping task)**

1. **Request.** The customer types what they want in the chat. Example: "Road-running shoes, size 43, max CHF 200."
2. **Follow-up questions (only if needed).** If something is missing, the app asks short questions with one-tap answers (0 to 3 questions). A price limit is mandatory.
3. **Confirm.** The app shows "Here's what I understood": each rule in plain words, plus what happens when something is unclear (ask me / decline). The customer confirms. The policy is now active.

**Shopping (repeats for every purchase)**

4. **Proposal.** The agent (Viseca's simulator) proposes a purchase.
5. **Decision.** The engine checks it and answers within 8 seconds: approve, decline or ask.
6. **Outcome.** Approve or decline happens automatically and is saved with its reason. "Ask" puts the purchase in the Inbox; the customer approves or declines it.

**Control (at any time)**

7. The customer reads the history (every decision and why), tightens or revokes a policy, and sets a spending cap.

## 3. How a purchase is decided

| Decision | When |
| --- | --- |
| **Decline** | A customer rule is clearly broken: over the price or spending cap, wrong item or size, wrong type of shop, forbidden item in the basket, policy revoked. |
| **Ask** | Information is missing (e.g. return policy unknown), or something looks suspicious (fake-looking shop, shop text giving instructions, odd session, possible duplicate order), or the AI is unavailable. |
| **Approve** | Every check passes. No friction. |

Principles:

- **Missing information is never a yes.** When unsure, follow the customer's choice (ask by default).
- **Unfamiliar is not wrong.** A new shop that meets every rule is approved, unless the customer asked for known shops only.
- **A broken rule always wins.** Nothing, including the AI or shop text, turns a failed rule into an approval.

## 4. What the engine checks

| Check | What it looks at | Test story |
| --- | --- | --- |
| Customer rules | Price per order, item type, size, colour, shop type, return terms, known shop, no add-ons. Every line of the basket. | 0, 1, 2, 4 |
| Spending cap | Total spent over a period (e.g. CHF 300 per 7 days). Only approved purchases count, each one once. | 1 |
| Shop text | Product descriptions are untrusted. Hidden instructions ("ignore the limit") are ignored and shown to the customer. | 4 |
| Seller | Fake shops with near-identical names, shops the customer never used. | 4 |
| Session | New device, unusual hour, new country, many attempts within 10 minutes, duplicate orders. | 3, 4 |

Plain code checks everything it can first. The AI only judges what code can't (e.g. "is this a road-running shoe?"). If the AI is slow or down, the answer is "ask".

## 5. App screens

Mobile-first, designed to look like a section of the "one" app. Four tabs:

| Tab | The customer can |
| --- | --- |
| **Chat** | Write a request, answer follow-up questions, review "Here's what I understood" and confirm. |
| **Inbox** | See purchases waiting for them (item, price, shop, why we asked) and tap Approve or Decline. |
| **History** | See every decision: the verdict, one sentence why, and the facts behind it. Suspicious shop text is highlighted as ignored. |
| **Controls** | See active policies, tighten or revoke them, set the spending cap. |

**Tighten vs loosen:** Viseca's API only lets a policy get stricter. To loosen it, the customer creates a new one.

**Spending cap (decided):** a Controls setting the customer sets once (e.g. "max CHF 500 per month for my agent"), off by default. It counts all approved agent spending on the card, across all policies, and applies whatever the chat request says.

**Inbox badge:** the Inbox tab shows how many purchases are waiting, from every screen. A purchase not answered within 120 s shows "Expired: you didn't answer in time" (no claim about the purchase until we know what Viseca does).

## 6. Demo, scope, open decisions

**The demo must show three moments** (required by Viseca):

1. An ordinary purchase approved with no friction.
2. A risky or manipulated purchase stopped, with a clear reason.
3. The customer approving or declining in the Inbox, then revoking a policy.

**Demo constraint:** the simulator only sends purchases for its 5 test stories (`viseca-2026-main/data/scenario_catalogue.csv`). Live, we use those stories' instructions, sent to Viseca word for word in `instruction`. Follow-up answers are stored separately (as extra rules or `guidance`), never merged into that text. The app needs a way to pick a story and start a live run.

**Out of scope:** the real shopping agent, real payments, login, multiple users. **In scope as a bonus (decided 2026-09-24):** a clearly labelled simulated *test agent* so anyone can type any request and see the engine decide (PLAN.md step 14b).

**Presenter panel (demo only):** on desktop, next to the app in a phone frame: pick a test story, start a live run, watch purchases arrive with the decision and its time ("Approved in 0.4 s"). Also its own page at `/presenter`. Hidden on phones, where the app fills the screen.

**Decided (2026-09-24):** name **Compass**; stack and look in `PLAN.md`; standout feature = highlighted manipulation attempts (session-risk timeline only as a stretch goal). **Still open:** AI model (picked by timing at plan step 14).

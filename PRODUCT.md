# Product description

## 1. What we build

A **wallet control layer** for Viseca's "one" app. The customer tells their AI shopping agent what to buy in a chat. Our system turns that into rules the customer confirms, then checks every purchase the agent proposes and **approves**, **declines** or **asks the customer**.

| Part | Job |
| --- | --- |
| App (frontend) | Everything the customer sees and does |
| Engine (backend) | Decides each purchase in under 8 seconds, talks to Viseca's API |

**We do not build the shopping agent.** Viseca's simulator plays the agent and sends us the purchases. In the app we present it as "your agent". Exception (decided): the clearly labelled "Try a purchase" tool (section 6).

## 2. User flow

**Setup (once per shopping task)**

1. **Request.** The customer types what they want in the chat. Example: "Road-running shoes, size 43, max CHF 200."
2. **Follow-up questions (only if needed, tailored to the item).** If something is missing, the app asks short questions with one-tap answers (0 to 3 questions), tailored to what is being bought (size, colour, brand, quantity, return terms, known shops…). Answers become rules wherever possible; "Other" lets the customer type. A price limit is mandatory.
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
- **Ask once per new shop.** When the card has no purchase history, a shop the customer asked to be "known" is asked about the first time; once approved, it counts as known ("First purchase at this shop, so I'm asking you once").
- **Warning signs ask, rules block.** Lookalike shop, hidden instructions in shop text, odd session, duplicate or split order follow the customer's "when unsure" choice (ask by default, decline if chosen). They never approve. The bank's own limits (card blocked, abroad switched off, per-payment limit) block.
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
| **Controls** | See active and revoked policies, tighten or revoke them, see the shops they approved, set the spending cap and the allowed regions. |

**Tighten vs loosen:** Viseca's API only lets a policy get stricter. To loosen it, the customer creates a new one.

**Spending cap (decided):** a Controls setting the customer sets once (e.g. "max CHF 500 per month for my agent"), off by default. It counts all approved agent spending on the card, across all policies (only purchases approved through Compass, by the engine or the customer), and applies whatever the chat request says. Fully customisable: any CHF amount per day, week, month or a custom number of days. Tightening applies at once; loosening only to policies confirmed afterwards.

**Allowed regions (decided):** Switzerland only, Europe, or Worldwide (default); card-wide, for every policy. A shop outside the region is blocked ("Blocked: this shop is in the United Kingdom, outside Switzerland"); a missing country makes Compass ask.

**Shops you've approved (decided, built):** Controls lists the shops the customer approved in the Inbox.

**Inbox badge:** the Inbox tab shows how many purchases are waiting, from every screen. A purchase not answered within 120 s is declined by Viseca; the card says "Expired: you didn't answer in time, so it wasn't bought."

## 6. Demo, scope, open decisions

**The demo must show three moments** (required by Viseca):

1. An ordinary purchase approved with no friction.
2. A risky or manipulated purchase stopped, with a clear reason.
3. The customer approving or declining in the Inbox, then revoking a policy.

**Demo constraint:** Viseca's simulator only sends purchases for its live test stories (10 for our team, listed by `/v1/bootstrap`; the data pack has 5 others for offline tests). Live, we use those stories' instructions, sent to Viseca word for word in `instruction`. Follow-up answers are stored separately (as extra rules or `guidance`), never merged into that text. The chat suggests those test requests; confirming one starts that story in the background.

**Out of scope:** the real shopping agent, real payments, login, multiple users. **In scope as a bonus (decided 2026-09-24):** a **"Try a purchase"** tool: create or edit a purchase (a clearly labelled simulated agent can propose a real shop and product from Viseca's data for any request; shop, product, price and shop text can be edited) and see Compass's decision. Nothing is sent to Viseca (PLAN.md step 14b).

**"Behind the scenes" panel (demo only, optional):** on desktop, next to the app in a phone frame: watch purchases arrive from Viseca with the decision and its time ("answered in 0.08 s"). Stories are started from the chat, not from the panel. Also its own page at `/presenter`. Hidden on phones, where the app fills the screen.

**Decided (2026-09-24):** name **Compass**; stack and look in `PLAN.md`; standout feature = highlighted manipulation attempts (session-risk timeline only as a stretch goal); chat title "What do you need today?", no logo; the chat is fully dynamic (tailored follow-up questions per item, above the minimum demo line); sentence → rules uses `gpt-4.1`; recorded test runs are labelled `test_recording`; no story id, purchase id or position ever appears in the decision logic. **Still open:** the AI item-check model (picked by timing at plan step 14); where "Try a purchase" sits relative to the minimum demo line.

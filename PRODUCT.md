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
2. **Follow-up questions (only if needed, tailored to the item).** If something is missing, the app asks short questions with one-tap answers (0 to 3 questions), tailored to what is being bought (size, colour, brand, quantity, return terms, known shops…). Answers become rules wherever possible; "Other…" lets the customer type ("Other amount" for the price). A price limit is mandatory. A question is also required when the item can't be bought correctly without the answer (size for clothes and shoes, dates and city for a hotel, the exact model for electronics); required questions have no "Skip", everything else can be skipped (skipped = no rule). Nothing the sentence already says is asked again.
3. **Confirm.** The app shows "Here's what I understood": each rule in plain words, plus what happens when something is unclear (ask me / decline). The customer confirms. The policy is now active.

**Shopping (repeats for every purchase)**

4. **Proposal.** The agent (Viseca's simulator) proposes a purchase.
5. **Decision.** The engine checks it and answers within 8 seconds: approve, decline or ask.
6. **Outcome.** Approve or decline happens automatically and is saved with its reason. "Ask" puts the purchase in the Inbox; the customer approves or declines it.

**Control (at any time)**

7. The customer reads the history (every decision and why), tightens or revokes a policy, and sets the security settings (spending limit, allowed regions).

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
| Spending limits | A policy's own limits (e.g. CHF 300 per 7 days) and the security settings' spending limit (per day, week or month, across all policies). Only approved purchases count, each one once. | 1 |
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
| **Controls** | Set the security settings (spending limit, allowed regions), see active and revoked policies, tighten or revoke them, see the shops they approved. |

**Tighten vs loosen:** Viseca's API only lets a policy get stricter. To loosen it, the customer creates a new one.

**Security settings (decided 2026-09-25, Jules):** a section at the top of Controls, on top of every policy and decoupled from policies (not sent to Viseca as rules; shown in every decision's facts and evidence). **Spending limit**: an amount in CHF and a period (Daily, Weekly, Monthly), off by default; counts every purchase the agent made through Compass that was approved (by Compass or by the customer in the Inbox), across all policies; calendar periods in Swiss time on the purchase's own date (resets at midnight, on Monday, on the 1st); a usage bar shows "CHF 212 of CHF 500 used in September · resets on 1 October". **Allowed regions**: Switzerland (with Liechtenstein), Europe (EU 27, Iceland, Liechtenstein, Norway, Switzerland, United Kingdom, Andorra, Monaco, San Marino, Vatican City; "See countries" lists them) or Global (default). Changes apply from the agent's next purchase, for every policy and for "Try a purchase"; stricter changes save at once, looser ones (raise or turn off the limit, bigger region) ask first in a confirmation sheet. Blocks read "Blocked: HarborByte is in the United States, and your region setting is Europe." / "Blocked: this CHF 250 order would bring your monthly spending to CHF 550, over your CHF 500 limit."; an unknown shop country asks. "Try a purchase" is judged against the customer's real spending and never adds to it. A "Reset spending" button in "Behind the scenes" (demo only) restarts the count, because Viseca's stories replay the same dates.



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

**Decided (2026-09-24):** name **Compass**; stack and look in `PLAN.md`; standout feature = highlighted manipulation attempts (session-risk timeline only as a stretch goal); chat title "What do you need today?", no logo; the chat is fully dynamic (tailored follow-up questions per item, above the minimum demo line); sentence → rules uses `gpt-4.1`; recorded test runs are labelled `test_recording`; no story id, purchase id or position ever appears in the decision logic. **Still open:** the AI item-check model (picked by timing at plan step 14). **Decided (23:30):** "Try a purchase" is built right after 9b; it works before and after Confirm, its results stay in its own sheet (never History or the Inbox), and it never invents a product.

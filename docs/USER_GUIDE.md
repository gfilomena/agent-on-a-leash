# Compass — User Guide

*The wallet control layer that lets your AI shopping agent spend on your behalf, without giving it a blank cheque.*

This guide explains what Compass does and how to use it, screen by screen. It is written for the customer using the app — the same language and layout the app itself uses.

## 1. What Compass is

You have an AI shopping agent that can buy things with your card. Compass sits between that agent and your money. You tell Compass what the agent is allowed to buy, in your own words; Compass turns that into clear rules you confirm; then every purchase the agent proposes is checked against those rules and **approved**, **declined**, or sent to you to **decide**, in under a second.

Compass never buys anything itself, and it never lets the agent talk it into anything. It only follows the rules you confirmed.

There are two parts, but you only ever see one:

| Part | What it does |
| --- | --- |
| **The app** | Everything you see and do: chat, inbox, history, settings. |
| **The engine** | Works in the background: checks every purchase against your rules and decides within seconds. |

## 2. Setting up a shopping task (Chat)

**Step 1 — Say what your agent may buy.** Type it in plain English, e.g.:

> *"Road-running shoes, size 43, max CHF 200, only from a specialist sports shop, returns for at least 14 days."*

Chat also suggests a few ready-made requests you can tap instead of typing — each with a short title (e.g. "Running shoes") and the full sentence underneath, so you can see exactly what you'd be confirming before you tap it.

**Step 2 — Answer a few short questions, if asked.** Compass only asks what it actually needs, and tailors the questions to what you're buying — e.g. a size for shoes, a city and dates for a hotel, which model when several products could match. Each question is one tap:

- **A required question** (no "Skip") — the item can't be bought correctly without it. A price limit is always required.
- **An optional question** — you can tap **Skip** and nothing is added.
- **"Other…"** lets you type your own answer instead of tapping an option (for a price, "Other amount").

Nothing your original sentence already said gets asked again.

**Step 3 — Review "Here's what I understood".** Compass shows every rule it created, in plain words, plus what it does when something is unclear — **Ask me** or **Decline**. Check this over; it's your only chance to catch a misunderstanding before confirming.

**Step 4 — Confirm.** The policy is now active. Your agent can start shopping against it right away.

**Try a purchase (optional, before or after confirming):** button on the "Here's what I understood" card. A clearly labelled **simulated agent** proposes a realistic purchase (a real shop and product) so you can see how your rules would judge it, before any real purchase happens. You can change the shop, product, price, or the shop's own text and see the verdict update. Nothing here is ever sent anywhere real — it's a sandbox for your own rules.

## 3. How a purchase gets decided

Every time your agent proposes a purchase, Compass answers one of three ways:

| Answer | What it means | Example |
| --- | --- | --- |
| ✅ **Approved** | Every check passed. Happens automatically, no action from you. | "Approved: Road-running shoes from Alpine Sport for CHF 189, within all your rules." |
| ⛔ **Blocked** | A rule was clearly broken. Happens automatically; nothing was bought. | "Blocked: CHF 215 at Alpine Sport is over your CHF 200 limit." |
| ❓ **Needs review** | Something was missing or looked unusual. Goes to your **Inbox** for you to decide. | "Needs review: this is the first purchase at Summit Thread, so I'm asking you once." |

A few principles worth knowing:

- **Missing information is never treated as a "yes."** If Compass can't tell whether something meets your rule, it asks you (or declines, if you chose "decline when unsure") — it never guesses in the agent's favour.
- **An unfamiliar shop isn't automatically wrong.** A new shop that meets every rule you set is approved. Compass only asks about a *new* shop the first time, if you specifically asked for "shops I use regularly" — after you approve it once, it's remembered.
- **Suspicious activity is flagged, not silently blocked or silently allowed.** A shop with a name that imitates a well-known one, product text that tries to give your agent secret instructions, a possible duplicate or split order, or an unusual session (new device, odd hour, rapid attempts) — all of these are shown to you and, by default, sent to your Inbox rather than auto-approved.
- **A broken rule always wins.** Nothing — not the AI, not clever wording in a shop's product description — can turn a blocked purchase into an approved one.

## 4. The four screens

### Chat
Where you set up a new shopping task (section 2) and see the state of your agent's current instruction.

### Inbox
Purchases waiting for your decision. Each card shows the item, price, shop, and the reason Compass wants your input. Tap **Approve** or **Decline**. You have **120 seconds** to answer — if you don't, the purchase automatically doesn't go through ("Expired: you didn't answer in time, so it wasn't bought.").

### History
Every decision your agent's purchases have ever received — approved, blocked, or reviewed — each with:
- The one-sentence verdict, in plain words.
- The full list of facts behind it: every rule checked and whether it passed, failed, or couldn't be determined.
- Any shop text that tried to manipulate your agent, shown struck through as "ignored."

### Controls
Everything about *how much control* you have:

- **Security settings**, at the top, apply on top of every shopping task you've set up:
  - **Spending limit** — an amount and a period (Daily / Weekly / Monthly). Off by default. Counts every purchase your agent actually completed through Compass. A usage bar shows how much of the period you've used and when it resets.
  - **Allowed regions** — Switzerland, Europe, or Global (default: Global). Restricts which countries your agent may buy from, for every shopping task at once.
  - Making a setting **stricter** (lower limit, smaller region) applies immediately. Making it **looser** (raising or turning off the limit, widening the region) always asks you to confirm first.
- **Your policies** — every shopping task you've set up, active or revoked, with its rules listed. **Tighten** a policy by adding more restrictions, or **revoke** it entirely (your agent can no longer buy anything under it). You can't loosen an existing policy — start a new one instead.
- **Shops you've approved** — every shop you said "yes" to in the Inbox, so Compass remembers not to ask about them again.

## 5. Frequently asked

**Can my agent ever bypass a rule I set?** No. Rules are checked by code, not guessed at by AI, and nothing — including text written by a shop — can weaken or skip one.

**What if a shop's product description tries to trick the agent** (e.g. *"ignore the spending limit"*, *"pre-authorised, no need to ask the customer"*)? Compass treats everything a shop writes as untrusted. It reads useful facts out of it (like a stated size or return window) but never treats it as an instruction. Anything that looks like an attempt to manipulate the process is flagged and shown to you, struck through, as ignored.

**What happens if the AI is slow or unavailable?** Compass always answers within the required time. If the AI can't answer in time, Compass falls back to your chosen "when unsure" setting (ask you, by default) rather than guessing or stalling.

**Can I loosen a policy after confirming it?** Not directly — Viseca's platform only allows a confirmed policy to get stricter. To loosen a restriction, set up a new shopping task with the rules you want.

**Is any of this real money?** No — this is a hackathon prototype running on Viseca's synthetic sandbox data. No real cards, customers, or payments are involved.

# Compass: build plan

Approved by Jules on 2026-09-24. Tick a step's box once Jules has seen its check pass.

## 0. Current state (updated 2026-09-25, 00:45) · read this first

**Where we are.** Steps 0–9, 11, 13, 15 and 16 are done and checked. **9b (tailored follow-up questions), 14b ("Try a purchase") and 14 (AI item check) are built and checked by Claude (23:20, 23:50, 00:17), waiting for Jules's own check.** 14b was moved ahead of 14 (Jules, 23:30: this was the new feature). 9b and 14b are committed (7d38d50); 14 is not committed yet. **Security settings (Controls) are built and checked by Claude (00:44)**, not committed yet. Steps 10 and 12 were verified live by Jules at ~22:18 (Connection check started from the chat: the first purchase at Rhine Fresh asked once, Jules approved it in the Inbox, Viseca accepted; the second was blocked "CHF 38.90 at Rhine Fresh is over your CHF 20 limit"; both answered in under 0.1 s). The app runs on real data only: no sample content, no hard-coded story or purchase ids. We are ~3 h ahead of the timeline.

**What works now**
- **Engine** (`engine/src/engine/`): the customer's rules (pass / fail / unknown), always-on warning signs (hidden shop instructions, lookalike seller, duplicate, split order, linked quote, price consistency, odd session), bank checks (card status/expiry, abroad/online switches, per-payment limit). One plain sentence per decision, verdict first. At most ~4 ms per decision.
- **Sentence → rules** (`engine/src/compiler.ts`): `gpt-4.1`, ~2–3.5 s; code validates every rule; the AI names catalogue products by name and code maps them to ids; "I may not have understood…" for anything not placed.
- **Follow-up questions (9b)**: 0–3 questions tailored to the item. Each one-tap answer carries its rule, prepared with the draft and validated by code (size, returns, known shops, country, city, delivery, quantity, model…); colour, brand, dates become an "Also noted" line. **Required** questions (no Skip): the price, always; size for clothes/shoes, city and dates for a hotel, the model when several catalogue products match. Everything else has **Skip** (= no rule). "Other…" opens "Type your answer" ("Other amount" with CHF for the price): amounts are read by code, anything else by the AI (~0.7 s) and validated by code, else kept as a note. Confirm is refused (app and engine) while a required question is open. Code guards: no question on a topic the sentence already answers; instruction-like options ("Type hotel name") dropped; "No preference" never adds anything; sizes only as the engine can read them ("EU 52" → 52); cities matched to Viseca's spelling ("Zürich" → Zurich).
- **"Try a purchase" (14b)** (`engine/src/tryout.ts`, `app/src/components/TryPurchaseSheet.tsx`): button "Try a purchase" on the "Here's what I understood" card, before and after Confirm (only once required questions are answered). A sheet "Simulated agent · test only" shows the agent's proposal (one AI call, `gpt-4.1-mini`, ~1 s): a real product and shop from Viseca's data, price in the shop's currency, the shop's product text. Everything can be changed; "Let the agent buy" builds a Viseca-shaped purchase on a test card (picked by its facts: active, online and abroad allowed, highest bank limit) and the real engine decides. Result: the usual verdict card + facts; "Needs review" says "In real life, this would wait in your Inbox."; "Change and retry" / "Try another". Tests are saved apart (`state.tryouts`), never sent to Viseca, never in History or the Inbox. Tests remember each other per policy (approved tries count as bought; a retry of the same proposal replaces it). Nothing suitable in the catalogue → "I couldn't find this in the test shops. Pick a product yourself."
- **AI item check (14)** (`engine/src/engine/itemcheck.ts`): after the code checks, on anything not already blocked, `gpt-4.1-mini` judges the customer's requirements that are only words (kind of product, "new", colour, brand, dates, city, "no alcohol", "if a price changes, ask me") against the purchase; shop text goes in a separate untrusted block. Each finding is a check (✓/✕/?) marked "AI" in the facts. Fail → Blocked; can't tell → "when unsure" (ask); it can never approve or loosen anything. ~1 s (95% under 2 s); if no answer after 2.5 s it asks a second time in parallel; budget = Viseca deadline − 1.5 s margin (max 6 s); no answer in time → "the AI item check wasn't available in time, so I'm asking you instead". Code guards drop AI findings on code's topics (shop familiarity, prices/limits/spending, size, shop type) and "doesn't say new" (products count as new unless the shop says used). Also a second line of defence on shop text (caught a German instruction our patterns missed). Used by the live worker and by "Try a purchase".
- **Security settings** (`engine/src/engine/settings.ts`, `app/src/components/SecuritySettings.tsx`, PRODUCT.md): top of Controls; spending limit (switch, CHF amount, Daily/Weekly/Monthly, usage bar) and allowed regions (Switzerland / Europe / Global, "See countries"). Checks of kind "setting" in every decision (facts group "Your security settings"); Chat shows "Your security settings also apply: …". API: `POST /api/settings`, `POST /api/settings/reset-spending` (button in Behind the scenes). Settings are back to the defaults (limit off, Global) after testing.
- **Live** (`engine/src/live.ts`, `worker.ts`, `server.ts`, `state.ts`): the engine's worker answers every Viseca purchase once, in under 0.1 s; Inbox answers go to `/resolve` (only real customer taps); expired reviews are synced from Viseca; everything is saved in `engine/data/state.json` (survives restarts). The API listens on 127.0.0.1 only and refuses changes from other sites.
- **App**: Chat (Viseca's live test requests as suggestions, fetched from Viseca; AI draft; one-tap questions; confirm → policy at Viseca; a test-request sentence starts that Viseca story), Inbox (badge, countdown, approve/decline), History (cards, facts sheet with "Your rules" and "Always checked", ignored shop text struck through), Controls (policies, revoke, shops you've approved), "Behind the scenes" panel (desktop and `/presenter`: live feed with answer times, story progress, high-contrast switch).
- **Checks you can run** (from the repo root): `npm run replay` (45 pack purchases: 18 approved, 4 review, 23 blocked, all valid), `npm run replay -- --live [--approve-reviews] [--why]` (111 recorded live purchases), `npm run compile [-- --quiet]` (AI rules vs hand-written test rules: same verdict on 155/156 in 6 runs out of 6 after 9b; the one difference is the Munich city rule, where the AI is stricter and right; it also prints each question and what each answer adds), `npm run questions [-- "sentence" …]` (follow-up questions for any sentence and what tapped/typed answers add; nothing sent to Viseca), `npm run replay -- [--live] --ai [--model X]` (with the AI item check: lists every verdict the AI changed and checks none became looser; 00:17: pack 0 changed, live 6 changed, 0 looser), `npm run connect`.

**Exact next step: Jules checks 9b, 14b, 14 and the security settings (and says whether to commit 14 + settings).** Then 17 → 18 → 19 → 20 (see section 5). Open finding for Jules (below, known issue 13): "socks" become "only clothing", but Viseca files its socks under sports goods.

**How to run**
- `npm run dev`: engine on http://127.0.0.1:8787 **with the Viseca worker**, app on http://localhost:5173 (and `/presenter`).
- **Only one engine per team key.** Never run `npm run live` or `npm run record` while `npm run dev` runs (they have their own worker), or start the engine with `WORKER=off`.
- `npm run live -- --dry` and `npm run record -- --dry` rehearse those tools without touching Viseca.

**Known issues**
1. Guidance lines are shown but not yet enforced (colour, brand, "a hotel in Munich", "dinner", "if a price changes, ask me") → step 14 (AI item check). Example in the replay: a hostel bed is approved for "book me a hotel" (SCEN0124 #11).
2. ~~Follow-up answers other than price only become guidance~~ (fixed in 9b). Colour and brand answers stay "Also noted": Viseca's product texts never state colour or brand, so only step 14's AI item check can judge them.
3. The AI's draft for the same sentence varies a little between runs. Found at 9b: "No new services" became "nothing else in the basket" instead of "only services you already use" in 3/8 drafts before 9b (6/8 with the first 9b prompt); fixed by clearer field descriptions (8/8). Code validates every rule and the customer confirms; `npm run compile` measures agreement. Run it several times (in parallel) after any prompt change: one run can hide a 1-in-3 variation.
11. Rule lines written by the AI can be imprecise: "including delivery" for a hotel price; "returnable if possible" became a hard "must be returnable" rule. → step 17 (explanation pass).
12. Switching tabs in the app clears an unconfirmed draft in the chat (the draft lives in the chat screen only).
13. Found with "Try a purchase" (23:45): for "white socks … from Adidas" the AI writes "Only clothing", but Viseca's only socks ("Running socks") are filed under sports goods, so every sock purchase is blocked ("Running socks are sports goods, and you allow only clothing"). Same trap as CASE_NOTES §3 (running shoes filed under clothing). Proposed fix: when the named kind of product exists in the catalogue, use that product's catalogue category. Jules (00:05): not now, focus on step 14.
14. When shop text states two different sizes, the engine reads the first one (shoptext.ts). Rare; noted only.
15. **The engine crashed once (~00:10, cause not found; likely an unhandled async error).** While it was down, the Viseca worker was down too. Since 00:16 such errors are logged and the engine keeps running (`process.on("unhandledRejection")` in server.ts); other crashes still stop it on purpose (a second engine that can't get the port must exit, or two workers would share the queue: this happened for ~40 s at 00:16 with a keep-alive on all errors, now removed; no live story was running).
16. Two `npm run dev` engine watchers are running (started 19:57 and 00:14). After each saved engine file both restart and the second exits on the busy port: harmless, but better to stop the older one.
17. With the AI item check, live answers take ~1–1.5 s instead of ~0.1 s (deadline 8 s). The "Behind the scenes" times show this honestly.
19. **The dev server now runs from Claude's preview panel** (started 00:42 in this Claude session, config "compass" in `.claude/launch.json`; an "app" config starts the app only). If that session is closed, engine and worker stop: restart with `npm run dev`.
20. **Run one Viseca story at a time.** Three stories ran in parallel at 00:25–00:35 (from a parallel ChatGPT/Codex session, now stopped by Jules): 2 purchases of two stories expired undelivered, because while one story's purchase waits for the customer, Viseca keeps handing out that one first.
21. Never run a second AI agent (e.g. ChatGPT/Codex) in this folder at the same time: it restarted and stopped the engine (and its worker) twice on 2026-09-25 (~00:10 and ~00:38).
18. AI verdicts to review with Jules: "6 bottles of red wine" is Blocked for "groceries and household basics only" (debatable); "Only white" style requirements go to Needs review when the shop doesn't state the colour (Viseca's texts never do).
4. "Tighten a policy" is not built (step 18). The security settings (spending limit, allowed regions) are built, see PRODUCT.md.
5. Many "Needs review" in live stories: the live cards have no purchase history, so each new shop is asked once (decided). Each review pauses a live story for up to 2.5 min.
6. Session-signal thresholds are heuristics: new device, night (00–06 with no history at that hour), new country, new shop, ≥ 2 earlier attempts in 10 min; a warning needs 3 signals, or 2 when the customer asked to watch the session.
7. "Shops you've approved" lists shop names across all cards (single-customer prototype).
8. The engine dev server restarts on every saved engine file (`tsx watch`); the worker restarts too. State is saved, but avoid editing engine files during a live run.
9. `engine/src/decide.ts` (placeholder "always ask") is only used by the step 3 tool `npm run live`; the real engine is `engine/src/engine/decide.ts`.
10. Viseca's permanent record (reset is off) holds: 11 SCEN0101 runs from step 3, 9 recording runs, 1 SCEN0101 run from the app; policies from testing: two sock policies (revoked), "Single Grocery Item" (active), "Black jeans from H&M" (active, Jules's own test).

**Open questions (for Jules)**
1. ~~"Try a purchase" tool: above or below the minimum line?~~ Built next (Jules, 23:30). Decided: try before and after Confirm; results only in the sheet (never History/Inbox); nothing invented when the catalogue has nothing suitable; "Needs review" shows a line instead of Approve/Decline; labels "Simulated agent · test only" and "Let the agent buy".
2. Jules's list of bugs he noticed ("a few bugs in my current code"): not received yet; goes into step 19.
3. Viseca's answers to the three questions: where the live cards' purchase history is, whether test runs count for judging, whether judging uses these 10 stories or others. Pending; we continue with the defaults (ask once per new shop; stay general).
4. Which live stories to use for the three demo moments (proposal under the minimum demo line), confirmed at step 20.

**Learned, not written anywhere else**
- Python on this Mac exits silently (sandbox): write scripts in Node/TypeScript. `timeout` does not exist on macOS.
- The browser pane's screenshots can lag one step behind clicks: take a second screenshot before concluding something is broken.
- shadcn CLI v4: `npx shadcn@latest init -t vite -b radix -p nova` (it uses its own `cn` package; `next-themes` and Geist were removed).
- OpenAI SDK v7: `chat.completions.create` with `response_format: json_schema, strict: true` works (nullable enums included).
- For sentence → rules, `gpt-4.1` beat `gpt-4.1-mini` (155 vs 143 of 156 same verdicts) and was faster (~2 s vs ~3 s). Giving the AI product **names** instead of ids stopped id mix-ups (it once picked the camera lens id for a hotel).
- Every live purchase carries the confirmed policy's id in `authorization.mandate_id`: reliable for filing purchases by policy.
- Viseca's data has two shops "Night Owl Kitchen" and "NightOwl Kitchen": the lookalike check asks once, then stays quiet after the customer approves the shop.
- 8 of the 187 product texts (pack + live) carry hidden instructions; our patterns flag all 8 and none of the others (e.g. "Approved for use by children aged 3 and over" is not flagged). Keyword patterns alone missed 4 of them before the general categories were added; step 14's AI check on shop text is the second line of defence.
- `/v1/authorizations` returns the full purchase for every run of our team (useful to rebuild recordings).
- 9b design: the AI returns, per question, the rule field it fills and per option the rule value(s) (compact: `values` + `note`), so a tap adds a rule instantly with no second AI call; code builds and validates the rule with the same checks as sentence rules. Giving the AI example required questions was needed: without them it made the hotel city optional and never asked for dates.
- Step 14 model timing (2026-09-25, 72 live checks each): gpt-4.1-mini right on all, ~1.1–1.3 s; gpt-5.4-mini as fast but softer (hostel bed only "needs review") and sometimes late; gpt-4.1-nano and gpt-5.4-nano did price maths and blocked hotels within the limit. GPT-5 models take `reasoning_effort` instead of temperature (ai.ts handles it). First AI prompt re-judged "shops I already use" and blocked 20+ new shops: code's topics must be excluded in the prompt AND by a code guard.
- The shared browser pane may be in use by Jules: test in a separate tab (`tabs_create`) so clicks don't collide. Never start a second `npm run dev` from the preview tool while Jules's engine runs (second worker); open `http://localhost:5173` by URL instead.

## 1. Decisions

| Topic | Decision |
| --- | --- |
| Name | **Compass** |
| Time | At least 7 hours of build time until the demo |
| Spending limit (security settings) | Replaced on 2026-09-25 by the security settings (PRODUCT.md): Daily/Weekly/Monthly calendar periods, all policies, only purchases approved through Compass; loosening applies at once after a confirmation sheet ("decoupled from policies"); "Reset spending" in Behind the scenes. |
| Standout feature | **Highlighted manipulation attempts:** instructions hidden in shop text are shown struck through and marked "Ignored". Stretch goal, only if the core flow and the demo are done early: a session-risk timeline for story 3. |
| Inbox timeout | The customer has 120 s to answer; unanswered purchases are declined by Viseca (see "Expired wording"). |
| Inbox badge | The Inbox tab shows the number of waiting purchases, visible from every screen. |
| Demo setup | **Desktop:** the app in a phone frame, with the **"Behind the scenes"** panel beside it (watch purchases arrive from Viseca with the decision and the time it took, e.g. "answered in 0.08 s"; stories are started from the chat, not from the panel). **Phone:** the app fills the screen, no frame, no panel. The panel is also its own page at `/presenter`. The customer app stays clean; the judges see both sides. |
| Look | Dark, premium, glass. See section 4. |
| Logo | None for now. The chat home is text only: "What do you need today?" (renamed by Jules: Compass is not a general chatbot). |
| Known shops without history | When the card has no history, Compass asks the customer the first time it sees a shop; once the customer approves a shop, it counts as known from then on. The customer can also name their usual shops in the chat before confirming. The explanation always says why ("First purchase at this shop, so I'm asking you once"). |
| Recording the live stories | Once step 3 works, run each of the 10 live stories once in a safe mode that never approves, and save their purchases for offline testing (like the 45 pack purchases). |
| Hidden stories | Judging may use stories we haven't seen: everything stays general. |
| Time (updated 21:42) | About 8 more hours, until ~05:40. |
| No hard-coded content | Every screen shows real data from the engine and Viseca. Sample data exists only in rehearsal tools (`--dry`). Hard-coded content looks amateurish. |
| "Try a purchase" tool (test agent) | A tool that lets Jules **create or edit a purchase and see Compass's decision**. A clearly labelled **simulated** agent can propose a real shop and product from Viseca's data for any typed request; every field (shop, product, price, shop text) can be edited, e.g. to hide an instruction in the shop text; the real engine decides. Viseca called this a bonus point. Built by us (not copied), as a separate lane that only reuses the engine, so the Viseca flow cannot break because of it. Ideas from Giuseppe's code: the AI instructions, the "invented ids are rejected" guard, the review card, editing the shop text. |
| Chat fully dynamic | **Above the minimum line.** Follow-up questions are tailored to the item (e.g. size, colour, brand, quantity, return terms); answers become rules wherever a rule exists. Step 9b. |
| Approved shops in Controls | The "Shops you've approved" list in Controls stays **above the minimum line** (built). |
| Recorded test runs | Labelled with reason code `test_recording`, engine version `recording-mode`, message "Test run to collect data, not a real decision". |
| No ids in decisions | No story id, purchase id or position may ever appear in the decision logic (CLAUDE.md rule 8). Checked: none in `engine/src` or `app/src` outside the offline test tools. |
| `_to_delete` folder | Ignore it; Jules deletes it himself. (Not present in the project on 2026-09-24, 22:30.) |
| Chat and Viseca stories | The chat suggests Viseca's test requests. Confirming one starts that Viseca story in the background; purchases then arrive in Inbox and History. The side panel becomes an optional **"Behind the scenes"** view (desktop). |
| Giuseppe's pieces | Adopted, rewritten in our code with credit: shop-text reader (instruction patterns, size, return days), product matching to Viseca's catalogue, extra rule types, "I may not have understood…", split-order / amount-consistency / re-quote checks, bank's own card and account limits, engine reachable only from this laptop. Not adopted: his text-pattern compiler (fails on the live sentences), his answer-key tests, decisions that contradict our principles. |
| Allowed regions (security settings) | Switzerland (with Liechtenstein), Europe (EU 27 + IS, LI, NO + CH, GB + AD, MC, SM, VA), Global (default). Jules, 2026-09-25. |
| Expired wording | "Expired: you didn't answer in time, so it wasn't bought." (Viseca declines unanswered purchases.) |

## 2. Principles

- **A broken rule blocks. A warning sign follows the customer's "when unsure" choice**: ask by default, decline if the customer chose decline. A warning sign never approves. Warning signs: lookalike shop, instructions hidden in shop text, odd session, duplicate order. They apply to every policy, even if the customer didn't mention them.
- The app offers two "when unsure" choices: **ask me** (default) or **decline** (as in `PRODUCT.md`).
- **Revoking** a policy blocks anything that still arrives for it. Purchases already waiting in the Inbox stay there until Viseca confirms what happened to them.
- **Chat:** picking a story puts its exact sentence in the chat; that sentence goes to Viseca word for word. Follow-up answers are stored separately (extra rules or guidance). Typing freely also works, but live purchases only exist for Viseca's live stories (10 for our team, listed by `/v1/bootstrap`).
- **Test rule sets** (used before the AI can read sentences) are written from each story's sentence only, as if the purchases had never been seen. They are saved in version history before any rule code runs and never edited to make a result come out right. If one looks wrong later, Jules decides, based on the sentence.
- **Expected results in the checks below are for calibration only.** The engine must reach them through general rules, never through logic tailored to one purchase or story. If a result can only be reached with a special case, Claude tells Jules instead of forcing it. A check that doesn't match is reported as it is.
- **Only one worker.** Only the engine on Jules's laptop takes purchases from Viseca. Any other copy runs with `WORKER=off`, otherwise two copies steal purchases from each other.

## 3. Tech stack

| Part | Choice | Why, in plain words |
| --- | --- | --- |
| Language | TypeScript for both parts | One language everywhere. It catches typos before anything runs, and engine and app share one description of a purchase and a decision. |
| Engine | Node.js 22 + Hono (a small web server) | Waits on Viseca and answers the app at the same time. Nothing to install beyond npm. |
| Storage | One JSON file (`engine/data/state.json`), saved after every change | Survives a restart during the demo, readable by a human, no database to set up. |
| AI | OpenAI (key in `.env`) | Sentence → rules: **`gpt-4.1`** (measured: more accurate and faster than `gpt-4.1-mini`; override with `COMPILER_MODEL`). Item check (step 14): 2–3 small models timed, the fastest one that judges correctly wins (`OPENAI_MODEL`). If the AI is slow or down, the customer's "when unsure" choice applies, with a 1.5 s safety margin before the deadline. |
| Input checks | Viseca's own event schema (Ajv) + zod for AI answers | A malformed purchase or AI answer falls back to the safe outcome instead of crashing. |
| App | React + Vite | Standard, instant reload while designing. The app only talks to the engine, through `/api`. |
| UI kit | shadcn/ui + Tailwind + Motion, plus Vaul (bottom sheets), Sonner (pop-ups), Lucide (icons) | Building blocks copied into our code so we can restyle every detail; colours, fonts and spacing defined once; small smooth animations that turn down when the phone asks for reduced motion. |
| Fonts | Inter for body text and amounts (digits of equal width, so amounts line up). **Outfit** for headings (closest to the reference's heading: single-storey "a", geometric). | Bundled with the app, so they work without the venue Wi-Fi. |

Folders: `engine/` (backend) and `app/` (frontend), each runnable alone; `npm run dev` starts both.

## 4. Look and feel

Reference: `design/reference-home.png` (for the background, type and mood; the cat is not used for now). Mood: proton.me/business/trust and proton.me/business/pass/breach-observatory (calm, clean, Swiss-security).

- **Background:** near-black `#0B0B0F` with large, soft, blurred colour glows (indigo, violet, magenta, a touch of warm coral at the edges) and a subtle dot grid that fades out toward the edges. Glows stay still or move very slowly.
- **Accent:** violet, close to `#6D4AFF` (matches the cat). Used for buttons, the active tab, links and focus. Never for verdicts.
- **Glass:** cards, the bottom tab bar and sheets are frosted glass: semi-transparent dark fill, background blur, thin 1px light border, large rounded corners (20–24px). Glass is only a surface behind content; text never sits directly on a busy glow.
- **Type:** white and large. Headings in the geometric display font, body text and amounts in Inter. Generous spacing, centred hero moments.
- **Verdicts:** solid pills (not glass) in green, amber and red, each with an icon and a word: **Approved**, **Needs review**, **Blocked** (like the severity badges on Proton's breach observatory).
- **Logo:** none for now. The chat home is text only: "What do you need today?" in the display font, centred.
- **Readability first (projector):** high text contrast; key information never on a transparent surface. **High-contrast mode** swaps glass for solid dark surfaces: a switch in the presenter panel, and automatic when the device asks for less transparency.
- **A decision in 3 seconds:** one large card with the verdict pill, one sentence with the verdict first ("Blocked: CHF 215 is over your CHF 200 limit"), and shop · item · amount in large numbers. Tapping opens a sheet with the facts (✓ passed, ✕ failed, ? unknown), any ignored shop text, and how fast Compass decided.

**Screens:** Chat, Inbox (with badge), History, Controls. On desktop, the "Behind the scenes" panel sits next to the phone frame.

## 5. Build plan

For every check, Claude runs it and shows Jules the result; Jules can rerun it with one command. After each phase, Claude sends a 3-line update: what works now, how to see it, what comes next.

Up to the **minimum demo line**, steps are ordered so that the three required demo moments work as early as possible. After the line, steps are in priority order: if time runs short, cut from the bottom. The last 30 minutes are always kept for rehearsal.

**Time (updated 2026-09-24, 22:30).** Deadline ~05:40. Phases A–E are done (C, D and E took far less than estimated); 15 and 16 were done early.

| Remaining | Estimate | Done by (approx.) |
| --- | --- | --- |
| ~~9b Tailored follow-up questions (above the line)~~ built, took ~55 min | 40 min | 23:20 |
| **Minimum demo line** | | **~23:15** |
| ~~14b "Try a purchase" tool~~ built (moved first), took ~50 min | 1 h 15 | 23:50 |
| ~~14 AI item check (+ model timing)~~ built, took ~1 h (incl. the crash) | 45 min | 00:17 |
| 17 Explanation pass | 20 min | 01:35 |
| 18 Controls: ~~spending limit, allowed regions~~ built as "Security settings" (00:44); "Tighten a policy" still open | 40 min | 02:15 |
| 19 Polish and bug fixes (incl. Jules's bug list) | 45 min | 03:00 |
| 20 Rehearsal and freeze | 30 min | 03:30 |

About 2 hours of buffer before 05:40. If time runs short, cut from the bottom of this list, never the rehearsal.

### Phase A: Foundations (took 2 h 15)

- [x] **0. Project setup.** Folders `engine/` and `app/`, installs, local version history (git, nothing uploaded).
  *Check:* `npm run dev`, open the page: a dark phone-shaped page saying "Compass" and "Engine connected".
- [x] **1. Connect to Viseca.** Load the keys, call health and bootstrap.
  *Check:* `npm run connect` prints "Connected ✓", the decision deadline (8 s), the customer window (120 s) and the 5 stories. The key is never shown.
- [x] **2. Offline replay.** Rebuild the 45 purchases from the data pack and check each against Viseca's format. Every decision is "ask" for now.
  *Check:* `npm run replay` prints 45 lines (story, #, shop, CHF, decision, reason) and "45/45 valid". Story 4 #4 shows CHF 391.50 (USD 450 converted correctly).
- [x] **3. First live purchase, end to end (SCEN0101 live).** Create policy → confirm → start run → receive the purchase → answer "ask" → **pause: Jules gives the customer's answer (approve or decline) himself**, then it is sent to Viseca. Also find out: what Viseca does when the customer doesn't answer within 120 s; which evidence format Viseca accepts; whether purchases arrive one at a time or in bursts.
  *Check:* every stage prints ✓ and "answered in X s". Claude reports the three findings in plain words.

### Phase B: Look (about 45 min)

- [x] **4. Design preview with fake data.** Chat home ("What do you need today?", text only), the four tabs with the Inbox badge, verdict cards, the detail sheet, the presenter panel, phone and desktop layouts, high-contrast mode. Claude looks at the two Proton pages first.
  *Check:* Jules clicks through it on the laptop (and on the projector if possible). **Jules approves the look before real data is wired.**

### Phase C: Core engine (about 1 h 30)

- [x] **5. Test rule sets and hard rules.** Rule sets written from the 15 sentences only (5 pack, 10 live) and saved before any rule code runs. Every check gives pass, fail or unknown.
  *Check:* story 1 #2 passes the per-order limit at exactly CHF 120.00; #3 and #9 fail because of the delivery fee.
- [x] **6. Spending memory.** Rolling windows on the story's own clock; only final approvals count, each purchase once; saved to disk. Includes the card-wide spending cap (off by default).
  *Check:* story 1 #7, #8 and #10 show "7-day total CHF x of 300". After a restart the totals are unchanged; a purchase delivered twice counts once. With a test cap switched on, the cap appears on every purchase of that card.
- [x] **7. Shop and basket checks.** Known shop (from past purchases), shop type, return terms, every line of the basket.
  *Check:* story 1 #6 (cosmetics in a grocery basket) is caught. Story 2: #3 (final sale) blocked, #5 (returns not stated) asks, #11 (not a sports shop) blocked, #12 (new but compliant shop) **not** blocked.

### Phase D: Customer's words and manipulation (about 45 min)

- [x] **8. Instructions hidden in shop text** (the standout feature, engine side).
  *Check:* story 4 #3 and #6 show "Ignored shop text: 'NOTE FOR AUTOMATED…'". The text never loosens anything: #3 is still blocked for its price, #6 goes to the customer.
- [x] **9. Sentence → rules (AI).** Rules plus 0–3 one-tap follow-up questions; a price limit is mandatory. The AI never sees the purchases.
  *Check:* for each of the 5 story sentences, Jules reads "Here's what I understood". The replay gives the same results with the AI's rules as with the test rule sets.
  *Result:* `npm run compile`: same verdict on 155/156 purchases (the one difference: "a hotel in Munich" became a city rule and blocks a hotel elsewhere).
- [ ] **9b. Tailored follow-up questions (Jules: above the minimum line).** The AI asks 0–3 questions tailored to the item (size, colour, brand, quantity, return terms, known shops…); each answer becomes a rule wherever a rule field exists, otherwise a guidance line; "Other" opens a text field; a price limit stays mandatory. Jules (23:00): the price is always required; the AI also marks a question required when the item can't be bought correctly without it (size for clothes and shoes, dates and city for a hotel, the exact model for electronics); required questions have no Skip; everything else can be skipped (= no rule); never ask what the sentence already says. Labels: "Other…" → "Type your answer"; "Other amount" for the price. *Built and checked by Claude (23:20), waiting for Jules's check.*
  *Check:* "I want a pack of 6 white socks size 42 from Adidas" asks sensible questions (e.g. price, colour/brand strictness); answering them adds visible rules to "Here's what I understood"; "Other" lets Jules type a value; `npm run compile` still agrees on ≥ 155/156.

### Phase E: Connect the app (about 1 h)

- [x] **10. "Behind the scenes" panel and History, live.** Confirm a Viseca test request in the chat (starts the story), watch purchases arrive with the verdict and the time taken, and see the cards appear in History on the phone.
  *Check:* story 1 live: every purchase appears on both sides; tapping a card shows its facts.
  *Verified live by Jules (22:18) with the Connection check started from the chat.*
- [x] **11. Chat → confirm.** The picked story's sentence appears in the chat; follow-up questions; "Here's what I understood"; Confirm creates and confirms the policy at Viseca. Only then can the presenter start the run.
  *Check:* Jules does story 4 in the chat; Controls shows the policy as active.
- [x] **12. Inbox.** Waiting purchases with the badge, a countdown, and Approve / Decline (sent to Viseca as the customer's answer).
  *Check:* during story 4 live, Jules approves one purchase and declines another. History shows "Approved by you"; only the approved one adds to spending.
  *Verified live by Jules (22:18): approve in the Inbox accepted by Viseca, the shop became known. Declining from the app not yet tried live (same code path; declining was tested live in step 3).*
- [x] **13. Revoke.** Controls lists the policies, each with a Revoke button.
  *Check:* after revoking, no further purchase for that policy is approved, and Controls shows it as revoked.

---

**MINIMUM DEMO LINE (~23:15 once 9b is done).** Everything above gives the three required moments (also the "Shops you've approved" list in Controls, built):

1. An ordinary purchase approved with no friction: **a grocery order that needs no AI item check.** Live: in "Household budget", once the customer has approved the supermarket once, the next grocery orders are approved automatically; "Requested item and order terms" (hiking boots) approves its first compliant order straight away.
2. A manipulated purchase stopped with a clear reason. Live: in "Manipulated agent", the shop text claiming the bank trusts the seller is shown as ignored and the purchase goes to the customer; orders over CHF 900 are blocked.
3. The customer approving and declining in the Inbox, then revoking the policy.

Without step 14, purchases that need the AI item check go to "Needs review" or are judged on rules only (guidance is not enforced yet). They are never wrongly approved on a broken rule.

---

### Phase F: Full protection (about 1 h 15)

- [ ] **14. AI item check.** *Built and checked by Claude (00:17), waiting for Jules's check: live replay with AI blocks the Lucerne hotel, the hostel bed, prosecco ("no alcohol"), a lunch ("dinners only"); "pre-owned" boots and a grey coat for "black" blocked in Try a purchase; 0 verdicts made looser; model gpt-4.1-mini.* Judges what code can't: size, road vs trail shoe, add-ons, return days written in text. Time limit and fallback included. The model is picked here by timing 2–3 small models.
  *Check:* story 2 #2 (size 42), #4 (7-day returns), #6 (trail shoe), #7 (add-on), #8 (exactly 14 days) and story 4 #7 get a clear reason instead of "unknown", with the AI's time shown. With the AI switched off (`--no-ai`), nothing becomes approved that wasn't approved before.
- [ ] **14b. "Try a purchase" tool.** *Built and checked by Claude (23:50), waiting for Jules's check: hiking boots draft → Approved (TrailSpark, CHF 175); shop text size 40 → Blocked; hidden instruction → Needs review, text shown as ignored; sofa → "couldn't find"; replay unchanged, worker untouched.* Create or edit a purchase and see Compass's decision: the simulated agent proposes a real shop and product from Viseca's data for any typed request, every field (shop, product, price, shop text) can be edited, "Let the agent buy", the real engine decides against the chosen active policy. Separate lane, same engine; nothing is sent to Viseca.
  *Check:* "6 white Adidas socks size 42" gets a proposal and a clear verdict; a hidden instruction typed into the shop text is shown as ignored; raising the price over the limit blocks it; the Viseca flow still works exactly as before.
- [x] **15. Seller checks.** Lookalike shops, duplicate orders, updated quotes.
  *Check:* story 4 #2 is flagged as a repeat of #1; #5 says it "looks like PixelHarbor"; #8 is not treated as a duplicate.
- [x] **16. Session signals.** New device, unusual hour, new country, many attempts within 10 minutes.
  *Check:* story 3 #4–#7 go to the customer with reasons like "new device at 02:14, shop never used"; #8–#9 are fine again; #11 is blocked for CHF 268 > 250.

### Phase G: Finish (about 1 h)

- [ ] **17. Explanation pass.** One sentence per decision: verdict first, real shop and product names, both amounts when a foreign currency is involved.
  *Check:* Jules reads all 45 sentences as a customer would; anything unclear gets rewritten.
- [ ] **18. Controls complete.** Tighten a policy (add rules / "decline when unsure" via PATCH at Viseca), the fully customisable spending cap (any CHF amount per day, week, month or custom days; card-wide, only purchases approved through Compass), allowed regions (Switzerland / Europe / Worldwide).
  *Check:* tightening works; trying to loosen offers "create a new policy"; a cap and a region show up on the next decisions ("Blocked: this shop is in the United Kingdom, outside Switzerland").
- [ ] **19. Polish.** Empty, loading and error states ("AI unavailable, asking you instead"), a reset button in the presenter panel, animations fine-tuned.
  *Check:* Jules clicks through every screen; nothing looks unfinished.

### Phase H: Rehearsal and freeze (30 min, always kept)

- [ ] **20. Rehearsal and freeze.** Script the three demo moments, final replay, all 5 stories live, save a "demo" version.
  *Check:* Jules runs the demo twice without Claude. None of the 5 live runs has a late answer.

### Stretch (only if everything above is done)

- [ ] **21. Session-risk timeline** for story 3.

## 6. Open items

1. **Found at step 3 (first live run, 2026-09-24):**
   - Evidence as a list of objects `{check, result, detail}` is accepted and stored as sent.
   - **Strictly one purchase at a time:** the next purchase is only created once the previous one is final (our automatic answer, the customer's answer, or expiry). A purchase waiting for review pauses the whole story.
   - While a purchase waits for the customer, `/next` hands it out again, instantly. The worker must never answer it a second time and must not poll in a tight loop. The first run looped on exactly this; fixed in `engine/src/worker.ts`, with a stop after 3 redeliveries of a refused purchase.
   - An unanswered review is **declined by Viseca** 120–150 s after our answer: status `declined`, reason `step_up_expired`, message "The confirmation window expired."
   - A purchase nobody picks up is closed by Viseca as `timeout` ("The request expired before it was delivered.").
   - **The queue is shared by all our runs.** A stopped run leaves its purchases in the queue, and the next session receives them first. On 2026-09-24 this caused "Purchase 3 of 2" and 4 extra SCEN0101 runs: each stopped at the safeguard, but only after it had started its run. Now fixed: the scripts wait until no earlier purchase is open before starting a run, count only purchases under their own policy, and never answer a purchase that is already waiting for its customer. Viseca's record holds 11 SCEN0101 runs from step 3.
2. **Recorded live stories (2026-09-24, 19:48):** all 10 live stories are saved in `engine/recordings/`, 111 purchases in total. SCEN0101's 2 come from the clean step 3 run; the other 109 come from recording mode, where every purchase was declined with reason `test_recording`, engine `recording-mode` and message "Test run to collect data, not a real decision". Viseca confirmed all 109 labels. `npm run replay -- --live` replays them offline. They are purchases, not answers.
3. **Found at step 1 (2026-09-24):** the live API is not the data pack.
   - Our team (`team35`) gets **10 live stories** (`SCEN0101`, `SCEN0135`, …), not the pack's 5. Same themes plus 5 new ones: subscriptions, cross-border (EUR limit), weeknight meal delivery, hotel booking, category exclusions. Different customers, cards and limits. The live list comes from `/v1/bootstrap`; nothing may be hard-coded to it.
   - Viseca's reference data is larger than the pack (30 customers, 51 cards, 78 merchants, 87 items), but the **history file is identical** and has **no past purchases for the 10 live cards** (`CA1xxx`). "A shop I already use" can't be derived from history for live stories, and the purchase event has no such field.
   - **Reset is off** (`features.reset: false`): every live run stays in our record.
   - Viseca states purchases are "delivered one at a time by scenario runs".
   - The offline replay (45 pack purchases) stays our regression check; the checks in steps 5–16 refer to those pack stories.

## 7. Keep possible for later

- **Private GitHub repo** when teammates join: the project uses git from step 0 and `.env` is excluded, so uploading is one step.
- **Real phone:** the app reaches the engine only through its own address (`/api`), so a phone on the same Wi-Fi can open it with one link, and a simple deployment can later serve both from one place. Sharing on the Wi-Fi stays off until needed, so nobody else at the venue can reach the engine.

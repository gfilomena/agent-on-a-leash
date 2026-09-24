# Compass: build plan

Approved by Jules on 2026-09-24. Tick a step's box once Jules has seen its check pass.

## 1. Decisions

| Topic | Decision |
| --- | --- |
| Name | **Compass** |
| Time | At least 7 hours of build time until the demo |
| Spending cap | One setting in Controls, **off by default**. Counts all approved agent spending on the card, across all policies (not per policy), but only purchases approved through Compass (by the engine or the customer), not the older history file. Lowering it is always allowed; raising it means creating a new policy. Test runs replay the same days, so the demo reset clears it. |
| Standout feature | **Highlighted manipulation attempts:** instructions hidden in shop text are shown struck through and marked "Ignored". Stretch goal, only if the core flow and the demo are done early: a session-risk timeline for story 3. |
| Inbox timeout | The customer has 120 s to answer; unanswered purchases are declined by Viseca (see "Expired wording"). |
| Inbox badge | The Inbox tab shows the number of waiting purchases, visible from every screen. |
| Demo setup | **Desktop:** the app in a phone frame, with a presenter panel beside it (pick a test story, start a live run, watch purchases arrive from Viseca with the decision and the time it took, e.g. "Approved in 0.4 s"). **Phone:** the app fills the screen, no frame, no panel. The presenter panel is also its own page at `/presenter`. The customer app stays clean; the judges see both sides. |
| Look | Dark, premium, glass. See section 4. |
| Logo | None for now. The chat home is text only: "What do you need today?" (renamed by Jules: Compass is not a general chatbot). |
| Known shops without history | When the card has no history, Compass asks the customer the first time it sees a shop; once the customer approves a shop, it counts as known from then on. The customer can also name their usual shops in the chat before confirming. The explanation always says why ("First purchase at this shop, so I'm asking you once"). |
| Recording the live stories | Once step 3 works, run each of the 10 live stories once in a safe mode that never approves, and save their purchases for offline testing (like the 45 pack purchases). |
| Hidden stories | Judging may use stories we haven't seen: everything stays general. |
| Time (updated 21:42) | About 8 more hours, until ~05:40. |
| No hard-coded content | Every screen shows real data from the engine and Viseca. Sample data exists only in rehearsal tools (`--dry`). Hard-coded content looks amateurish. |
| Test agent ("try it yourself") | A clearly labelled **simulated** shopping agent: for any typed request it proposes a real shop and product from Viseca's data, and the real engine decides. Viseca called this a bonus point. Built by us (not copied), as a separate lane that only reuses the engine, so the Viseca flow cannot break because of it. Ideas from Giuseppe's code: the AI instructions, the "invented ids are rejected" guard, the review card, editing the shop text to try to trick Compass. |
| Chat and Viseca stories | The chat suggests Viseca's test requests. Confirming one starts that Viseca story in the background; purchases then arrive in Inbox and History. The side panel becomes an optional **"Behind the scenes"** view (desktop). |
| Giuseppe's pieces | Adopted, rewritten in our code with credit: shop-text reader (instruction patterns, size, return days), product matching to Viseca's catalogue, extra rule types, "I may not have understood…", split-order / amount-consistency / re-quote checks, bank's own card and account limits, engine reachable only from this laptop. Not adopted: his text-pattern compiler (fails on the live sentences), his answer-key tests, decisions that contradict our principles. |
| Spending cap and regions | Cap fully customisable (any CHF amount per day, week, month or custom days). Allowed regions: Switzerland only, Europe, Worldwide (default). Both card-wide, for every policy. Tightening applies at once; loosening only to policies confirmed afterwards. Built in step 18. |
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
| AI | OpenAI (key in `.env`) | Sentence → rules: start with `gpt-4.1-mini`; not on the 8-second path, so a larger model is allowed if quality needs it. Item check: 2–3 small models timed at step 14, the fastest one that judges correctly wins. If the AI is slow or down, the customer's "when unsure" choice applies, with a 1.5 s safety margin before the deadline. |
| Input checks | Viseca's own event schema (Ajv) + zod for AI answers | A malformed purchase or AI answer falls back to the safe outcome instead of crashing. |
| App | React + Vite | Standard, instant reload while designing. The app only talks to the engine, through `/api`. |
| UI kit | shadcn/ui + Tailwind + Motion, plus Vaul (bottom sheets), Sonner (pop-ups), Lucide (icons) | Building blocks copied into our code so we can restyle every detail; colours, fonts and spacing defined once; small smooth animations that turn down when the phone asks for reduced motion. |
| Fonts | Inter for body text and amounts (digits of equal width, so amounts line up). A geometric display font for headings, like the "How can I help?" in the reference (Sora or Outfit, picked in step 4). | Bundled with the app, so they work without the venue Wi-Fi. |

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

**Screens:** Chat, Inbox (with badge), History, Controls. On desktop, the presenter panel sits next to the phone frame.

## 5. Build plan

For every check, Claude runs it and shows Jules the result; Jules can rerun it with one command. After each phase, Claude sends a 3-line update: what works now, how to see it, what comes next.

Up to the **minimum demo line**, steps are ordered so that the three required demo moments work as early as possible. After the line, steps are in priority order: if time runs short, cut from the bottom. The last 30 minutes are always kept for rehearsal.

**Time (updated 2026-09-24, 21:45).** About 8 hours left (until ~05:40). Phases A and B are done.

| Phase | Estimate | Done by (approx.) |
| --- | --- | --- |
| A Foundations (0–3) + recording, B Look (4) | done | 21:45 |
| C Core engine (5–7) + Giuseppe pieces 1, 2, 3, 6 | 1 h 45 | 23:30 |
| D Shop text + sentence → rules (8–9) + pieces 4, 5 | 1 h | 00:30 |
| E Connect the app (10–13) + piece 7, all sample content replaced | 1 h 15 | 01:45 |
| **Minimum demo line** | | **~01:45** |
| F AI item check (14), test agent (14b), seller checks (15), session signals (16) | 2 h 25 | 04:10 |
| G Explanations (17), Controls with cap and regions (18), polish and bug fixes (19) | 1 h 20 | 05:30 |
| H Rehearsal and freeze (20) | 30 min | ~06:00 |

That is about 15 minutes over. If time runs short, cut from the bottom of phase G, never the rehearsal.

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

### Phase E: Connect the app (about 1 h)

- [ ] **10. Presenter panel and History, live.** Pick a story, start a live run, watch purchases arrive with the verdict and the time taken, and see the cards appear in History on the phone.
  *Check:* story 1 live: every purchase appears on both sides; tapping a card shows its facts.
- [ ] **11. Chat → confirm.** The picked story's sentence appears in the chat; follow-up questions; "Here's what I understood"; Confirm creates and confirms the policy at Viseca. Only then can the presenter start the run.
  *Check:* Jules does story 4 in the chat; Controls shows the policy as active.
- [ ] **12. Inbox.** Waiting purchases with the badge, a countdown, and Approve / Decline (sent to Viseca as the customer's answer).
  *Check:* during story 4 live, Jules approves one purchase and declines another. History shows "Approved by you"; only the approved one adds to spending.
- [ ] **13. Revoke.** Controls lists the policies, each with a Revoke button.
  *Check:* after revoking, no further purchase for that policy is approved, and Controls shows it as revoked.

---

**MINIMUM DEMO LINE (about 6 h 15 in, ~23:50).** Everything above gives the three required moments:

1. An ordinary purchase approved with no friction: **a grocery order from story 1, which needs no AI item check.**
2. A manipulated purchase stopped with a clear reason (story 4 #3: blocked for its price, the hidden instruction shown as ignored).
3. The customer approving and declining in the Inbox, then revoking the policy.

Without step 14, purchases that need the AI item check go to "Needs review". That is slower for the customer, but they are never wrongly approved. If no story 1 grocery order gets approved without the AI item check, Claude tells Jules (no special case).

---

### Phase F: Full protection (about 1 h 15)

- [ ] **14. AI item check.** Judges what code can't: size, road vs trail shoe, add-ons, return days written in text. Time limit and fallback included. The model is picked here by timing 2–3 small models.
  *Check:* story 2 #2 (size 42), #4 (7-day returns), #6 (trail shoe), #7 (add-on), #8 (exactly 14 days) and story 4 #7 get a clear reason instead of "unknown", with the AI's time shown. With the AI switched off (`--no-ai`), nothing becomes approved that wasn't approved before.
- [ ] **14b. Test agent ("try it yourself").** Type any request; the simulated agent proposes a real shop and product from Viseca's data (you can edit the shop text to try to trick Compass); "Let the agent buy"; the real engine decides. Separate lane, same engine.
  *Check:* "6 white Adidas socks size 42" gets a proposal and a clear verdict; a hidden instruction typed into the shop text is shown as ignored; the Viseca flow still works exactly as before.
- [x] **15. Seller checks.** Lookalike shops, duplicate orders, updated quotes.
  *Check:* story 4 #2 is flagged as a repeat of #1; #5 says it "looks like PixelHarbor"; #8 is not treated as a duplicate.
- [x] **16. Session signals.** New device, unusual hour, new country, many attempts within 10 minutes.
  *Check:* story 3 #4–#7 go to the customer with reasons like "new device at 02:14, shop never used"; #8–#9 are fine again; #11 is blocked for CHF 268 > 250.

### Phase G: Finish (about 1 h)

- [ ] **17. Explanation pass.** One sentence per decision: verdict first, real shop and product names, both amounts when a foreign currency is involved.
  *Check:* Jules reads all 45 sentences as a customer would; anything unclear gets rewritten.
- [ ] **18. Controls complete.** Tighten a policy, set the spending cap.
  *Check:* tightening works; trying to loosen offers "create a new policy"; a cap shows up on the next decisions.
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

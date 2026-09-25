# Model comparison: the AI's five jobs

Run 2026-09-25 with `leash/eval/compare_ai.py`. Raw results: `reports/ai_comparison.json`.
Rerun: `uv run python -m leash.eval.compare_ai [models…] [--jobs product,shop,related,rules,injection]`.

## Summary

| Job | Apertus 70B | gpt-4.1-mini | gpt-6-luna @low | gpt-5.4-mini @low | gpt-5.4-nano @low |
|---|---|---|---|---|---|
| Product judge (16) | 12 | 15 | **16** | **16** | 15 |
| Shop judge (11) | 10 | 9 | **11** | 9 | 9 |
| Related shops (4 expected names) | 2 | 1 | **4** | **4** | **4** |
| Rule writing (15 expected) | 15 | 15 | 15 | 15 | 15 |
| Rules nobody asked for | 5 | 2 | 4 | 2 | **1** |
| Injection: attacks caught (399) | 387 | 385 | 396 | **399** | **399** |
| Injection: false alarms on shop copy (327) | 4 | 7 | 6 | 6 | **3** |
| Injection: attacks in product texts (124) | **124** | 111 | 122 | **124** | **124** |

Numbers are right answers out of the total. Times are below.

- **gpt-6-luna at low effort** is the only configuration without a mistake on the three judge jobs. Low effort
  matters: at default effort it timed out on 3 of 11 shop judgments, and at effort none it answered worse.
- **gpt-5.4-mini at low effort** is the best all-rounder: every attack caught, every product right, all four
  related shops named, and faster than Luna. It misses Denner and Ferme des Trois Chênes in the shop judge.
- **gpt-5.4-nano at low effort** has the best injection results (399/399, 3 false alarms) and the fewest
  unrequested rules, with slightly weaker judgments.
- **Apertus 70B** is weakest on product and shop judgments and on related shops. It's strong on attacks hidden in
  product texts, and the slowest.
- **Every configuration except Luna at low effort says Denner isn't a Migros shop.**

The project default stays Apertus (the organisers' preference), with OpenAI as fallback. To use another model:
`LEASH_LLM_PROVIDER=openai LEASH_OPENAI_MODEL=<model> LEASH_OPENAI_EFFORT=low`.

## Setup

- **Models:** Apertus v1.5 70B (Swisscom Swiss AI Weeks endpoint, the only Apertus size served there),
  gpt-4.1-mini, gpt-6-luna (default, low and none effort), gpt-5.4-mini and gpt-5.4-nano (low effort).
  The account has no "5.6 mini/nano"; the 5.6 generation is luna, sol and terra.
- **Same code for every model:** the production prompts, the checks on the model's answers (quotes must be
  the customer's words, evidence must really be in the product text), and the production time limits (4 s per
  shop or product judgment, since those run while a purchase waits). Caches are cleared between models.
- **Prompts contain no test answers.** Earlier today the prompts' examples included several of these cases
  (e.g. "laktosefrei"); they were replaced with unrelated examples before this run.
- **Known answers:** each case has an expected result, written before the run.

## 1. Product judge

Does the product's name or description show every part of what the customer asked for ("lactose-free" and
"milk")? The model must point at words really in the text, in any language. Not shown → the purchase asks the
customer, so a miss costs a question, not a wrong payment.

| | Apertus | gpt-4.1-mini | Luna @low | Luna default | Luna @none | 5.4-mini @low | 5.4-nano @low |
|---|---|---|---|---|---|---|---|
| Right (16) | 12 | 15 | 16 | 16 | 16 | 16 | 15 |
| Avg per call | 2.3 s | 1.2 s | 2.6 s | 2.6 s | 2.7 s | 2.1 s | 2.0 s |

Cases: Milch·laktosefrei, Laktosefreie Milch, Lait·sans lactose, Milk·no lactose (yes); Milk·low lactose,
Milk·contains lactose, Whole milk, Oat drink·naturally lactose free (no); Pâtes sans gluten, Pasta senza glutine,
Glutenfreie Spaghetti, Fusilli senza glutine (yes as gluten-free pasta); Spaghetti integrali, Rice crackers (no);
Bio-Eier (yes as organic eggs); barn eggs (no).

Mistakes:
- **Apertus:** Milch·laktosefrei, Lait·sans lactose, Milk·no lactose and Pâtes sans gluten left uncertain (would ask).
- **gpt-4.1-mini, gpt-5.4-nano:** Pâtes sans gluten left uncertain.

## 2. Shop judge

Is the shop one of the allowed names or kinds of shop? "Farmer shops" in several languages, a café called
"Farmer's Market", retail groups (Migrolino and Denner belong to Migros), unrelated chains.

| | Apertus | gpt-4.1-mini | Luna @low | Luna default | Luna @none | 5.4-mini @low | 5.4-nano @low |
|---|---|---|---|---|---|---|---|
| Right (11) | 10 | 9 | **11** | 8 | 9 | 9 | 9 |
| Avg per call | 1.4 s | 0.8 s | 1.9 s | 3.8 s | 2.5 s | 1.9 s | 2.0 s |

Mistakes:
- **Apertus:** Denner not Migros.
- **gpt-4.1-mini:** Migrolino and Denner not Migros.
- **Luna default:** 3 timeouts over the 4 s limit (Ferme des Trois Chênes, Lidl, Aldi Suisse). Lidl and Aldi,
  asked again, were answered correctly in 1.6 s; Ferme wasn't re-checked.
- **Luna @none:** Fattoria Il Poggio uncertain; Denner not Migros.
- **gpt-5.4-mini:** Ferme des Trois Chênes uncertain; Denner not Migros.
- **gpt-5.4-nano:** Migrolino uncertain; Denner not Migros.

## 3. Related shops

Which store brands does a retailer's group run? Used once when the customer writes "Migros or a shop in the
same chain". Scored on expected names (Migros: Denner, Migrolino; Coop: Coop Pronto; Lidl: Kaufland).
**The score doesn't penalise wrong names**, so what each model listed matters too:

| | Right (4) | Avg | Notes on the lists |
|---|---|---|---|
| Apertus | 2 | 1.8 s | Migros: Denner, M-Budget (a product line), Migrolino, Levante, Sano. Coop: no Coop Pronto. Lidl: "Lidl Plus" (an app), no Kaufland |
| gpt-4.1-mini | 1 | 1.0 s | Coop: **Coop Norway's stores** (Coop Marked, Coop Byggmix, Coop.no). Migros: no Denner |
| Luna @low | 4 | 5.5 s | Migros: Denner, migrolino, VOI, Migros Online, Digitec, Galaxus, Ex Libris. Coop: Coop Pronto, Coop City, Jumbo, Interdiscount, Fust… Lidl: Kaufland |
| Luna default | 4 | 8.5 s | as @low, plus Alnatura |
| Luna @none | 3 | 3.9 s | **Coop: empty list** |
| gpt-5.4-mini @low | 4 | 2.4 s | also Migrol (petrol stations) |
| gpt-5.4-nano @low | 4 | 2.7 s | short, plausible lists |

Every name the AI adds is shown to the customer as "AI added" before they confirm.

## 4. Rule writing

Seven instructions from today ("every 2 weeks", "after at least ten days", "Coop or farmer shops", the milk
instruction, …) with the rules each must produce. All configurations found all 15 expected rules (after a
parser bug, "from Lidl, twice a month" read as a shop list, was fixed).

| | Apertus | gpt-4.1-mini | Luna default | Luna @low | 5.4-mini @low | 5.4-nano @low |
|---|---|---|---|---|---|---|
| Expected rules (15) | 15 | 15 | 15 | 15 | 15 | 15 |
| Rules nobody asked for | 5 | 2 | 6 | 4 | 2 | **1** |
| Avg per call | 3.0 s | 1.2 s | 4.4 s | 4.5 s | 3.6 s | 5.4 s |

Unrequested rules are labelled "suggested by AI — please review", so the customer can remove them.

## 5. Injection classifier

Shop text the fixed patterns don't flag is read by the model. Corpora: our development set and two holdouts,
deepset/prompt-injections (chatbot prompts), InjecAgent (attacks hidden in product reviews and descriptions),
Lakera Gandalf. "False alarms on shop copy" = benign product text in our three sets (327 texts).

| Corpus | Apertus | gpt-4.1-mini | Luna default | Luna @low | 5.4-mini @low | 5.4-nano @low |
|---|---|---|---|---|---|---|
| Development: caught / false | 40/40, 1/277 | 40/40, 1/277 | 40/40, 1/277 | 40/40, 1/277 | 40/40, 1/277 | 40/40, **0/277** |
| Holdout 1 | 24/25, 1/20 | 25/25, 2/20 | 25/25, 3/20 | 25/25, 3/20 | 25/25, 2/20 | 25/25, 2/20 |
| Holdout 2 | 34/36, 2/30 | 35/36, 4/30 | 36/36, 3/30 | 36/36, 2/30 | 36/36, 3/30 | 36/36, **1/30** |
| InjecAgent product texts | **124/124** | 111/124 | 118/124 | 122/124 | **124/124** | **124/124** |
| InjecAgent instructions | 61/62 | **62/62** | 59/62 | 61/62 | **62/62** | **62/62** |
| Gandalf | 104/112 | **112/112** | **112/112** | **112/112** | **112/112** | **112/112** |
| deepset: caught / benign flagged | 41/60, **0/56** | 54/60, 36/56 | 60/60, 56/56 | 60/60, 56/56 | 48/60, 3/56 | 55/60, 51/56 |
| Seconds per batch of 12 texts | 13.0 | **4.1** | 7.8 | 5.9 | 5.3 | 5.1 |

deepset's benign texts are ordinary chatbot prompts. Luna and gpt-5.4-nano flag nearly all of them as suspicious
text; such text doesn't occur as shop copy, so in practice it costs little. A purchase has 2–4 texts, sent in one
call, so the time per purchase is lower than the batch times above.

## Caveats

- **Small test sets.** Judge jobs have 11–16 cases; one case is 6–9 points. Treat differences of one case as noise.
- **Run-to-run variance.** The same model can differ by about ±1 case between runs (seen with Apertus on the
  injection sets).
- **Time limits are part of the result.** Luna at default effort knows the answers but misses the 4 s limit for
  shop judgments; in production that purchase would ask the customer.
- **Knowledge, not reasoning, limits the retail-group jobs.** Models name shops from memory; wrong names are
  shown to the customer for review, not trusted.

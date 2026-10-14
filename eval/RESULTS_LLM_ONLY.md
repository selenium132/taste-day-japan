# LLM-only side: recorded results (2026-10-03). No comparison conclusion yet.

- Model: `gemini-3.5-flash` (Gemini API, temperature 0, JSON output), asked 2026-10-03 05:31 UTC (14:31 JST). Earlier tries with `gemini-2.5-flash` (no longer available to new keys) and `gemini-3.8-flash` (503 and quota errors) produced no complete set; only the complete 3.5 run is kept. Temperature 0 is not fully deterministic, so a rerun may differ.
- Travelers: `travelers.json` (T1 Tokyo, T2 Kyoto, T3 Tokyo). 15 stops in total.
- (a) Existence, by OpenStreetMap Nominatim (first result for "<name>, <city>, Japan", 1 request/second): 13 of 15 found. The 2 misses: T1 morning "Chatei Hatou" (also not found by its Japanese name; not confirmed) and T2 afternoon "Otagi Nenbutsu-ji" (found by its Japanese name 愛宕念仏寺, so it exists). T3 evening "Bar Music" matched a differently named bar ("+Music"); unconfirmed. So: **the LLM did not obviously invent places in these three runs; at most 2 of 15 are unconfirmed.** Nominatim only shows that something with a similar name exists in OSM, not that the description given is true (e.g. "Michelin-starred", the Tampopo omurice story were not checked).
- (b) Reason tied to the input: 15 of 15 reasons mention one of the traveler's artists, films or foods (or a property following from it). Scored by one reader (the author's AI assistant), sentences are in `eval_table.csv`. Some links are loose (a Radiohead fan and a design-book hub).
- (c) Needs the Qloo side. Not run.

Plain reading: on these inputs a current LLM gives real, input-linked answers. Whatever Qloo adds has to be shown on other grounds (affinity values, ranking beyond famous places, evidence for each stop), not on "LLMs invent places". Do not write a win into the submission before the Qloo side is run.

---
# Qloo side (run 2026-10-06, live Qloo hackathon API, mock planner): summary only

Same three travelers (`travelers.json`). **The raw Qloo output, the per-stop lookup file and the Qloo columns of the table are not in this repository**: Qloo's developer guide says not to store Qloo response data in a public repository, so they are kept locally (`local_only/eval/`, git-ignored) and this section gives counts and aggregates only. `verify_qloo.mjs` re-creates the lookup file from a local `qloo_results.json` (run the app live with your own key, save each `/api/plan` response). `eval_table.csv` holds the LLM-only side only.

- Stops returned: T1 Tokyo 5, T2 Kyoto 4 (no evening stop: too few distinct places), T3 Tokyo 5 = 14 stops.
- (a) Existence by OpenStreetMap name lookup: 9 of 14 found; where found, the OSM point is within 0.5 km of the coordinates Qloo returned (0 to 0.46 km). 5 not found by this method, not confirmed by hand. Every Qloo place carries coordinates and an address, so a place cannot be a free invention, but a missing OSM match is a missing match. LLM-only side: 13 of 15 found.
- (b) Reasons: all 14 are Qloo explainability scores mapped to the traveler's inputs, so every reason names an input by construction. They barely discriminate: within a traveler the same inputs appear in nearly the same order with scores of 0.23 to 0.41 for every stop. They show which of your favorites Qloo weighted for the place; they do not say why this place and not another.
- (c) Overlap with the LLM-only answers: 0 of 14 (by name, checked by reading). Qloo's picks lean to museums, galleries, university buildings and cafes; the LLM-only picks are the famous venues for the films and bands. Qloo's food slots are only loosely tied to the food asked for (a "ramen" query in Tokyo returned an Italian restaurant first).
- Plain reading: the Qloo-grounded agent gives different, less obvious places with coordinates and per-input scores. It is not better on existence (9/14 vs 13/15 by this lookup) and the food matching is loose. Whether the places suit the traveler better was not measured; no taste judgment by an independent reader was made. We do not claim a win.

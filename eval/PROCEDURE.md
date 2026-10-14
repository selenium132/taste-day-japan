# LLM-only vs Qloo-grounded: comparison procedure

Goal: test the claim "this agent outperforms a generic LLM-only approach" on the same travelers, and report the result whether it is a win, a tie or a loss.

Status: both sides are recorded (Qloo side 2026-10-06, see RESULTS_LLM_ONLY.md). No win is claimed.

## Travelers
`travelers.json`: three fixed travelers (T1 Tokyo, T2 Kyoto, T3 Tokyo). The same inputs go to both sides. Do not change them after seeing results.

## Side A: LLM only (done by `llm_only.mjs`)
- `node eval/llm_only.mjs [model]` asks a Gemini model for 5 stops (morning, lunch, afternoon, dinner, evening) with a one-sentence reason each. No Qloo, no tools, temperature 0, JSON output. The prompt template, model name and UTC time of each call are stored in `llm_only_results.json`.
- The key is read from a local file inside the process and is never printed or stored in the results.

## Side B: Qloo-grounded (run when the key has arrived)
- Run the app live (`node --env-file=.env dev-server.js`) or call `handlePlan` with the same three travelers. Save each response as `local_only/eval/qloo_results.json` (the `itinerary.stops` and `trace`). Record the date. Qloo's developer guide says not to store Qloo response data in a public repository, so this file stays local (git-ignored) and only counts go into `RESULTS_LLM_ONLY.md`.
- Use the same LLM provider setting you will name in the demo; write it down.

## Scoring (3 axes, same for both sides)
(a) **Does the place exist?** `node eval/verify_places.mjs` looks each named place up in OpenStreetMap Nominatim (`<name>, <city>, Japan`, first result, one request per second). A miss is "not found by this method"; open each miss by hand (map search) and write what you saw in the `notes` column. For Side B the places come from Qloo, so run the same script on them and report the same way (do not assume they exist).
(b) **Is each reason tied to the input?** For each stop, mark 1 if the reason names one of the traveler's inputs (artist, film or food) or a property that follows from it, 0 if it is generic ("a lovely area", "famous for its atmosphere"). For Side B a reason counts only if it comes from Qloo's explainability scores. Score by reading, and keep the sentence in the table so a reader can disagree.
(c) **Does Qloo change the ranking?** Side B only, after the key arrives: for each traveler, list the stops, and note which stops Side A also named (overlap) and which are new. Report counts only.

## Reporting rules
- Report all three travelers, including ones where the LLM-only answer is as good or better.
- State the model name, dates, and that scoring (b) is by one reader.
- If either side is missing when the submission is written, remove the comparison claim from the Devpost text instead of describing the missing side.
- The sample (replay) data in the demo is not Qloo output and must never be used as Side B.

## Files
- `travelers.json`: inputs. `llm_only.mjs`: Side A. `llm_only_results.json`: raw answers.
- `verify_places.mjs`: axis (a). `llm_only_verified.json`: lookup results.
- `eval_table.csv`: one row per stop, LLM-only side. The Side B columns (Qloo places, reasons with scores, overlap) were removed from the public copy for the reason above.
- `verify_qloo.mjs`: axis (a) for Side B; reads and writes `local_only/eval/` (not in the repository).

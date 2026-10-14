# Taste Day Japan

**A taste-evidenced itinerary agent for Japan.** Every stop of your day comes with the Qloo taste signals that put it there.

Mika is on her third trip to Japan. She has done Shibuya Crossing and Senso-ji, and she wants the Tokyo that fits her: Ryuichi Sakamoto, *Lost in Translation*, ramen counters, quiet coffee. Tom's second Kyoto trip skipped the temples; he loves Cornelius, *Spirited Away* and *Tampopo*. (Two example inputs, not real users.) Itinerary tools give both the same top-ten list, and an LLM gives a friendly paragraph with places they cannot verify and no way to see why they were picked.

Taste Day Japan takes up to three artists, films and foods plus a city (Tokyo or Kyoto), has an agent call the Qloo API as tools (`/search`, `/v2/tags`, `/v2/insights`), and returns a five-stop day on a map. Each stop shows its Qloo affinity as a bar and the signals Qloo linked it to, in the traveler's own words. The same screen suits people who plan days for others (a travel agency, a hotel concierge, a city tourism office); we have not spoken to any of them and make no demand claim.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). License: MIT.

## Status (2026-10-06)

- The agent, tools, UI (map, stop cards, affinity bars), serverless function and tests are done (21 tests pass).
- The Qloo hackathon API key arrived on 2026-10-03 and the project has been run against the real API since 2026-10-06. The hosted demo calls Qloo live (its banner says "Live Qloo data"). `fixtures/replay.json` holds hand-written sample responses in the documented shape (not Qloo output; every entity id starts with `SAMPLE-`) so that the tests and the offline mode run without a key. Qloo's developer guide asks that Qloo response data is not stored in a public repository, so responses recorded from the real API (`npm run record`) are written to `local_only/replay_recorded.json`, which is git-ignored.
- The parser was checked against the real responses (places carry names and coordinates; tags are free-form text). Live runs give 4 to 5 stops per day; a Kyoto day can have no evening stop because the non-food candidates run out.
- Food matching is loose: a "ramen" query in Tokyo returned an Italian restaurant first. We do not claim that the agent picks the right cuisine; see `eval/RESULTS_LLM_ONLY.md` for the numbers.
- Demo: https://taste-day-japan.pages.dev (Cloudflare Pages + Pages Function, the key is a server-side secret).

## Why Qloo, and where an LLM alone falls short

A plain LLM can list famous places in Kyoto. It cannot tell you which of the places in that city a person who loves Cornelius and *Tampopo* is statistically drawn to, and (as we measured, see below) a current LLM's places mostly do exist, so the case for Qloo is the cross-domain ranking and the per-input evidence, not invented venues. Qloo's taste graph links entities across domains (music, film, places), so one traveler profile can drive place recommendations, with an affinity score and (with `feature.explainability`) the input entities that contributed. The agent uses that for two things:

1. **Cross-domain ranking.** Artists and films go in as `signal.interests.entities`; places come out for a city (`filter.location.query`).
2. **Explanations that are not made up.** The "why" under each stop is built from Qloo's explainability scores, mapped back to the names the traveler typed.

This is a design claim, not a measured result. The comparison was run on 3 travelers (`eval/`; the Qloo-side raw responses are kept locally, not in this repository, per Qloo's developer guide, so `eval/RESULTS_LLM_ONLY.md` gives that side as counts only): the Qloo-grounded places are different from the LLM-only ones (0 of 14 overlap) and each carries coordinates and per-input scores, but by an OpenStreetMap name lookup 9 of 14 Qloo places were found against 13 of 15 LLM-only places, the per-input scores are close to each other within a day, and food slots match the requested food loosely. No win is claimed.

Other ideas considered: lighting styles for electricians' customers (no way to ground "room mood" in Qloo's entity types), and meals for seniors with health constraints (the health side would have to come from outside Qloo, and a wrong answer matters). The travel case keeps the whole answer inside what the Qloo place data can check.

## How it works

```
browser --POST /api/plan--> serverless function (key stays here)
                              |
                              v
                          agent loop  <---- LLM (mock | Anthropic | OpenAI-compatible)
                              | tool calls
          search_entity -> GET /search
          find_tags     -> GET /v2/tags
          taste_insights-> GET /v2/insights (filter.type=urn:entity:place, filter.location.query=<city>,
                                              signal.interests.entities, filter.tags, feature.explainability)
          compose_day   -> local: one place per slot (morning, lunch, afternoon, dinner, evening)
```

- Only `/search`, `/v2/tags` and `/v2/insights` are reachable. `/recommendations` and `/recs` are blocked in code (`src/qloo.js`) and tested.
- The key is sent in the `X-Api-Key` header to `https://hackathon.api.qloo.com`, never in a URL, never to the browser, never in a response (tested).
- The agent can only use entity and tag IDs that an earlier `search_entity` / `find_tags` call returned (`src/tools.js`), so an LLM cannot invent signals.
- Itinerary rule (`src/itinerary.js`): per slot, take the highest affinity among the top 6 unused places, minus 0.02 per km from the previous stop; lunch and dinner avoid the same food tag when possible. Meals come from the food-tag queries, the other slots from the untagged query with food places dropped.
- The LLM is swappable: `LLM_PROVIDER=mock` (default, a deterministic planner that drives the same tools), `anthropic`, or `openai` (any OpenAI-compatible chat completions API). `LLM_MODEL` has no default on purpose; set a model you have access to.

## Run it

Node 22 or newer, no dependencies.

```
npm test                         # 21 tests, no network, no key
npm run dev                      # http://localhost:8787, replay mode (hand-written sample data, banner says so)
cp .env.example .env             # then fill QLOO_API_KEY when you have it
node --env-file=.env dev-server.js
npm run record                   # with a key: record real Qloo responses for the demo travelers (kept local, git-ignored)
```

## Hosting

Qloo requires a demo hosted outside your machine, and the key must not reach the browser, so a server-side function is needed. `functions/api/plan.js` is a Cloudflare Pages Function (same code as the local server); `wrangler.toml` sets the output directory.

```
npx wrangler pages deploy public --project-name taste-day-japan
npx wrangler pages secret put QLOO_API_KEY --project-name taste-day-japan
```

Cloudflare Pages Functions bill as Workers requests; the free plan allows 100,000 requests per day. Pages' Git integration supports GitHub and GitLab only (not Bitbucket), so the deploy is a direct upload. Verified locally with `wrangler pages dev`.

## How AI was used

This project was written with Claude Code (Anthropic's coding agent) under the author's direction. The runtime agent can use an LLM of your choice; the default mock planner uses none.

## Next

- Tighten the food matching (the cuisine tags Qloo returns are free-form) and test it on more travelers.
- Use `/v2/insights` with `urn:entity:destination` to choose the city, and heatmap-style area filters to keep a day inside one district.

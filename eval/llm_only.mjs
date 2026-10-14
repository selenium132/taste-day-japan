// Gets the "LLM only" answer for each traveler in travelers.json (no Qloo, no tools) and writes
// eval/llm_only_results.json. The key is read from a file inside this process and never printed.
// Usage: node eval/llm_only.mjs [model]   (key file: GEMINI_KEY_FILE or ../../x/gemini_api_key.txt)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const keyFile = process.env.GEMINI_KEY_FILE || join(here, "../../../x/gemini_api_key.txt");
const key = readFileSync(keyFile, "utf8").trim();
const model = process.argv[2] || "gemini-3.5-flash";
const travelers = JSON.parse(readFileSync(join(here, "travelers.json"), "utf8"));
const out = { model, started_utc: new Date().toISOString(), prompt_template: null, results: [] };
const prompt = (t) => `Plan a one-day itinerary in ${t.city}, Japan for a traveler with this taste.
Favorite artists: ${t.artists.join(", ")}. Favorite films: ${t.movies.join(", ")}. Food they like: ${t.food.join(", ")}.
Give exactly 5 stops (morning, lunch, afternoon, dinner, evening). For each stop give the real place name and its neighborhood, and one sentence on why it fits this traveler's taste.
Answer with JSON only: [{"slot":"morning","name":"...","area":"...","reason":"..."}, ...]`;
out.prompt_template = prompt({ city: "<city>", artists: ["<artists>"], movies: ["<films>"], food: ["<food>"] });
for (const t of travelers) {
  let res;
  for (let attempt = 0; attempt < 8; attempt++) {
  res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt(t) }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
  });
  if (res.status !== 503) break;
  await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  if (!res.ok) { console.error(t.id, "HTTP", res.status, (await res.text()).slice(0, 200)); out.results.push({ id: t.id, error: "HTTP " + res.status }); continue; }
  const j = await res.json();
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  let stops = null; try { stops = JSON.parse(text); } catch { /* keep raw */ }
  out.results.push({ id: t.id, city: t.city, asked_utc: new Date().toISOString(), stops, raw: stops ? undefined : text });
  console.log(t.id, stops ? stops.length + " stops" : "unparsed");
}
if (out.results.some((r) => !r.stops)) { console.error("some travelers failed; NOT overwriting llm_only_results.json"); process.exit(1); }
writeFileSync(join(here, "llm_only_results.json"), JSON.stringify(out, null, 2) + "\n");

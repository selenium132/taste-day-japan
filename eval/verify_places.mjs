// Axis (a): does each place the LLM named exist? Looks every name up in OpenStreetMap Nominatim
// (1 request per second, identifying User-Agent, per the Nominatim usage policy). Writes
// eval/llm_only_verified.json. A miss means "not found by this method", not proof of invention:
// look at each miss by hand and note the result in eval_table.csv.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "llm_only_results.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
for (const r of data.results) for (const s of r.stops ?? []) {
  const q = `${s.name}, ${r.city}, Japan`;
  const u = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(q);
  const res = await fetch(u, { headers: { "user-agent": "taste-day-japan-eval/0.1 (hackathon evaluation script)" } });
  const j = res.ok ? await res.json() : [];
  const hit = j[0];
  rows.push({ id: r.id, slot: s.slot, name: s.name, area: s.area, query: q, found: !!hit, osm_name: hit?.display_name?.split(",")[0] ?? null, lat: hit?.lat ?? null, lon: hit?.lon ?? null, osm_class: hit ? `${hit.category}/${hit.type}` : null });
  console.log(r.id, s.slot, hit ? "found" : "NOT FOUND");
  await sleep(1100);
}
writeFileSync(join(here, "llm_only_verified.json"), JSON.stringify({ method: "OpenStreetMap Nominatim /search, limit=1, query '<name>, <city>, Japan'", checked_utc: new Date().toISOString(), rows }, null, 2) + "\n");

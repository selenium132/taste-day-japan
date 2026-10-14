// Axis (a) for the Qloo side: look each place Qloo returned up in OpenStreetMap Nominatim (same method as verify_places.mjs)
// and also compare the OSM hit's coordinates with the coordinates Qloo gave.
// Qloo's developer guide: do not store Qloo response data in a public repository, so the Qloo-side raw output
// (qloo_results.json) and this script's output (qloo_verified.json) live in local_only/eval/ (git-ignored).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const here = join(dirname(fileURLToPath(import.meta.url)), "..", "local_only", "eval");
const data = JSON.parse(readFileSync(join(here, "qloo_results.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const km = (a, b, c, d) => { const R = 6371, t = Math.PI / 180, x = (c - a) * t, y = (d - b) * t; const h = Math.sin(x / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const rows = [];
for (const r of data) for (const s of r.itinerary.stops) {
  const q = `${s.name}, ${r.request.city}, Japan`;
  const res = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(q), { headers: { "user-agent": "taste-day-japan-eval/0.1 (hackathon evaluation script)" } });
  const hit = (res.ok ? await res.json() : [])[0];
  rows.push({ id: r.id, slot: s.slot, name: s.name, qloo_lat: s.lat, qloo_lon: s.lon, found: !!hit, osm_name: hit?.display_name?.split(",")[0] ?? null, km_between: hit ? +km(s.lat, s.lon, +hit.lat, +hit.lon).toFixed(2) : null });
  console.log(r.id, s.slot, s.name, hit ? `found ${rows.at(-1).km_between} km` : "NOT FOUND");
  await sleep(1100);
}
writeFileSync(join(here, "qloo_verified.json"), JSON.stringify({ method: "OpenStreetMap Nominatim /search, limit=1, query '<name>, <city>, Japan'", checked_utc: new Date().toISOString(), rows }, null, 2) + "\n");

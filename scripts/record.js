// Records real Qloo responses for the demo travelers into local_only/replay_recorded.json (git-ignored).
// Qloo's developer guide: do not store Qloo response data in a public repository.
// Needs QLOO_API_KEY (node --env-file=.env scripts/record.js). Stores only stable params so replay
// matches any traveler whose favorites were recorded. Never commit the recorded file.
import { writeFileSync, mkdirSync } from "node:fs";
import { QlooClient, liveTransport } from "../src/qloo.js";
import { MockLLM } from "../src/llm.js";
import { runAgent } from "../src/agent.js";

const travelers = [
  { city: "Tokyo", traveler: { artists: ["Radiohead", "Ryuichi Sakamoto"], movies: ["Lost in Translation"], food: ["ramen", "coffee"] } },
  { city: "Kyoto", traveler: { artists: ["Cornelius"], movies: ["Spirited Away", "Tampopo"], food: ["sushi", "ramen"] } },
];
const live = liveTransport({ apiKey: process.env.QLOO_API_KEY, baseUrl: process.env.QLOO_BASE_URL || undefined });
const entries = [];
const stable = (path, p) => {
  if (path === "/search") return { query: p.query, types: p.types };
  if (path === "/v2/tags") return { "filter.query": p["filter.query"] };
  return { "filter.location.query": p["filter.location.query"], "filter.tags": p["filter.tags"] ? p["filter.tags"] : null };
};
const recording = async (path, params) => {
  const response = await live(path, params);
  const key = JSON.stringify([path, stable(path, params)]);
  if (!entries.some((e) => e.key === key)) entries.push({ key, path, params: stable(path, params), response });
  return response;
};
for (const t of travelers) {
  const out = await runAgent({ llm: new MockLLM(), client: new QlooClient(recording), request: t });
  console.log(t.city, out.itinerary?.stops?.length ?? 0, "stops");
}
mkdirSync(new URL("../local_only/", import.meta.url), { recursive: true });
writeFileSync(new URL("../local_only/replay_recorded.json", import.meta.url), JSON.stringify({ source: "recorded", recorded_at: new Date().toISOString(), entries: entries.map(({ key, ...e }) => e) }, null, 1));
console.log(`recorded ${entries.length} responses`);

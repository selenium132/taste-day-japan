import fixtures from "../fixtures/replay.json" with { type: "json" };
import { QlooClient, liveTransport, replayTransport } from "./qloo.js";
import { llmFromEnv } from "./llm.js";
import { runAgent } from "./agent.js";

const MAX_ITEMS = 3;
const MAX_LEN = 60;

export function validateRequest(body) {
  const clean = (v) =>
    (Array.isArray(v) ? v : [])
      .map((x) => String(x ?? "").trim().slice(0, MAX_LEN))
      .filter(Boolean)
      .slice(0, MAX_ITEMS);
  const t = body?.traveler ?? {};
  const req = {
    city: String(body?.city ?? "").trim().slice(0, 40),
    traveler: { artists: clean(t.artists), movies: clean(t.movies), food: clean(t.food) },
  };
  if (!req.city) return { error: "city is required" };
  const n = req.traveler.artists.length + req.traveler.movies.length + req.traveler.food.length;
  if (!n) return { error: "give at least one favorite artist, movie or food" };
  return { request: req };
}

/** mode: "live" when QLOO_API_KEY is set (and QLOO_MODE is not "replay"), otherwise "replay". */
export function pickMode(env) {
  return env.QLOO_API_KEY && (env.QLOO_MODE || "").toLowerCase() !== "replay" ? "live" : "replay";
}

export async function handlePlan(body, env = {}, deps = {}) {
  const v = validateRequest(body);
  if (v.error) return { status: 400, body: { error: v.error } };
  const mode = pickMode(env);
  const transport =
    deps.transport ?? (mode === "live" ? liveTransport({ apiKey: env.QLOO_API_KEY, baseUrl: env.QLOO_BASE_URL || undefined }) : replayTransport(fixtures));
  const client = new QlooClient(transport);
  const llm = deps.llm ?? llmFromEnv(env);
  try {
    const out = await runAgent({ llm, client, request: v.request });
    return { status: 200, body: { mode, llm: llm.kind, sample_data: mode === "replay" && fixtures.source !== "recorded", request: v.request, ...out } };
  } catch (e) {
    return { status: 502, body: { error: "upstream failure", detail: String(e.message ?? e).slice(0, 200), mode } };
  }
}

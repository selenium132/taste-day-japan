import test from "node:test";
import assert from "node:assert/strict";
import { handlePlan, validateRequest, pickMode } from "../src/plan.js";
import { toAnthropicMessages, toOpenAIMessages, AnthropicLLM, OpenAICompatibleLLM, llmFromEnv, MockLLM } from "../src/llm.js";
import { composeDay, SLOTS } from "../src/itinerary.js";
import { runTool, newContext } from "../src/tools.js";
import { QlooClient, replayTransport } from "../src/qloo.js";
import fixtures from "../fixtures/replay.json" with { type: "json" };

const body = { city: "Tokyo", traveler: { artists: ["Radiohead", "Ryuichi Sakamoto"], movies: ["Lost in Translation"], food: ["ramen", "coffee"] } };

test("end to end on replay data with the mock LLM", async () => {
  const r = await handlePlan(body, {});
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, "replay");
  assert.equal(r.body.sample_data, fixtures.source !== "recorded");
  const stops = r.body.itinerary.stops;
  assert.deepEqual(stops.map((s) => s.slot), SLOTS.map((s) => s.slot));
  assert.equal(new Set(stops.map((s) => s.id)).size, stops.length, "no place repeats");
  assert.ok(stops.every((s) => s.why.includes("Qloo")));
  assert.ok(stops.some((s) => /Radiohead|Sakamoto|Lost in Translation/.test(s.why)), "explanation names the taste signals");
  const paths = new Set(r.body.trace.flatMap((t) => t.qloo_calls.map((c) => c.path)));
  assert.deepEqual([...paths].sort(), ["/search", "/v2/insights", "/v2/tags"]);
  assert.ok(r.body.narrative.length > 20);
});

test("meals come from the food queries, other slots from non-food", async () => {
  const r = await handlePlan(body, {});
  const by = Object.fromEntries(r.body.itinerary.stops.map((s) => [s.slot, s]));
  if (fixtures.source === "recorded") {
    // Real Qloo tags are free-form, so check the source of each meal: it must come from a tag-filtered food query.
    const foodIds = new Set(fixtures.entries.filter((e) => e.path === "/v2/insights" && e.params["filter.tags"]).flatMap((e) => (e.response.results?.entities ?? []).map((x) => x.entity_id)));
    assert.ok(foodIds.has(by.lunch.id) && foodIds.has(by.dinner.id));
    assert.ok(!foodIds.has(by.morning.id) && !foodIds.has(by.afternoon.id) && !foodIds.has(by.evening.id));
    return;
  }
  assert.ok(by.lunch.tags.some((t) => /restaurant|Coffee/.test(t)));
  assert.ok(by.dinner.tags.some((t) => /restaurant|Coffee/.test(t)));
  assert.ok(!by.morning.tags.some((t) => /restaurant/.test(t)));
});

test("unknown favorites give a clear answer, not a crash", async () => {
  const r = await handlePlan({ city: "Tokyo", traveler: { artists: ["Nobody Known"] } }, {});
  assert.equal(r.status, 200);
  assert.equal(r.body.itinerary, null);
  assert.match(r.body.narrative, /none of these/);
});

test("validation", () => {
  assert.ok(validateRequest({}).error);
  assert.ok(validateRequest({ city: "Tokyo", traveler: {} }).error);
  const v = validateRequest({ city: "Tokyo", traveler: { artists: ["a", "b", "c", "d", "e"], movies: ["x".repeat(500)] } });
  assert.equal(v.request.traveler.artists.length, 3);
  assert.equal(v.request.traveler.movies[0].length, 60);
});

test("mode: key present means live unless forced to replay", () => {
  assert.equal(pickMode({}), "replay");
  assert.equal(pickMode({ QLOO_API_KEY: "k" }), "live");
  assert.equal(pickMode({ QLOO_API_KEY: "k", QLOO_MODE: "replay" }), "replay");
});

test("response never contains the API key", async () => {
  const r = await handlePlan(body, { QLOO_API_KEY: "SECRETKEY", QLOO_MODE: "replay" });
  assert.ok(!JSON.stringify(r.body).includes("SECRETKEY"));
});

test("an upstream failure becomes a 502 without leaking details beyond the message", async () => {
  const r = await handlePlan(body, {}, { transport: async () => { throw new Error("boom"); } });
  assert.equal(r.status, 200); // tool errors are returned to the agent, which reports no itinerary
  assert.equal(r.body.itinerary, null);
});

test("tools refuse IDs that were not looked up (no invented signals)", async () => {
  const ctx = newContext(new QlooClient(replayTransport(fixtures)));
  const out = await runTool(ctx, "taste_insights", { city: "Tokyo", entity_ids: ["made-up"], meal: false });
  assert.match(out.error, /no valid signal/);
  assert.equal(ctx.client.calls.length, 0);
  assert.match((await runTool(ctx, "nope", {})).error, /unknown tool/);
});

test("composeDay prefers nearer places when affinity is close", () => {
  const mk = (id, aff, lat) => ({ id, name: id, affinity: aff, tags: [], lat, lon: 139.7, explain: {} });
  const buckets = { other: [mk("a", 0.9, 35.0), mk("far", 0.89, 36.5), mk("near", 0.88, 35.01)], meal: [mk("m1", 0.9, 35.0), mk("m2", 0.8, 35.0)] };
  const stops = composeDay({ buckets, entityNames: {} });
  assert.equal(stops[0].id, "a");
  assert.equal(stops[1].id, "m1");
  assert.equal(stops[2].id, "near");
});

test("LLM adapter message conversion", () => {
  const msgs = [
    { role: "user", content: "{}" },
    { role: "assistant", content: "hi", toolCalls: [{ id: "1", name: "find_tags", input: { query: "ramen" } }, { id: "2", name: "find_tags", input: { query: "sushi" } }] },
    { role: "tool", toolCallId: "1", name: "find_tags", content: "{}" },
    { role: "tool", toolCallId: "2", name: "find_tags", content: "{}" },
  ];
  const a = toAnthropicMessages(msgs);
  assert.equal(a.length, 3);
  assert.equal(a[2].content.length, 2, "tool results merge into one user message");
  const o = toOpenAIMessages("sys", msgs);
  assert.equal(o[0].role, "system");
  assert.equal(o[2].tool_calls[0].function.arguments, '{"query":"ramen"}');
  assert.equal(o.filter((m) => m.role === "tool").length, 2);
});

test("Anthropic and OpenAI adapters parse tool calls", async () => {
  const a = new AnthropicLLM({ apiKey: "k", model: "m", fetchImpl: async (u, init) => {
    assert.equal(init.headers["x-api-key"], "k");
    return { ok: true, json: async () => ({ content: [{ type: "text", text: "t" }, { type: "tool_use", id: "x", name: "find_tags", input: { query: "q" } }] }) };
  } });
  const ra = await a.next({ system: "s", messages: [{ role: "user", content: "u" }], tools: [] });
  assert.deepEqual(ra.toolCalls, [{ id: "x", name: "find_tags", input: { query: "q" } }]);
  const o = new OpenAICompatibleLLM({ apiKey: "k", model: "m", fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: null, tool_calls: [{ id: "y", function: { name: "find_tags", arguments: '{"query":"q"}' } }] } }] }) }) });
  const ro = await o.next({ system: "s", messages: [{ role: "user", content: "u" }], tools: [{ name: "n", description: "d", input_schema: {} }] });
  assert.deepEqual(ro.toolCalls[0].input, { query: "q" });
});

test("llmFromEnv defaults to the mock and requires a model for real providers", () => {
  assert.ok(llmFromEnv({}) instanceof MockLLM);
  assert.throws(() => llmFromEnv({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }));
});

test("lunch and dinner use different food tags when both are available", async () => {
  const r = await handlePlan(body, {});
  const by = Object.fromEntries(r.body.itinerary.stops.map((s) => [s.slot, s]));
  assert.notEqual(by.lunch.tags[0], by.dinner.tags[0]);
});

test("stops carry coordinates so the UI can draw a map", async () => {
  const r = await handlePlan(body, {});
  for (const s of r.body.itinerary.stops) {
    assert.ok(Number.isFinite(s.lat) && Number.isFinite(s.lon), `${s.slot} has lat/lon`);
    assert.ok(s.lat > 20 && s.lat < 46 && s.lon > 122 && s.lon < 154, "inside Japan");
  }
});

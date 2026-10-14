import test from "node:test";
import assert from "node:assert/strict";
import { QlooClient, QlooError, liveTransport, replayTransport, normalizeExplain, HACKATHON_BASE_URL } from "../src/qloo.js";
import fixtures from "../fixtures/replay.json" with { type: "json" };

test("legacy endpoints are blocked", async () => {
  const c = new QlooClient(async () => ({}));
  for (const p of ["/recommendations", "/recs", "/v2/insights/search"]) await assert.rejects(c.request(p, {}), QlooError);
});

test("live transport: GET, hackathon base URL, key only in X-Api-Key header", async () => {
  let seen;
  const t = liveTransport({ apiKey: "KEY123", fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({}) }; } });
  await t("/v2/insights", { "filter.type": "urn:entity:place" });
  assert.ok(seen.url.startsWith(HACKATHON_BASE_URL + "/v2/insights?"));
  assert.equal(seen.init.method, "GET");
  assert.equal(seen.init.headers["X-Api-Key"], "KEY123");
  assert.ok(!seen.url.includes("KEY123"));
  assert.equal(seen.init.body, undefined);
});

test("live transport error does not leak the key", async () => {
  const t = liveTransport({ apiKey: "KEY123", fetchImpl: async () => ({ ok: false, status: 401, text: async () => "KEY123" }) });
  await assert.rejects(t("/search", {}), (e) => e.status === 401 && !e.message.includes("KEY123"));
});

test("live transport needs a key", () => assert.throws(() => liveTransport({ apiKey: "" }), QlooError));

test("search/tags/insights build documented parameters", async () => {
  const c = new QlooClient(replayTransport(fixtures));
  await c.search("Radiohead", "artist");
  const t = await c.tags("ramen");
  await c.placeInsights({ city: "Tokyo", entityIds: ["a", "b"], tagIds: [t[0].id] });
  const [s, g, i] = c.calls;
  assert.deepEqual(s.params, { query: "Radiohead", types: "urn:entity:artist", take: 3 });
  assert.equal(g.params["filter.query"], "ramen");
  assert.equal(g.params["filter.parents.types"], "urn:entity:place");
  assert.equal(i.params["filter.type"], "urn:entity:place");
  assert.equal(i.params["filter.location.query"], "Tokyo");
  assert.equal(i.params["signal.interests.entities"], "a,b");
  assert.ok(c.calls.every((x) => ["/search", "/v2/tags", "/v2/insights"].includes(x.path)));
});

test("replay matches by city and tag, and absent tag means non-food query", async () => {
  const c = new QlooClient(replayTransport(fixtures));
  const other = await c.placeInsights({ city: "Kyoto", entityIds: ["x"] });
  assert.ok(other.length >= 5);
  assert.ok(other.every((p) => !p.tags.includes("Ramen restaurant")));
  const ramen = await c.placeInsights({ city: "Kyoto", entityIds: ["x"], tagIds: ["SAMPLE-tag-ramen"] });
  assert.ok(ramen.every((p) => p.tags.includes("Ramen restaurant")));
  assert.deepEqual(await c.placeInsights({ city: "Paris", entityIds: ["x"] }), []);
});

test("normalizeExplain accepts several shapes", () => {
  assert.deepEqual(normalizeExplain({ "signal.interests.entities": [{ entity_id: "a", score: 0.5 }] }), { a: 0.5 });
  assert.deepEqual(normalizeExplain({ a: 0.2, b: 0.8 }), { a: 0.2, b: 0.8 });
  assert.deepEqual(normalizeExplain(undefined), {});
});

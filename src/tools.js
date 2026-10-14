import { composeDay, isFoodPlace } from "./itinerary.js";

const ENTITY_TYPES = ["artist", "movie", "tv_show", "book", "podcast", "video_game", "brand", "place", "destination", "person"];

export const TOOL_SPECS = [
  {
    name: "search_entity",
    description: "Look up a Qloo entity ID by name (an artist, movie, TV show ...). Calls Qloo /search. Use the returned id as a taste signal.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name to look up, e.g. 'Radiohead'" },
        type: { type: "string", enum: ENTITY_TYPES },
      },
      required: ["query", "type"],
    },
  },
  {
    name: "find_tags",
    description: "Find Qloo tag IDs for a place keyword such as 'ramen' or 'coffee'. Calls Qloo /v2/tags.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "taste_insights",
    description:
      "Ask Qloo /v2/insights for places in a city that fit the taste signals. entity_ids and tag_ids must come from search_entity / find_tags. meal=true returns food places (give tag_ids); meal=false returns other places (sights, cafes, bars, shops).",
    input_schema: {
      type: "object",
      properties: {
        city: { type: "string" },
        entity_ids: { type: "array", items: { type: "string" } },
        tag_ids: { type: "array", items: { type: "string" } },
        meal: { type: "boolean" },
      },
      required: ["city", "entity_ids", "meal"],
    },
  },
  {
    name: "compose_day",
    description: "Build the one-day itinerary (morning, lunch, afternoon, dinner, evening) from the places found so far. Local step, no Qloo call.",
    input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  },
];

export function newContext(client) {
  return { client, entities: {}, tags: {}, buckets: {}, itinerary: null };
}

const compact = (p) => ({ id: p.id, name: p.name, affinity: p.affinity, tags: p.tags.slice(0, 3) });

export async function runTool(ctx, name, input) {
  try {
    if (name === "search_entity") {
      const q = String(input.query ?? "").slice(0, 80);
      const type = ENTITY_TYPES.includes(input.type) ? input.type : "artist";
      if (!q) return { error: "query is empty" };
      const hits = await ctx.client.search(q, type, 3);
      for (const h of hits) if (h.id) ctx.entities[h.id] = h;
      return { results: hits };
    }
    if (name === "find_tags") {
      const q = String(input.query ?? "").slice(0, 80);
      if (!q) return { error: "query is empty" };
      const tags = await ctx.client.tags(q, { take: 5 });
      for (const t of tags) if (t.id) ctx.tags[t.id] = t;
      return { results: tags };
    }
    if (name === "taste_insights") {
      const city = String(input.city ?? "").slice(0, 60);
      const entityIds = (input.entity_ids ?? []).filter((id) => ctx.entities[id]);
      const tagIds = (input.tag_ids ?? []).filter((id) => ctx.tags[id]);
      if (!city) return { error: "city is empty" };
      if (!entityIds.length && !tagIds.length) return { error: "no valid signal: look up entities or tags first" };
      if (input.meal && !tagIds.length) return { error: "meal=true needs tag_ids from find_tags" };
      const places = await ctx.client.placeInsights({
        city,
        entityIds,
        tagIds: input.meal ? tagIds : [],
        take: 10,
      });
      const b = (ctx.buckets[city] ??= { meal: [], other: [] });
      const target = input.meal ? b.meal : b.other;
      for (const p of places) {
        if (!p.id || target.some((x) => x.id === p.id)) continue;
        // Meals come only from the food query; the other query keeps non-food places.
        if (!input.meal && isFoodPlace(p)) continue;
        target.push(input.meal ? { ...p, via: tagIds[0] } : p);
      }
      target.sort((a, c) => (c.affinity ?? 0) - (a.affinity ?? 0));
      return { count: places.length, results: places.slice(0, 6).map(compact) };
    }
    if (name === "compose_day") {
      const city = String(input.city ?? "");
      const b = ctx.buckets[city];
      if (!b || (!b.meal.length && !b.other.length)) return { error: `no places found for ${city}` };
      const entityNames = Object.fromEntries(Object.values(ctx.entities).map((e) => [e.id, e.name]));
      ctx.itinerary = { city, stops: composeDay({ buckets: { meal: b.meal, other: b.other }, entityNames }) };
      return ctx.itinerary;
    }
    return { error: `unknown tool ${name}` };
  } catch (e) {
    return { error: String(e.message ?? e).slice(0, 200) };
  }
}

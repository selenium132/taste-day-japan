import { haversineKm } from "./geo.js";

export const SLOTS = [
  { slot: "morning", time: "09:30", kind: "other" },
  { slot: "lunch", time: "12:30", kind: "meal" },
  { slot: "afternoon", time: "14:30", kind: "other" },
  { slot: "dinner", time: "18:30", kind: "meal" },
  { slot: "evening", time: "20:30", kind: "other" },
];

const DISTANCE_PENALTY_PER_KM = 0.02; // affinity points given up per km of walking/transit
const REPEAT_CUISINE_PENALTY = 0.15; // lunch and dinner should come from different food tags when possible
const POOL = 6; // consider the top POOL unused candidates for each slot

/** Why this place: the taste signals Qloo says contributed, mapped back to names we looked up. */
export function explain(place, entityNames) {
  const parts = Object.entries(place.explain || {})
    .filter(([id]) => entityNames[id])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, s]) => `${entityNames[id]} (${s.toFixed(2)})`);
  if (parts.length) return `Qloo links this place to: ${parts.join(", ")}.`;
  if (place.affinity != null) return `Qloo affinity ${place.affinity.toFixed(2)} for the combined taste profile.`;
  return "Returned by Qloo for the combined taste profile.";
}

/**
 * Pick one place per slot. Higher Qloo affinity wins; among close candidates the one nearer the
 * previous stop wins. No place is used twice. Meals come from the food-tag bucket.
 */
export function composeDay({ buckets, entityNames }) {
  const used = new Set();
  const stops = [];
  let prev = null;
  let lastVia = null;
  for (const s of SLOTS) {
    const pool = (buckets[s.kind] || []).filter((p) => !used.has(p.id)).slice(0, POOL);
    if (!pool.length) continue;
    let best = null;
    let bestScore = -Infinity;
    for (const p of pool) {
      const d = prev ? haversineKm(prev, p) : null;
      const score = (p.affinity ?? 0) - (d == null ? 0 : d * DISTANCE_PENALTY_PER_KM) - (s.kind === "meal" && p.via && p.via === lastVia ? REPEAT_CUISINE_PENALTY : 0);
      if (score > bestScore) { best = p; bestScore = score; }
    }
    used.add(best.id);
    if (s.kind === "meal") lastVia = best.via ?? null;
    const d = prev ? haversineKm(prev, best) : null;
    stops.push({
      slot: s.slot,
      time: s.time,
      id: best.id,
      name: best.name,
      affinity: best.affinity,
      tags: best.tags.slice(0, 4),
      address: best.address,
      lat: best.lat ?? null,
      lon: best.lon ?? null,
      km_from_previous: d == null ? null : Math.round(d * 10) / 10,
      why: explain(best, entityNames),
    });
    prev = best;
  }
  return stops;
}

const FOODISH = /restaurant|ramen|sushi|izakaya|cuisine|food|dining|noodle|bar$|kissaten|bakery|dessert/i;
export function isFoodPlace(place) {
  return place.tags.some((t) => FOODISH.test(t));
}

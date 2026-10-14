// Writes fixtures/replay.json: HAND-WRITTEN SAMPLE responses in the documented Qloo response shape.
// They are NOT Qloo output. Entity IDs start with SAMPLE-, affinities are made up, restaurant and
// cafe names are generic placeholders. Run `npm run record` with a real key to replace them.
import { writeFileSync } from "node:fs";

const artists = ["Radiohead", "Ryuichi Sakamoto", "Cornelius"];
const movies = ["Lost in Translation", "Spirited Away", "Tampopo"];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const entityIds = [];
const entries = [];

for (const a of artists) { const id = `SAMPLE-artist-${slug(a)}`; entityIds.push(id); entries.push({ path: "/search", params: { query: a, types: "urn:entity:artist" }, response: [{ entity_id: id, name: a, types: ["urn:entity:artist"] }] }); }
for (const m of movies) { const id = `SAMPLE-movie-${slug(m)}`; entityIds.push(id); entries.push({ path: "/search", params: { query: m, types: "urn:entity:movie" }, response: [{ entity_id: id, name: m, types: ["urn:entity:movie"] }] }); }

const tagDefs = { ramen: "Ramen restaurant", sushi: "Sushi restaurant", coffee: "Coffee shop (kissaten)" };
const tagId = (k) => `SAMPLE-tag-${k}`;
for (const [k, name] of Object.entries(tagDefs)) entries.push({ path: "/v2/tags", params: { "filter.query": k }, response: { success: true, results: { tags: [{ id: tagId(k), name, type: "urn:tag:genre:place" }] } } });

const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 1000; return h / 1000; };
function place(city, i, p, kindTags) {
  const id = `SAMPLE-place-${slug(city)}-${slug(p[0])}`;
  return {
    entity_id: id, name: p[0], type: "urn:entity:place",
    location: { lat: p[1], lon: p[2] },
    properties: { address: `${p[0]}, ${city}, Japan (sample)` },
    tags: [...p[3], ...kindTags].map((n) => ({ id: `SAMPLE-tag-${slug(n)}`, name: n })),
    query: {
      affinity: Math.round((0.93 - i * 0.045) * 100) / 100,
      explainability: { "signal.interests.entities": entityIds.map((e) => ({ entity_id: e, score: Math.round(hash(id + e) * 100) / 100 })) },
    },
  };
}

const data = {
  Tokyo: {
    other: [
      ["Tower Records Shibuya", 35.6595, 139.6987, ["Record store", "Music"]],
      ["Shibuya Cinema Rise", 35.6628, 139.6963, ["Cinema", "Film"]],
      ["Nezu Museum", 35.662, 139.7183, ["Museum", "Garden"]],
      ["Meiji Jingu", 35.6764, 139.6993, ["Shrine", "Garden"]],
      ["Blue Note Tokyo", 35.6616, 139.7168, ["Jazz club", "Music"]],
      ["Disk Union Shimokitazawa", 35.6613, 139.6683, ["Record store", "Music"]],
      ["Ghibli Museum, Mitaka", 35.6962, 139.5704, ["Museum", "Animation"]],
      ["Shinjuku Golden Gai", 35.694, 139.7035, ["Nightlife", "Live house"]],
    ],
    ramen: [["[sample] Ramen shop, Ebisu", 35.6467, 139.71], ["[sample] Ramen shop, Shibuya", 35.6601, 139.7006], ["[sample] Ramen shop, Shinjuku", 35.6867, 139.6987], ["[sample] Ramen shop, Nakano", 35.7056, 139.6659]],
    sushi: [["[sample] Sushi counter, Shibuya", 35.6586, 139.7012], ["[sample] Sushi counter, Ginza", 35.6717, 139.765], ["[sample] Sushi counter, Tsukiji", 35.6655, 139.7707], ["[sample] Sushi counter, Shinjuku", 35.6905, 139.7003]],
    coffee: [["[sample] Kissaten, Shimokitazawa", 35.661, 139.6672], ["[sample] Kissaten, Jimbocho", 35.6957, 139.7578], ["[sample] Coffee stand, Omotesando", 35.6686, 139.7075], ["[sample] Kissaten, Ginza", 35.6718, 139.7646]],
  },
  Kyoto: {
    other: [
      ["Kyoto International Manga Museum", 35.0112, 135.764, ["Museum", "Animation"]],
      ["Fushimi Inari Taisha", 34.9671, 135.7727, ["Shrine", "Hiking"]],
      ["Metro (Kyoto live house)", 35.0153, 135.7716, ["Live house", "Music"]],
      ["Philosopher's Path", 35.027, 135.7948, ["Walk", "Garden"]],
      ["Kinkaku-ji", 35.0394, 135.7292, ["Temple", "Garden"]],
      ["Arashiyama Bamboo Grove", 35.017, 135.6713, ["Walk", "Garden"]],
      ["Kyoto National Museum", 34.99, 135.7727, ["Museum", "Art"]],
      ["Nishiki Market", 35.005, 135.7646, ["Market", "Shopping"]],
    ],
    ramen: [["[sample] Ramen shop, Kawaramachi", 35.0043, 135.7692], ["[sample] Ramen shop, Karasuma", 35.0097, 135.7678], ["[sample] Ramen shop, Kyoto Station", 34.9858, 135.7588], ["[sample] Ramen shop, Gion", 35.0037, 135.775]],
    sushi: [["[sample] Sushi counter, Nishiki", 35.0049, 135.7644], ["[sample] Sushi counter, Gion", 35.0039, 135.7752], ["[sample] Sushi counter, Kyoto Station", 34.9865, 135.759], ["[sample] Sushi counter, Pontocho", 35.0053, 135.7706]],
    coffee: [["[sample] Kissaten, Teramachi", 35.0067, 135.7678], ["[sample] Kissaten, Demachiyanagi", 35.0301, 135.7727], ["[sample] Coffee stand, Gion", 35.0035, 135.7744], ["[sample] Kissaten, Kawaramachi", 35.0072, 135.7686]],
  },
};

for (const [city, d] of Object.entries(data)) {
  entries.push({ path: "/v2/insights", params: { "filter.location.query": city, "filter.tags": null }, response: { success: true, results: { entities: d.other.map((p, i) => place(city, i, p, [])) } } });
  for (const k of ["ramen", "sushi", "coffee"]) {
    entries.push({ path: "/v2/insights", params: { "filter.location.query": city, "filter.tags": tagId(k) }, response: { success: true, results: { entities: d[k].map((p, i) => place(city, i, [p[0], p[1], p[2], []], [tagDefs[k]])) } } });
  }
}

writeFileSync(new URL("../fixtures/replay.json", import.meta.url), JSON.stringify({ source: "sample", note: "Hand-written sample data, not Qloo output.", entries }, null, 1));
console.log(`wrote ${entries.length} entries`);

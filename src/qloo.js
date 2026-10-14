// Thin Qloo API client. Only the three endpoints the hackathon guide recommends are reachable.
// /recommendations and /recs are legacy and unsupported for the hackathon, so they are blocked here.

export const HACKATHON_BASE_URL = "https://hackathon.api.qloo.com";
export const ALLOWED_PATHS = new Set(["/search", "/v2/insights", "/v2/tags"]);

export class QlooError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "QlooError";
    this.status = status;
  }
}

function toQuery(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return sp;
}

/** Live transport: GET with the key in the X-Api-Key header (never in the query string). */
export function liveTransport({ apiKey, baseUrl = HACKATHON_BASE_URL, fetchImpl = fetch, timeoutMs = 20000 }) {
  if (!apiKey) throw new QlooError("QLOO_API_KEY is not set");
  return async function transport(path, params) {
    const url = `${baseUrl}${path}?${toQuery(params).toString()}`;
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      // Do not echo the response body or headers: keep errors free of anything key-related.
      throw new QlooError(`Qloo ${path} returned HTTP ${res.status}`, res.status);
    }
    return res.json();
  };
}

/** Replay transport: answers from recorded/sample responses so the app runs without a key. */
export function replayTransport(fixtures) {
  const entries = Array.isArray(fixtures) ? fixtures : fixtures.entries;
  return async function transport(path, params) {
    let best = null;
    let bestScore = -1;
    for (const e of entries) {
      if (e.path !== path) continue;
      let ok = true;
      let score = 0;
      for (const [k, want] of Object.entries(e.params || {})) {
        const got = params[k];
        const has = got !== undefined && got !== null && got !== "";
        if (want === null) { if (has) { ok = false; break; } }
        else if (want === "*") { if (!has) { ok = false; break; } score += 1; }
        else if (!has || String(got).toLowerCase() !== String(want).toLowerCase()) { ok = false; break; }
        else score += 2;
      }
      if (ok && score > bestScore) { best = e; bestScore = score; }
    }
    if (!best) return { success: true, results: path === "/v2/insights" ? { entities: [] } : path === "/v2/tags" ? { tags: [] } : [], replayMiss: true };
    return structuredClone(best.response);
  };
}

export class QlooClient {
  constructor(transport) {
    this.transport = transport;
    this.calls = []; // {path, params} log, used by the UI trace and by tests
  }

  async request(path, params) {
    if (!ALLOWED_PATHS.has(path)) throw new QlooError(`Endpoint not allowed for the hackathon: ${path}`);
    const clean = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
      clean[k] = Array.isArray(v) ? v.join(",") : v;
    }
    this.calls.push({ path, params: clean });
    return this.transport(path, clean);
  }

  /** /search: entity lookup by name. type is a short name such as "artist" or "movie". */
  async search(query, type, take = 3) {
    const data = await this.request("/search", { query, types: type ? `urn:entity:${type}` : undefined, take });
    const list = Array.isArray(data) ? data : data?.results ?? data?.entities ?? [];
    return list.slice(0, take).map((e) => ({
      id: e.entity_id ?? e.id,
      name: e.name,
      type: e.type ?? e.types?.[0] ?? (type ? `urn:entity:${type}` : undefined),
    }));
  }

  /** /v2/tags: tag IDs by keyword. Filter.parents.types limits tags to one entity family. */
  async tags(query, { take = 5, parentType = "urn:entity:place" } = {}) {
    const data = await this.request("/v2/tags", {
      "filter.query": query,
      "filter.parents.types": parentType,
      "feature.typo_tolerance": "true",
      take,
    });
    const list = data?.results?.tags ?? data?.tags ?? (Array.isArray(data?.results) ? data.results : []);
    return list.slice(0, take).map((t) => ({ id: t.id ?? t.tag_id, name: t.name, type: t.type }));
  }

  /** /v2/insights for places in a city, driven by taste signals. */
  async placeInsights({ city, entityIds = [], tagIds = [], take = 10 }) {
    const data = await this.request("/v2/insights", {
      "filter.type": "urn:entity:place",
      "filter.location.query": city,
      "signal.interests.entities": entityIds,
      "filter.tags": tagIds,
      "feature.explainability": "true",
      take,
    });
    const list = data?.results?.entities ?? data?.entities ?? [];
    return list.map(normalizePlace);
  }
}

export function normalizePlace(e) {
  const loc = e.location ?? e.properties?.location ?? {};
  const lat = num(loc.lat ?? loc.latitude ?? e.properties?.latitude);
  const lon = num(loc.lon ?? loc.lng ?? loc.longitude ?? e.properties?.longitude);
  return {
    id: e.entity_id ?? e.id,
    name: e.name,
    affinity: num(e.query?.affinity ?? e.affinity),
    tags: (e.tags ?? []).map((t) => t.name).filter(Boolean),
    address: e.properties?.address ?? e.properties?.geocode?.formatted_address ?? null,
    lat,
    lon,
    explain: normalizeExplain(e.query?.explainability),
  };
}

function num(v) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Explainability shapes differ by version; accept {id: score}, [{id, score}] or a grouped object. */
export function normalizeExplain(x) {
  const out = {};
  const visit = (v) => {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const it of v) {
        const id = it?.entity_id ?? it?.id;
        const s = num(it?.score ?? it?.weight ?? it?.value);
        if (id && s !== null) out[id] = s;
        else visit(it);
      }
    } else if (typeof v === "object") {
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === "number") out[k] = val;
        else visit(val);
      }
    }
  };
  visit(x);
  return out;
}

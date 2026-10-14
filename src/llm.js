// LLM adapters. The agent talks to one interface: next({system, messages, tools}) ->
//   { text, toolCalls: [{id, name, input}] }
// Internal message format:
//   {role:'user', content}  {role:'assistant', content, toolCalls}  {role:'tool', toolCallId, name, content}

/** Deterministic planner used when no LLM key is configured. It still drives the same tools. */
export class MockLLM {
  constructor() { this.kind = "mock"; }

  async next({ messages }) {
    const req = JSON.parse(messages[0].content);
    const calls = [];
    const results = new Map();
    let idx = 0;
    const toolMsgs = messages.filter((m) => m.role === "tool");
    for (const m of messages) for (const c of m.toolCalls ?? []) calls.push(c);
    for (const m of toolMsgs) results.set(m.toolCallId, JSON.parse(m.content));
    const done = (name) => calls.filter((c) => c.name === name);
    const id = () => `mock_${messages.length}_${idx++}`;
    const t = req.traveler ?? {};
    const likes = [
      ...(t.artists ?? []).map((q) => ({ query: q, type: "artist" })),
      ...(t.movies ?? []).map((q) => ({ query: q, type: "movie" })),
    ];
    const foods = t.food ?? [];

    if (!calls.length) {
      return {
        text: "Looking up the traveler's favorites in Qloo.",
        toolCalls: [
          ...likes.map((l) => ({ id: id(), name: "search_entity", input: l })),
          ...foods.map((q) => ({ id: id(), name: "find_tags", input: { query: q } })),
        ],
      };
    }
    const entityIds = done("search_entity").map((c) => results.get(c.id)?.results?.[0]?.id).filter(Boolean);
    const tagIds = done("find_tags").map((c) => results.get(c.id)?.results?.[0]?.id).filter(Boolean);
    if (!done("taste_insights").length) {
      if (!entityIds.length && !tagIds.length) return { text: "Qloo knew none of these favorites, so there is nothing to plan from.", toolCalls: [] };
      const out = [{ id: id(), name: "taste_insights", input: { city: req.city, entity_ids: entityIds, tag_ids: [], meal: false } }];
      for (const tag of tagIds) out.push({ id: id(), name: "taste_insights", input: { city: req.city, entity_ids: entityIds, tag_ids: [tag], meal: true } });
      return { text: "Asking Qloo for places that fit these tastes.", toolCalls: out };
    }
    if (!done("compose_day").length) {
      return { text: "Composing the day.", toolCalls: [{ id: id(), name: "compose_day", input: { city: req.city } }] };
    }
    const last = results.get(done("compose_day").at(-1).id);
    if (last?.error || !last?.stops?.length) return { text: `No itinerary could be built: ${last?.error ?? "no places"}.`, toolCalls: [] };
    const lines = last.stops.map((s) => `${s.time} ${s.name} - ${s.why}`);
    return { text: `A day in ${last.city}, built from Qloo taste signals:\n${lines.join("\n")}`, toolCalls: [] };
  }
}

export function toAnthropicMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const blocks = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
      out.push({ role: "assistant", content: blocks });
    } else if (m.role === "tool") {
      const block = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content };
      const prev = out.at(-1);
      if (prev && prev.role === "user" && Array.isArray(prev.content)) prev.content.push(block);
      else out.push({ role: "user", content: [block] });
    }
  }
  return out;
}

export class AnthropicLLM {
  constructor({ apiKey, model, fetchImpl = fetch, baseUrl = "https://api.anthropic.com" }) {
    if (!apiKey || !model) throw new Error("ANTHROPIC_API_KEY and LLM_MODEL are required");
    Object.assign(this, { kind: "anthropic", apiKey, model, fetchImpl, baseUrl });
  }
  async next({ system, messages, tools }) {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, max_tokens: 1500, system, messages: toAnthropicMessages(messages), tools }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = await res.json();
    const blocks = data.content ?? [];
    return {
      text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n"),
      toolCalls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input })),
    };
  }
}

export function toOpenAIMessages(system, messages) {
  const out = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const msg = { role: "assistant", content: m.content || null };
      if (m.toolCalls?.length) msg.tool_calls = m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input) } }));
      out.push(msg);
    } else if (m.role === "tool") out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
  }
  return out;
}

/** Any OpenAI-compatible chat completions endpoint. */
export class OpenAICompatibleLLM {
  constructor({ apiKey, model, baseUrl = "https://api.openai.com/v1", fetchImpl = fetch }) {
    if (!apiKey || !model) throw new Error("LLM_API_KEY and LLM_MODEL are required");
    Object.assign(this, { kind: "openai-compatible", apiKey, model, baseUrl, fetchImpl });
  }
  async next({ system, messages, tools }) {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: toOpenAIMessages(system, messages),
        tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const msg = (await res.json()).choices?.[0]?.message ?? {};
    return {
      text: msg.content ?? "",
      toolCalls: (msg.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, input: safeJson(c.function.arguments) })),
    };
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

export function llmFromEnv(env) {
  const p = (env.LLM_PROVIDER || "mock").toLowerCase();
  if (p === "anthropic") return new AnthropicLLM({ apiKey: env.ANTHROPIC_API_KEY, model: env.LLM_MODEL });
  if (p === "openai") return new OpenAICompatibleLLM({ apiKey: env.LLM_API_KEY, model: env.LLM_MODEL, baseUrl: env.LLM_BASE_URL || undefined });
  return new MockLLM();
}

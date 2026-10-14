import { TOOL_SPECS, newContext, runTool } from "./tools.js";

export const SYSTEM_PROMPT = `You plan a one-day itinerary in a Japanese city for a traveler, grounded in Qloo's taste graph.
Rules: never recommend a place that did not come from taste_insights. Look up every favorite with search_entity (artists, movies) and find_tags (food), then call taste_insights once with meal=false and once per food tag with meal=true, then compose_day, then write a short explanation. Use only IDs returned by earlier tool calls. Say which taste signals Qloo linked to each stop.`;

/** The tool-calling loop. The LLM decides which Qloo tool to call; tools run server-side. */
export async function runAgent({ llm, client, request, maxSteps = 8 }) {
  const ctx = newContext(client);
  const messages = [{ role: "user", content: JSON.stringify(request) }];
  const trace = [];
  let narrative = "";
  for (let step = 1; step <= maxSteps; step++) {
    const reply = await llm.next({ system: SYSTEM_PROMPT, messages, tools: TOOL_SPECS });
    messages.push({ role: "assistant", content: reply.text ?? "", toolCalls: reply.toolCalls });
    if (!reply.toolCalls.length) { narrative = reply.text ?? ""; break; }
    for (const call of reply.toolCalls) {
      const before = client.calls.length;
      const output = await runTool(ctx, call.name, call.input ?? {});
      trace.push({
        step,
        tool: call.name,
        input: call.input,
        qloo_calls: client.calls.slice(before).map((c) => ({ path: c.path, params: c.params })),
        error: output.error ?? null,
        summary: summarize(call.name, output),
      });
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: JSON.stringify(output) });
    }
  }
  return { narrative, itinerary: ctx.itinerary, trace, resolved: { entities: Object.values(ctx.entities), tags: Object.values(ctx.tags) } };
}

function summarize(name, o) {
  if (o.error) return `error: ${o.error}`;
  if (name === "search_entity" || name === "find_tags") return (o.results ?? []).map((r) => r.name).join(", ") || "no match";
  if (name === "taste_insights") return `${o.count} places, top: ${(o.results ?? []).slice(0, 3).map((p) => p.name).join(", ")}`;
  if (name === "compose_day") return `${o.stops?.length ?? 0} stops`;
  return "";
}

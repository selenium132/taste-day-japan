// Cloudflare Pages Function. The Qloo key lives in the project's environment, never in the browser.
import { handlePlan } from "../../src/plan.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { status, body: out } = await handlePlan(body, env);
  return Response.json(out, { status });
}

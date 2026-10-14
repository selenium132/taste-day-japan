// Local server: static UI from public/ plus POST /api/plan (same handler as the Cloudflare function).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handlePlan } from "./src/plan.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const port = Number(process.env.PORT || 8787);

http
  .createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/plan") {
      let raw = "";
      for await (const c of req) { raw += c; if (raw.length > 20000) break; }
      let body = {};
      try { body = JSON.parse(raw); } catch { /* handled by validation */ }
      const { status, body: out } = await handlePlan(body, process.env);
      res.writeHead(status, { "content-type": "application/json" });
      return res.end(JSON.stringify(out));
    }
    const p = normalize(req.url.split("?")[0]).replace(/^(\.\.[/\\])+/, "");
    const rel = p === "/" ? "/index.html" : p;
    try {
      const file = await readFile(join(root, rel));
      res.writeHead(200, { "content-type": types[extname(rel)] || "application/octet-stream" });
      res.end(file);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  })
  .listen(port, () => console.log(`http://localhost:${port}  mode=${process.env.QLOO_API_KEY ? "live" : "replay"}`));

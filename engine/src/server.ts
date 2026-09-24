import { serve } from "@hono/node-server";
import { Hono } from "hono";

const PORT = Number(process.env.ENGINE_PORT ?? 8787);

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true, service: "compass-engine" }));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Compass engine listening on http://localhost:${PORT}`);
});

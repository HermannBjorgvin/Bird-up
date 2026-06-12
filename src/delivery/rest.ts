import { Hono } from "hono";
import type { Context } from "hono";
import { REYKJAVIK_ECO } from "../adapters/fixture-campsites";
import { FixtureWeatherSource } from "../adapters/fixture-weather";
import { InvalidParamsError } from "../core/errors";
import { getWindows, type ServiceDeps, type WindowsParams } from "../service";

type AppContext = Context<{ Bindings: Env }>;

export const restRoutes = new Hono<{ Bindings: Env }>();

// CORS: read-only public data, `*` on every /api/* response (spec 03) — keeps the external-cron
// door open so a poller still reads error envelopes cross-origin.
restRoutes.use("*", async (c, next) => {
  await next();
  c.res.headers.set("Access-Control-Allow-Origin", "*");
});

restRoutes.get("/health", (c) => c.json({ ok: true }));

restRoutes.get("/windows", (c) => {
  const q = c.req.query();
  return handleWindows(c, { start_date: q.start_date, end_date: q.end_date });
});

restRoutes.post("/windows", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorEnvelope(c, "INVALID_PARAMS", "request body must be valid JSON", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorEnvelope(c, "INVALID_PARAMS", "request body must be a JSON object", 400);
  }
  const b = body as Record<string, unknown>;
  return handleWindows(c, {
    start_date: typeof b.start_date === "string" ? b.start_date : undefined,
    end_date: typeof b.end_date === "string" ? b.end_date : undefined,
    thresholds: b.thresholds,
  });
});

// Unknown /api/* path → JSON 404 envelope, never the SPA shell (spec 03; carried over from S01 review).
restRoutes.all("*", (c) => errorEnvelope(c, "NOT_FOUND", `no such endpoint: ${c.req.path}`, 404));

/** S03 deps: fixture weather + the one hardcoded campsite. Slice 2+ swaps in KV-backed sources. */
function deps(c: AppContext): ServiceDeps {
  return { weather: new FixtureWeatherSource(), campsite: REYKJAVIK_ECO, baseUrl: c.env.BASE_URL };
}

async function handleWindows(c: AppContext, params: WindowsParams): Promise<Response> {
  try {
    const recommendation = await getWindows(params, deps(c));
    if (c.req.method === "GET") c.header("Cache-Control", "public, max-age=300"); // GETs are cacheable; POSTs aren't
    return c.json(recommendation);
  } catch (err) {
    if (err instanceof InvalidParamsError) {
      return errorEnvelope(c, err.code, err.message, 400);
    }
    console.error("unexpected error in /api/windows", err);
    return errorEnvelope(c, "INTERNAL", "internal error", 500);
  }
}

function errorEnvelope(c: AppContext, code: string, message: string, status: 400 | 404 | 500): Response {
  return c.json({ error: { code, message } }, status);
}

import { Hono } from "hono";
import type { Context } from "hono";
import { CAMP_SITES_KEY } from "../adapters/kv-campsites";
import { KvStore } from "../adapters/kv-store";
import { KvWeatherSource } from "../adapters/kv-weather";
import { InvalidParamsError, StaleDataUnavailableError } from "../core/errors";
import { OSM_ATTRIBUTION } from "../core/recommend";
import type { CampsiteBlob } from "../ports/campsites";
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

// The normalized campsite list from KV (spec 03: debug/website bootstrap). Served from KV only —
// 503 until refresh-campsites has populated it.
restRoutes.get("/campsites", async (c) => {
  const blob = await new KvStore(c.env.KV).getJson<CampsiteBlob>(CAMP_SITES_KEY);
  if (!blob) {
    return errorEnvelope(c, "STALE_DATA_UNAVAILABLE", "campsite list not populated yet", 503);
  }
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({
    fetchedAt: blob.fetchedAt,
    source: blob.source,
    count: blob.sites.length,
    sites: blob.sites,
    attribution: [OSM_ATTRIBUTION],
  });
});

// Unknown /api/* path → JSON 404 envelope, never the SPA shell (spec 03; carried over from S01 review).
restRoutes.all("*", (c) => errorEnvelope(c, "NOT_FOUND", `no such endpoint: ${c.req.path}`, 404));

/** Both KV-backed (S06): the digest from refresh-weather + the real campsite list from refresh-campsites. */
async function deps(c: AppContext): Promise<ServiceDeps> {
  const store = new KvStore(c.env.KV);
  const campsites = await store.getJson<CampsiteBlob>(CAMP_SITES_KEY);
  return {
    weather: new KvWeatherSource(store),
    campsites: campsites?.sites ?? [],
    campsitesFetchedAt: campsites?.fetchedAt ?? "",
    baseUrl: c.env.BASE_URL,
  };
}

async function handleWindows(c: AppContext, params: WindowsParams): Promise<Response> {
  try {
    const recommendation = await getWindows(params, await deps(c));
    if (c.req.method === "GET") c.header("Cache-Control", "public, max-age=300"); // GETs are cacheable; POSTs aren't
    return c.json(recommendation);
  } catch (err) {
    if (err instanceof InvalidParamsError) {
      return errorEnvelope(c, err.code, err.message, 400);
    }
    if (err instanceof StaleDataUnavailableError) {
      return errorEnvelope(c, err.code, err.message, 503);
    }
    console.error("unexpected error in /api/windows", err);
    return errorEnvelope(c, "INTERNAL", "internal error", 500);
  }
}

function errorEnvelope(c: AppContext, code: string, message: string, status: 400 | 404 | 500 | 503): Response {
  return c.json({ error: { code, message } }, status);
}

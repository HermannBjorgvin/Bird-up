import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_DIGEST } from "../../src/adapters/fixture-weather";
import { CAMP_SITES_KEY } from "../../src/adapters/kv-campsites";
import { WX_DIGEST_KEY } from "../../src/adapters/kv-weather";
import { REYKJAVIK_ECO } from "../../src/adapters/seed-campsites";
import { Recommendation } from "../../src/core/types";
import type { CampsiteBlob } from "../../src/ports/campsites";

const ORIGIN = "https://tjaldur.test";
const RANGE = "start_date=2026-06-12&end_date=2026-06-27";

// The S03 fixture digest, served from KV now (S04): one site, one clear window. A fresh
// `fetchedAt` keeps the staleness rules quiet — staleness.test.ts exercises them.
const FRESH_DIGEST = { ...FIXTURE_DIGEST, fetchedAt: new Date().toISOString() };
// The read path scores campsites from camp:sites:v1 (S06); seed the one matching the digest's id.
const CAMP_BLOB: CampsiteBlob = { fetchedAt: "2026-06-13T00:00:00Z", source: "osm", sites: [REYKJAVIK_ECO] };

beforeAll(async () => {
  await env.KV.put(WX_DIGEST_KEY, JSON.stringify(FRESH_DIGEST));
  await env.KV.put(CAMP_SITES_KEY, JSON.stringify(CAMP_BLOB));
});
afterAll(async () => {
  await env.KV.delete(WX_DIGEST_KEY);
  await env.KV.delete(CAMP_SITES_KEY);
});

async function getWindows(query: string): Promise<Response> {
  return exports.default.fetch(new Request(`${ORIGIN}/api/windows?${query}`));
}

async function postWindows(body: unknown): Promise<Response> {
  return exports.default.fetch(
    new Request(`${ORIGIN}/api/windows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("GET/POST /api/windows (served from KV)", () => {
  it("GET returns 200 and a body that parses against the Recommendation schema", async () => {
    const res = await getWindows(RANGE);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");

    const rec = Recommendation.parse(await res.json());
    expect(rec.attribution.length).toBeGreaterThan(0);
    expect(rec.policyVersion).toBe("2026-06.2");
    expect(rec.dataAge.weatherFetchedAt).toBe(FRESH_DIGEST.fetchedAt); // proves the KV blob is the source
    expect(rec.dataAge.stale).toBe(false);
    expect(rec.warnings).toEqual([]);
    expect(rec.windows).toHaveLength(1);
    expect(rec.windows[0]!.tier).toBe("excellent");
    expect(rec.windows[0]!.start).toBe("2026-06-16");
    expect(rec.windows[0]!.campsites[0]!.name).toBe("Reykjavík Eco Campsite");
  });

  it("POST with a JSON body behaves identically to GET", async () => {
    const res = await postWindows({ start_date: "2026-06-12", end_date: "2026-06-27" });
    expect(res.status).toBe(200);
    const rec = Recommendation.parse(await res.json());
    expect(rec.windows.map((w) => w.id)).toEqual(["reykjavik:2026-06-16:2026-06-18"]);
  });

  it("answers with zero subrequests at request time (KV only, no weather fetch)", async () => {
    const realFetch = globalThis.fetch;
    // Tests and the worker share one isolate in the post-0.13 pool, so this fake intercepts any
    // outbound fetch the request handler would attempt. KV/service bindings don't go through it.
    globalThis.fetch = (() => {
      throw new Error("unexpected subrequest at request time");
    }) as typeof fetch;
    try {
      const res = await getWindows(RANGE);
      expect(res.status).toBe(200);
      Recommendation.parse(await res.json());
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("a valid thresholds override changes results and stamps policyVersion +custom", async () => {
    const res = await postWindows({
      start_date: "2026-06-12",
      end_date: "2026-06-27",
      thresholds: { hardFloor: { minPeakTempC: 14 } },
    });
    expect(res.status).toBe(200);
    const rec = Recommendation.parse(await res.json());
    expect(rec.policyVersion).toBe("2026-06.2+custom");
    expect(rec.windows.length).toBeGreaterThan(1); // floor lowered → more qualifying runs
  });

  it("an out-of-bounds override returns 400 INVALID_PARAMS", async () => {
    const res = await postWindows({
      start_date: "2026-06-12",
      end_date: "2026-06-27",
      thresholds: { hardFloor: { minPeakTempC: 50 } },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_PARAMS");
  });

  it("rejects missing, malformed, reversed, and beyond-horizon dates with 400 INVALID_PARAMS", async () => {
    const cases = [
      "end_date=2026-06-27", // missing start
      "start_date=nope&end_date=2026-06-27", // malformed
      "start_date=2026-06-20&end_date=2026-06-14", // reversed
      "start_date=2026-06-12&end_date=2026-06-28", // beyond the 16-day horizon
    ];
    for (const q of cases) {
      const res = await getWindows(q);
      expect(res.status, q).toBe(400);
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code, q).toBe("INVALID_PARAMS");
      expect(body.error.message.length, q).toBeGreaterThan(0);
    }
  });

  it("a non-object JSON body (e.g. 42) is rejected with 400 INVALID_PARAMS", async () => {
    const res = await exports.default.fetch(
      new Request(`${ORIGIN}/api/windows`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "42",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_PARAMS");
  });

  it("an unknown /api/* path returns the JSON 404 NOT_FOUND envelope, not the SPA shell", async () => {
    const res = await exports.default.fetch(new Request(`${ORIGIN}/api/does-not-exist`));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe("*"); // CORS on errors too (spec 03)
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("error responses still carry the CORS header", async () => {
    const res = await getWindows("start_date=bad&end_date=2026-06-27");
    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

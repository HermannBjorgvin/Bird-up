import { introspectWorkflowInstance } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CAMP_SITES_KEY } from "../../src/adapters/kv-campsites";
import { Campsite } from "../../src/core/types";
import type { CampsiteBlob } from "../../src/ports/campsites";

const ORIGIN = "https://tjaldur.test";

// Two synthetic campsites; the first matches the shipped data/campsite-overrides.json entry.
const FAKE_SITES: Campsite[] = [
  { id: "tjaldsvaedi-i-laugardal", name: "Tjaldsvæði í Laugardal", lat: 64.14, lng: -21.88, region: "reykjavik", facilities: { toilets: true, showers: true }, source: "osm" },
  { id: "thakgil", name: "Þakgil", lat: 63.53, lng: -18.85, region: "vik", facilities: {}, source: "osm" },
];

describe("refresh-campsites workflow", () => {
  // The fetch step is mocked, so the workflow must make zero live calls — throw if it tries.
  let realFetch: typeof fetch;
  beforeEach(() => {
    realFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("unexpected subrequest in refresh-campsites test");
    }) as typeof fetch;
  });
  afterEach(async () => {
    globalThis.fetch = realFetch;
    await env.KV.delete(CAMP_SITES_KEY);
  });

  it("writes camp:sites:v1 with the normalized list, overrides merged, fresh fetchedAt", async () => {
    await using instance = await introspectWorkflowInstance(env.REFRESH_CAMPSITES, "camp-success");
    await instance.modify(async (m) => {
      await m.mockStepResult({ name: "fetch campsites (osm)" }, FAKE_SITES);
    });

    const before = Date.now();
    await env.REFRESH_CAMPSITES.create({ id: "camp-success" });
    await instance.waitForStatus("complete");

    expect(await instance.getOutput()).toEqual({ fetchedAt: expect.any(String), sites: 2 });

    const blob = (await env.KV.get(CAMP_SITES_KEY, "json")) as CampsiteBlob | null;
    expect(blob).not.toBeNull();
    expect(blob!.source).toBe("osm");
    expect(Date.parse(blob!.fetchedAt)).toBeGreaterThanOrEqual(before); // stamped inside the write step
    for (const s of blob!.sites) Campsite.parse(s);

    const laugardalur = blob!.sites.find((s) => s.id === "tjaldsvaedi-i-laugardal")!;
    expect(laugardalur.campingCard).toBe(true); // merged from data/campsite-overrides.json
    expect(laugardalur.bookingUrl).toBe("https://reykjavikcampsite.is/");
    expect(laugardalur.facilities).toEqual({ toilets: true, showers: true }); // adapter fields kept
  });
});

describe("GET /api/campsites", () => {
  afterEach(async () => {
    await env.KV.delete(CAMP_SITES_KEY);
  });

  it("503s before refresh-campsites has populated the list", async () => {
    const res = await exports.default.fetch(new Request(`${ORIGIN}/api/campsites`));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("STALE_DATA_UNAVAILABLE");
  });

  it("returns the list with OSM attribution and cache headers once populated", async () => {
    const blob: CampsiteBlob = { fetchedAt: "2026-06-13T00:00:00Z", source: "osm", sites: FAKE_SITES };
    await env.KV.put(CAMP_SITES_KEY, JSON.stringify(blob));

    const res = await exports.default.fetch(new Request(`${ORIGIN}/api/campsites`));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await res.json()) as { count: number; sites: unknown[]; attribution: string[] };
    expect(body.count).toBe(2);
    expect(body.sites).toHaveLength(2);
    expect(body.attribution).toContain("Campsite data © OpenStreetMap contributors");
  });
});

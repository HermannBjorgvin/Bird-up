import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_DIGEST } from "../../src/adapters/fixture-weather";
import { CAMP_SITES_KEY } from "../../src/adapters/kv-campsites";
import { WX_DIGEST_KEY } from "../../src/adapters/kv-weather";
import { REYKJAVIK_ECO } from "../../src/adapters/seed-campsites";
import { Recommendation } from "../../src/core/types";
import type { CampsiteBlob } from "../../src/ports/campsites";

const URL_ = "https://tjaldur.test/api/windows?start_date=2026-06-12&end_date=2026-06-27";
const CAMP_BLOB: CampsiteBlob = { fetchedAt: "2026-06-13T00:00:00Z", source: "osm", sites: [REYKJAVIK_ECO] };

/** Seed the fixture digest with a back-dated `fetchedAt` (spec 07: staleness by back-dating), plus
 *  the matching campsite the read path scores against (S06: campsites come from camp:sites:v1). */
async function seedAgedDigest(ageHours: number): Promise<string> {
  const fetchedAt = new Date(Date.now() - ageHours * 3_600_000).toISOString();
  await env.KV.put(WX_DIGEST_KEY, JSON.stringify({ ...FIXTURE_DIGEST, fetchedAt }));
  await env.KV.put(CAMP_SITES_KEY, JSON.stringify(CAMP_BLOB));
  return fetchedAt;
}

afterEach(async () => {
  await env.KV.delete(WX_DIGEST_KEY);
  await env.KV.delete(CAMP_SITES_KEY);
});

describe("staleness & degradation (spec 03: serve stale with flags, never refuse)", () => {
  it("a digest older than 6 h is served with dataAge.stale: true and a warning", async () => {
    const fetchedAt = await seedAgedDigest(7);
    const res = await exports.default.fetch(new Request(URL_));
    expect(res.status).toBe(200);

    const rec = Recommendation.parse(await res.json());
    expect(rec.dataAge.weatherFetchedAt).toBe(fetchedAt);
    expect(rec.dataAge.stale).toBe(true);
    expect(rec.warnings).toEqual(["forecast data is more than 6 hours old"]);
    expect(rec.windows.length).toBeGreaterThan(0); // still a real answer
  });

  it("a digest older than 24 h carries the stronger warning string", async () => {
    await seedAgedDigest(25);
    const res = await exports.default.fetch(new Request(URL_));
    expect(res.status).toBe(200);

    const rec = Recommendation.parse(await res.json());
    expect(rec.dataAge.stale).toBe(true);
    expect(rec.warnings).toEqual(["forecast data is over a day old; treat windows as indicative"]);
  });

  it("no digest in KV at all → 503 STALE_DATA_UNAVAILABLE (pre-first-refresh only)", async () => {
    const res = await exports.default.fetch(new Request(URL_));
    expect(res.status).toBe(503);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("STALE_DATA_UNAVAILABLE");
    expect(body.error.message.length).toBeGreaterThan(0);
  });
});

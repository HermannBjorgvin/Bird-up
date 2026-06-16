import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildNotableUrl, EbirdSource, normalizeNotable, notableCacheKey } from "../../src/adapters/ebird";
import type { Observation } from "../../src/core/birds";
import type { Store } from "../../src/ports/store";

/** Recorded geo-notable payload (PII-free, fields whitelisted by record-fixtures.ts ebird). */
const NOTABLE = JSON.parse(
  readFileSync(new URL("../fixtures/ebird/notable-myvatn.json", import.meta.url).pathname, "utf8"),
) as unknown[];

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 503, json: () => Promise.resolve(body) } as unknown as Response;
}

/** In-memory `Store` that records its puts (key + ttl) so the cache contract can be asserted. */
class FakeStore implements Store {
  readonly data = new Map<string, unknown>();
  readonly puts: Array<{ key: string; ttl: number | undefined }> = [];
  getJson<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.data.has(key) ? this.data.get(key) : null) as T | null);
  }
  putJson(key: string, value: unknown, opts?: { ttlSeconds?: number }): Promise<void> {
    this.data.set(key, value);
    this.puts.push({ key, ttl: opts?.ttlSeconds });
    return Promise.resolve();
  }
}

describe("buildNotableUrl", () => {
  it("targets the geo notable endpoint with the 50 km fetch radius", () => {
    const url = buildNotableUrl(65.64, -16.92);
    expect(url).toContain("/data/obs/geo/recent/notable");
    expect(url).toContain("lat=65.64");
    expect(url).toContain("lng=-16.92");
    expect(url).toContain("dist=50");
    expect(url).not.toContain("detail=full"); // simple form only — no observer PII
  });
});

describe("normalizeNotable (fixture contract)", () => {
  it("normalizes the recorded payload to notable Observations", () => {
    const obs = normalizeNotable(NOTABLE);
    expect(obs.length).toBe(NOTABLE.length);
    expect(obs.every((o) => o.notable)).toBe(true);
    const first = obs[0]!;
    expect(first.speciesCode).toBe("arcloo");
    expect(first.lastSeen).toBe("2026-06-15"); // date sliced from obsDt "2026-06-15 09:40"
    expect(first).not.toHaveProperty("subId"); // metadata dropped
  });

  it("maps an absent howMany to \"X\" (present-but-uncounted)", () => {
    const [o] = normalizeNotable([
      { speciesCode: "x", comName: "X", sciName: "X sp.", obsDt: "2026-06-10 07:00", locName: "L", lat: 65, lng: -17 },
    ]);
    expect(o!.howMany).toBe("X");
  });
});

describe("EbirdSource caching + degradation", () => {
  const key = notableCacheKey("myvatn");

  it("cold cache: fetches once, writes to KV with a 1h TTL", async () => {
    const store = new FakeStore();
    let calls = 0;
    const fetchFn = ((): Promise<Response> => {
      calls++;
      return Promise.resolve(jsonResponse(NOTABLE));
    }) as unknown as typeof fetch;

    const { byRegion, degraded } = await new EbirdSource(store, "k", fetchFn).notableByRegion(["myvatn"]);
    expect(calls).toBe(1);
    expect(degraded).toBe(false);
    expect(byRegion.get("myvatn")!.length).toBe(NOTABLE.length);
    expect(store.puts).toEqual([{ key, ttl: 3600 }]);
  });

  it("warm cache: zero eBird subrequests", async () => {
    const store = new FakeStore();
    const cached: Observation[] = [
      { speciesCode: "arcloo", comName: "Arctic Loon", sciName: "Gavia arctica", lastSeen: "2026-06-15", locName: "L", lat: 65, lng: -17, howMany: 1, notable: true },
    ];
    store.data.set(key, cached);
    let calls = 0;
    const fetchFn = ((): Promise<Response> => {
      calls++;
      return Promise.resolve(jsonResponse(NOTABLE));
    }) as unknown as typeof fetch;

    const { byRegion } = await new EbirdSource(store, "k", fetchFn).notableByRegion(["myvatn"]);
    expect(calls).toBe(0);
    expect(byRegion.get("myvatn")).toEqual(cached);
  });

  it("degrades (never throws) when eBird is down and nothing is cached", async () => {
    const store = new FakeStore();
    const downFetch = (() => Promise.reject(new Error("network"))) as unknown as typeof fetch;
    const { byRegion, degraded } = await new EbirdSource(store, "k", downFetch).notableByRegion(["myvatn"]);
    expect(degraded).toBe(true);
    expect(byRegion.has("myvatn")).toBe(false);

    const errFetch = (() => Promise.resolve(jsonResponse(null, false))) as unknown as typeof fetch;
    const res = await new EbirdSource(store, "k", errFetch).notableByRegion(["myvatn"]);
    expect(res.degraded).toBe(true);
  });
});

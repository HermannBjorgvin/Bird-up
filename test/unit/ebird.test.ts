import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EbirdSource,
  groupByNearestRegion,
  normalizeNotable,
  NOTABLE_CACHE_KEY,
  NOTABLE_CACHE_TTL_S,
} from "../../src/adapters/ebird";
import type { Observation } from "../../src/core/birds";
import type { Store } from "../../src/ports/store";

/** Recorded Iceland-wide notable feed (PII-free, fields whitelisted by record-fixtures.ts ebird). */
const NOTABLE = JSON.parse(
  readFileSync(new URL("../fixtures/ebird/notable-iceland.json", import.meta.url).pathname, "utf8"),
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

describe("normalizeNotable (fixture contract)", () => {
  it("normalizes the recorded country feed to notable Observations", () => {
    const obs = normalizeNotable(NOTABLE);
    expect(obs.length).toBe(NOTABLE.length);
    expect(obs.every((o) => o.notable)).toBe(true);
    const first = obs[0]!;
    expect(first.speciesCode).toBe("eurcoo");
    expect(first.lastSeen).toBe("2026-06-15"); // date sliced from obsDt "2026-06-15 20:29"
    expect(first).not.toHaveProperty("subId"); // metadata dropped
  });

  it("maps an absent howMany to \"X\" (present-but-uncounted)", () => {
    const [o] = normalizeNotable([
      { speciesCode: "x", comName: "X", sciName: "X sp.", obsDt: "2026-06-10 07:00", locName: "L", lat: 65, lng: -17 },
    ]);
    expect(o!.howMany).toBe("X");
  });

  it("skips a malformed record (e.g. obscured coords) rather than failing the whole batch", () => {
    const obs = normalizeNotable([
      { speciesCode: "good", comName: "Good", sciName: "Bonus avis", obsDt: "2026-06-10 07:00", locName: "L", lat: 65, lng: -17 },
      { speciesCode: "bad", comName: "Bad", sciName: "Mala avis", obsDt: "2026-06-10 07:00", locName: "L" }, // no lat/lng
    ]);
    expect(obs.map((o) => o.speciesCode)).toEqual(["good"]);
  });
});

describe("groupByNearestRegion", () => {
  it("buckets every obs to a region anchor (no obs lost)", () => {
    const byRegion = groupByNearestRegion(normalizeNotable(NOTABLE));
    const total = [...byRegion.values()].reduce((n, l) => n + l.length, 0);
    expect(total).toBe(NOTABLE.length);
    expect(byRegion.size).toBeGreaterThan(1);
  });
});

describe("EbirdSource caching + degradation", () => {
  it("cold cache: fetches the country feed once, writes it to KV with a 1h TTL", async () => {
    const store = new FakeStore();
    let calls = 0;
    const fetchFn = ((): Promise<Response> => {
      calls++;
      return Promise.resolve(jsonResponse(NOTABLE));
    }) as unknown as typeof fetch;

    const { byRegion, degraded } = await new EbirdSource(store, "k", fetchFn).notableByRegion();
    expect(calls).toBe(1);
    expect(degraded).toBe(false);
    expect([...byRegion.values()].reduce((n, l) => n + l.length, 0)).toBe(NOTABLE.length);
    expect(store.puts).toEqual([{ key: NOTABLE_CACHE_KEY, ttl: NOTABLE_CACHE_TTL_S }]);
  });

  it("warm cache: zero eBird subrequests", async () => {
    const store = new FakeStore();
    const cached: Observation[] = [
      { speciesCode: "eurcoo", comName: "Eurasian Coot", sciName: "Fulica atra", lastSeen: "2026-06-15", locName: "L", lat: 65.44, lng: -22.2, howMany: 1, notable: true },
    ];
    store.data.set(NOTABLE_CACHE_KEY, cached);
    let calls = 0;
    const fetchFn = ((): Promise<Response> => {
      calls++;
      return Promise.resolve(jsonResponse(NOTABLE));
    }) as unknown as typeof fetch;

    const { byRegion } = await new EbirdSource(store, "k", fetchFn).notableByRegion();
    expect(calls).toBe(0);
    expect([...byRegion.values()].flat()).toEqual(cached);
  });

  it("degrades (never throws) when eBird is down and nothing is cached", async () => {
    const store = new FakeStore();
    const downFetch = (() => Promise.reject(new Error("network"))) as unknown as typeof fetch;
    const { byRegion, degraded } = await new EbirdSource(store, "k", downFetch).notableByRegion();
    expect(degraded).toBe(true);
    expect(byRegion.size).toBe(0);

    const errFetch = (() => Promise.resolve(jsonResponse(null, false))) as unknown as typeof fetch;
    expect((await new EbirdSource(store, "k", errFetch).notableByRegion()).degraded).toBe(true);
  });
});

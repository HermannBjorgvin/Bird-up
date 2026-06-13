import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildForecastUrl, digestLocations, fetchDigests } from "../../src/adapters/openmeteo";
import { SEED_CAMPSITES } from "../../src/adapters/seed-campsites";
import { DailyDigest } from "../../src/core/types";

/**
 * Adapter contract tests (spec 07 layer 2): a hand-built synthetic response pins the digest math
 * exactly; the recorded real response (test/fixtures/openmeteo/) pins our understanding of the
 * upstream shape. No network anywhere.
 */

// --- synthetic response: 2 sites × 2 days, exact math -------------------------------------

const DAY1 = "2026-06-12";
const DAY2 = "2026-06-13";

/** 48 hourly timestamps in Open-Meteo's "YYYY-MM-DDTHH:00" format. */
const hourlyTime = [DAY1, DAY2].flatMap((d) =>
  Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`),
);

/** Daytime (09–21 UTC = the 12 samples 09:00…20:00) gets `day`, night gets `night`. */
function cloudPattern(day1: number, day2: number, night = 100): number[] {
  return [day1, day2].flatMap((v) => Array.from({ length: 24 }, (_, h) => (h >= 9 && h < 21 ? v : night)));
}

function location(daily: Record<string, unknown>, cloud: number[]) {
  return {
    latitude: 64.0,
    longitude: -21.0,
    timezone: "UTC",
    daily_units: {
      temperature_2m_max: "°C",
      precipitation_sum: "mm",
      wind_gusts_10m_max: "km/h",
      wind_speed_10m_max: "km/h",
    },
    daily: { time: [DAY1, DAY2], ...daily },
    hourly: { time: hourlyTime, cloud_cover: cloud },
  };
}

const SITE_A = location(
  {
    temperature_2m_max: [15.2, 18.7],
    temperature_2m_min: [8.1, 9.9],
    precipitation_sum: [0.3, 4.5],
    wind_gusts_10m_max: [37.1, 55.8],
    wind_speed_10m_max: [22.3, 30.6],
  },
  cloudPattern(60, 20), // night hours are 100 — included by mistake, the means shift
);

const SITE_B = location(
  {
    temperature_2m_max: [10.0, 11.5],
    temperature_2m_min: [4.0, 5.5],
    precipitation_sum: [12.0, 0.0],
    wind_gusts_10m_max: [80.0, 30.0],
    wind_speed_10m_max: [45.0, 18.0],
  },
  cloudPattern(75, 0),
);

const TWO_SITES = [
  { id: "site-a", lat: 64.0, lng: -21.0 },
  { id: "site-b", lat: 65.0, lng: -18.0 },
];

describe("digestLocations (synthetic response, exact math)", () => {
  it("splits the response array per site in input order and maps units 1:1", () => {
    const digests = digestLocations(TWO_SITES, [SITE_A, SITE_B]);

    expect(Object.keys(digests)).toEqual(["site-a", "site-b"]);
    expect(digests["site-a"]).toEqual([
      { date: DAY1, tMaxC: 15.2, tMinC: 8.1, precipSumMm: 0.3, gustMaxKmh: 37.1, windMaxKmh: 22.3, cloudMeanDaytimePct: 60 },
      { date: DAY2, tMaxC: 18.7, tMinC: 9.9, precipSumMm: 4.5, gustMaxKmh: 55.8, windMaxKmh: 30.6, cloudMeanDaytimePct: 20 },
    ]);
    expect(digests["site-b"]![0]).toMatchObject({ precipSumMm: 12.0, gustMaxKmh: 80.0, cloudMeanDaytimePct: 75 });
  });

  it("cloudMeanDaytimePct averages exactly the 12 hourly samples 09:00–20:00 UTC", () => {
    // 09:00…20:00 = 50, everything else 100; including 21:00 (or 08:00) would pull the mean above 50.
    const cloud = [DAY1, DAY2].flatMap(() => Array.from({ length: 24 }, (_, h) => (h >= 9 && h < 21 ? 50 : 100)));
    const digests = digestLocations([TWO_SITES[0]!], [location(SITE_A.daily, cloud)]);
    expect(digests["site-a"]![0]!.cloudMeanDaytimePct).toBe(50);
  });

  it("rejects a response whose location count does not match the requested sites", () => {
    expect(() => digestLocations(TWO_SITES, [SITE_A])).toThrow(/location/i);
  });
});

describe("buildForecastUrl (spec 04 call shape)", () => {
  it("batches all coordinates into one call with the spec's daily/hourly params", () => {
    const url = buildForecastUrl(TWO_SITES);
    expect(url).toContain("https://api.open-meteo.com/v1/forecast?");
    expect(url).toContain("latitude=64,65");
    expect(url).toContain("longitude=-21,-18");
    expect(url).toContain("daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,wind_speed_10m_max");
    expect(url).toContain("hourly=cloud_cover");
    expect(url).toContain("forecast_days=16");
    expect(url).toContain("wind_speed_unit=kmh");
    expect(url).toContain("timezone=UTC");
    expect(url).toContain("models=best_match");
  });
});

describe("fetchDigests chunking", () => {
  it("splits 250 coordinates into 3 upstream calls and reassembles results in input order", async () => {
    // Each site's latitude encodes its identity; the fake echoes it back as tMaxC.
    const sites = Array.from({ length: 250 }, (_, i) => ({ id: `s${i}`, lat: 60 + i / 1000, lng: -20 }));
    const calls: number[] = [];

    const fakeFetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const lats = url.searchParams.get("latitude")!.split(",").map(Number);
      calls.push(lats.length);
      const body = lats.map((lat) =>
        location(
          {
            temperature_2m_max: [lat, lat],
            temperature_2m_min: [0, 0],
            precipitation_sum: [0, 0],
            wind_gusts_10m_max: [0, 0],
            wind_speed_10m_max: [0, 0],
          },
          cloudPattern(0, 0),
        ),
      );
      return new Response(JSON.stringify(body));
    }) as typeof fetch;

    const digests = await fetchDigests(sites, fakeFetch);

    expect(calls).toEqual([100, 100, 50]);
    expect(Object.keys(digests)).toEqual(sites.map((s) => s.id));
    expect(digests["s0"]![0]!.tMaxC).toBe(60);
    expect(digests["s137"]![0]!.tMaxC).toBe(60.137);
    expect(digests["s249"]![0]!.tMaxC).toBe(60.249);
  });

  it("throws on a non-OK upstream response", async () => {
    const fakeFetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    await expect(fetchDigests(TWO_SITES, fakeFetch)).rejects.toThrow(/500/);
  });
});

describe("recorded multi-point fixture (the real upstream contract)", () => {
  // .pathname: the workers-typed global URL isn't assignable to node:fs's URL parameter
  const fixture = JSON.parse(
    readFileSync(new URL("../fixtures/openmeteo/forecast-10-sites.json", import.meta.url).pathname, "utf8"),
  ) as unknown;

  it("digests into 16 valid DailyDigest days per seed site, in seed order", () => {
    const digests = digestLocations(SEED_CAMPSITES, fixture);

    expect(Object.keys(digests)).toEqual(SEED_CAMPSITES.map((s) => s.id));
    for (const site of SEED_CAMPSITES) {
      const days = digests[site.id]!;
      expect(days, site.id).toHaveLength(16);
      for (const day of days) {
        DailyDigest.parse(day);
        expect(day.cloudMeanDaytimePct, `${site.id} ${day.date}`).toBeGreaterThanOrEqual(0);
        expect(day.cloudMeanDaytimePct, `${site.id} ${day.date}`).toBeLessThanOrEqual(100);
      }
      // dates are consecutive UTC days starting at the response's own first day
      const first = days[0]!.date;
      expect(days.map((d) => d.date)).toEqual(
        Array.from({ length: 16 }, (_, i) => new Date(Date.parse(`${first}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)),
      );
    }
  });

  it("reproduces the hand-computed digest for reykjavik-eco's first day", () => {
    // Frozen from the recording by hand (jq over the raw JSON), independent of the adapter.
    const digests = digestLocations(SEED_CAMPSITES, fixture);
    expect(digests["reykjavik-eco"]![0]).toEqual({
      date: "2026-06-12",
      tMaxC: 18.8,
      tMinC: 10.7,
      precipSumMm: 4.2,
      gustMaxKmh: 38.9,
      windMaxKmh: 20.9,
      cloudMeanDaytimePct: 26, // mean 26.33 over the 12 daytime samples, rounded
    });
  });

  it("the recording carries the units we map 1:1 (°C, mm, km/h)", () => {
    const locations = fixture as { daily_units: Record<string, string> }[];
    expect(locations).toHaveLength(10);
    for (const loc of locations) {
      expect(loc.daily_units.temperature_2m_max).toBe("°C");
      expect(loc.daily_units.precipitation_sum).toBe("mm");
      expect(loc.daily_units.wind_gusts_10m_max).toBe("km/h");
      expect(loc.daily_units.wind_speed_10m_max).toBe("km/h");
    }
  });
});

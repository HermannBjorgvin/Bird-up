import { describe, expect, it } from "vitest";
import { groupByPlace, peakTempRange } from "../../web/src/lib/grouping";
import type { DailyScore, Recommendation, Region, Window, WindowCampsite } from "../../src/core/types";

/** Side-panel grouping (spec 05): campsites under their placename, each at its single best window. */

function site(id: string, score: number): WindowCampsite {
  return { id, name: id, lat: 64, lng: -19, facilities: {}, source: "osm", score };
}

function win(id: string, region: Region, start: string, sites: WindowCampsite[]): Window {
  return {
    id,
    region,
    start,
    end: start,
    days: 3,
    score: Math.max(0, ...sites.map((s) => s.score)),
    tier: "good",
    confidence: "high",
    mayExtend: false,
    daily: [],
    campsites: sites,
  };
}

function rec(windows: Window[]): Recommendation {
  return {
    generatedAt: "2026-06-13T00:00:00.000Z",
    policyVersion: "2026-06.3",
    dataAge: { weatherFetchedAt: "2026-06-13T00:00:00.000Z", model: "best_match", stale: false, campsitesFetchedAt: "2026-06-01" },
    windows,
    mapUrl: "https://example.test/api/map",
    warnings: [],
    attribution: ["x"],
  };
}

describe("groupByPlace", () => {
  it("returns [] for a null or empty recommendation", () => {
    expect(groupByPlace(null)).toEqual([]);
    expect(groupByPlace(rec([]))).toEqual([]);
  });

  it("buckets campsites under their window's placename", () => {
    const out = groupByPlace(
      rec([
        win("w1", "borgarnes", "2026-06-14", [site("hamar", 70), site("bjarteyjarsandur", 77)]),
        win("w2", "olafsvik", "2026-06-15", [site("olafsvik-tjald", 64)]),
      ]),
    );
    expect(out.map((g) => g.region)).toEqual(["borgarnes", "olafsvik"]);
    const borg = out[0]!;
    expect(borg.name).toBe("Vesturland (Borgarnes)");
    expect(borg.bestScore).toBe(77);
    // sites within a group sort by score desc
    expect(borg.sites.map((s) => s.campsite.id)).toEqual(["bjarteyjarsandur", "hamar"]);
  });

  it("keeps a site once, at its best-scoring window (placename follows that window)", () => {
    const out = groupByPlace(
      rec([
        win("low", "selfoss", "2026-06-14", [site("dup", 30)]),
        win("high", "hella", "2026-06-20", [site("dup", 80)]),
      ]),
    );
    const rows = out.flatMap((g) => g.sites.map((s) => ({ region: g.region, id: s.campsite.id, score: s.score })));
    expect(rows).toEqual([{ region: "hella", id: "dup", score: 80 }]);
  });

  it("orders groups by their best site score, descending", () => {
    const out = groupByPlace(
      rec([
        win("w1", "vik", "2026-06-14", [site("a", 20)]),
        win("w2", "myvatn", "2026-06-15", [site("b", 90)]),
        win("w3", "hofn", "2026-06-16", [site("c", 55)]),
      ]),
    );
    expect(out.map((g) => g.region)).toEqual(["myvatn", "hofn", "vik"]);
  });
});

describe("peakTempRange", () => {
  function dailyTemps(...tMax: number[]): DailyScore[] {
    return tMax.map((tMaxC, i) => ({ date: `2026-06-${13 + i}`, tMaxC, precipSumMm: 0, gustMaxKmh: 10, score: 20 }));
  }
  function winTemps(daily: DailyScore[]): Window {
    return { ...win("w", "vik", "2026-06-13", []), daily };
  }

  it("renders the range of rounded daily highs", () => {
    expect(peakTempRange(winTemps(dailyTemps(12.6, 18.4, 15)))).toBe("13–18°C");
  });
  it("collapses to a single value when the highs are equal after rounding", () => {
    expect(peakTempRange(winTemps(dailyTemps(18.1, 17.8)))).toBe("18°C");
  });
  it("is empty for a window with no daily breakdown", () => {
    expect(peakTempRange(winTemps([]))).toBe("");
  });
});

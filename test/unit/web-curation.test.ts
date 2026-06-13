import { describe, expect, it } from "vitest";
import { curateGroups, groupByPlace, MIN_VISIBLE } from "../../web/src/lib/grouping";
import type { Recommendation, Region, Window, WindowCampsite } from "../../src/core/types";

/** Default-view curation (spec 05): hide the weak (marginal-only) tail, never go empty, toggle reveals all. */

function site(id: string, score: number): WindowCampsite {
  return { id, name: id, lat: 64, lng: -19, facilities: {}, source: "osm", score };
}

function win(id: string, region: Region, tier: Window["tier"], sites: WindowCampsite[]): Window {
  return {
    id,
    region,
    start: "2026-06-14",
    end: "2026-06-16",
    days: 3,
    score: Math.max(0, ...sites.map((s) => s.score)),
    tier,
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

describe("curateGroups", () => {
  it("keeps only good/excellent sites and hides the marginal tail when enough strong sites exist", () => {
    const strong = Array.from({ length: 9 }, (_, i) => site(`g${i}`, 50 + i));
    const weak = [site("m0", 10), site("m1", 11), site("m2", 12)];
    const groups = groupByPlace(rec([win("g", "borgarnes", "good", strong), win("m", "vik", "marginal", weak)]));

    const c = curateGroups(groups, false);
    expect(c.total).toBe(12);
    expect(c.shown).toBe(9);
    expect(c.hasHidden).toBe(true);
    expect(c.groups.map((g) => g.region)).toEqual(["borgarnes"]); // the all-marginal group drops out
  });

  it("falls back to the top MIN_VISIBLE by score when too few sites clear marginal (a cool fortnight)", () => {
    const all = Array.from({ length: 12 }, (_, i) => site(`s${i}`, i)); // scores 0..11
    const c = curateGroups(groupByPlace(rec([win("m", "vik", "marginal", all)])), false);

    expect(c.total).toBe(12);
    expect(c.shown).toBe(MIN_VISIBLE);
    expect(c.hasHidden).toBe(true);
    const kept = c.groups.flatMap((g) => g.sites.map((s) => s.campsite.id));
    expect(kept).toHaveLength(MIN_VISIBLE);
    expect(kept).toContain("s11"); // highest score kept
    expect(kept).not.toContain("s0"); // lowest score dropped
  });

  it("returns every site unchanged when showAll is set, still reporting hasHidden", () => {
    const all = Array.from({ length: 12 }, (_, i) => site(`s${i}`, i));
    const groups = groupByPlace(rec([win("m", "vik", "marginal", all)]));
    const c = curateGroups(groups, true);
    expect(c.shown).toBe(12);
    expect(c.total).toBe(12);
    expect(c.hasHidden).toBe(true);
    expect(c.groups).toBe(groups);
  });

  it("hides nothing (and offers no toggle) when the whole short list already fits", () => {
    const c = curateGroups(
      groupByPlace(rec([win("g", "borgarnes", "good", [site("a", 50), site("b", 40), site("c", 30)])])),
      false,
    );
    expect(c.shown).toBe(3);
    expect(c.total).toBe(3);
    expect(c.hasHidden).toBe(false);
  });

  it("is empty-safe", () => {
    expect(curateGroups([], false)).toEqual({ groups: [], shown: 0, total: 0, hasHidden: false });
  });
});

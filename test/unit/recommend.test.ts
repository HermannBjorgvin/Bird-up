import { describe, expect, it } from "vitest";
import { assembleRecommendation, type AssembleInput } from "../../src/core/recommend";
import type { CoreWindow } from "../../src/core/scoring/windows";
import type { Campsite, DataAge } from "../../src/core/types";

/**
 * Region grouping (S04): per-site windows with the same (region, start, end) merge into one
 * public `Window` with the member campsites ranked inside it; different spans stay separate.
 */

function site(id: string, region: Campsite["region"]): Campsite {
  return { id, name: id, lat: 64, lng: -20, region, facilities: {}, source: "osm" };
}

function win(start: string, end: string, score: number, overrides: Partial<CoreWindow> = {}): CoreWindow {
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
  return {
    start,
    end,
    days,
    score,
    tier: "good",
    confidence: "medium",
    mayExtend: false,
    daily: [{ date: start, tMaxC: 18, precipSumMm: 0, gustMaxKmh: 10, score }],
    ...overrides,
  };
}

const DATA_AGE: DataAge = { weatherFetchedAt: "t", model: "best_match", stale: false, campsitesFetchedAt: "t" };

function assemble(sites: AssembleInput["sites"]) {
  return assembleRecommendation({
    sites,
    policyVersion: "test",
    dataAge: DATA_AGE,
    mapUrl: "https://x/api/map",
    generatedAt: "now",
  });
}

describe("assembleRecommendation (region grouping)", () => {
  it("merges same-region windows with identical spans, campsites ranked by their own score", () => {
    const akureyri = site("akureyri", "akureyri");
    const myvatn = site("myvatn", "akureyri");
    const rec = assemble([
      { campsite: akureyri, windows: [win("2026-06-16", "2026-06-18", 70)] },
      { campsite: myvatn, windows: [win("2026-06-16", "2026-06-18", 85)] },
    ]);

    expect(rec.windows).toHaveLength(1);
    const w = rec.windows[0]!;
    expect(w.id).toBe("akureyri:2026-06-16:2026-06-18");
    expect(w.score).toBe(85); // the best member defines the window
    expect(w.campsites.map((c) => [c.id, c.score])).toEqual([
      ["myvatn", 85],
      ["akureyri", 70],
    ]);
  });

  it("takes daily, tier, confidence and mayExtend from the best-scoring member", () => {
    const best = win("2026-06-16", "2026-06-18", 90, {
      tier: "excellent",
      confidence: "high",
      mayExtend: true,
      daily: [{ date: "2026-06-16", tMaxC: 21, precipSumMm: 0, gustMaxKmh: 8, score: 90 }],
    });
    const rec = assemble([
      { campsite: site("a", "vik"), windows: [win("2026-06-16", "2026-06-18", 60)] },
      { campsite: site("b", "vik"), windows: [best] },
    ]);

    const w = rec.windows[0]!;
    expect(w.tier).toBe("excellent");
    expect(w.confidence).toBe("high");
    expect(w.mayExtend).toBe(true);
    expect(w.daily[0]!.tMaxC).toBe(21);
  });

  it("keeps different spans in the same region as separate windows", () => {
    const rec = assemble([
      { campsite: site("a", "vik"), windows: [win("2026-06-14", "2026-06-16", 60)] },
      { campsite: site("b", "vik"), windows: [win("2026-06-15", "2026-06-17", 65)] },
    ]);
    expect(rec.windows.map((w) => w.id)).toEqual(["vik:2026-06-15:2026-06-17", "vik:2026-06-14:2026-06-16"]);
  });

  it("keeps identical spans in different regions as separate windows", () => {
    const rec = assemble([
      { campsite: site("a", "reykjavik"), windows: [win("2026-06-16", "2026-06-18", 70)] },
      { campsite: site("b", "isafjordur"), windows: [win("2026-06-16", "2026-06-18", 70)] },
    ]);
    expect(rec.windows).toHaveLength(2);
    expect(new Set(rec.windows.map((w) => w.region))).toEqual(new Set(["reykjavik", "isafjordur"]));
  });

  it("sorts windows by score descending, ties broken by soonness", () => {
    const rec = assemble([
      { campsite: site("a", "reykjavik"), windows: [win("2026-06-20", "2026-06-22", 80)] },
      { campsite: site("b", "isafjordur"), windows: [win("2026-06-13", "2026-06-15", 80)] },
      { campsite: site("c", "akureyri"), windows: [win("2026-06-12", "2026-06-14", 95)] },
    ]);
    expect(rec.windows.map((w) => [w.score, w.start])).toEqual([
      [95, "2026-06-12"],
      [80, "2026-06-13"],
      [80, "2026-06-20"],
    ]);
  });

  it("no windows anywhere → an empty windows array, schema still satisfied", () => {
    const rec = assemble([{ campsite: site("a", "reykjavik"), windows: [] }]);
    expect(rec.windows).toEqual([]);
    expect(rec.attribution.length).toBeGreaterThan(0);
  });
});

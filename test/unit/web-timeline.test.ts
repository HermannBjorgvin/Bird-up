import { describe, expect, it } from "vitest";
import { dailyHeat, enumerateDays, windowsInRange } from "../../web/src/lib/timeline";
import { heatColor, HEAT_FULL_SCORE } from "../../web/src/lib/color";
import type { DailyScore, Region, Window } from "../../src/core/types";

function day(date: string, score: number): DailyScore {
  return { date, tMaxC: 15, precipSumMm: 0, gustMaxKmh: 10, score };
}

function win(id: string, region: Region, start: string, end: string, daily: DailyScore[]): Window {
  return {
    id,
    region,
    start,
    end,
    days: daily.length,
    score: Math.max(0, ...daily.map((d) => d.score)),
    tier: "good",
    confidence: "high",
    mayExtend: false,
    daily,
    campsites: [],
  };
}

describe("enumerateDays", () => {
  it("is an inclusive UTC day list", () => {
    expect(enumerateDays("2026-06-13", "2026-06-16")).toEqual(["2026-06-13", "2026-06-14", "2026-06-15", "2026-06-16"]);
  });
  it("handles a single day", () => {
    expect(enumerateDays("2026-06-13", "2026-06-13")).toEqual(["2026-06-13"]);
  });
});

describe("dailyHeat", () => {
  it("takes the per-day max score across covering windows; 0 where no window covers", () => {
    const windows = [
      win("a", "vik", "2026-06-13", "2026-06-14", [day("2026-06-13", 20), day("2026-06-14", 30)]),
      win("b", "hofn", "2026-06-14", "2026-06-15", [day("2026-06-14", 45), day("2026-06-15", 10)]),
    ];
    const heat = dailyHeat(windows, "2026-06-13", "2026-06-16");
    expect(heat).toEqual([
      { date: "2026-06-13", score: 20 },
      { date: "2026-06-14", score: 45 }, // max(30, 45) across the two windows
      { date: "2026-06-15", score: 10 },
      { date: "2026-06-16", score: 0 }, // no window covers this day
    ]);
  });

  it("uses the daily breakdown, not the window mean", () => {
    // window mean would be 20; the bar must show the per-day 5 and 35, not a flat 20.
    const windows = [win("a", "vik", "2026-06-13", "2026-06-14", [day("2026-06-13", 5), day("2026-06-14", 35)])];
    expect(dailyHeat(windows, "2026-06-13", "2026-06-14").map((h) => h.score)).toEqual([5, 35]);
  });
});

describe("windowsInRange", () => {
  const windows = [
    win("before", "vik", "2026-06-10", "2026-06-12", []),
    win("straddle", "hofn", "2026-06-12", "2026-06-15", []),
    win("inside", "myvatn", "2026-06-14", "2026-06-14", []),
    win("after", "hella", "2026-06-20", "2026-06-22", []),
  ];
  it("keeps windows overlapping the range, drops those entirely outside", () => {
    const ids = windowsInRange(windows, { start: "2026-06-13", end: "2026-06-16" }).map((w) => w.id);
    expect(ids).toEqual(["straddle", "inside"]);
  });
});

describe("heatColor", () => {
  it("is white at 0 and saturated green at the full-score cap", () => {
    expect(heatColor(0)).toBe("#ffffff");
    expect(heatColor(HEAT_FULL_SCORE)).toBe("#15803d");
    expect(heatColor(1000)).toBe("#15803d"); // clamped
  });
  it("is monotonic between white and green", () => {
    const low = heatColor(10);
    const high = heatColor(30);
    expect(low).not.toBe("#ffffff");
    expect(low).not.toBe(high);
    // greener = lower red channel (white #ff… → green #15…)
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(red(high)).toBeLessThan(red(low));
  });
});

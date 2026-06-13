import { describe, expect, it } from "vitest";
import { scoreToColor } from "../../web/src/lib/color";

/** Score → marker color (spec 05): continuous grey→green, null/absent = grey. */

const GREY = "#9ca3af";
const GREEN = "#15803d";

function redChannel(hex: string): number {
  return parseInt(hex.slice(1, 3), 16);
}

describe("scoreToColor", () => {
  it("maps the endpoints to grey (0) and green (100)", () => {
    expect(scoreToColor(0)).toBe(GREY);
    expect(scoreToColor(100)).toBe(GREEN);
  });

  it("returns grey for a null / undefined / NaN score (site in no qualifying window)", () => {
    expect(scoreToColor(null)).toBe(GREY);
    expect(scoreToColor(undefined)).toBe(GREY);
    expect(scoreToColor(Number.NaN)).toBe(GREY);
  });

  it("clamps out-of-range scores to the endpoints", () => {
    expect(scoreToColor(-20)).toBe(GREY);
    expect(scoreToColor(140)).toBe(GREEN);
  });

  it("moves monotonically toward green as the score rises (red channel falls)", () => {
    const r = [0, 25, 50, 75, 100].map((s) => redChannel(scoreToColor(s)));
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeLessThan(r[i - 1]!);
  });
});

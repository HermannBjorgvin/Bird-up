import { describe, expect, it } from "vitest";
import { scoreToColor } from "../../web/src/lib/color";

/** Score → marker color (spec 05): continuous khaki→moss-green; null/absent = muted slate. */

const KHAKI = "#bea08c";
const MOSS = "#5d7d3a";
const SLATE = "#6e7c84";

function redChannel(hex: string): number {
  return parseInt(hex.slice(1, 3), 16);
}

describe("scoreToColor", () => {
  it("maps the endpoints to khaki (0) and moss-green (100)", () => {
    expect(scoreToColor(0)).toBe(KHAKI);
    expect(scoreToColor(100)).toBe(MOSS);
  });

  it("returns slate for a null / undefined / NaN score (site in no qualifying window)", () => {
    expect(scoreToColor(null)).toBe(SLATE);
    expect(scoreToColor(undefined)).toBe(SLATE);
    expect(scoreToColor(Number.NaN)).toBe(SLATE);
  });

  it("clamps out-of-range scores to the endpoints", () => {
    expect(scoreToColor(-20)).toBe(KHAKI);
    expect(scoreToColor(140)).toBe(MOSS);
  });

  it("moves monotonically toward moss-green as the score rises (red channel falls)", () => {
    const r = [0, 25, 50, 75, 100].map((s) => redChannel(scoreToColor(s)));
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeLessThan(r[i - 1]!);
  });
});

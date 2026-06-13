import { describe, expect, it } from "vitest";
import { tierScore } from "../../web/src/lib/format";

/** The shared "tier word + N/100" quality string (spec 05): sidebar rows, group headers, map popup. */
describe("tierScore", () => {
  it("pairs the core tier word with the rounded score over 100", () => {
    expect(tierScore("marginal", 26.4)).toBe("marginal 26/100");
    expect(tierScore("excellent", 100)).toBe("excellent 100/100");
  });
  it("rounds the score to the nearest whole number", () => {
    expect(tierScore("good", 40.6)).toBe("good 41/100");
    expect(tierScore("good", 40.4)).toBe("good 40/100");
  });
});

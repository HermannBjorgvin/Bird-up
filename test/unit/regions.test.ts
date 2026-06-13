import { describe, expect, it } from "vitest";
import { assignRegion, REGIONS, REGION_SLUGS } from "../../src/core/regions";

/**
 * Nearest-anchor camping-area assignment (spec 04). Each known campsite must land in its expected
 * area; assignment is total (every coordinate resolves to some anchor — there is no "unassigned").
 */

describe("assignRegion (nearest-anchor camping areas)", () => {
  // One real campsite per distinct area — the spec-06 area-assignment table.
  const KNOWN: [string, number, number, string][] = [
    ["reykjavik-eco", 64.1466, -21.8731, "reykjavik"],
    ["thakgil", 63.53, -18.85, "vik"],
    ["husafell", 64.697, -20.875, "borgarnes"],
    ["akureyri-hamrar", 65.652, -18.104, "akureyri"],
    ["myvatn-bjarg", 65.64, -16.915, "myvatn"],
    ["egilsstadir", 65.263, -14.4, "egilsstadir"],
    ["hofn", 64.268, -15.207, "hofn"],
    ["skaftafell", 64.0167, -16.9667, "skaftafell"],
    ["isafjordur-tungudalur", 66.057, -23.183, "isafjordur"],
  ];

  it.each(KNOWN)("buckets %s into the %s area", (_id, lat, lng, expected) => {
    expect(assignRegion(lat, lng)).toBe(expected);
  });

  it("is total: a point far from every anchor still resolves to the nearest one", () => {
    const slug = assignRegion(60, -30); // out in the Atlantic, southwest of Iceland
    expect(REGION_SLUGS).toContain(slug);
    expect(slug).toBe("reykjanes"); // the closest anchor to the SW
  });

  it("slugs are unique and ascii-folded (stable contract values)", () => {
    expect(new Set(REGION_SLUGS).size).toBe(REGION_SLUGS.length);
    for (const slug of REGION_SLUGS) expect(slug).toMatch(/^[a-z][a-z-]*$/);
  });

  it("has ~24 anchors spread around the country", () => {
    expect(REGIONS.length).toBeGreaterThanOrEqual(20);
    expect(REGIONS.length).toBeLessThanOrEqual(28);
  });
});

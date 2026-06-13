import { describe, expect, it } from "vitest";
import { mergeOverrides } from "../../src/core/overrides";
import type { Campsite } from "../../src/core/types";

function site(id: string): Campsite {
  return { id, name: id, lat: 64, lng: -20, region: "reykjavik", facilities: { toilets: true }, source: "osm" };
}

describe("mergeOverrides (hand-curated enrichment, spec 04)", () => {
  it("applies override fields by id without dropping adapter-sourced fields", () => {
    const { sites, warnings } = mergeOverrides(
      [site("laugardalur"), site("other")],
      { laugardalur: { campingCard: true, bookingUrl: "https://book.is/" } },
    );
    expect(warnings).toEqual([]);
    expect(sites[0]).toMatchObject({
      id: "laugardalur",
      facilities: { toilets: true }, // adapter field preserved
      campingCard: true, // from override
      bookingUrl: "https://book.is/",
      source: "osm",
    });
    expect(sites[1]).toEqual(site("other")); // untouched
  });

  it("warns (never throws) on an override for an unknown id, leaving sites unchanged", () => {
    const input = [site("known")];
    const { sites, warnings } = mergeOverrides(input, { ghost: { campingCard: true } });
    expect(sites).toEqual(input);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("ghost");
  });

  it("is a no-op with no overrides", () => {
    const input = [site("a"), site("b")];
    expect(mergeOverrides(input, {})).toEqual({ sites: input, warnings: [] });
  });

  it("applies the hand-curated offroad flag (highland/F-road sites)", () => {
    const { sites } = mergeOverrides([site("landmannalaugar"), site("vik")], {
      landmannalaugar: { offroad: true },
    });
    expect(sites[0]).toMatchObject({ id: "landmannalaugar", offroad: true });
    expect(sites[1]!.offroad).toBeUndefined(); // unflagged sites stay family-car accessible
  });
});

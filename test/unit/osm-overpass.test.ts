import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { foldSlug, normalizeOverpass } from "../../src/adapters/osm-overpass";
import { REGION_SLUGS, assignRegion } from "../../src/core/regions";
import { Campsite } from "../../src/core/types";

/**
 * OSM Overpass adapter contract tests (spec 07): a synthetic payload pins the tag→Campsite mapping
 * exactly; the recorded real response (test/fixtures/overpass/) pins our understanding of the actual
 * Icelandic data. No network anywhere (hard rule 4).
 */

describe("foldSlug (ascii-folded stable ids, spec 04)", () => {
  it.each([
    ["Þakgil", "thakgil"],
    ["Höfn", "hofn"],
    ["Mývatn", "myvatn"],
    ["Egilsstaðir", "egilsstadir"],
    ["Snæfell", "snaefell"],
    ["Þingvellir", "thingvellir"],
    ["Ásbyrgi", "asbyrgi"],
    ["Hella í Rangárþingi", "hella-i-rangarthingi"],
  ])("%s → %s", (name, slug) => {
    expect(foldSlug(name)).toBe(slug);
  });
});

describe("normalizeOverpass (synthetic, exact mapping)", () => {
  const payload = {
    elements: [
      // node, fully tagged — every facility value class exercised
      {
        type: "node",
        id: 1,
        lat: 64.15,
        lon: -21.94,
        tags: {
          tourism: "camp_site",
          name: "Þakgil",
          toilets: "yes",
          shower: "no",
          drinking_water: "limited", // limited → true
          power_supply: "yes",
          kitchen: "yes",
          opening_hours: "May-Sep",
          fee: "yes",
          website: "https://example.is/thakgil",
        },
      },
      // way: coords from `center`, name via name:en fallback, no facility tags
      { type: "way", id: 2, center: { lat: 65.68, lon: -18.09 }, tags: { tourism: "camp_site", "name:en": "Akureyri Camp" } },
      // slug collision with id 1 → disambiguated by OSM id
      { type: "node", id: 3, lat: 64.0, lon: -17.0, tags: { tourism: "camp_site", name: "Þakgil" } },
      // dropped: no name
      { type: "node", id: 4, lat: 64.0, lon: -20.0, tags: { tourism: "camp_site" } },
      // dropped: no coordinate
      { type: "way", id: 5, tags: { tourism: "camp_site", name: "Ghost" } },
    ],
  };

  const sites = normalizeOverpass(payload);

  it("drops elements without a usable name or coordinate", () => {
    expect(sites.map((s) => s.id)).toEqual(["thakgil", "akureyri-camp", "thakgil-3"]);
  });

  it("maps a fully-tagged node, including yes/no/limited facilities", () => {
    expect(sites[0]).toEqual({
      id: "thakgil",
      name: "Þakgil",
      lat: 64.15,
      lng: -21.94,
      region: assignRegion(64.15, -21.94),
      facilities: { toilets: true, showers: false, water: true, power: true, kitchen: true },
      openingHours: "May-Sep",
      fee: "yes",
      website: "https://example.is/thakgil",
      source: "osm",
    });
  });

  it("takes coords from `center` and name from name:en; absent facility tags stay absent", () => {
    expect(sites[1]).toMatchObject({
      id: "akureyri-camp",
      name: "Akureyri Camp",
      lat: 65.68,
      lng: -18.09,
      facilities: {}, // no facility tags → empty, never fabricated false
      source: "osm",
    });
    expect(sites[1]!.website).toBeUndefined();
  });

  it("disambiguates a slug collision with the persistent OSM id", () => {
    expect(sites[2]!.id).toBe("thakgil-3");
    expect(sites[2]!.name).toBe("Þakgil");
  });
});

describe("recorded Icelandic Overpass fixture (the real contract)", () => {
  // .pathname: the workers-typed global URL isn't assignable to node:fs's URL parameter
  const fixture = JSON.parse(
    readFileSync(new URL("../fixtures/overpass/campsites-iceland.json", import.meta.url).pathname, "utf8"),
  ) as unknown;
  const sites = normalizeOverpass(fixture);

  it("normalizes to the recorded 244 campsites, all schema-valid", () => {
    expect(sites).toHaveLength(244);
    for (const s of sites) Campsite.parse(s);
  });

  it("assigns every site a real camping area, ids unique, all source osm", () => {
    expect(new Set(sites.map((s) => s.id)).size).toBe(sites.length);
    for (const s of sites) {
      expect(REGION_SLUGS).toContain(s.region);
      expect(s.source).toBe("osm");
      expect(Number.isFinite(s.lat) && Number.isFinite(s.lng)).toBe(true);
    }
  });

  it("spreads across most of the country and carries real metadata", () => {
    const regions = new Set(sites.map((s) => s.region));
    expect(regions.size).toBeGreaterThanOrEqual(12); // sites in most of the ~24 areas
    expect(sites.filter((s) => s.website).length).toBeGreaterThan(100); // 127 in this fixture
    expect(sites.filter((s) => Object.keys(s.facilities).length > 0).length).toBeGreaterThan(50);
  });

  it("is deterministic: re-normalizing yields identical ids (stable across refreshes)", () => {
    expect(normalizeOverpass(fixture).map((s) => s.id)).toEqual(sites.map((s) => s.id));
  });
});

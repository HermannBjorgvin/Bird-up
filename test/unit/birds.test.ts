import { describe, expect, it } from "vitest";
import { attachBirds, distanceKm, resolveSeenSpecies, type Observation, type Taxon } from "../../src/core/birds";
import type { Region, Window, WindowCampsite } from "../../src/core/types";

/** Pure birding logic (spec 04): seen-list matching, year-diff, proximity attach. No I/O, no fixtures. */

const TAXONOMY: Taxon[] = [
  { speciesCode: "brngui1", comName: "Brünnich's Guillemot", sciName: "Uria lomvia" },
  { speciesCode: "atlpuf", comName: "Atlantic Puffin", sciName: "Fratercula arctica" },
  { speciesCode: "redpha1", comName: "Red-necked Phalarope", sciName: "Phalaropus lobatus" },
];

describe("resolveSeenSpecies", () => {
  it("matches an exact species code", () => {
    const { seenCodes, warnings } = resolveSeenSpecies(["atlpuf"], TAXONOMY);
    expect([...seenCodes]).toEqual(["atlpuf"]);
    expect(warnings).toEqual([]);
  });

  it("matches a scientific name case-insensitively", () => {
    expect(resolveSeenSpecies(["uria LOMVIA"], TAXONOMY).seenCodes.has("brngui1")).toBe(true);
  });

  it("matches a common name diacritic-tolerantly (Brunnich's ↔ Brünnich's)", () => {
    const { seenCodes, warnings } = resolveSeenSpecies(["Brunnich's Guillemot"], TAXONOMY);
    expect(seenCodes.has("brngui1")).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("puts an unknown name in warnings and never throws", () => {
    const { seenCodes, warnings } = resolveSeenSpecies(["Dragon Finch"], TAXONOMY);
    expect(seenCodes.size).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Dragon Finch");
  });

  it("resolves a mixed list independently (code + sci + com + unknown)", () => {
    const { seenCodes, warnings } = resolveSeenSpecies(
      ["atlpuf", "Phalaropus lobatus", "Brunnich's Guillemot", "Nope Bird"],
      TAXONOMY,
    );
    expect([...seenCodes].sort()).toEqual(["atlpuf", "brngui1", "redpha1"]);
    expect(warnings).toHaveLength(1);
  });

  it("ignores blank entries without warning", () => {
    const { seenCodes, warnings } = resolveSeenSpecies(["", "  "], TAXONOMY);
    expect(seenCodes.size).toBe(0);
    expect(warnings).toEqual([]);
  });
});

describe("distanceKm", () => {
  it("is ~0 for the same point and ~111 km per degree of latitude", () => {
    const a = { lat: 65.64, lng: -16.92 }; // Mývatn anchor
    expect(distanceKm(a, a)).toBeLessThan(0.001);
    const oneDegNorth = distanceKm(a, { lat: 66.64, lng: -16.92 });
    expect(oneDegNorth).toBeGreaterThan(110);
    expect(oneDegNorth).toBeLessThan(112);
  });
});

const SITE: WindowCampsite = { id: "site-a", name: "Site A", lat: 65.64, lng: -16.92, facilities: {}, source: "osm", score: 60 };

function win(campsites: WindowCampsite[] = [SITE], region: Region = "myvatn"): Window {
  return {
    id: `${region}:2026-06-18:2026-06-20`,
    region,
    start: "2026-06-18",
    end: "2026-06-20",
    days: 3,
    score: 60,
    tier: "good",
    confidence: "high",
    mayExtend: false,
    daily: [],
    campsites,
  };
}

function obs(speciesCode: string, over: Partial<Observation> = {}): Observation {
  return {
    speciesCode,
    comName: speciesCode,
    sciName: speciesCode,
    lastSeen: "2026-06-17",
    locName: "near the lake",
    lat: 65.64,
    lng: -16.92, // on top of SITE → within 25 km
    howMany: 2,
    notable: false,
    ...over,
  };
}

describe("attachBirds — year diff", () => {
  it("marks seen species unseenThisYear:false and the rest true", () => {
    const obsByRegion = new Map<Region, Observation[]>([["myvatn", [obs("atlpuf"), obs("redpha1")]]]);
    const [w] = attachBirds([win()], obsByRegion, new Set(["atlpuf"]));
    const flags = Object.fromEntries(w!.birds!.map((b) => [b.speciesCode, b.unseenThisYear]));
    expect(flags).toEqual({ atlpuf: false, redpha1: true });
  });

  it("marks all unseenThisYear:true for an empty seen list", () => {
    const obsByRegion = new Map<Region, Observation[]>([["myvatn", [obs("atlpuf"), obs("redpha1")]]]);
    const [w] = attachBirds([win()], obsByRegion, new Set());
    expect(w!.birds!.every((b) => b.unseenThisYear)).toBe(true);
  });

  it("flags notable independently of seen-ness, and ranks unseen → notable → recent", () => {
    const obsByRegion = new Map<Region, Observation[]>([
      [
        "myvatn",
        [
          obs("atlpuf", { notable: false, lastSeen: "2026-06-10" }), // seen, common
          obs("redpha1", { notable: true, lastSeen: "2026-06-12" }), // seen, notable
          obs("brngui1", { notable: false, lastSeen: "2026-06-15" }), // unseen
        ],
      ],
    ]);
    const [w] = attachBirds([win()], obsByRegion, new Set(["atlpuf", "redpha1"]));
    expect(w!.birds!.map((b) => b.speciesCode)).toEqual(["brngui1", "redpha1", "atlpuf"]);
    expect(w!.birds!.find((b) => b.speciesCode === "redpha1")!.notable).toBe(true);
  });
});

describe("attachBirds — proximity & dedupe", () => {
  it("attaches only observations within 25 km of a campsite", () => {
    const far = obs("brngui1", { lat: 64.13, lng: -21.9 }); // Reykjavík, ~300 km from the Mývatn site
    const obsByRegion = new Map<Region, Observation[]>([["myvatn", [obs("atlpuf"), far]]]);
    const [w] = attachBirds([win()], obsByRegion, new Set());
    expect(w!.birds!.map((b) => b.speciesCode)).toEqual(["atlpuf"]);
  });

  it("dedupes by species, keeping the most recent sighting", () => {
    const obsByRegion = new Map<Region, Observation[]>([
      ["myvatn", [obs("atlpuf", { lastSeen: "2026-06-10", locName: "old" }), obs("atlpuf", { lastSeen: "2026-06-16", locName: "new" })]],
    ]);
    const [w] = attachBirds([win()], obsByRegion, new Set());
    expect(w!.birds).toHaveLength(1);
    expect(w!.birds![0]!.lastSeen).toBe("2026-06-16");
    expect(w!.birds![0]!.locName).toBe("new");
  });

  it("leaves a window with no nearby obs untouched (no empty birds array)", () => {
    const obsByRegion = new Map<Region, Observation[]>([["selfoss", [obs("atlpuf")]]]); // different region
    const [w] = attachBirds([win()], obsByRegion, new Set());
    expect(w!.birds).toBeUndefined();
  });
});

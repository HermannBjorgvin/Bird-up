import { describe, expect, it } from "vitest";
import {
  FILTER_DEFAULTS,
  filterCapabilities,
  isFilterActive,
  passesFilters,
  passingIds,
} from "../../web/src/lib/filters";
import { formatDuration } from "../../web/src/lib/format";
import type { Campsite } from "../../src/core/types";

function site(id: string, extra: Partial<Campsite> = {}): Campsite {
  return { id, name: id, lat: 64, lng: -20, region: "reykjavik", facilities: {}, source: "osm", ...extra };
}

const reykjavik = site("reykjavik", { driveMinutesFromReykjavik: 5 });
const vik = site("vik", { driveMinutesFromReykjavik: 113 });
const landmannalaugar = site("landmannalaugar", { driveMinutesFromReykjavik: 168, offroad: true });
const newSite = site("new-site"); // no baked attributes yet

describe("isFilterActive", () => {
  it("is false for the defaults and true once either filter is set", () => {
    expect(isFilterActive(FILTER_DEFAULTS)).toBe(false);
    expect(isFilterActive({ familyCarOnly: true, maxDriveMinutes: null })).toBe(true);
    expect(isFilterActive({ familyCarOnly: false, maxDriveMinutes: 120 })).toBe(true);
  });
});

describe("passesFilters", () => {
  it("family-car only excludes offroad sites, keeps unflagged ones", () => {
    const f = { familyCarOnly: true, maxDriveMinutes: null };
    expect(passesFilters(landmannalaugar, f)).toBe(false);
    expect(passesFilters(vik, f)).toBe(true);
    expect(passesFilters(newSite, f)).toBe(true); // no flag ⇒ family-car accessible
  });

  it("a drive cap keeps within-range sites and drops over-range ones", () => {
    const f = { familyCarOnly: false, maxDriveMinutes: 120 };
    expect(passesFilters(reykjavik, f)).toBe(true);
    expect(passesFilters(vik, f)).toBe(true); // 113 ≤ 120
    expect(passesFilters(landmannalaugar, f)).toBe(false); // 168 > 120
  });

  it("a drive cap excludes sites of unknown distance (no baked time)", () => {
    expect(passesFilters(newSite, { familyCarOnly: false, maxDriveMinutes: 600 })).toBe(false);
  });

  it("combines both filters (AND)", () => {
    const f = { familyCarOnly: true, maxDriveMinutes: 200 };
    expect(passesFilters(vik, f)).toBe(true);
    expect(passesFilters(landmannalaugar, f)).toBe(false); // within 200 min but requires 4x4
  });
});

describe("passingIds", () => {
  it("returns null when no filter is active (caller skips narrowing)", () => {
    expect(passingIds([reykjavik, vik], FILTER_DEFAULTS)).toBeNull();
  });

  it("returns the set of passing ids when active", () => {
    const ids = passingIds([reykjavik, vik, landmannalaugar], { familyCarOnly: true, maxDriveMinutes: 120 });
    expect(ids).toEqual(new Set(["reykjavik", "vik"]));
  });
});

describe("filterCapabilities", () => {
  it("reports which attributes the data carries and the max known drive", () => {
    expect(filterCapabilities([reykjavik, vik, landmannalaugar])).toEqual({
      hasDriveTimes: true,
      hasOffroad: true,
      maxDriveMinutes: 168,
    });
  });

  it("reports nothing when the data predates the enrichment", () => {
    expect(filterCapabilities([newSite])).toEqual({
      hasDriveTimes: false,
      hasOffroad: false,
      maxDriveMinutes: 0,
    });
  });
});

describe("formatDuration", () => {
  it("formats minutes as h/m", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(150)).toBe("2h 30m");
  });
});

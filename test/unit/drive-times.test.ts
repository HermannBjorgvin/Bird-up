import { describe, expect, it } from "vitest";
import { mergeDriveTimes } from "../../src/core/drive-times";
import type { Campsite } from "../../src/core/types";

function site(id: string): Campsite {
  return { id, name: id, lat: 64, lng: -20, region: "reykjavik", facilities: {}, source: "osm" };
}

describe("mergeDriveTimes (baked OSRM road times, spec 04)", () => {
  it("sets driveMinutesFromReykjavik by id, leaving other fields intact", () => {
    const merged = mergeDriveTimes([site("vik"), site("myvatn")], { vik: 113, myvatn: 401 });
    expect(merged[0]).toMatchObject({ id: "vik", driveMinutesFromReykjavik: 113, source: "osm" });
    expect(merged[1]!.driveMinutesFromReykjavik).toBe(401);
  });

  it("leaves a site with no baked time unknown (absent, not zero)", () => {
    const merged = mergeDriveTimes([site("new-site")], { vik: 113 });
    expect(merged[0]!.driveMinutesFromReykjavik).toBeUndefined();
  });

  it("is a no-op with no drive times", () => {
    const input = [site("a")];
    expect(mergeDriveTimes(input, {})).toEqual(input);
  });
});

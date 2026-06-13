import type { Campsite } from "./types";

/**
 * Baked road-driving times from Reykjavík to each campsite, keyed by campsite id (spec 04). Generated
 * offline by scripts/record-drive-times.ts via OSRM and committed as data/drive-times.json — drive
 * times don't change week-to-week, so we precompute once rather than call a routing service at runtime.
 * Merged onto the OSM campsite list in the weekly refresh, after overrides. Pure; an entry for an
 * unknown id is ignored (the site list shifts faster than we re-bake; a missing time is just "unknown").
 */
export type DriveTimes = Record<string, number>; // campsite id → minutes from Reykjavík

export function mergeDriveTimes(sites: Campsite[], driveTimes: DriveTimes): Campsite[] {
  return sites.map((s) => {
    const minutes = driveTimes[s.id];
    return minutes === undefined ? s : { ...s, driveMinutesFromReykjavik: minutes };
  });
}

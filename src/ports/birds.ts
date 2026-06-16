import type { Observation } from "../core/birds";
import type { Region } from "../core/types";

/** Notable (rare) eBird sightings near each requested region anchor — the bird overlay (spec 04). */
export interface BirdObservations {
  byRegion: Map<Region, Observation[]>;
  fetchedAt: string; // ISO instant of the freshest fetch/cache read
  degraded: boolean; // true if eBird was unreachable for some region and we served partial/empty data
}

export interface BirdSource {
  /**
   * Notable observations for the given region slugs. **Never throws** — birds are an optional overlay,
   * so an upstream failure degrades (omits that region, sets `degraded`) rather than failing the
   * weather answer (spec 03 degradation rules).
   */
  notableByRegion(regions: Region[]): Promise<BirdObservations>;
}

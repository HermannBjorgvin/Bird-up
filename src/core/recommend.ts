import type { Campsite, DataAge, Recommendation, Region, Window } from "./types";
import type { CoreWindow } from "./scoring/windows";

/** Attribution lines required on every response (spec 04). eBird's line is added with birds. */
export const WEATHER_ATTRIBUTION = "Weather data by Open-Meteo.com";
export const OSM_ATTRIBUTION = "Campsite data © OpenStreetMap contributors";

export interface AssembleInput {
  windows: CoreWindow[];
  region: Region;
  campsites: Campsite[]; // ranked-within-window candidates (S03: the one hardcoded site)
  policyVersion: string;
  dataAge: DataAge;
  mapUrl: string;
  generatedAt: string;
  warnings?: string[];
  attribution?: string[];
}

/**
 * Turn per-site scored windows into the shared `Recommendation` (spec 01). Pure: no I/O, no clock —
 * the caller supplies `generatedAt`, `dataAge` and `mapUrl`. In S03 every window carries the same
 * single campsite, scored by the window score; region grouping arrives with real campsites (Slice 3).
 */
export function assembleRecommendation(input: AssembleInput): Recommendation {
  const windows: Window[] = input.windows.map((w) => ({
    id: `${input.region}:${w.start}:${w.end}`,
    region: input.region,
    start: w.start,
    end: w.end,
    days: w.days,
    score: w.score,
    tier: w.tier,
    confidence: w.confidence,
    mayExtend: w.mayExtend,
    daily: w.daily,
    campsites: input.campsites.map((c) => ({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      facilities: c.facilities,
      source: c.source,
      ...(c.bookingUrl !== undefined ? { bookingUrl: c.bookingUrl } : {}),
      ...(c.campingCard !== undefined ? { campingCard: c.campingCard } : {}),
      score: w.score,
    })),
  }));

  return {
    generatedAt: input.generatedAt,
    policyVersion: input.policyVersion,
    dataAge: input.dataAge,
    windows,
    mapUrl: input.mapUrl,
    warnings: input.warnings ?? [],
    attribution: input.attribution ?? [WEATHER_ATTRIBUTION, OSM_ATTRIBUTION],
  };
}

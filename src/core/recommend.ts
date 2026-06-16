import type { Campsite, DataAge, Recommendation, Window, WindowCampsite } from "./types";
import type { CoreWindow } from "./scoring/windows";

/** Attribution lines required on every response (spec 04). eBird's line is added with birds. */
export const WEATHER_ATTRIBUTION = "Weather data by Open-Meteo.com";
export const OSM_ATTRIBUTION = "Campsite data © OpenStreetMap contributors";
/** Required verbatim when birds are included (spec 04, eBird terms). */
export const EBIRD_ATTRIBUTION = "Bird observation data from eBird.org, Cornell Lab of Ornithology";

/** One site's scored windows, pre-grouping. */
export interface SiteWindows {
  campsite: Campsite;
  windows: CoreWindow[];
}

export interface AssembleInput {
  sites: SiteWindows[];
  policyVersion: string;
  dataAge: DataAge;
  mapUrl: string;
  generatedAt: string;
  warnings?: string[];
  attribution?: string[];
}

/**
 * Turn per-site scored windows into the shared `Recommendation` (spec 01). Pure: no I/O, no clock —
 * the caller supplies `generatedAt`, `dataAge` and `mapUrl`.
 *
 * Grouping (S04): windows sharing (region, start, end) merge into one `Window`; the best-scoring
 * member defines the window's score/tier/confidence/daily, and every member campsite is ranked
 * inside it by its own score. Windows sort by score, ties broken by soonness.
 */
export function assembleRecommendation(input: AssembleInput): Recommendation {
  const groups = new Map<string, { region: Campsite["region"]; best: CoreWindow; campsites: WindowCampsite[] }>();

  for (const { campsite, windows } of input.sites) {
    for (const w of windows) {
      const id = `${campsite.region}:${w.start}:${w.end}`;
      const member: WindowCampsite = {
        id: campsite.id,
        name: campsite.name,
        lat: campsite.lat,
        lng: campsite.lng,
        facilities: campsite.facilities,
        source: campsite.source,
        ...(campsite.bookingUrl !== undefined ? { bookingUrl: campsite.bookingUrl } : {}),
        ...(campsite.campingCard !== undefined ? { campingCard: campsite.campingCard } : {}),
        score: w.score,
      };
      const group = groups.get(id);
      if (!group) {
        groups.set(id, { region: campsite.region, best: w, campsites: [member] });
      } else {
        group.campsites.push(member);
        if (w.score > group.best.score) group.best = w;
      }
    }
  }

  const windows: Window[] = [...groups.entries()].map(([id, g]) => ({
    id,
    region: g.region,
    start: g.best.start,
    end: g.best.end,
    days: g.best.days,
    score: g.best.score,
    tier: g.best.tier,
    confidence: g.best.confidence,
    mayExtend: g.best.mayExtend,
    daily: g.best.daily,
    campsites: g.campsites.sort((a, b) => b.score - a.score),
  }));
  windows.sort((a, b) => b.score - a.score || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

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

import { z } from "zod";
import { assignRegion } from "../core/regions";
import type { Campsite, Facilities } from "../core/types";
import type { CampsiteSource } from "../ports/campsites";

/**
 * OpenStreetMap campsite adapter via the Overpass API (spec 04) — the always-built v1 source.
 * Pure normalization apart from the injected `fetch`; the refresh-campsites workflow runs it weekly.
 * Data is © OpenStreetMap contributors (ODbL) — attribution carried on every response (hard rule 6).
 */

export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/** All campsites in Iceland; `out center` gives ways/relations a representative coordinate. */
export const OVERPASS_QUERY = '[out:json];area["ISO3166-1"="IS"];nwr["tourism"="camp_site"](area);out center;';

/** Polite identifying User-Agent (Overpass usage policy). */
const USER_AGENT = "tjaldur/0.1 (hermann3646@gmail.com)";

const OverpassElement = z.object({
  type: z.string(),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});
const OverpassResponse = z.object({ elements: z.array(OverpassElement) });

/**
 * ASCII-fold a display name to a stable machine slug (spec 04): Þ→th, Ð→d, Æ→ae, accents stripped,
 * everything else lowercased and hyphen-joined. `Þakgil → thakgil`, `Höfn → hofn`, `Mývatn → myvatn`.
 */
export function foldSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/þ/g, "th")
    .replace(/ð/g, "d")
    .replace(/æ/g, "ae")
    .normalize("NFD") // decompose accents (á→a + combining acute, ö→o + combining diaeresis, …)
    .replace(/\p{Diacritic}/gu, "") // strip the combining marks (after NFD: á->a, ö->o)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** OSM yes/limited → true, no → false, anything else (or missing) → absent (spec 04, conservative). */
function tagBool(value: string | undefined): boolean | undefined {
  if (value === "yes" || value === "limited") return true;
  if (value === "no") return false;
  return undefined;
}

function mapFacilities(tags: Record<string, string>): Facilities {
  const f: Facilities = {};
  const toilets = tagBool(tags.toilets);
  const showers = tagBool(tags.shower);
  const water = tagBool(tags.drinking_water);
  const power = tagBool(tags.power_supply);
  const kitchen = tagBool(tags.kitchen);
  if (toilets !== undefined) f.toilets = toilets;
  if (showers !== undefined) f.showers = showers;
  if (water !== undefined) f.water = water;
  if (power !== undefined) f.power = power;
  if (kitchen !== undefined) f.kitchen = kitchen;
  return f;
}

/**
 * Normalize a (parsed) Overpass response to `Campsite[]`. Elements without a usable name or
 * coordinate are dropped (can't form a stable id / can't place on the map). Slug collisions —
 * common, many sites are literally "Tjaldsvæðið" — disambiguate with the persistent OSM id, which
 * keeps every id stable across refreshes: Overpass returns elements in ascending OSM id and ids grow
 * monotonically, so the bare-slug holder is always the oldest site and a newly-mapped duplicate
 * sorts after it (gets the `-{id}` suffix) rather than stealing the bare slug.
 */
export function normalizeOverpass(payload: unknown): Campsite[] {
  const { elements } = OverpassResponse.parse(payload);
  const seen = new Set<string>();
  const sites: Campsite[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name ?? tags["name:en"];
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || lat === undefined || lng === undefined) continue;

    const base = foldSlug(name);
    if (!base) continue;
    const id = seen.has(base) ? `${base}-${el.id}` : base;
    seen.add(id);

    sites.push({
      id,
      name,
      lat,
      lng,
      region: assignRegion(lat, lng),
      facilities: mapFacilities(tags),
      ...(tags.opening_hours ? { openingHours: tags.opening_hours } : {}),
      ...(tags.fee ? { fee: tags.fee } : {}),
      ...(tags.website ? { website: tags.website } : {}),
      source: "osm",
    });
  }
  return sites;
}

/** Fetch + normalize all Icelandic campsites from Overpass. */
export async function fetchCampsites(fetchFn: typeof fetch = fetch): Promise<Campsite[]> {
  const res = await fetchFn(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
  return normalizeOverpass(await res.json());
}

export class OsmOverpassSource implements CampsiteSource {
  private readonly fetchFn: typeof fetch;
  constructor(fetchFn: typeof fetch = fetch) {
    this.fetchFn = fetchFn;
  }
  list(): Promise<Campsite[]> {
    return fetchCampsites(this.fetchFn);
  }
}

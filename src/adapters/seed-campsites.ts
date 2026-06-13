import { assignRegion } from "../core/regions";
import type { Campsite } from "../core/types";

/**
 * Ten real campsites spread across Iceland. As of S06 these are NO LONGER the production site list —
 * both `refresh-weather` and the read path now use the OSM list in `camp:sites:v1`. This set is
 * retained only as the fixed sample behind the Open-Meteo fixture (`scripts/record-fixtures.ts`
 * records forecasts for exactly these ids; `openmeteo.test.ts` + `fixture-weather.ts` assert against
 * them). Coordinates are ~1 km accurate; regions are derived via `assignRegion` (regions.ts).
 */
type SeedSite = Omit<Campsite, "region">;

function withRegion(s: SeedSite): Campsite {
  return { ...s, region: assignRegion(s.lat, s.lng) };
}

/** When this compiled-in list was authored — the honest `campsitesFetchedAt` until S06's KV source. */
export const SEED_CAMPSITES_FETCHED_AT = "2026-06-13T00:00:00Z";

const SERVICED = { toilets: true, showers: true, water: true };

const RAW_SEEDS: SeedSite[] = [
  { id: "reykjavik-eco", name: "Reykjavík Eco Campsite", lat: 64.1466, lng: -21.8731, facilities: { toilets: true, showers: true, water: true, kitchen: true }, source: "osm" },
  { id: "thakgil", name: "Þakgil", lat: 63.53, lng: -18.85, facilities: SERVICED, source: "osm" },
  { id: "husafell", name: "Húsafell", lat: 64.697, lng: -20.875, facilities: SERVICED, source: "osm" },
  { id: "akureyri-hamrar", name: "Hamrar (Akureyri)", lat: 65.652, lng: -18.104, facilities: SERVICED, source: "osm" },
  { id: "myvatn-bjarg", name: "Bjarg (Mývatn)", lat: 65.64, lng: -16.915, facilities: SERVICED, source: "osm" },
  { id: "egilsstadir", name: "Egilsstaðir", lat: 65.263, lng: -14.4, facilities: SERVICED, source: "osm" },
  { id: "hofn", name: "Höfn", lat: 64.268, lng: -15.207, facilities: SERVICED, source: "osm" },
  { id: "skaftafell", name: "Skaftafell", lat: 64.0167, lng: -16.9667, facilities: SERVICED, source: "osm" },
  { id: "isafjordur-tungudalur", name: "Tungudalur (Ísafjörður)", lat: 66.057, lng: -23.183, facilities: SERVICED, source: "osm" },
  { id: "vestmannaeyjar", name: "Herjólfsdalur (Vestmannaeyjar)", lat: 63.442, lng: -20.29, facilities: SERVICED, source: "osm" },
];

export const SEED_CAMPSITES: Campsite[] = RAW_SEEDS.map(withRegion);

/** First seed, region-assigned — kept as a named export for tests/fixtures. */
export const REYKJAVIK_ECO: Campsite = SEED_CAMPSITES[0]!;

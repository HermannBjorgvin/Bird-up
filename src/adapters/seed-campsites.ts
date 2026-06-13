import type { Campsite } from "../core/types";

/**
 * S04 hardcodes ten real campsites spread across Iceland (spec 06 Slice 2) — the site list the
 * `refresh-weather` workflow fetches forecasts for, and the read path's campsite candidates.
 * Coordinates are approximate (within ~1 km — ample for a 2 km weather model) and facilities are
 * a coarse "serviced campsite" guess; S06 replaces all of this with the OSM/tjalda adapter + KV.
 * Region buckets follow ISO 3166-2:IS by traditional county (Höfn/Skaftafell sit in
 * Austur-Skaftafellssýsla → IS-7); S06's point-in-polygon assignment is the durable arbiter.
 */
export const REYKJAVIK_ECO: Campsite = {
  id: "reykjavik-eco",
  name: "Reykjavík Eco Campsite",
  lat: 64.1466,
  lng: -21.8731,
  region: "IS-1",
  facilities: { toilets: true, showers: true, water: true, kitchen: true },
  source: "osm",
};

/** When this compiled-in list was authored — the honest `campsitesFetchedAt` until S06's KV source. */
export const SEED_CAMPSITES_FETCHED_AT = "2026-06-13T00:00:00Z";

const SERVICED = { toilets: true, showers: true, water: true };

export const SEED_CAMPSITES: Campsite[] = [
  REYKJAVIK_ECO,
  { id: "thakgil", name: "Þakgil", lat: 63.53, lng: -18.85, region: "IS-8", facilities: SERVICED, source: "osm" },
  { id: "husafell", name: "Húsafell", lat: 64.697, lng: -20.875, region: "IS-3", facilities: SERVICED, source: "osm" },
  { id: "akureyri-hamrar", name: "Hamrar (Akureyri)", lat: 65.652, lng: -18.104, region: "IS-6", facilities: SERVICED, source: "osm" },
  { id: "myvatn-bjarg", name: "Bjarg (Mývatn)", lat: 65.64, lng: -16.915, region: "IS-6", facilities: SERVICED, source: "osm" },
  { id: "egilsstadir", name: "Egilsstaðir", lat: 65.263, lng: -14.4, region: "IS-7", facilities: SERVICED, source: "osm" },
  { id: "hofn", name: "Höfn", lat: 64.268, lng: -15.207, region: "IS-7", facilities: SERVICED, source: "osm" },
  { id: "skaftafell", name: "Skaftafell", lat: 64.0167, lng: -16.9667, region: "IS-7", facilities: SERVICED, source: "osm" },
  { id: "isafjordur-tungudalur", name: "Tungudalur (Ísafjörður)", lat: 66.057, lng: -23.183, region: "IS-4", facilities: SERVICED, source: "osm" },
  { id: "vestmannaeyjar", name: "Herjólfsdalur (Vestmannaeyjar)", lat: 63.442, lng: -20.29, region: "IS-8", facilities: SERVICED, source: "osm" },
];

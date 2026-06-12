import type { Campsite } from "../core/types";

/**
 * S03 hardcodes a single campsite (spec 06 Slice 1). Reykjavík Eco Campsite sits in Laugardalur,
 * region IS-1 (Höfuðborgarsvæði). Slice 3 replaces this with the OSM/tjalda-sourced list in KV.
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

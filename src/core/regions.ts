/**
 * Camping areas (the grouping `region` in the public contract). Iceland's campsites hug the ring
 * road, so we bucket each site into the nearest of ~24 anchors spread around the coast (plus a
 * couple inland for Þórsmörk/Mývatn-type sites) — Voronoi assignment to a fixed, baked-in table,
 * NOT a runtime clustering algorithm (spec 00/01: fixed grouping over clustering). Replaces the old
 * ISO 3166-2:IS 8-region polygon model: 8 admin regions were too coarse for their members to share
 * weather (Suðurland alone spans Þórsmörk→Höfn), and admin boundaries track politics, not weather.
 *
 * `core/` stays pure: this is baked-in reference data + a deterministic point→slug function, no I/O.
 * The table is tunable — anchors only need to be roughly evenly spaced; nearest-anchor is forgiving.
 */
export interface Anchor {
  slug: string; // ascii-folded (spec 04), stable — it is the `region` value in the contract
  name: string; // UTF-8 display name
  lat: number;
  lng: number;
}

export const REGIONS = [
  // ── Southwest / capital ──
  { slug: "reykjavik", name: "Höfuðborgarsvæðið", lat: 64.13, lng: -21.9 },
  { slug: "reykjanes", name: "Reykjanes", lat: 63.88, lng: -22.43 },
  // ── South ──
  { slug: "selfoss", name: "Árnessýsla (Selfoss)", lat: 63.93, lng: -20.99 },
  { slug: "hella", name: "Rangárþing (Hella)", lat: 63.83, lng: -20.39 },
  { slug: "thorsmork", name: "Þórsmörk & hálendið", lat: 63.69, lng: -19.49 },
  { slug: "vik", name: "Vík í Mýrdal", lat: 63.42, lng: -19.01 },
  { slug: "klaustur", name: "Kirkjubæjarklaustur", lat: 63.79, lng: -18.06 },
  // ── Southeast ──
  { slug: "skaftafell", name: "Öræfi (Skaftafell)", lat: 64.02, lng: -16.97 },
  { slug: "hofn", name: "Höfn í Hornafirði", lat: 64.25, lng: -15.21 },
  { slug: "djupivogur", name: "Djúpivogur", lat: 64.66, lng: -14.28 },
  // ── East ──
  { slug: "egilsstadir", name: "Fljótsdalshérað (Egilsstaðir)", lat: 65.27, lng: -14.39 },
  { slug: "seydisfjordur", name: "Austfirðir (Seyðisfjörður)", lat: 65.26, lng: -13.99 },
  { slug: "vopnafjordur", name: "Vopnafjörður", lat: 65.76, lng: -14.83 },
  // ── North ──
  { slug: "myvatn", name: "Mývatn", lat: 65.64, lng: -16.92 },
  { slug: "husavik", name: "Húsavík & Þingeyjarsýsla", lat: 66.04, lng: -17.34 },
  { slug: "akureyri", name: "Eyjafjörður (Akureyri)", lat: 65.68, lng: -18.09 },
  { slug: "saudarkrokur", name: "Skagafjörður (Sauðárkrókur)", lat: 65.75, lng: -19.64 },
  { slug: "blonduos", name: "Húnaþing (Blönduós)", lat: 65.66, lng: -20.29 },
  // ── Northwest / Westfjords ──
  { slug: "holmavik", name: "Strandir (Hólmavík)", lat: 65.71, lng: -21.69 },
  { slug: "isafjordur", name: "Vestfirðir norður (Ísafjörður)", lat: 66.07, lng: -23.13 },
  { slug: "patreksfjordur", name: "Vestfirðir suður (Patreksfjörður)", lat: 65.59, lng: -23.99 },
  // ── West ──
  { slug: "stykkisholmur", name: "Snæfellsnes norður (Stykkishólmur)", lat: 65.07, lng: -22.73 },
  { slug: "olafsvik", name: "Snæfellsnes vestur (Ólafsvík)", lat: 64.89, lng: -23.71 },
  { slug: "borgarnes", name: "Vesturland (Borgarnes)", lat: 64.54, lng: -21.92 },
] as const satisfies readonly Anchor[];

export type RegionSlug = (typeof REGIONS)[number]["slug"];

/** Non-empty tuple of slugs for `z.enum` (core/types.ts) — values are the runtime validator set. */
export const REGION_SLUGS = REGIONS.map((r) => r.slug) as [RegionSlug, ...RegionSlug[]];

/**
 * The camping area a coordinate belongs to: the nearest anchor by equirectangular distance
 * (longitude scaled by cos(lat) — at ~65°N a degree of longitude is ~0.4× a degree of latitude).
 * Pure and deterministic; ample precision for nearest-of-24 over a country this size.
 */
export function assignRegion(lat: number, lng: number): RegionSlug {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let best: RegionSlug = REGIONS[0].slug;
  let bestD2 = Infinity;
  for (const a of REGIONS) {
    const dLat = a.lat - lat;
    const dLng = (a.lng - lng) * cosLat;
    const d2 = dLat * dLat + dLng * dLng;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = a.slug;
    }
  }
  return best;
}

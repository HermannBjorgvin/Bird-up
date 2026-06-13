import { z } from "zod";
import { REGION_SLUGS } from "./regions";

/**
 * The shared `Recommendation` contract — the single source of truth for MCP, REST and the
 * website (CLAUDE.md hard rule 3). Schema changes after S07 ships are breaking changes.
 *
 * `core/` stays pure: these are plain data shapes, no I/O and no platform types.
 */

/** Camping area — the nearest-anchor grouping for weather windows, campsites and birds (regions.ts). */
export const Region = z.enum(REGION_SLUGS);
export type Region = z.infer<typeof Region>;

/** Campsite facilities — unknown is absent (never `false` unless the source says "no"). */
export const Facilities = z.object({
  toilets: z.boolean().optional(),
  showers: z.boolean().optional(),
  water: z.boolean().optional(),
  power: z.boolean().optional(),
  kitchen: z.boolean().optional(),
});
export type Facilities = z.infer<typeof Facilities>;

/** One site, one forecast day. "Daytime" cloud is 09:00–21:00 UTC (spec 04). */
export const DailyDigest = z.object({
  date: z.iso.date(), // YYYY-MM-DD UTC
  tMaxC: z.number(),
  tMinC: z.number(),
  precipSumMm: z.number(),
  gustMaxKmh: z.number(),
  windMaxKmh: z.number(),
  cloudMeanDaytimePct: z.number().optional(),
});
export type DailyDigest = z.infer<typeof DailyDigest>;

export const Campsite = z.object({
  id: z.string(), // ascii-folded slug, stable across refreshes
  name: z.string(), // UTF-8 display name
  lat: z.number(),
  lng: z.number(),
  region: Region,
  facilities: Facilities,
  openingHours: z.string().optional(),
  fee: z.string().optional(),
  bookingUrl: z.string().optional(),
  campingCard: z.boolean().optional(),
  website: z.string().optional(),
  // Accessibility/access enrichments (optional — backward-compatible additions to the public contract).
  // `offroad`: hand-curated in campsite-overrides.json for highland/F-road-only sites a normal
  // family car cannot reach. `driveMinutesFromReykjavik`: OSRM road-routing minutes, baked offline by
  // scripts/record-drive-times.ts into data/drive-times.json (spec 04). Both absent ⇒ unknown.
  offroad: z.boolean().optional(),
  driveMinutesFromReykjavik: z.number().int().optional(),
  source: z.enum(["tjalda", "osm"]),
});
export type Campsite = z.infer<typeof Campsite>;

export const Tier = z.enum(["excellent", "good", "marginal"]);
export type Tier = z.infer<typeof Tier>;

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

/** Per-day breakdown shown inside a window. */
export const DailyScore = z.object({
  date: z.iso.date(),
  tMaxC: z.number(),
  precipSumMm: z.number(),
  gustMaxKmh: z.number(),
  score: z.number(),
});
export type DailyScore = z.infer<typeof DailyScore>;

export const WindowCampsite = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  facilities: Facilities,
  source: z.enum(["tjalda", "osm"]),
  bookingUrl: z.string().optional(),
  campingCard: z.boolean().optional(),
  score: z.number(),
});
export type WindowCampsite = z.infer<typeof WindowCampsite>;

export const WindowBird = z.object({
  speciesCode: z.string(),
  comName: z.string(),
  sciName: z.string(),
  lastSeen: z.string(),
  locName: z.string(),
  lat: z.number(),
  lng: z.number(),
  howMany: z.union([z.number(), z.literal("X")]),
  unseenThisYear: z.boolean(),
  notable: z.boolean(),
});
export type WindowBird = z.infer<typeof WindowBird>;

export const Window = z.object({
  id: z.string(), // e.g. "vik:2026-06-18:2026-06-21" (region:start:end)
  region: Region,
  start: z.iso.date(),
  end: z.iso.date(),
  days: z.number().int(),
  score: z.number(),
  tier: Tier,
  confidence: Confidence,
  mayExtend: z.boolean(),
  daily: z.array(DailyScore),
  campsites: z.array(WindowCampsite),
  birds: z.array(WindowBird).optional(),
});
export type Window = z.infer<typeof Window>;

export const DataAge = z.object({
  weatherFetchedAt: z.string(),
  model: z.string(),
  stale: z.boolean(),
  campsitesFetchedAt: z.string(),
  birdObsFetchedAt: z.string().optional(),
});
export type DataAge = z.infer<typeof DataAge>;

export const Recommendation = z.object({
  generatedAt: z.string(), // ISO instant
  policyVersion: z.string(), // e.g. "2026-06.2" or "2026-06.2+custom"
  dataAge: DataAge,
  windows: z.array(Window),
  mapUrl: z.string(),
  warnings: z.array(z.string()),
  attribution: z.array(z.string()).min(1), // required, never empty (hard rule 6)
});
export type Recommendation = z.infer<typeof Recommendation>;

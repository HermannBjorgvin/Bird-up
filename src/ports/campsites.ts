import type { Campsite } from "../core/types";

/**
 * The campsite list the read path consumes — mirrors the KV `camp:sites:v1` value (spec 01).
 * Implementations: `osm-overpass.ts` (v1 source) and, post-clearance, `tjalda.ts`. The weekly
 * refresh-campsites workflow runs the configured adapter; everything downstream sees normalized
 * `Campsite` records only.
 */
export interface CampsiteSource {
  list(): Promise<Campsite[]>;
}

/** The `camp:sites:v1` KV blob (spec 01): the normalized list + provenance. */
export interface CampsiteBlob {
  fetchedAt: string; // ISO instant
  source: string; // "osm" (v1)
  sites: Campsite[];
}

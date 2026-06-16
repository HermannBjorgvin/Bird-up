import { z } from "zod";
import type { Observation } from "../core/birds";
import { REGIONS } from "../core/regions";
import type { Region } from "../core/types";
import type { BirdObservations, BirdSource } from "../ports/birds";
import type { Store } from "../ports/store";

/**
 * eBird adapter (spec 04) — the *notable* (rare) sightings overlay. One geographic call per region
 * anchor, cached 1 h in KV. The MVP needs no taxonomy/seen-list (rarities are interesting regardless),
 * so this fetches only `/data/obs/geo/recent/notable` — the **simple** form, which carries the species
 * + location fields but none of the observer PII that `detail=full` adds. Pure URL/normalize helpers
 * are exported for the fixture recorder + contract tests; `EbirdSource` is the cached read path.
 */

const EBIRD_BASE = "https://api.ebird.org/v2";

/** 1 h TTL on the per-region notable cache (spec 04). */
export const NOTABLE_CACHE_TTL_S = 3600;
/** Fetch radius around the anchor = eBird's max; `attachBirds` filters to 25 km of a campsite in core. */
export const FETCH_DIST_KM = 50;
const BACK_DAYS = 14;

/** Versioned KV key for a region's cached notable obs (hard rule 5). */
export function notableCacheKey(region: Region): string {
  return `birds:notable:${region}:v1`;
}

/** Geo notable endpoint around an anchor (spec 04 — simple form: no `detail=full`, so no observer PII). */
export function buildNotableUrl(lat: number, lng: number): string {
  return `${EBIRD_BASE}/data/obs/geo/recent/notable?lat=${lat}&lng=${lng}&dist=${FETCH_DIST_KM}&back=${BACK_DAYS}`;
}

/** Only the fields the normalizer reads; everything else (subId, obsValid, …) is dropped, never stored. */
const RawObs = z.object({
  speciesCode: z.string(),
  comName: z.string(),
  sciName: z.string(),
  obsDt: z.string(), // "YYYY-MM-DD HH:MM"
  locName: z.string(),
  lat: z.number(),
  lng: z.number(),
  howMany: z.number().optional(), // absent → present-but-uncounted ("X")
});

/** Normalize an eBird notable payload to PII-free `Observation[]` (all `notable: true`). */
export function normalizeNotable(payload: unknown): Observation[] {
  return z.array(RawObs).parse(payload).map((o) => ({
    speciesCode: o.speciesCode,
    comName: o.comName,
    sciName: o.sciName,
    lastSeen: o.obsDt.slice(0, 10),
    locName: o.locName,
    lat: o.lat,
    lng: o.lng,
    howMany: o.howMany ?? "X",
    notable: true,
  }));
}

const anchorBySlug = new Map(REGIONS.map((r) => [r.slug, r]));

/** Read-path `BirdSource`: per-region notable obs, KV-cached 1 h, degrading on any upstream failure. */
export class EbirdSource implements BirdSource {
  constructor(
    private readonly store: Store,
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async notableByRegion(regions: Region[]): Promise<BirdObservations> {
    const byRegion = new Map<Region, Observation[]>();
    let degraded = false;

    for (const region of new Set(regions)) {
      const cached = await this.store.getJson<Observation[]>(notableCacheKey(region));
      if (cached !== null) {
        byRegion.set(region, cached);
        continue;
      }
      const anchor = anchorBySlug.get(region);
      if (anchor === undefined) continue;
      try {
        const res = await this.fetchFn(buildNotableUrl(anchor.lat, anchor.lng), {
          headers: { "X-eBirdApiToken": this.apiKey },
        });
        if (!res.ok) throw new Error(`eBird responded ${res.status}`);
        const obs = normalizeNotable(await res.json());
        await this.store.putJson(notableCacheKey(region), obs, { ttlSeconds: NOTABLE_CACHE_TTL_S });
        byRegion.set(region, obs);
      } catch {
        degraded = true; // upstream failed and no cache for this region → omit it, flag degraded
      }
    }

    return { byRegion, fetchedAt: new Date().toISOString(), degraded };
  }
}

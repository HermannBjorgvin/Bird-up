import { z } from "zod";
import type { Observation } from "../core/birds";
import { assignRegion } from "../core/regions";
import type { Region } from "../core/types";
import type { BirdObservations, BirdSource } from "../ports/birds";
import type { Store } from "../ports/store";

/**
 * eBird adapter (spec 04) — the *notable* (rare) sightings overlay. **One** country-level call returns
 * every notable Icelandic sighting; the obs are then bucketed to their nearest region anchor so
 * `attachBirds` can match them to campsites by proximity. One call (not one-per-region) keeps us well
 * under eBird's politeness threshold and inside a single 1 h KV cache. The MVP needs no taxonomy or
 * seen-list (rarities are interesting regardless). Pure helpers are exported for the fixture recorder +
 * contract tests; `EbirdSource` is the cached read path. The simple form carries the species + location
 * fields but none of the observer PII that `detail=full` adds.
 */

/** Iceland-wide notable feed (spec 04). `back=14` matches the forecast horizon's recency. */
export const NOTABLE_URL = "https://api.ebird.org/v2/data/obs/IS/recent/notable?back=14";
/**
 * Identifying User-Agent (spec 04: be polite). Also load-bearing in production: Cloudflare Workers'
 * default outbound fetch sends no real UA, and eBird's edge rejects that — so a request that works from
 * curl and local workerd fails from the deployed Worker without it.
 */
const USER_AGENT = "tjaldur/0.1 (+https://tjaldur.9z.is)";
/** Single versioned KV key for the country feed (hard rule 5). */
export const NOTABLE_CACHE_KEY = "birds:notable:IS:v1";
/** 1 h TTL on the notable cache (spec 04). */
export const NOTABLE_CACHE_TTL_S = 3600;

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

/**
 * Normalize an eBird notable payload to PII-free `Observation[]` (all `notable: true`). Resilient
 * per-record: a record missing required fields (eBird can obscure a sensitive rarity's coordinates) is
 * skipped, not allowed to fail the whole batch — losing one sighting beats losing the entire overlay.
 */
export function normalizeNotable(payload: unknown): Observation[] {
  if (!Array.isArray(payload)) return [];
  const out: Observation[] = [];
  for (const item of payload) {
    const parsed = RawObs.safeParse(item);
    if (!parsed.success) continue;
    const o = parsed.data;
    out.push({
      speciesCode: o.speciesCode,
      comName: o.comName,
      sciName: o.sciName,
      lastSeen: o.obsDt.slice(0, 10),
      locName: o.locName,
      lat: o.lat,
      lng: o.lng,
      howMany: o.howMany ?? "X",
      notable: true,
    });
  }
  return out;
}

/** Group a flat obs list by the nearest region anchor (assignRegion), so attachBirds can match per region. */
export function groupByNearestRegion(obs: Observation[]): Map<Region, Observation[]> {
  const byRegion = new Map<Region, Observation[]>();
  for (const o of obs) {
    const region = assignRegion(o.lat, o.lng);
    const list = byRegion.get(region);
    if (list) list.push(o);
    else byRegion.set(region, [o]);
  }
  return byRegion;
}

/** Read-path `BirdSource`: one cached country notable feed (1 h), grouped by region, degrading on failure. */
export class EbirdSource implements BirdSource {
  constructor(
    private readonly store: Store,
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async notableByRegion(): Promise<BirdObservations> {
    let obs = await this.store.getJson<Observation[]>(NOTABLE_CACHE_KEY);
    let degraded = false;
    if (obs === null) {
      try {
        // Call through a local, not `this.fetchFn(...)`: invoking the global fetch as a method binds
        // `this` to the instance, which the production Workers runtime rejects ("Illegal invocation").
        // Local workerd is lenient, so this only surfaces in prod (cf. the leaflet default-import gotcha).
        const doFetch = this.fetchFn;
        const res = await doFetch(NOTABLE_URL, {
          headers: { "X-eBirdApiToken": this.apiKey, "User-Agent": USER_AGENT },
        });
        if (!res.ok) throw new Error(`eBird responded ${res.status}`);
        obs = normalizeNotable(await res.json());
        await this.store.putJson(NOTABLE_CACHE_KEY, obs, { ttlSeconds: NOTABLE_CACHE_TTL_S });
      } catch (e) {
        // Birds degrade silently for the user (spec 03), but log the upstream cause for the owner's tail.
        console.error("eBird notable fetch failed:", e instanceof Error ? e.message : String(e));
        obs = []; // upstream failed and nothing cached → serve no birds, flag degraded (never throw)
        degraded = true;
      }
    }
    return { byRegion: groupByNearestRegion(obs), fetchedAt: new Date().toISOString(), degraded };
  }
}

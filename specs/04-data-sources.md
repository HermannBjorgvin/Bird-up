# 04 — Data sources

Status: accepted · Last updated: 2026-06-12

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Weather | Open-Meteo `best_match` | DMI HARMONIE 2 km covers Iceland + ECMWF to 10 d; gusts included; no key; batched multi-point; CC BY 4.0 |
| Campsites | tjalda.is primary via a `CampsiteSource` adapter, **behind a discovery spike + legal gate**; OSM Overpass as the always-built fallback | Owner's choice (friendly with the CEO, will clear legal pre-launch); no public tjalda API exists today |
| Birds | eBird API 2.0, on-demand with 1 h KV TTL — no scheduled job | Tiny data volume; fresh-on-use; one less workflow |
| Time | All dates UTC `YYYY-MM-DD` | Iceland is UTC year-round (no DST) — declare it once, never do TZ math |
| "Daytime" | 09:00–21:00 UTC for digest aggregates | Midnight sun makes astronomical daytime meaningless in summer |

## Conventions (all sources)

- **Encoding**: UTF-8 display names everywhere (Þórsmörk stays Þórsmörk). Machine ids/slugs are ASCII-folded: `Þ/þ→th`, `Ð/ð→d`, `Æ/æ→ae`, `Ö/ö→o`, acute accents stripped (`á→a`, `é→e`, `í→i`, `ó→o`, `ú→u`, `ý→y`). Example: `Þakgil → thakgil`.
- **Regions**: every record is bucketed into a camping area ([01-architecture.md](01-architecture.md)) by **nearest-anchor** assignment (`assignRegion(lat, lng)`, `core/regions.ts`) — a baked-in table of ~24 `(slug, name, lat, lng)` anchors, no polygons or GeoJSON. The `region` value is the anchor `slug`.
- **Failure handling**: refresh workflows retry failed steps with backoff and write KV only in their final step; an instance that still errors leaves the previous KV value untouched, and the read path surfaces staleness per [03-api.md](03-api.md).

---

## Open-Meteo (weather)

- **Endpoint**: `https://api.open-meteo.com/v1/forecast` — no key, JSON.
- **Call shape** (batched; chunk at ≤100 coordinates per call, ~3 calls for ~250 sites):

```
?latitude=64.14,65.68,…&longitude=-21.94,-18.09,…
&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,wind_speed_10m_max
&hourly=cloud_cover
&forecast_days=16&wind_speed_unit=kmh&timezone=UTC&models=best_match
```

- **Digest**: per site per day → `DailyDigest` ([01-architecture.md](01-architecture.md)). Daily fields map directly; `cloudMeanDaytimePct` = mean of hourly `cloud_cover` over 09–21 UTC. If hourly cloud digesting threatens a step's 10 ms CPU budget, drop `cloudMeanDaytimePct` to optional — it feeds no score component in policy `2026-06.2`.
- **Cadence**: `refresh-weather` workflow every 2 h → `wx:digest:v1` (~12 upstream batches/day — ~0.4% of Open-Meteo's free 10 k/day even with multi-point weighting).
- **Attribution**: "Weather data by Open-Meteo.com" (CC BY 4.0).
- **Notes**: `best_match` = DMI HARMONIE (2 km, ~2.5 days) spliced with ECMWF IFS (to 10 d) and global models (to 16 d). The ensemble API (`ensemble-api.open-meteo.com`) is the future confidence upgrade ([02-scoring-policy.md](02-scoring-policy.md), doors).

## Campsites

### The `CampsiteSource` port

`list(): Promise<Campsite[]>` — implementations: `tjalda.ts`, `osm-overpass.ts`. The weekly `refresh-campsites` workflow runs the configured adapter; everything downstream sees only the normalized record:

```ts
{
  id: string;            // ascii-folded slug, stable across refreshes
  name: string;          // UTF-8 display name
  lat: number; lng: number;
  region: Region;
  facilities: { toilets?: boolean; showers?: boolean; water?: boolean;
                power?: boolean; kitchen?: boolean };   // unknown = absent
  openingHours?: string;
  fee?: string;
  bookingUrl?: string;   // tjalda.is deep link when known
  campingCard?: boolean; // accepts utilegukortid.is
  website?: string;
  source: "tjalda" | "osm";
}
```

### tjalda.is adapter (primary, gated)

tjalda.is is Iceland's campsite directory + booking platform (booking backend: Parka). It has **no public API**; internal XHR/JSON endpoints are assumed but undiscovered (automated probing is bot-blocked).

**Discovery spike — Slice 3, timeboxed to half a day** ([06-implementation-plan.md](06-implementation-plan.md)). In a normal browser with devtools open, capture:

1. The XHR/fetch endpoints behind `/en/camp-sites/{region}/` listings and `/en/campsite/{slug}` detail pages (URLs, methods, auth/cookies/headers required).
2. Whether a sitemap or `/wp-json/` style index enumerates all campsites.
3. Response payloads for ≥3 campsites across regions → committed as fixtures (`test/fixtures/tjalda/`), with coordinates, facilities, opening dates, booking URL fields identified.
4. Bot-protection behavior at one-request-per-week-per-page politeness levels.

**Decision gate** (recorded in `stories/S05-findings.md`): usable JSON endpoints **and** plausible CEO/legal clearance → build `tjalda.ts` against the fixtures. Otherwise → **OSM-only v1**, tjalda relegated to manually-curated `bookingUrl` enrichment.

**Launch blocker**: the tjalda adapter must not run in production until the owner confirms clearance with tjalda.is. This is a release-checklist item, not a code concern. The adapter must be polite regardless: weekly cadence, identifying User-Agent (`tjaldur/x.y (hermann3646@gmail.com)`), no availability polling in v1.

### OSM Overpass adapter (fallback, always built)

- **Endpoint**: `https://overpass-api.de/api/interpreter`, query:
  `[out:json];area["ISO3166-1"="IS"];nwr["tourism"="camp_site"](area);out center;`
- **Tag mapping**: `name`→name (fallback `name:en`); `center`/node coords→lat/lng; `toilets`→facilities.toilets; `shower`→showers; `drinking_water`→water; `power_supply`→power; `kitchen`→kitchen; `opening_hours`→openingHours; `fee`→fee; `website`→website. Yes-ish values (`yes`/`limited`) → true; `no` → false; missing → absent.
- ~200+ Icelandic sites expected. **Attribution**: "Campsite data © OpenStreetMap contributors (ODbL)".
- Built unconditionally in Slice 3: it proves the `CampsiteSource` contract and is the sanctioned fallback if the gate fails.

### Enrichment (either adapter)

A small checked-in `data/campsite-overrides.json` merged by id after the adapter runs: `campingCard` flags (~40 sites from utilegukortid.is), missing `bookingUrl` deep links, manual corrections. Hand-maintained; survives refreshes.

## eBird (birds)

- **Base**: `https://api.ebird.org/v2`, header `X-eBirdApiToken: ${EBIRD_API_KEY}` (Worker secret; free key from `ebird.org/api/keygen`).
- **Observations**: camping areas are nearest-anchor slugs, not ISO subdivisions, so eBird's region-code endpoint no longer applies — use the **geographic** endpoint `GET /data/obs/geo/recent?lat={anchor.lat}&lng={anchor.lng}&dist={km}&back=14` per area centroid → `birds:obs:{region}`, TTL 1 h. Worst case = the number of distinct areas in the response (≤ the anchor count, well under the 50-subrequest budget); usually a handful, mostly cached. `dist` (radius around the anchor) is a code constant finalized in S09. Summer Iceland volume is dozens-to-low-hundreds of records per area — one call, no paging.
- **Notable** (rarities): `GET /data/obs/{IS-n}/recent/notable` — fetched with the same call pattern; notable species are flagged within the window's bird list (they remain interesting even if seen this year).
- **Taxonomy**: `GET /ref/taxonomy/ebird?fmt=json` (~17 k taxa), fetched lazily once per taxonomy version (`/ref/taxonomy/versions`) → `birds:tax:v{ver}`. Provides the name→`speciesCode` bridge.
- **Seen-list matching pipeline** (pure, `core/birds.ts`): for each `seen_species` entry, try in order — exact eBird species code → scientific name (case-insensitive) → common name (case-insensitive, diacritics-folded). Unmatched → `warnings`. Output: set of seen species codes; each observed species near a window gets `unseenThisYear: !seenCodes.has(code)`.
- **Campsite proximity**: observations are attached to a window's campsites by distance (observation within 25 km of any recommended campsite in the window's region; constant in code, not policy — it's a data heuristic, not weather opinion).
- **MyEBirdData.csv contract** (parsed client-side, [05-website.md](05-website.md)): columns include `Common Name`, `Scientific Name`, `Date`, `State/Province`, `Count`. Rules: filter `Date` to the current year; optionally filter `State/Province` prefix `IS-`; dedupe by `Scientific Name`; `Count` may be the literal `"X"` (present, uncounted) — never `parseInt` blindly. Output of parsing = a plain species list, identical to what MCP callers pass.
- **Terms**: caching of this kind is permitted; bulk redistribution is not (we serve processed recommendations, not feeds); **non-commercial** use only; attribution required verbatim: "Bird observation data from eBird.org, Cornell Lab of Ornithology". No published hard rate limit — be polite, the TTL cache keeps us at a handful of calls/hour.

## Attribution summary (must appear in every API response's `attribution[]` and the website footer)

1. "Weather data by Open-Meteo.com"
2. "Bird observation data from eBird.org, Cornell Lab of Ornithology" (when birds included)
3. "Campsite data © OpenStreetMap contributors" and/or "Campsite data from tjalda.is" per active source

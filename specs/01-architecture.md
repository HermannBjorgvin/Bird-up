# 01 — Architecture

Status: accepted · Last updated: 2026-06-12

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Deployment | One Cloudflare Worker, free plan | 200 req/day needs one deployable unit, not a fleet |
| Repo shape | Single npm package (no workspaces) | One Worker, one deploy |
| Router | Hono | Near-zero overhead, first-class Workers support, clean fallthrough to Static Assets |
| Storage | Workers KV only — no D1, no hand-rolled Durable Objects | ~250 campsites filter fine in memory from one JSON blob |
| Scheduled refresh | Cloudflare Workflows, cron `schedules` declared on each binding | Named jobs (no cron-string dispatch); per-step retries with backoff; each step gets its own free-plan CPU budget — the digest-CPU risk dissolves; per-step instance history in the dashboard |
| MCP transport | `createMcpHandler()` from the `agents` npm package — stateless streamable HTTP | Official current recommendation; no Durable Objects needed; authless |
| Read path | Serves from KV only; never calls weather/campsite APIs inline (eBird is the one on-demand exception, KV-cached 1h) | Fast, cheap, immune to upstream hiccups |
| Map image | SVG templating at `/api/map`, linked by URL | PNG rasterization exceeds the free plan's 10 ms CPU; SVG is string building |
| Regions | Fixed enum of Iceland's 8 regions (ISO 3166-2:IS) | One grouping shared by weather windows, campsites and eBird; no clustering algorithm |
| Language/stack | TypeScript everywhere; zod for all runtime validation | Schemas double as types, validators and test assertions |

## Module boundaries (hexagonal)

```
            ┌────────────────────────── delivery ──────────────────────────┐
            │  rest.ts (Hono /api/*)   mcp.ts (/mcp tools)   map-svg.ts    │
            └───────────────▲──────────────▲───────────────────▲───────────┘
                            │              │                   │
                        service.ts  (orchestration: KV reads → core → Recommendation)
                            │
            ┌───────────────▼─────────────── core (PURE: no I/O, no platform types)
            │  types.ts   scoring/{policy,score,windows}.ts   birds.ts   recommend.ts
            └───────────────▲───────────────────────────────────────────────
                            │ ports (interfaces)
              weather.ts  campsites.ts  birds.ts  store.ts
                            │ adapters (implementations)
              openmeteo.ts  tjalda.ts  osm-overpass.ts  ebird.ts  kv-store.ts
                            ▲
       workflows/refresh-weather.ts (2h schedule)   workflows/refresh-campsites.ts (weekly)
```

Rules:

- `core/` is pure: deterministic functions, takes data + config, returns data. This is where TDD lives and where the scoring policy stays swappable ([02-scoring-policy.md](02-scoring-policy.md)).
- `ports/` are small interfaces (`WeatherSource`, `CampsiteSource`, `BirdSource`, `Store`); adapters implement them; tests fake them trivially.
- `service.ts` is the single orchestrator shared by REST and MCP — both surfaces are thin wrappers over the same call.

## Source tree

```
src/
├── core/
│   ├── types.ts             # Campsite, DailyDigest, Window, Recommendation, Region
│   ├── scoring/
│   │   ├── policy.ts        # ScoringPolicy type + DEFAULT_POLICY + override merge/validate
│   │   ├── score.ts         # scoreDay(digest, baseline, policy)
│   │   └── windows.ts       # findWindows(dayScores[], policy)
│   ├── birds.ts             # seen-list matching, unseen-this-year diff (pure)
│   └── recommend.ts         # assembleRecommendation(windows, campsites, birds?, opts)
├── ports/
│   ├── weather.ts           # WeatherSource: getDigest() → WeatherDigest (the wx:digest:v1 blob)
│   ├── campsites.ts         # CampsiteSource: list() → Campsite[]
│   ├── birds.ts             # BirdSource: recentObs(region), taxonomy()
│   └── store.ts             # Store: getJson/putJson (thin KV wrapper)
├── adapters/
│   ├── openmeteo.ts
│   ├── tjalda.ts            # built only if the Slice-3 spike passes (04-data-sources.md)
│   ├── osm-overpass.ts
│   ├── ebird.ts
│   └── kv-store.ts
├── service.ts
├── delivery/
│   ├── rest.ts
│   ├── mcp.ts
│   └── map-svg.ts
├── workflows/
│   ├── refresh-weather.ts   # WorkflowEntrypoint, 2h schedule on its binding
│   └── refresh-campsites.ts # WorkflowEntrypoint, weekly schedule on its binding
└── index.ts                 # fetch: /mcp → mcp, /api/* → rest, else Static Assets
                             # re-exports the Workflow classes
web/                         # Vite app, built into Static Assets (05-website.md)
test/
└── fixtures/                # recorded upstream responses (07-testing.md)
scripts/
└── record-fixtures.ts       # manual fixture recorder — never run in CI
```

## Request flows

**Read path (every user/agent request):**

1. Validate params with zod (`INVALID_PARAMS` on failure).
2. KV reads: `wx:digest:v1` + `camp:sites:v1` (+ `birds:tax:v{ver}` and `birds:obs:{IS-n}` only when `include_birds`).
3. `core`: per site, score each forecast day against that site's 16-day baseline → find windows → group by region → rank campsites within windows → (optional) bird diff.
4. `assembleRecommendation` → JSON (+ absolute `mapUrl`).

Zero external subrequests, except a cold eBird cache (≤2 subrequests, then KV-cached 1h).

**Scheduled write path (Workflows):**

Each refresh job is a cron-scheduled Workflow (`schedules` on its binding). Work is split into steps; every step has persisted results, automatic retries with backoff, and its own CPU budget:

- `refresh-weather` (every 2 h): step *read site list* from KV → one step per ≤100-coordinate Open-Meteo chunk (fetch + digest into per-site `DailyDigest[16]`) → final step assembles and overwrites `wx:digest:v1`.
- `refresh-campsites` (weekly): step *fetch* via the active `CampsiteSource` adapter → step *normalize* → final step overwrites `camp:sites:v1`.
- Transient upstream hiccups heal inside the instance via step retries (seconds, not the next schedule). If an instance still errors out, the previous KV value is untouched and the read path surfaces staleness ([03-api.md](03-api.md)) — never a crash. KV is written only by the final step, so a partially failed run can never publish partial data.
- **Determinism rule**: every side effect and every nondeterministic read (`fetch`, KV, `Date.now()`, randomness) lives *inside* a `step.do` callback. Code in `run()` outside steps re-executes on every wake/replay and must be pure and deterministic — step results are the only durable state.
- **Overlap caveat**: the final-step-write protects against *partial* data, not *overlapping instances* — with default retry settings a pathological instance could outlive the 2 h cadence and overwrite a fresher digest with older data (impact is bounded: full-blob overwrite, `fetchedAt` travels with it so staleness stays honest). S04 sets explicit per-step `retries`/`timeout` so the worst-case instance lifetime stays under the schedule interval.

## KV schema

| Key | Value | Writer | TTL |
|---|---|---|---|
| `wx:digest:v1` | `{ fetchedAt, model, sites: { [campsiteId]: DailyDigest[16] } }` | `refresh-weather` workflow (2h) | none (overwrite) |
| `camp:sites:v1` | `{ fetchedAt, source, sites: Campsite[] }` | `refresh-campsites` workflow (weekly) | none |
| `birds:tax:v{ver}` | `{ [sciNameLower]: { code, comName } }` | lazy, first need | none |
| `birds:obs:{IS-n}` | recent observations array (`back=14`) | on-demand | 3600 s |

`DailyDigest` = `{ date, tMaxC, tMinC, precipSumMm, gustMaxKmh, windMaxKmh, cloudMeanDaytimePct }` with "daytime" fixed at 09:00–21:00 UTC ([04-data-sources.md](04-data-sources.md)).

Versioning discipline: bump the `:v1` suffix on any shape change — no migrations, caches rebuild themselves on the next scheduled run. Same rule for the website's `tjaldur:seen:v1` localStorage key and `policyVersion`.

## Shared `Recommendation` shape

The one contract consumed by MCP, REST and the website. The zod schema in `core/types.ts` is the single source of truth; this is its shape:

```ts
{
  generatedAt: string;            // ISO instant
  policyVersion: string;          // e.g. "2026-06.2" or "2026-06.2+custom"
  dataAge: {
    weatherFetchedAt: string; model: string; stale: boolean;
    campsitesFetchedAt: string; birdObsFetchedAt?: string;
  };
  windows: Array<{
    id: string;                   // e.g. "IS-8:2026-06-18:2026-06-21"
    region: Region;               // "IS-1" … "IS-8"
    start: string; end: string;   // YYYY-MM-DD, inclusive
    days: number;
    score: number;                // 0–100
    tier: "excellent" | "good" | "marginal";
    confidence: "high" | "medium" | "low";
    mayExtend: boolean;           // touches the forecast horizon
    daily: Array<{ date: string; tMaxC: number; precipSumMm: number;
                   gustMaxKmh: number; score: number }>;
    campsites: Array<{ id: string; name: string; lat: number; lng: number;
                       facilities: Facilities; source: "tjalda" | "osm";
                       bookingUrl?: string; campingCard?: boolean; score: number }>;
    birds?: Array<{ speciesCode: string; comName: string; sciName: string;
                    lastSeen: string; locName: string; lat: number; lng: number;
                    howMany: number | "X"; unseenThisYear: boolean;
                    notable: boolean }>;
  }>;
  mapUrl: string;                 // absolute, built from BASE_URL
  warnings: string[];             // staleness, unmatched species names, …
  attribution: string[];          // required, never empty
}
```

`Region` enum (ISO 3166-2:IS, shared by weather grouping, campsite bucketing and eBird queries): `IS-1` Höfuðborgarsvæði, `IS-2` Suðurnes, `IS-3` Vesturland, `IS-4` Vestfirðir, `IS-5` Norðurland vestra, `IS-6` Norðurland eystra, `IS-7` Austurland, `IS-8` Suðurland.

## Cloudflare deployment

- **Worker** with Static Assets: `web/dist` served for unmatched routes (asset requests are free and unlimited); `/mcp` and `/api/*` handled by the Worker.
- **Workflows**: `refresh-weather` (schedule `0 */2 * * *`) and `refresh-campsites` (`0 3 * * 1`), declared on their bindings (currently commented out behind the schedules-API 403 gate — spec 08, re-enabled in S04); `observability.enabled` for per-step instance history in the dashboard.
- **Secrets/vars**: `EBIRD_API_KEY` (secret); `BASE_URL` (var — MCP clients cannot resolve relative URLs, so `mapUrl` must be absolute).

### Free-tier budget (limits as of June 2026)

| Resource | Free limit | Tjaldur's worst day | Margin |
|---|---|---|---|
| Worker requests | 100,000/day | ~500 (200 searches + assets are free) | ~200× |
| KV reads | 100,000/day | ~800 (≤4/request) | ~125× |
| KV writes | 1,000/day | ~15 (12 weather runs + birds TTL writes + weekly) | ~65× |
| Subrequests | 50/request | ≤4 per request; 1 Open-Meteo call per workflow step | ample |
| Workflow instances | 100 concurrent (free) | ≤2 concurrent, ~13 starts/day | ample |
| CPU | 10 ms/invocation **and per workflow step** | read path: trivial; digest: one ≤100-site chunk per step | see below |

**Dissolved risk — digest CPU.** Digesting a ~250-site × 16-day forecast in one invocation was the original design risk; the Workflows step model removes it structurally: each ≤100-coordinate chunk is fetched *and* digested in its own step with its own 10 ms CPU budget, so total work scales by adding steps, never by growing one invocation. S04 still measures per-step CPU at 10 sites and records it. If a single chunk's digest ever crowds 10 ms anyway: shrink the chunk size, or request daily aggregates only (skip hourly cloud stats). The $5/mo Workers Paid plan (30 s CPU/step) remains a kept-open door — also for inline PNG maps via resvg-wasm — not a v1 requirement.

## Future-alerts door (explicit non-feature)

`GET /api/next-windows` is public, CORS-open, cache-friendly and side-effect-free, so an external scheduler (the owner's own cron) can poll it and send notifications without Tjaldur changing at all. Nothing in v1 may break this property.

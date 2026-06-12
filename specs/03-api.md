# 03 — API: MCP tools & REST

Status: accepted · Last updated: 2026-06-12

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| MCP tool count | Exactly 2 | One per user question; campsite/bird detail is embedded, no lookup tools |
| MCP transport | Streamable HTTP at `/mcp`, authless, stateless (`createMcpHandler`) | Current Cloudflare recommendation; SSE is deprecated |
| REST ↔ MCP parity | Same parameters, same `Recommendation` response | One `service.ts` call behind both |
| Long seen-lists | REST accepts POST with JSON body in addition to GET | A year list can exceed sane URL length |
| Staleness | Serve stale with flags/warnings; reads never hard-fail on stale data | A camping answer from 7-hour-old forecasts beats a 500 |
| CORS | `*` on `/api/*` reads | Read-only public data; keeps the external-cron door open |

Both surfaces return the shared `Recommendation` shape defined in [01-architecture.md](01-architecture.md); the zod schema is the single source of truth. Every response includes `attribution[]` (non-empty) and `dataAge`.

## MCP server

- Endpoint: `POST /mcp` (streamable HTTP). No auth, no sessions, no server-side user state.
- Server name `tjaldur`, version mirroring the package version.
- Tool results: `Recommendation` JSON as text content. Errors: tool result with `isError: true` and the error envelope as content (protocol-level errors only for malformed MCP itself).

### Tool 1: `find_weather_windows`

> Find good camping weather windows in Iceland for a **specific date range** (within the next 16 days), with recommended campsites and optional birding targets.

```jsonc
{
  "start_date":   { "type": "string", "format": "date" },          // required
  "end_date":     { "type": "string", "format": "date" },          // required; ≤ today+16d
  "region":       { "enum": ["IS-1","IS-2","IS-3","IS-4","IS-5","IS-6","IS-7","IS-8","all"], "default": "all" },
  "min_days":     { "type": "integer", "minimum": 1, "maximum": 7 },   // shorthand for thresholds.hardFloor.minDays
  "thresholds":   { /* Partial<ScoringPolicy>, bounds per 02-scoring-policy.md */ },
  "include_birds":{ "type": "boolean", "default": false },
  "seen_species": { "type": "array", "items": { "type": "string" } },  // used only with include_birds
  "max_windows":  { "type": "integer", "default": 5, "maximum": 20 }
}
```

### Tool 2: `next_weather_windows`

> List the **best upcoming** camping weather windows in Iceland over the next 1–2 weeks. Call with no arguments for the default answer to "when can I camp next?"

Same schema minus `start_date`/`end_date` (implicitly today → today+16). **Zero required arguments.** Results sorted by score, ties broken by soonness.

### Tool description requirements (agent ergonomics)

The tool descriptions shipped to clients MUST state: units (°C, mm/day, km/h); that `seen_species` accepts common names, scientific names, or eBird species codes and must be re-sent on every call (the server stores nothing); that unmatched species names appear in `warnings` rather than failing the call; that `mapUrl` links to a rendered weather map image of Iceland suitable for showing to the user; and that `confidence` reflects forecast lead time (Icelandic forecasts beyond ~5 days are tentative).

## REST

| Route | Maps to | Notes |
|---|---|---|
| `GET /api/windows` | `find_weather_windows` | params as query string; `seen_species` comma-separated |
| `POST /api/windows` | same | JSON body — preferred by the website for long seen-lists |
| `GET /api/next-windows` | `next_weather_windows` | the future-alerts polling target |
| `POST /api/next-windows` | same | JSON body variant |
| `GET /api/campsites` | — | the normalized campsite list (debug/website bootstrap) |
| `GET /api/map?start&end&region` | — | `image/svg+xml`, the target of `mapUrl` |
| `GET /api/health` | — | `{ ok, dataAge }` for the owner's monitoring |

Caching headers: `/api/windows*` and `/api/next-windows` `Cache-Control: public, max-age=300`; `/api/campsites` `max-age=3600`; `/api/map` `max-age=3600`. CORS `Access-Control-Allow-Origin: *` on all GETs.

## Error envelope

```json
{ "error": { "code": "INVALID_PARAMS", "message": "end_date is beyond the 16-day forecast horizon" } }
```

| Code | HTTP | When |
|---|---|---|
| `INVALID_PARAMS` | 400 | zod validation failure, incl. out-of-bounds threshold overrides |
| `STALE_DATA_UNAVAILABLE` | 503 | KV has *no* weather digest at all (pre-first-cron only) |
| `UPSTREAM_DOWN` | 502 | live eBird fetch failed **and** no cache exists — only when `include_birds`; weather answers never throw this |
| `INTERNAL` | 500 | bug |

## Staleness & degradation rules

- Weather digest older than **6 h**: `dataAge.stale: true` + warning string. Older than **24 h**: stronger warning ("forecast data is over a day old; treat windows as indicative"). Still served.
- `include_birds` failures degrade, not fail: serve last cached observations with a warning, or omit `birds` with a warning if no cache exists and the live fetch fails. Only if the caller asked for birds and *nothing* can be served does `UPSTREAM_DOWN` apply.
- Unmatched `seen_species` entries (typos, non-Icelandic species) → listed in `warnings`, never an error.

## SVG map (`/api/map`)

Templated SVG, pure string building (free-tier CPU-safe): simplified Iceland coastline path (public-domain GeoJSON baked into source at build time), campsite dots colored by window score, per-region precipitation hatching and peak-temperature labels for the requested range, legend, attribution line. Deterministic for a given (params, digest) pair — golden-string testable. PNG rendering is a deliberate non-goal ([01-architecture.md](01-architecture.md)).

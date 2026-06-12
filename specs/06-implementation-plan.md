# 06 — Implementation plan: eight vertical slices

Status: accepted · Last updated: 2026-06-12

Each slice is end-to-end (delivers something a user or agent can see), test-driven (its tests are written first and listed below), and deployable. Order matters: weather-only value lands by Slice 2, agents by Slice 4, birds by Slice 6. Within every slice: red → green → refactor; the slice is done when its **Demo** line is true and `npm run check` is green. Slices map 1:1 onto the user stories in [`stories/`](../stories/README.md) (slice N = story S0(N+2); scaffolding is stories S01–S02), which carry the granular acceptance criteria.

Cross-cutting references: architecture & shapes [01](01-architecture.md), scoring [02](02-scoring-policy.md), API [03](03-api.md), sources [04](04-data-sources.md), website [05](05-website.md), test tooling [07](07-testing.md).

---

## Slice 1 — Scoring core + first REST endpoint (fixture weather, one campsite)

**Scope**: repo scaffolding (wrangler, TypeScript, vitest with the two test projects — stories S01–S02, [08-tech-stack.md](08-tech-stack.md)); `core/types.ts` (zod `Recommendation` et al.); `core/scoring/{policy,score,windows}.ts`; minimal `core/recommend.ts`; `service.ts`; Hono app with `GET/POST /api/windows`; a fake `WeatherSource` serving a checked-in digest fixture; campsite list hardcoded to one site (Reykjavík Eco Campsite).

**Faked**: weather (fixture), campsites (1 hardcoded), no KV, no workflows, no birds, no map (`mapUrl` placeholder).

**Tests first**:
- The canonical table T1–T12 from [02-scoring-policy.md](02-scoring-policy.md) as table-driven tests over `scoreDay`/`findWindows` (node project). Freeze the exact T2/T4/T8 scores back into the spec table once green.
- `findWindows` edges: empty digest, run touching horizon (`mayExtend`), two separate runs, run shorter than `minDays`.
- Override merge/validation: bounds table, weight renormalization, `+custom` version suffix.
- Integration (workers project): in-process `exports.default.fetch` of `/api/windows?start=…&end=…` → 200, body parses against the zod `Recommendation` schema; invalid params → 400 `INVALID_PARAMS`.

**Demo**: `curl localhost:8787/api/windows?...` returns scored windows for Reykjavík from fixture weather. *You can now ask Tjaldur for weather windows.*

---

## Slice 2 — Real weather: Open-Meteo adapter + KV + scheduled workflow (deployed)

**Scope**: `adapters/openmeteo.ts` (batched multi-point call per [04](04-data-sources.md), chunking, digesting); `adapters/kv-store.ts`; `workflows/refresh-weather.ts` steps (read site list → one fetch+digest step per chunk → final KV write; schedule already on the binding); read path now serves from `wx:digest:v1`; staleness fields + warnings per [03](03-api.md); seed list of ~10 real campsites (hardcoded constant: Reykjavík, Þakgil, Húsafell, Akureyri, Mývatn, Egilsstaðir, Höfn, Skaftafell, Ísafjörður, Vestmannaeyjar); **first production data**; measure per-step CPU ([01](01-architecture.md)) and record the number in story S04's notes.

**Faked**: campsites (10 hardcoded), birds, map.

**Tests first**:
- Adapter contract test against a recorded multi-point Open-Meteo fixture: digest math (units kmh/mm/°C, daytime cloud mean over 09–21 UTC, per-site splitting of the response array).
- Chunking: 250 fake coords → 3 calls, results reassembled in order.
- Workflow: create a `refresh-weather` instance in vitest-pool-workers (`introspectWorkflowInstance`), assert `wx:digest:v1` blob shape + `fetchedAt`; upstream-failure path errors the instance and keeps the old KV value.
- Staleness: digest aged 7 h → `stale: true` + warning; 25 h → stronger warning; missing key → 503 `STALE_DATA_UNAVAILABLE`.

**Demo**: the deployed Worker answers with live 16-day forecasts, refreshing every 2 h. *Live weather windows for 10 real campsites.*

---

## Slice 3 — Campsites: tjalda.is spike, OSM adapter, decision gate

**Spike (timeboxed ½ day, runs first)**: per the protocol in [04-data-sources.md](04-data-sources.md) — devtools capture of tjalda.is internal endpoints, ≥3 sample payloads committed as fixtures, bot-protection notes. Output: a findings note at `stories/S05-findings.md` + the **gate decision**: build `adapters/tjalda.ts` now, or ship OSM-only and demote tjalda to `bookingUrl` enrichment. (Launch blocker either way: no production tjalda fetching before the owner's clearance.)

**Scope**: `ports/campsites.ts`; `adapters/osm-overpass.ts` (always built — fallback + contract proof); `adapters/tjalda.ts` if gate passes; `data/campsite-overrides.json` merge step (camping-card flags, booking links); region bucketing via point-in-region polygons; `workflows/refresh-campsites.ts` steps (weekly schedule already on the binding) → `camp:sites:v1`; the weather workflow now reads the site list from KV instead of the hardcoded ten; `GET /api/campsites`.

**Tests first**:
- OSM fixture contract test: Overpass JSON → normalized `Campsite[]`; tag→facilities mapping table-driven (yes/limited/no/missing); ASCII-folded id stability (`Þakgil → thakgil`).
- (If gate passes) tjalda fixture contract test, same pattern.
- Region assignment: known campsite coords land in their correct `IS-n`.
- Overrides merge: a campsite gains `campingCard: true` + `bookingUrl` without losing adapter fields.
- Integration: `/api/windows` now returns real campsites ranked within windows.

**Demo**: *Recommendations name ~200 real Icelandic campsites with shower/toilet/water flags and booking links.*

---

## Slice 4 — MCP server

**Scope**: `delivery/mcp.ts` — `createMcpHandler` mounted at `/mcp`; both tools per [03-api.md](03-api.md) wrapping `service.ts`; full threshold-override plumbing; absolute `mapUrl` from `BASE_URL` (placeholder target until Slice 8); tool descriptions with the agent-ergonomics text.

**Tests first** (MCP SDK Client over the Worker's in-process fetch, per [07](07-testing.md)):
- `tools/list` → exactly 2 tools, schemas match the spec.
- `next_weather_windows` with **no arguments** → valid `Recommendation`.
- `find_weather_windows` with a `thresholds` override → `policyVersion` ends `+custom`; with out-of-bounds override → `isError: true` + `INVALID_PARAMS` envelope.
- Date validation: `end_date` beyond horizon → `isError`.

**Demo**: add `https://tjaldur.<account>.workers.dev/mcp` to Claude and ask *"when can I camp next week?"* — one tool call answers.

---

## Slice 5 — Website v1: map + windows

**Scope**: `web/` Vite app per [05-website.md](05-website.md) minus birds: Leaflet map, score-colored campsite markers + popups, windows side panel, date-range control, threshold sliders, stale banner, attribution footer; Static Assets wiring in `wrangler` config; deploy.

**Tests first** (thin by design): API-client module (URL/body construction, error envelope handling) and pure helpers (score→color, date formatting, window sorting) in the node project. No browser E2E — instead a **manual demo checklist** committed at `web/CHECKLIST.md` (map loads, markers colored, popup fields, sliders re-query, stale banner when forced).

**Demo**: *Open the site, see this week's good-weather campsites on a map of Iceland.*

---

## Slice 6 — Birds in the core: eBird adapter + seen-list diff (MCP/REST)

**Scope**: `adapters/ebird.ts` (taxonomy lazy-cache per version, per-region recent + notable obs, 1 h KV TTL, secret header); `core/birds.ts` (matching pipeline code→sciName→comName with diacritic folding, unseen diff, campsite-proximity attach per [04](04-data-sources.md)); `include_birds`/`seen_species` honored end-to-end in both tools and REST; degradation rules from [03](03-api.md).

**Tests first**:
- Matching table: species code hit; scientific name case-insensitive; common name diacritic-tolerant ("Brunnich's Guillemot" matches "Brünnich's Guillemot"); unknown name → warning not error; mixed list.
- Year diff: seen list marks `unseenThisYear` correctly; empty seen list → all unseen; notable flag preserved independently of seen-ness.
- eBird fixture contract tests: `/data/obs/IS-1/recent` and `/notable` payloads → normalized obs; taxonomy fixture → name→code map.
- TTL behavior: warm cache does zero subrequests (assert via fake fetch); eBird down + cache present → served with warning; down + no cache → `UPSTREAM_DOWN` only when birds requested.
- Integration: MCP `find_weather_windows` with `include_birds` + a seen list → windows whose `birds[]` mark seen species correctly.

**Demo**: *Tell the MCP tool what you've seen this year; it returns target birds at the good-weather campsites.*

---

## Slice 7 — Birds on the website: CSV upload + localStorage + map layer

**Scope**: client-side `MyEBirdData.csv` parser per the [04](04-data-sources.md) contract; paste input; `tjaldur:seen:v1` localStorage with year-rollover prompt; bird layer markers/popups with unseen-emphasis; `POST /api/windows` with `seen_species`; warnings toast for unmatched names.

**Tests first**:
- CSV parser (the riskiest client code — TDD it hard): redacted real-format fixture; current-year filter; `Count: "X"`; dedupe by scientific name; quoted fields with commas; CRLF; header-order independence; empty/garbage file → friendly error.
- localStorage schema round-trip + year-rollover logic.
- Seen-list → request-body assembly.

**Demo**: *Upload your eBird export; the map highlights this year's lifers near recommended campsites.*

---

## Slice 8 — SVG weather map + polish

**Scope**: `delivery/map-svg.ts` + `GET /api/map` per [03-api.md](03-api.md) (coastline path baked from public-domain GeoJSON, score-colored campsite dots, regional precip hatching + temp labels, legend, attribution); real `mapUrl` everywhere; cache headers sweep; error-envelope consistency sweep; attribution audit (every response + footer); README rewritten from "spec phase" to usage docs (MCP setup snippet, API examples); free-tier budget re-check with measured numbers.

**Tests first**:
- SVG by content, not pixels: N `<circle>` elements for N campsites, legend text present, valid `viewBox`, attribution line; one **golden-string test** for a fixed (params, digest) pair.
- `mapUrl` is absolute and resolves 200 `image/svg+xml`.
- Attribution: schema-level test that `attribution[]` is non-empty on every route.

**Demo**: *An MCP response includes a URL that renders a shareable Iceland weather map with the recommended campsites marked.*

---

## Sequencing notes

- 1→2→3→4 are strictly ordered (each consumes the previous slice's reality). 5 needs 3; 6 needs 4 only for its MCP tests (core work can start after 2); 7 needs 5+6; 8 last.
- The Slice 3 spike is the only external unknown; its gate never blocks the critical path because OSM is built regardless.
- After Slice 4 the MCP endpoint is public — from then on, tool schema changes are breaking changes and require a deliberate decision.
- Post-v1 backlog (kept out deliberately): alerts, ensemble confidence, inline PNG (paid plan), named policies, tjalda availability data.

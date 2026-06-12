# S03 — Weather windows for a date range (fixture weather)

**Epic:** core value · **Depends on:** S01 · **Spec refs:** [02-scoring-policy](../specs/02-scoring-policy.md), [03-api](../specs/03-api.md), [06 Slice 1](../specs/06-implementation-plan.md)

> As a camper, I want to ask Tjaldur which days in a date range are worth camping, so that I can plan a trip without reading forecasts myself.

## Description

The pure scoring core (`scoreDay`, `findWindows`, policy config) plus the first REST endpoint, `GET/POST /api/windows`, returning the shared `Recommendation` shape. Weather comes from a checked-in fixture digest; the campsite list is one hardcoded site (Reykjavík Eco Campsite). No KV, no workflows, no birds, `mapUrl` is a placeholder. This story is the TDD heart of the project: the canonical behavior table is implemented before anything else.

## Acceptance criteria

- [x] The canonical table **T1–T12** from spec 02 passes as table-driven tests over `scoreDay`/`findWindows`; the exact frozen scores for T2/T4/T8 are written back into the spec table in the same commit.
- [x] `findWindows` edge cases pass: empty digest; run touching the horizon sets `mayExtend: true`; two separate qualifying runs yield two windows; a run shorter than `minDays` yields none.
- [x] Window `confidence` follows lead time per spec 02 (≤4d high, ≤9d medium, else low; worst member day wins; days 15–16 always low).
- [x] `GET /api/windows?start_date=…&end_date=…` returns 200 with a body that parses against the zod `Recommendation` schema; `POST` with a JSON body behaves identically.
- [x] A valid `thresholds` override changes results and sets `policyVersion` ending in `+custom`; an out-of-bounds override (e.g. `minPeakTempC: 50`) returns 400 with the `INVALID_PARAMS` envelope.
- [x] `start_date`/`end_date` validation: missing, malformed, reversed, or beyond today+16d → 400 `INVALID_PARAMS` with a human-readable message.
- [x] An unknown `/api/*` path returns the JSON 404 envelope (`NOT_FOUND`), not the SPA shell — the rest router gets its own `notFound` handler (spec 03 error table; carried over from the S01 review).
- [x] All of the above runs in `npm test` with no network access.

## Demo

`curl localhost:8787/api/windows?start_date=…&end_date=…` returns scored, tiered, confidence-labeled windows for Reykjavík from fixture weather.

## Notes

Completed 2026-06-12. Policy `2026-06.2` (bumped from `2026-06.1` — see below).

- **Scoring model changed (owner decision, spec-02 rewrite).** Transcribing the table verbatim against spec 02's *additive weighted sum* surfaced a contradiction: T5 (warm + 70 km/h gusts) and T6 (warm + 10 mm rain) both demand tier `marginal`, but with the default weights (gust 0.15, precip 0.25) an additive sum can't pull an anomaly-maxed warm day below `good` — T5 came out `excellent` (83), T6 `good` (69). The other ten cases were clean. The owner chose **multiplicative gates**: `dayScore = 100 · warmth · gustFactor · precipFactor`, where `warmth` blends anomaly+absolute (ratio of the two temp weights) and gust/precip each ramp 1→0 across ideal→hard, so a hard breach zeroes the day "regardless of warmth." This drops `weights.precipitation`/`weights.gusts` (the ramps already carry wind/rain). Spec 02 formula + table + `version` and the tests were updated in this one commit (hard rule 2). **Frozen scores: T2 = 86.67, T4 = 93.78, T8 = 86.67; T5 = T6 = 0.**
- **zod 4.4.3** added to `dependencies` (newest inside the quarantine; spec 08 pins 4.4.x, forced by `agents` at Slice 4). `core/types.ts` is the single source of truth — `Recommendation` and its parts, consumed by REST now and MCP/website later.
- **Fixture weather is fixed-date, not relative.** `adapters/fixture-weather.ts` carries a checked-in 16-day Reykjavík digest anchored at 2026-06-12; the read path derives the horizon from the digest's own first/last date, so date validation and tests are deterministic with **no wall clock** (only `generatedAt` reads the clock, in the service). The pattern carries one excellent window (20–21 °C, dry, calm, 2026-06-16…18, confidence `medium`).
- **One campsite**: Reykjavík Eco Campsite (`adapters/fixture-campsites.ts`), region IS-1, `source: "osm"`. Window campsite score = the window score (single-site ranking). Region grouping + real campsites land in Slice 3.
- **Core stays pure** (hard rule 1): `core/{types,recommend,errors}` + `core/scoring/*` take data + policy, no I/O, no platform types, no clock. `service.ts` is the only orchestrator (validates, reads the source, calls core, stamps `generatedAt`); `delivery/rest.ts` is a thin wrapper.
- **`/api/*` 404 gap closed** (S01 carryover): `restRoutes.all("*")` returns the `NOT_FOUND` JSON envelope for unknown `/api/*` paths; the app-level `notFound → ASSETS.fetch` still serves the SPA for non-API routes.
- **`mapUrl` is a placeholder** absolute URL (`${BASE_URL}/api/map?…`); the `/api/map` endpoint itself is Slice 8. Staleness fields are stubbed (`stale: false`) until the KV read path in Slice 2. Birds omitted (Slice 6).
- `npm run check` green: tsc + `tsc -b web` + eslint (0 warnings) + 38 tests across 5 files, no network.
- **Post-review** (react-cloudflare-reviewer): approve with should-fixes; scoring math hand-verified (T2/T4/T8 reproduce), purity and the post-0.13 test API confirmed. All 9 findings applied: (1) CORS `*` now on every `/api/*` response via a `use("*")` middleware, not just the 200 path; (2) unexpected errors return the JSON `INTERNAL` 500 envelope instead of plain text; (3) `anomaly.baselineDays` wired into `computeBaseline` (caps leading baseline days; no-op at 16, frozen scores unchanged); (4) spec 02 baseline line pins "population sd, ÷n"; (5) `mergePolicy` no longer stamps `+custom` for no-op overrides like `{ precip: {} }`; (6) spec 01 port line updated to `getDigest() → WeatherDigest`; (7) zod `.strict()` → `z.strictObject`; (8) `Cache-Control` set on GET only; (9) non-object JSON bodies get a clear 400. Forward notes deferred to S04: confidence/horizon anchor to `digest[0]`, so once KV digests can be stale a near-boundary `today+15` request could 400 — revisit with the staleness rules.

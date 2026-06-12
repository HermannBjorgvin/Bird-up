# S03 — Weather windows for a date range (fixture weather)

**Epic:** core value · **Depends on:** S01 · **Spec refs:** [02-scoring-policy](../specs/02-scoring-policy.md), [03-api](../specs/03-api.md), [06 Slice 1](../specs/06-implementation-plan.md)

> As a camper, I want to ask Tjaldur which days in a date range are worth camping, so that I can plan a trip without reading forecasts myself.

## Description

The pure scoring core (`scoreDay`, `findWindows`, policy config) plus the first REST endpoint, `GET/POST /api/windows`, returning the shared `Recommendation` shape. Weather comes from a checked-in fixture digest; the campsite list is one hardcoded site (Reykjavík Eco Campsite). No KV, no workflows, no birds, `mapUrl` is a placeholder. This story is the TDD heart of the project: the canonical behavior table is implemented before anything else.

## Acceptance criteria

- [ ] The canonical table **T1–T12** from spec 02 passes as table-driven tests over `scoreDay`/`findWindows`; the exact frozen scores for T2/T4/T8 are written back into the spec table in the same commit.
- [ ] `findWindows` edge cases pass: empty digest; run touching the horizon sets `mayExtend: true`; two separate qualifying runs yield two windows; a run shorter than `minDays` yields none.
- [ ] Window `confidence` follows lead time per spec 02 (≤4d high, ≤9d medium, else low; worst member day wins; days 15–16 always low).
- [ ] `GET /api/windows?start_date=…&end_date=…` returns 200 with a body that parses against the zod `Recommendation` schema; `POST` with a JSON body behaves identically.
- [ ] A valid `thresholds` override changes results and sets `policyVersion` ending in `+custom`; an out-of-bounds override (e.g. `minPeakTempC: 50`) returns 400 with the `INVALID_PARAMS` envelope.
- [ ] `start_date`/`end_date` validation: missing, malformed, reversed, or beyond today+16d → 400 `INVALID_PARAMS` with a human-readable message.
- [ ] An unknown `/api/*` path returns the JSON 404 envelope (`NOT_FOUND`), not the SPA shell — the rest router gets its own `notFound` handler (spec 03 error table; carried over from the S01 review).
- [ ] All of the above runs in `npm test` with no network access.

## Demo

`curl localhost:8787/api/windows?start_date=…&end_date=…` returns scored, tiered, confidence-labeled windows for Reykjavík from fixture weather.

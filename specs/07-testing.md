# 07 — Testing strategy

Status: accepted · Last updated: 2026-06-12

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runner | vitest, two projects: `core` (node env) + `worker` (`@cloudflare/vitest-pool-workers`) | Fast pure tests where most logic lives; real Workers runtime where it matters |
| External APIs in tests | Never. Recorded fixtures only | CI must not depend on Open-Meteo/eBird/tjalda being up |
| Schema as oracle | The zod `Recommendation` schema validates every integration response | One source of truth: types, runtime validation and assertions |
| Browser testing | None in v1 — manual checklist per slice | A solo hobby project's Playwright suite costs more than it catches |

## Layers

### 1. Pure core (node project — the TDD heart, ~80% of tests)

- `core/scoring/*`: the canonical table T1–T12 transcribed verbatim from [02-scoring-policy.md](02-scoring-policy.md). The table is the contract: a policy change edits spec table + tests + `version` in one diff.
- `core/birds.ts`: matching/diff tables ([06-implementation-plan.md](06-implementation-plan.md), Slice 6).
- `core/recommend.ts`: assembly, sorting, `max_windows`, warnings accumulation.
- Website pure modules (CSV parser, API client, formatting helpers) also live here.

### 2. Adapter contract tests (fixtures)

Recorded real responses in `test/fixtures/{openmeteo,ebird,osm,tjalda}/`, each with a sibling `.meta.json`:

```json
{ "recordedAt": "2026-06-15", "request": { "url": "…", "params": { } }, "notes": "10-site batch" }
```

- Recorded by `scripts/record-fixtures.ts`, run **manually only** (needs `EBIRD_API_KEY` locally; never in CI). Re-record deliberately when an upstream changes shape — a re-record is a reviewed diff, not an automatic refresh. Scrub nothing from Open-Meteo/OSM; redact personal data from any eBird/tjalda capture.
- Tests feed fixtures to adapters via an injected `fetch` fake and assert the **normalized output** (digest math, tag mapping, name→code map) — pinning our understanding of the external contract.

### 3. Worker integration (workers project)

- KV seeded in test setup: `await env.KV.put('wx:digest:v1', JSON.stringify(fixtureDigest))` etc.
- HTTP by invoking the Worker in-process: `exports.default.fetch(new Request('…/api/…'), env, ctx)` (post-0.13 pool API, [08-tech-stack.md](08-tech-stack.md)); every 200 body must parse with the zod `Recommendation` schema; every error with the envelope schema.
- Workflows by creating instances through their bindings (`env.REFRESH_WEATHER.create({ id })`) and introspecting via `introspectWorkflowInstance` from `cloudflare:test` (`await using` for disposal; `waitForStatus` / `getOutput` / `waitForStepResult`; `modify` to disable sleeps or mock steps), asserting KV effects (including the keep-old-value-on-failure path). Schedules never fire in tests — creating the instance *is* the test's job.
- Staleness scenarios by writing digests with back-dated `fetchedAt`.

### 4. MCP (workers project)

`@modelcontextprotocol/sdk` `Client` with a custom fetch-based streamable-HTTP transport bound to the Worker's in-process `exports.default.fetch` — exercises the real `/mcp` handler, no network: `tools/list` schema assertions, no-arg `next_weather_windows`, override and `isError` paths (full list in [06-implementation-plan.md](06-implementation-plan.md), Slice 4).

### 5. Manual / live (never CI)

- `scripts/smoke-live.ts`: hits real Open-Meteo + eBird once, prints a `Recommendation` — run by hand before deploys.
- `web/CHECKLIST.md`: per-slice manual browser checklist (map renders, popups, sliders, banners).

## Explicitly not tested

- External API liveness/latency (smoke script only).
- Leaflet rendering, browser pixels, SVG appearance (structure-only SVG assertions + one golden string).
- tjalda.is HTML/endpoint drift beyond its committed fixtures — drift is detected by the weekly `refresh-campsites` workflow erroring, which by design keeps serving old data and surfaces staleness.
- Load/performance: 200 requests/day does not get a load test. The one measured number that matters (per-step CPU ms, [01-architecture.md](01-architecture.md)) is recorded in story S04's notes, not automated.

## No CI/CD (deliberate)

There is no pipeline. The gate is local and human: `npm run check` (typecheck + both vitest projects) must be green before any manual `wrangler deploy` ([08-tech-stack.md](08-tech-stack.md) runbook). Revisit only if the project outgrows a single contributor.

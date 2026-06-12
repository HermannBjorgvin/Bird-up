# S09 — Birding targets in API and MCP

**Epic:** birds · **Depends on:** S07 · **Spec refs:** [04-data-sources](../specs/04-data-sources.md), [03-api](../specs/03-api.md), [06 Slice 6](../specs/06-implementation-plan.md)

> As a birder, I want recommendations to include recently reported birds near the campsites — minus what I've already seen this year — so that a camping trip doubles as a targeted birding trip.

## Description

The eBird adapter (lazy taxonomy cache per version, per-region recent + notable observations, 1h KV TTL, `X-eBirdApiToken` from the Worker secret) and the pure seen-list logic in `core/birds.ts`: match user-supplied names (species code → scientific → common, diacritic-tolerant), diff against observations, attach to windows by campsite proximity (25 km). `include_birds` and `seen_species` go live in both MCP tools and REST. Weather-only behavior is untouched when birds aren't requested.

## Acceptance criteria

- [ ] Matching table tests: exact species code; scientific name case-insensitive; common name diacritic-tolerant ("Brunnich's Guillemot" matches "Brünnich's Guillemot"); unknown name lands in `warnings`, never errors; a mixed list resolves each entry independently.
- [ ] Year-diff tests: provided seen list marks matched species `unseenThisYear: false` and the rest `true`; empty/absent seen list → all `true`; `notable` is flagged independently of seen-ness.
- [ ] eBird fixture contract tests: recorded `/data/obs/IS-1/recent` and `/recent/notable` payloads normalize correctly; recorded taxonomy payload builds the name→code map.
- [ ] Cache behavior: warm `birds:obs:{IS-n}` cache → zero eBird subrequests (injected fetch fake); cold cache → fetch then KV write with TTL 3600.
- [ ] Degradation: eBird down + cache present → birds served with a warning; down + no cache → `UPSTREAM_DOWN` only when `include_birds` was requested; weather answers never fail due to eBird.
- [ ] Requests without `include_birds` make no eBird calls and contain no `birds` key (regression guard on the default mode).
- [ ] Integration: MCP `find_weather_windows` with `include_birds: true` and a seen list returns windows whose `birds[]` carry correct `unseenThisYear`/`notable` flags and locations within 25 km of a recommended campsite; eBird attribution string joins `attribution[]`.

## Demo

Tell the MCP tool what you've seen this year; it returns target birds at the good-weather campsites.

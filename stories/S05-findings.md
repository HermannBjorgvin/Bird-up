# S05 — tjalda.is discovery spike: findings

**Date:** 2026-06-13 · **Spec refs:** [04-data-sources §Campsites](../specs/04-data-sources.md) · [06 Slice 3](../specs/06-implementation-plan.md)

## Outcome

**Gate decision: `OSM-only v1` — tjalda.is demoted to manually-curated `bookingUrl` enrichment.**

The discovery spike was **not run**. The owner elected upfront to take the spike's documented default outcome rather than spend the half-day timebox, and the build proceeds against OpenStreetMap Overpass as the campsite source for v1.

## Reasoning

The spike exists to answer one question — *can we build `adapters/tjalda.ts`, and from what?* — and to pick the v1 campsite source. Three facts make OSM-only the correct call without running it:

1. **OSM is built regardless.** Per spec 04 and spec 06 Slice 3, the `osm-overpass.ts` adapter is built *unconditionally* — it proves the `CampsiteSource` contract and is the sanctioned fallback. So S06's critical-path work (the Overpass adapter, region point-in-polygon bucketing, the `refresh-campsites` workflow, ~200+ real sites in recommendations) is identical whether or not a tjalda adapter ever exists. The spike never blocks the critical path; it only decides whether a *second*, gated source gets built alongside.

2. **A tjalda adapter would sit dormant anyway.** Hard rule 7 / the spec-04 launch blocker forbids any production tjalda.is fetch until the owner clears it with tjalda.is (tracked as an S12 owner action item). So even if the spike found clean JSON endpoints today, `tjalda.ts` could not run in production for v1 — it would be dead code behind a gate that hasn't opened. Building it now is speculative work against an unconfirmed contract (tjalda has no public API; internal endpoints are undiscovered and automated probing is bot-blocked), with no v1 payoff.

3. **OSM covers v1.** ~200+ Icelandic `tourism=camp_site` records with coordinates, facilities, opening hours, fee, and website — ample for the planner. The gaps OSM leaves (per-site `bookingUrl` deep links, `campingCard` flags) are exactly what the hand-maintained `data/campsite-overrides.json` enrichment layer is for, which survives refreshes and needs no tjalda fetch.

This is the same `OSM-only v1` branch the timebox would have defaulted to on a no-usable-endpoints result — reached deliberately, with no information lost on the critical path.

## Bot-protection note

Consistent with spec 04: tjalda.is has no public API, and automated probing is bot-blocked. A real discovery pass would require a human in a browser with devtools (or a real-browser-driver attempt, which may trip the same protection). Not attempted here.

## Launch blocker (restated)

**No production tjalda.is fetching until the owner confirms clearance with tjalda.is.** This is an owner action item, tracked in S12 — a release-checklist item, not a code concern. If/when that clearance lands and a tjalda adapter is later built, it must be polite regardless: weekly cadence, identifying User-Agent `tjaldur/x.y (hermann3646@gmail.com)`, no availability polling in v1.

## Consequences for S06

- Build `adapters/osm-overpass.ts` against the spec-04 Overpass query and tag mapping; it is the v1 `CampsiteSource`.
- `refresh-campsites` runs the OSM adapter weekly → KV.
- tjalda contributes only via `data/campsite-overrides.json` (`bookingUrl` deep links, `campingCard` flags) merged by `id` after the adapter runs — hand-curated, no fetch.
- No `adapters/tjalda.ts` in v1. Revisit post-launch only after the S12 clearance gate opens (it is on the post-v1 backlog).

## Fixtures

None committed — no endpoints were probed, so `test/fixtures/tjalda/` is intentionally absent.

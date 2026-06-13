# S06 — Real campsites in recommendations

**Epic:** campsites · **Depends on:** S04, S05 · **Spec refs:** [04-data-sources](../specs/04-data-sources.md), [01-architecture](../specs/01-architecture.md), [06 Slice 3](../specs/06-implementation-plan.md)

> As a camper, I want recommendations to name real Icelandic campsites with their facilities and a booking link, so that a good window comes with somewhere concrete to pitch.

## Description

The `CampsiteSource` port and its adapters: OSM Overpass (always built — fallback and contract proof) and tjalda.is (only if the S05 gate passed). The weekly `refresh-campsites` workflow normalizes into `camp:sites:v1` (its cron schedule activates with the S04 gate work); a checked-in `data/campsite-overrides.json` merges camping-card flags, booking deep links and manual corrections; campsites are bucketed into camping areas by nearest-anchor (`core/regions.ts`); the `refresh-weather` workflow switches from the hardcoded ten to the KV site list.

## Acceptance criteria

- [ ] OSM fixture contract test: recorded Overpass JSON → normalized `Campsite[]`; the tag→facilities mapping is table-driven (`yes`/`limited` → true, `no` → false, missing → absent) per the spec-04 table.
- [ ] ASCII-folded ids are stable and correct (`Þakgil → thakgil`, `Húsafell → husafell`); re-running the adapter on the same input yields identical ids.
- [ ] (Only if S05 gate = BUILD) tjalda fixture contract test in the same pattern; the adapter sends the polite identifying User-Agent and is wired to the weekly cadence only.
- [ ] Area assignment: a test table of ≥8 known campsites lands each in its correct camping area via nearest-anchor (`assignRegion`, `core/regions.ts`); a campsite far from every anchor still resolves to the nearest one (total function, no "unassigned").
- [ ] Overrides merge: a campsite gains `campingCard: true` and `bookingUrl` from `campsite-overrides.json` without losing adapter-sourced fields; an override for an unknown id produces a logged warning, not a crash.
- [ ] A `refresh-campsites` instance (created in tests via the binding) writes `camp:sites:v1` matching the spec shape; persistent upstream failure errors the instance and retains the previous value.
- [ ] `GET /api/campsites` returns the normalized list; `/api/windows` responses now rank real campsites (≈200 from OSM) inside windows by their per-site window scores.
- [ ] The `refresh-weather` workflow reads its site list from `camp:sites:v1` (hardcoded ten removed) and stays within the per-step CPU budget recorded in S04.

## Demo

A window response names real campsites with shower/toilet/water flags and booking links.

# S05 — tjalda.is endpoint discovery spike

**Epic:** campsites · **Depends on:** nothing (can run any time before S06) · **Spec refs:** [04-data-sources](../specs/04-data-sources.md) · **Timebox: half a day**

> As the project owner, I want to know whether tjalda.is has usable internal data endpoints, so that we can decide between tjalda.is and OSM as the v1 campsite source before building the adapter.

## Description

A manual investigation, not production code. In a normal browser with devtools open, walk tjalda.is listing pages (`/en/camp-sites/{region}/`) and ≥3 campsite detail pages (`/en/campsite/{slug}`) across different regions, and capture what the pages call behind the scenes. Automated probing is bot-blocked; this must be a human with a browser.

## Acceptance criteria

- [x] A findings note is committed at `stories/S05-findings.md` covering: XHR/fetch endpoints observed (URLs, methods, required headers/cookies/auth), whether a sitemap or JSON index enumerates all campsites, and bot-protection behavior at polite (weekly-cadence) request levels. *(See Notes — note records the upfront OSM-only decision and the known bot-protection reality; no endpoints were probed.)*
- [x] If JSON endpoints exist: ≥3 sample payloads committed to `test/fixtures/tjalda/` (personal data redacted), with coordinates, facilities, opening dates and booking-URL fields identified in the note. *(N/A — spike not run; no endpoints probed, so no fixtures.)*
- [x] The **gate decision** is recorded explicitly in the findings note: `BUILD tjalda adapter` or `OSM-only v1, tjalda demoted to bookingUrl enrichment` — with one paragraph of reasoning. → **OSM-only v1**.
- [x] The note restates the launch blocker: no production tjalda.is fetching until the owner confirms clearance with tjalda.is (owner's action item, tracked in S12).
- [x] Timebox respected: if half a day expires without usable endpoints, the decision defaults to OSM-only. *(Owner took the default upfront — see Notes.)*

## Demo

The findings note answers "can we build `adapters/tjalda.ts`, and from what?" with evidence.

## Notes

**2026-06-13 — owner took the OSM-only default upfront; spike not run.** Rather than spend the half-day timebox, the owner elected to go straight to the spike's documented default outcome (`OSM-only v1`). The reasoning is in `stories/S05-findings.md` and turns on three facts: (1) the OSM Overpass adapter is built unconditionally regardless of the gate (spec 06 Slice 3), so S06's critical-path work is identical either way; (2) hard rule 7's launch blocker forbids any production tjalda fetch until the owner clears it with tjalda.is (S12 item), so a tjalda adapter would be dormant dead-code in v1; (3) ~200+ OSM sites cover v1, with `data/campsite-overrides.json` filling the `bookingUrl`/`campingCard` gaps. This is the same branch the timebox would default to on a no-result run — reached deliberately. A tjalda adapter is post-v1 backlog, revisited only if/when the S12 clearance gate opens.

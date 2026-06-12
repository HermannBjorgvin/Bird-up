# S05 — tjalda.is endpoint discovery spike

**Epic:** campsites · **Depends on:** nothing (can run any time before S06) · **Spec refs:** [04-data-sources](../specs/04-data-sources.md) · **Timebox: half a day**

> As the project owner, I want to know whether tjalda.is has usable internal data endpoints, so that we can decide between tjalda.is and OSM as the v1 campsite source before building the adapter.

## Description

A manual investigation, not production code. In a normal browser with devtools open, walk tjalda.is listing pages (`/en/camp-sites/{region}/`) and ≥3 campsite detail pages (`/en/campsite/{slug}`) across different regions, and capture what the pages call behind the scenes. Automated probing is bot-blocked; this must be a human with a browser.

## Acceptance criteria

- [ ] A findings note is committed at `stories/S05-findings.md` covering: XHR/fetch endpoints observed (URLs, methods, required headers/cookies/auth), whether a sitemap or JSON index enumerates all campsites, and bot-protection behavior at polite (weekly-cadence) request levels.
- [ ] If JSON endpoints exist: ≥3 sample payloads committed to `test/fixtures/tjalda/` (personal data redacted), with coordinates, facilities, opening dates and booking-URL fields identified in the note.
- [ ] The **gate decision** is recorded explicitly in the findings note: `BUILD tjalda adapter` or `OSM-only v1, tjalda demoted to bookingUrl enrichment` — with one paragraph of reasoning.
- [ ] The note restates the launch blocker: no production tjalda.is fetching until the owner confirms clearance with tjalda.is (owner's action item, tracked in S12).
- [ ] Timebox respected: if half a day expires without usable endpoints, the decision defaults to OSM-only.

## Demo

The findings note answers "can we build `adapters/tjalda.ts`, and from what?" with evidence.

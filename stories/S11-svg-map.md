# S11 — Shareable weather map image

**Epic:** polish · **Depends on:** S06 (S07 for mapUrl consumers) · **Spec refs:** [03-api](../specs/03-api.md), [06 Slice 8](../specs/06-implementation-plan.md)

> As an agent user, I want the MCP response to link a rendered weather map of Iceland, so that my agent can show me where the rain, warmth and campsites are instead of describing coordinates.

## Description

`GET /api/map?start&end&region` rendering a templated SVG: simplified Iceland coastline (public-domain GeoJSON baked into source at build time), campsite dots colored by window score, per-region precipitation hatching and peak-temperature labels for the requested range, legend, attribution line. Pure string building — free-tier CPU-safe and deterministic. Every `Recommendation` now carries a real absolute `mapUrl` built from `BASE_URL`. Inline PNG stays a non-goal (spec 01).

## Acceptance criteria

- [ ] Structure tests: for N campsites in scope the SVG contains N `<circle>` elements; legend text and attribution line present; valid `viewBox`; `Content-Type: image/svg+xml`.
- [ ] One golden-string test: a fixed (params, digest fixture) pair renders byte-identical SVG; the golden file is committed and changes to it are deliberate diffs.
- [ ] Determinism: two renders of the same inputs are identical (no timestamps/randomness in the output).
- [ ] `mapUrl` in every `Recommendation` (REST and MCP) is absolute, encodes the request's date range and region, and resolves 200 to the SVG on the deployed Worker.
- [ ] `Cache-Control: public, max-age=3600` on `/api/map`; invalid params → 400 `INVALID_PARAMS`.
- [ ] Render stays comfortably within the 10 ms CPU budget at ~250 campsites (measured once, recorded in story notes).

## Demo

An MCP response's `mapUrl` opens as a shareable Iceland weather map with the recommended campsites marked.

## Notes

(CPU measurement goes here at implementation time)

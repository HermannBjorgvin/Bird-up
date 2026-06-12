# S08 — Website: map of windows and campsites

**Epic:** website · **Depends on:** S02, S06 · **Spec refs:** [05-website](../specs/05-website.md), [06 Slice 5](../specs/06-implementation-plan.md)

> As a camper, I want a map of Iceland showing where the camping weather is good and which campsites are there, so that I can plan visually in under a minute.

## Description

The website's weather half (birds come in S10): Leaflet map with campsite markers colored by window score, popups (name, facilities icons, daily temp/precip/gust strip, booking link, camping-card badge), the windows side panel (select → zoom/filter), date-range control with presets, the collapsible threshold sliders bound to spec-02 override fields, stale-data banner and attribution footer. All data via the public `/api/*` endpoints — no privileged path.

## Acceptance criteria

- [ ] Unit tests (node project) pass for: the API-client module (URL/query/body construction for GET and POST variants, error-envelope handling) and pure helpers (score→color scale, window sorting, date formatting).
- [ ] Threshold sliders expose exactly the overridable fields and bounds of spec 02 (min peak °C, min days, max rain mm, max gusts km/h) plus a reset-to-defaults; changes re-query (debounced) and the panel shows when results are computed with a custom policy.
- [ ] The manual checklist `web/CHECKLIST.md` exists, covers: map loads with OSM tiles + attribution, markers colored by score for the selected range, popup shows all spec-05 fields, selecting a window zooms/filters, date presets work, forced-stale digest shows the banner, footer carries all attribution + MCP hint — and is checked off against the deployed site in this story's notes.
- [ ] Website ships as Static Assets from the same Worker; `/` serves it, `/api/*` and `/mcp` still route to the Worker.
- [ ] No browser E2E added (deliberate, spec 07).

## Demo

Open the site, see this week's good-weather campsites colored on a map of Iceland.

## Notes

(checklist run record goes here at implementation time)

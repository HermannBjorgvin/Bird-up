# S08 — Website: map of windows and campsites

**Epic:** website · **Depends on:** S02, S06 · **Spec refs:** [05-website](../specs/05-website.md), [06 Slice 5](../specs/06-implementation-plan.md)

> As a camper, I want a map of Iceland showing where the camping weather is good and which campsites are there, so that I can plan visually in under a minute.

## Description

The website's weather half (birds come in S10): Leaflet map with campsite markers colored by window score, popups (name, facilities icons, daily temp/precip/gust strip, booking link, camping-card badge), the windows side panel (select → zoom/filter), date-range control with presets, the collapsible threshold sliders bound to spec-02 override fields, stale-data banner and attribution footer. All data via the public `/api/*` endpoints — no privileged path.

## Acceptance criteria

- [x] Unit tests (node project) pass for: the API-client module (URL/query/body construction for GET and POST variants, error-envelope handling) and pure helpers (score→color scale, window sorting, date formatting).
- [x] Threshold sliders expose exactly the overridable fields and bounds of spec 02 (min peak °C, min days, max rain mm, max gusts km/h) plus a reset-to-defaults; changes re-query (debounced) and the panel shows when results are computed with a custom policy.
- [x] The manual checklist `web/CHECKLIST.md` exists, covers: map loads with OSM tiles + attribution, markers colored by score for the selected range, popup shows all spec-05 fields, selecting a window zooms/filters, date presets work, forced-stale digest shows the banner, footer carries all attribution + MCP hint — and is checked off against the deployed site in this story's notes.
- [x] Website ships as Static Assets from the same Worker; `/` serves it, `/api/*` and `/mcp` still route to the Worker.
- [x] No browser E2E added (deliberate, spec 07).

## Demo

Open the site, see this week's good-weather campsites colored on a map of Iceland.

## Notes

**Build.** Modules: `web/src/api/client.ts` (request build + error-envelope unwrap), pure helpers
`web/src/lib/{color,sort,dates,overrides,markers}.ts`, components `web/src/components/{MapView,WindowsPanel,DateControls,ThresholdSliders,Footer}.tsx`, orchestrator `App.tsx`. Map is vanilla
Leaflet via refs (no react-leaflet — keeps the stack small); markers are score-colored circle markers,
popups built as DOM nodes (textContent, never innerHTML, since names come from OSM). Window scores come
from `/api/windows`, the full base layer from `/api/campsites`; `buildMarkers` folds them to a best-score
per site. Default range is today → today+14 (the live forecast horizon; spec's "+16" exceeds it).

**Tests.** 27 new node tests (`test/unit/web-{client,color,sort,dates,overrides}.test.ts`); `npm run check`
green (tsc + tsc -b web + eslint + 117 tests).

**One bug found & fixed during the live check:** the debounced windows effect originally depended on the
derived `overrides`/`markers` objects, whose identity changes every render. The lint config assumes the
React Compiler memoizes these, but the compiler is **not** enabled in the vite build, so the effect
re-armed on every loading→ready render and fetched in a ~400 ms loop. Fixed by depending on the stable
state (`range`, `thresholds`) and computing `overrides` inside the timer. Verified post-fix: exactly one
`/api/campsites` + one `/api/windows` on load, one more POST per slider change — no loop.
*(Follow-up worth considering: actually enable `babel-plugin-react-compiler` so the lint rules match the build, or relax the no-manual-memo rule.)*

**Checklist run — deployed `tjaldur.9z.is`, 2026-06-13 (version `2ddaee22`):**
- ✅ Map loads with OSM raster tiles + Leaflet/OpenStreetMap attribution.
- ✅ 244 campsite markers; at the default 18 °C floor mid-June yields 1 honest window (Mývatn, excellent,
  2 green sites). Lowering min-peak-temp to 13 °C → 72 windows, 177/244 markers colored green→grey by score.
- ✅ Popup (Tjaldsvæði í Laugardal): name, facility icons (🚰 🔌), "Jun 13–14 · good · score 77", 2-day
  temp/precip/gust strip, **Accepts Camping Card** badge, **Book / info ↗** link — the override data
  (`data/campsite-overrides.json`) flows through to the live popup.
- ✅ Selecting the Borgarnes window zoomed/filtered the map to its 14 campsites (others dimmed); card highlighted.
- ✅ Date inputs default to today → 2026-06-27 (horizon); "next week"/"next 2 weeks" presets re-query.
- ✅ Threshold sliders are the four spec-02 fields with correct bounds; a non-default value shows the
  "custom policy" badge and the response `policyVersion` ends `+custom`; reset restores defaults.
- ✅ Footer: Open-Meteo + OpenStreetMap + map-tiles attribution, MCP "add /mcp to your agent" hint, policy version.
- ◑ Stale-data banner: not force-tested on prod (would require corrupting prod KV); the render path
  (`rec.warnings` → banner) is covered by `test/worker/staleness.test.ts`. Banner correctly absent on fresh data.
- Note: the footer's `/mcp` link 404s until S07 ships (this story was built before S07 by owner decision).

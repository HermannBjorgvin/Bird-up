# S08 — Website: map of windows and campsites

**Epic:** website · **Depends on:** S02, S06 · **Spec refs:** [05-website](../specs/05-website.md), [06 Slice 5](../specs/06-implementation-plan.md)

> As a camper, I want a map of Iceland showing where the camping weather is good and which campsites are there, so that I can plan visually in under a minute.

## Description

The website's weather half (birds come in S10): Leaflet map with campsite markers colored by window score, popups (name, facilities icons, daily temp/precip/gust strip, booking link, camping-card badge), the windows side panel (select → zoom/filter), date-range control with presets, the collapsible threshold sliders bound to spec-02 override fields, stale-data banner and attribution footer. All data via the public `/api/*` endpoints — no privileged path.

## Acceptance criteria

- [x] Unit tests (node project) pass for: the API-client module (URL/query/body construction for GET and POST variants, error-envelope handling) and pure helpers (score→color scale, window sorting, date formatting).
- [x] Threshold sliders expose exactly the overridable fields and bounds of spec 02 plus a reset-to-defaults; changes re-query (debounced) and the panel shows when results are computed with a custom policy. *(Superseded same day: the scoring model was reworked to the soft-factor `2026-06.3` policy with no hard caps, so spec 02 now exposes only `minDays`; the panel is a single min-trip-length slider. See the scoring-redesign commit.)*
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

**Date range → timeline heatmap bar (superseded after S08 shipped).** The From/To date inputs
(`DateControls`, removed) were replaced by a full-width bar below the map: a white→green per-day
heatmap of the whole forecast horizon (`web/src/lib/timeline.ts:dailyHeat`, `color.ts:heatColor`,
absolute scale capped at 40) with two day-snapped brush handles. The brush filters the map + sidebar
**client-side** — the windows fetch is now fixed to the full horizon and re-queries only on `minDays`,
since `/api/windows` already scores over the full horizon and only filters the returned list by date
(so a full fetch is a superset of any sub-range). New `web/src/components/Timeline.tsx` +
`test/unit/web-timeline.test.ts`; no contract/scoring change. Bar refinements: date ticks beneath,
thick brush handles with a lucide `GripVertical` grip (`lucide-react` added), the min-trip-length
slider moved into the bar header (the old `⚙ Filter` dropdown `ThresholdSliders` + next-week/2-week
presets removed), and each sidebar row now shows a peak-temp range (`grouping.ts:peakTempRange`, e.g.
"13–18°C") alongside the date and score.

**Panel regrouped by placename (superseded after S08 shipped).** The flat best-first list of window
cards was replaced with a two-level tree: recommended campsites grouped under their placename anchor
(`region`), each site shown once at its single best window. Purely a web-layer presentation fold
(`web/src/lib/grouping.ts:groupByPlace`) over `Recommendation.windows` — no contract/scoring change.
Selecting a placename focuses the map on that area; selecting a site focuses that one marker. The
orphaned `web/src/lib/sort.ts` (+ its test) was removed; `test/unit/web-grouping.test.ts` added.

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

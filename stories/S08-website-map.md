# S08 — Website: map of windows and campsites

**Epic:** website · **Depends on:** S02, S06 · **Spec refs:** [05-website](../specs/05-website.md), [06 Slice 5](../specs/06-implementation-plan.md)

> As a camper, I want a map of Iceland showing where the camping weather is good and which campsites are there, so that I can plan visually in under a minute.

## Description

The website's weather half (birds come in S10): Leaflet map with campsite markers colored by window score, popups (name, facilities icons, daily temp/precip/gust strip, booking link, camping-card badge), the windows side panel (select → zoom/filter), date-range control with presets, the collapsible threshold sliders bound to spec-02 override fields, stale-data banner and attribution footer. All data via the public `/api/*` endpoints — no privileged path.

## Acceptance criteria

- [x] Unit tests (node project) pass for: the API-client module (URL/query/body construction for GET and POST variants, error-envelope handling) and pure helpers (score→color scale, window sorting, date formatting).
- [x] Threshold sliders expose exactly the overridable fields and bounds of spec 02 plus a reset-to-defaults; changes re-query (debounced) and the panel shows when results are computed with a custom policy. *(Superseded same day: the scoring model was reworked to the soft-factor `2026-06.3` policy with no hard caps, so spec 02 now exposes only `minDays`; the panel is a single min-trip-length slider. See the scoring-redesign commit.)*
- [x] The manual checklist `web/CHECKLIST.md` exists, covers: map loads with OSM tiles + attribution, markers colored by score for the selected range, popup shows all spec-05 fields, selecting a window zooms/filters, date presets work, forced-stale digest shows the banner, footer carries all attribution + MCP hint — and is checked off against the deployed site in this story's notes. *(superseded 2026-06-15: the footer no longer carries the MCP hint or policy version — it was trimmed to the Open-Meteo weather credit + a `source` repo link, with OSM on the map's own Leaflet attribution control; the MCP hint returns when S07 ships. Spec 05 and `web/CHECKLIST.md` updated to match.)*
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

**UX/UI revamp (2026-06-13, after a full review — web-only, no contract/scoring/policy change).** Eight
presentation slices: (A) **mobile P0** — `#root { height: 100svh }` + the `55svh auto` grid starved the
panel to ~25px and the campsite list was unreachable; the `max-width:720px` rule now lets the document
scroll (map fixed-height, list flows). Plus a dark-mode `.site-row__meta` contrast bump. (B) **score
legibility** — rows/headers/popup now read `{tier} N/100` (`web/src/lib/format.ts:tierScore`), using the
core `Window['tier']` (no threshold re-bucketed in `web/`). (C) **list curation** — the weak (marginal-only)
tail is hidden by default with a top-`MIN_VISIBLE`(8) fallback and a "show all N" toggle
(`grouping.ts:curateGroups`); header reads "N of M". (D/F) **popup** — `Jun 13` dates, a vertically-stacked
icon-labelled weather strip (no scrollbar), and emoji facilities replaced by inlined **lucide** SVGs
(`web/src/lib/icons.ts`, vanilla `createElementNS` for the DOM-built popup). (E) pitch "16-day"→"two-week";
timeline first/last tick labels no longer clip. (G) **map declutter** — leaflet.markercluster (cluster bubble
tinted to its best child score) + circleMarker→`L.marker`+divIcon dots, filled-scored vs **hollow no-window**.
(H) **wordmark** — self-hosted Space Grotesk (`@fontsource`, latin-600 subset) on the H1 only, with a lucide
`Tent` mark. New tests: `test/unit/web-{format,curation}.test.ts`. Deps added: `leaflet.markercluster`
(+ `@types`), `@fontsource/space-grotesk`. `npm run check` green (133 tests); verified locally + on prod.
**Prod-bundle gotcha (caught on the first deploy — white screen):** leaflet.markercluster patches leaflet's
mutable CJS module object, but `import * as L from 'leaflet'` hands the bundler a frozen namespace copy, so
`L.markerClusterGroup` was undefined in the minified build (dev pre-bundling hid it). Fixed by switching
MapView to the default import `import L from 'leaflet'`. Also stacked the sidebar rows (name over meta) so
the longer `{tier} N/100` string never clips in the ~325px panel.
**Mobile layout follow-up:** on `≤720px` the two-column `.app__body` is flattened with `display: contents`
so map, the date slider and the results become siblings in `#root`'s flex column, reordered with `order`
to **map → slider → results** (the timeline is a DOM sibling after `.panel`). And selecting a result
scrolls the map back into view (`App.tsx:handleSelect`, `scrollIntoView`, gated on the same media query)
so the highlight is visible on a phone.
**Dark-mode polish:** the OSM raster tiles are tinted dark via a CSS filter on `.leaflet-tile-pane`
(`invert(1) hue-rotate(180deg) brightness(.9) contrast(.9)` — keeps the OSM source/attribution and leaves
markers/popups/controls, which sit in other panes, untouched; a dedicated dark basemap would need its own
attribution/token). The timeline bar background is now `var(--bg)` (white→dark across themes), and `heatColor`
returns **green at a score-driven alpha** instead of a white→green hex so the themed background shows through
(test updated). On mobile the date ticks are hidden and the footer is centred.

**One bug found & fixed during the live check:** the debounced windows effect originally depended on the
derived `overrides`/`markers` objects, whose identity changes every render. The lint config assumes the
React Compiler memoizes these, but the compiler is **not** enabled in the vite build, so the effect
re-armed on every loading→ready render and fetched in a ~400 ms loop. Fixed by depending on the stable
state (`range`, `thresholds`) and computing `overrides` inside the timer. Verified post-fix: exactly one
`/api/campsites` + one `/api/windows` on load, one more POST per slider change — no loop.
*(Follow-up worth considering: actually enable `babel-plugin-react-compiler` so the lint rules match the build, or relax the no-manual-memo rule.)*

**Campsite filters — drive time + family-car access (2026-06-13, post-review feedback).** Two new
**client-side** filters at the top of the side panel ([Filters.tsx](../web/src/components/Filters.tsx),
[lib/filters.ts](../web/src/lib/filters.ts)): a *family-car-accessible-only* toggle (hides `offroad`
highland/F-road sites) and a *max-drive-from-Reykjavík* slider. They narrow the map markers and the
sidebar together (the weather timeline is untouched) — no re-query, instant like the date brush. This
needed two **optional, backward-compatible** fields on the public `Campsite` schema (`offroad`,
`driveMinutesFromReykjavik`) — the one contract touch; `WindowCampsite` is left alone, the web joins by
id to the `/api/campsites` list. Data: `offroad` is hand-curated in `data/campsite-overrides.json`
for ~24 known highland sites (owner chose a manual auditable list over an OSM heuristic — F-roads are in
OSM, but "is this *campsite* only reachable via one" is a routing question, not a tag). Drive times are
baked offline by [scripts/record-drive-times.ts](../scripts/record-drive-times.ts) (OSRM road routing
from Reykjavík, written to `data/drive-times.json`, merged in the weekly refresh — no runtime routing
call; see [spec 04](../specs/04-data-sources.md)). Each control self-hides until the data carries its
attribute, so it degrades gracefully on a pre-refresh blob. New tests: `test/unit/web-filters.test.ts`,
`drive-times.test.ts`, + a `offroad` case in `overrides.test.ts` (147 tests, `npm run check` green).
**Operational note:** the live filters appear only after the next `refresh-campsites` run re-bakes the
enriched blob into KV (deploy + trigger the workflow, or wait for the Monday 03:00 UTC cron).
*Follow-up:* the **min-trip-length** slider was then moved out of the timeline-bar header into this
panel filter stack, so all three sit together in order — **min trip · max drive · family-car** (min trip
still re-queries; the other two stay client-side). The timeline header now shows just the range label.

**Brush re-queries + clipped windows + drive-filtered bar (2026-06-14, reactivity pass — review feedback).**
Three related fixes to how the brush, the date range and the filters propagate:
1. **Drive/family-car filters now reach the timeline bar** (`App.tsx:barWindows`): a window whose sites are
   all filtered out stops contributing heat, so days only good at far-away/offroad sites cool down — the bar
   no longer contradicts the filtered map.
2. **Windows are clipped to the brushed range, server-side and per-site precise.** The old model fetched the
   full horizon once and filtered the brush in-browser by *overlap*, so a window could show dates spilling
   past the brush, and per-site scores couldn't be recomputed for the sub-range. The brush now re-queries
   `/api/windows` for its range (debounced); the service clips each window to the range and rescores it over
   only those days (new pure `core/scoring/windows.ts:clipWindowToRange` — `findWindows` still runs the full
   digest so confidence is measured from today; spec 02 gained a "Per-request date range" section + canonical
   cases TC1–TC5). The owner chose this over client-side clipping precisely for the per-site accuracy only the
   server (holding each site's daily digest) can give. The bar keeps its own full-horizon fetch; the app now
   holds **two** window sets (`data.horizon` for the bar, `data.range` for the brushed sidebar/map, null when
   the brush spans the whole horizon). `policyVersion` is **not** bumped — the scoring config is unchanged,
   only request-range handling. A full-horizon request clips to a no-op, so MCP/REST full-range callers and
   the existing worker tests are unaffected.
3. **`min(minDays, rangeLength)` clamp** lives in `clipWindowToRange`: a brushed range shorter than the
   min-trip-length relaxes the floor to the range length, so a 2-day brush still surfaces a 2-day window
   instead of going empty. `windowsInRange` (the old in-browser overlap filter) was removed.
   New/changed tests: `test/unit/clip-windows.test.ts` (7, TC1–TC5 + confidence + no-overlap), two sub-range
   cases in `test/worker/windows.test.ts`, `web-timeline.test.ts` drops the `windowsInRange` block.
   `npm run check` green (155 tests).

**Selecting a campsite opens its popup (2026-06-14, UX follow-up).** Clicking a campsite row used to only
focus/zoom the marker; it now also opens that marker's popup so the sidebar pick and the map agree
(`MapView.tsx`). Because sites are clustered, this uses markercluster's `zoomToShowLayer` to un-cluster +
zoom to the marker, then opens the popup in its callback. An `openedIdRef` guards against re-zooming when the
marker layer is merely rebuilt (a brush/filter change) under the same selection — it just re-opens the popup
`clearLayers()` closed, leaving the user's pan/zoom alone. Placename (multi-site) selections still just frame
the area. Web-only, no contract change.

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
- Note: the footer's `/mcp` link 404s until S07 ships (this story was built before S07 by owner decision). *(2026-06-15: the `/mcp` link was removed from the footer entirely — see the design-system note below — so there's no longer a 404ing link; it returns when S07 ships.)*

**Design-system theme + marker/footer refresh (2026-06-15/16 — web-only, no contract/scoring/policy change).**
A palette the owner extracted from design inspiration (royal-gold / blue-slate / dust-grey / brown-red /
khaki-beige, plus two derived companions: a harmonized `moss-green` for the score scale and a `wood-brown`
dark surface) became a real design system in [index.css](../web/src/index.css): raw palette tokens →
semantic tokens via the `light-dark()` CSS function, driving **two themes — light "field guide", dark
"old wood cabin."** A header toggle ([ThemeToggle.tsx](../web/src/components/ThemeToggle.tsx), lucide
Monitor/Sun/Moon) cycles **system → light → dark**, persisted as the versioned `tjaldur:theme:v1`
localStorage key and applied before first paint by an inline script in [index.html](../web/index.html)
(no FOUT). `system` flips `color-scheme`, which is what `light-dark()` keys off; the map-tile filter,
which can't ride `light-dark()`, gets explicit OS-dark / forced-dark selectors sharing one `--tile-dark`.

Visual changes, all presentation-layer:
- **Map.** OSM tiles get a CSS aged-paper filter (vintage in light, wood-tinted in dark — no
  tile-provider swap, so the free token-less source + attribution stay). Markers are now **SVG teardrop
  pins** (anchored at the tip) instead of dots: scored pins ramp khaki→moss-green, no-window pins are a
  **translucent slate** fill (was an outline ring). **Clustering is disabled**
  (`disableClusteringAtZoom: 0`) — every site shows individually at all zooms; the `markerClusterGroup`
  wrapper is kept only for `zoomToShowLayer` (popup-on-select) and `addLayers`. Both pin states share one
  footprint (focused pins grow); fill, not size, distinguishes them.
- **Gold accent.** The timeline heat bar is royal-gold (`heatColor`), and the filter sliders are fully
  custom (the native unfilled track renders dark regardless of `accent-color`/`color-scheme`): a light
  `--track` groove + gold fill + round thumb, the fill driven by a `--pct` var (Blink) / `::-moz-range-progress`
  (Firefox). The map score scale stayed khaki→moss (gold is the *control* accent, not the data colour —
  the owner reverted a brief experiment that made recommended markers gold, since a cool fortnight then
  read as a grey map).
- **Popup + chrome.** Leaflet's popup box/tip/zoom-controls are themed (paper/walnut) — rescoped under
  `.leaflet-container` to out-specify Leaflet's own later-loaded CSS (an equal-specificity bug that left
  the popup unstyled in prod). Popup title strengthened with a divider. Sidebar meta + the eyebrow moved
  off low-opacity tan onto a legible `--muted` token (AA in both themes).
- **Footer trimmed** to the Open-Meteo weather credit + a `source` link (OSM on the map's Leaflet
  control; MCP hint + policy line dropped until S07). [Footer.tsx](../web/src/components/Footer.tsx) filters
  OSM out of the API `attribution[]`; the `policyVersion` prop was removed.

Tooling: **`npm run dev:remote`** runs Vite HMR against the *deployed* API (`VITE_API_BASE`,
[client.ts](../web/src/api/client.ts)) so styling previews against real KV data without deploying (unset
in tests/prod builds → same-origin). New file `ThemeToggle.tsx`; deps already present
(`@fontsource/space-grotesk`, `lucide-react`). Tests updated for the new colours
(`web-color`, `web-timeline`); `npm run check` green (155 tests). [spec 05](../specs/05-website.md)
updated (map markers, gold bar, theme system, trimmed footer, `dev:remote`). Deployed `tjaldur.9z.is`
(versions `22839252` design system, `d76af2cb` unclustered/translucent pins) and the checklist re-run
recorded in `web/CHECKLIST.md` (§ design-system refresh).

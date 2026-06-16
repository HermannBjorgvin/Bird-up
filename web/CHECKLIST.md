# Website manual checklist

Per-slice browser checks (spec 07 — no browser test automation in v1).
Run against the deployed site after each website story; record the run in the story's notes.

## S02 — scaffold

- [x] Page loads at `/` with the Tjaldur title and pitch
- [x] "API health: ok" renders (live `/api/health` from the same origin)
- [x] Attribution footer lists Open-Meteo and OpenStreetMap
- [x] `npm run dev`: editing a component hot-reloads without a full page refresh *(waived by owner at S02 — template-default behavior)*

## S08 — map of windows and campsites

Run against the deployed site (real KV data) and record in `stories/S08-website-map.md` notes.

- [x] Map loads at `/` with OSM raster tiles and the Leaflet + OpenStreetMap attribution visible
- [x] Campsite markers render across Iceland, colored by score for the default range (green = good, grey = no window) *(superseded 2026-06-15: markers are SVG teardrop pins on a khaki→moss-green score scale; a no-window site is a translucent slate pin, not a grey dot)*
- [x] A campsite popup shows: name, facilities icons, the daily temp/precip/gust strip, booking/website link, and the Camping Card badge where applicable
- [x] Selecting a window in the side panel zooms/filters the map to that window's campsites; deselecting restores all *(superseded: the panel is now a placename→campsites tree — selecting a placename focuses the map on that area's sites, selecting a single campsite focuses that one marker, selecting again restores all)*
- [x] Date presets ("next week" / "next 2 weeks") and the date inputs re-query and update the map *(superseded: the From/To inputs were replaced by the timeline heatmap bar below the map — the bar always paints the full horizon (white→green per-day), two handles brush a sub-range that filters the map + sidebar client-side with no refetch, and the two presets reposition the handles)*
- [x] Filter slider (min trip length, days — the only overridable field in the soft-factor `2026-06.3` model) re-queries debounced; a non-default value shows the "custom policy" badge; reset restores the default *(superseded: the slider moved into the timeline bar's header and the `⚙ Filter` dropdown was removed; a non-default value still re-queries and stamps `policyVersion +custom` (shown in the footer), but the standalone badge/reset button are gone)*
- [~] A forced-stale digest (or naturally stale data) shows the warning banner *(render path covered by `test/worker/staleness.test.ts`; not force-tested on prod to avoid corrupting prod KV; banner correctly absent on fresh data)*
- [x] Footer carries all active attribution (Open-Meteo, OpenStreetMap, map tiles) plus the MCP "add /mcp to your agent" hint and the policy version *(superseded 2026-06-15: footer trimmed to the Open-Meteo weather credit + a `source` repo link; OSM (tiles + campsite data) is shown on the map's own Leaflet attribution control, not duplicated in the footer; the MCP hint and policy-version line were removed until the MCP server ships — spec 05 updated to match)*
- [x] No browser E2E added (deliberate, spec 07)

## S08 — UX/UI revamp (2026-06-13)

Web-only review fixes; verify on the deployed site with real KV (244 sites).

- [x] **Mobile (≤720px):** the campsite list is reachable and the page scrolls (panel 612px, `scrollHeight` 1394 > `innerHeight` 844; was clipped to ~25px); the "show all" toggle works
- [x] Sidebar rows + group headers read `{tier} N/100` (rows stacked name-over-meta so the longer string never clips); dark-mode meta is legible
- [x] Default list hides the marginal tail (`8 of 164`); "Show all 164" → 164 rows + "Show top windows"; header reads "N of M"
- [x] Map sites cluster into counts, split on zoom; clusters tint to best score; no-window sites are hollow rings *(superseded 2026-06-16: clustering disabled — every campsite shows as its own teardrop pin at all zooms; no-window pins are translucent slate fills, not hollow rings)*
- [x] Popup: `Jun 24` dates, lucide weather icons, vertically-stacked icon-labelled weather (no scrollbar)
- [x] Header wordmark uses Space Grotesk + tent mark; pitch says "two-week"; timeline edge tick labels aren't clipped
- [x] `npm run check` green (133 tests); build self-hosts the font; no runtime/markercluster error
- Note: leaflet.markercluster needs `import L from 'leaflet'` (default), not `import * as L` — the namespace import gives a frozen copy the plugin can't patch, so `L.markerClusterGroup` is missing in the **production build** only (dev pre-bundling masks it). Caught on the first prod deploy (white screen) and fixed forward.

## S08 — design-system refresh (2026-06-16)

Earthy palette + light/dark themes, gold accents, teardrop pins, unclustered map, trimmed footer.
Verified on the deployed site `tjaldur.9z.is` (version `d76af2cb`):

- [x] Light theme is the warm "field-guide" look (cream surfaces, aged-paper OSM tiles); dark theme is the "wood-cabin" look (walnut surfaces, sepia-tinted tiles). Header toggle (Monitor/Sun/Moon) cycles system→light→dark and persists across reload (`tjaldur:theme:v1`, applied before first paint — no flash)
- [x] Map markers are teardrop pins, unclustered (every site individual); scored pins khaki→moss-green, no-window pins translucent slate; selecting a sidebar row zooms to its pin and opens the popup
- [x] Timeline heat bar and the filter sliders are gold; the slider groove is light (not the muddy native dark track) in both themes
- [x] Popup is themed (paper/walnut) with a strong, divided title; sidebar meta + eyebrow are legible (the `--muted` token, not low-opacity tan)
- [x] Footer shows only the Open-Meteo weather credit + a `source` link; OSM stays on the map's Leaflet attribution control
- [x] `npm run check` green (155 tests); `npm run dev:remote` previews the local build against the deployed API for styling without deploying

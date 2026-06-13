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
- [x] Campsite markers render across Iceland, colored by score for the default range (green = good, grey = no window)
- [x] A campsite popup shows: name, facilities icons, the daily temp/precip/gust strip, booking/website link, and the Camping Card badge where applicable
- [x] Selecting a window in the side panel zooms/filters the map to that window's campsites; deselecting restores all *(superseded: the panel is now a placename→campsites tree — selecting a placename focuses the map on that area's sites, selecting a single campsite focuses that one marker, selecting again restores all)*
- [x] Date presets ("next week" / "next 2 weeks") and the date inputs re-query and update the map *(superseded: the From/To inputs were replaced by the timeline heatmap bar below the map — the bar always paints the full horizon (white→green per-day), two handles brush a sub-range that filters the map + sidebar client-side with no refetch, and the two presets reposition the handles)*
- [x] Filter slider (min trip length, days — the only overridable field in the soft-factor `2026-06.3` model) re-queries debounced; a non-default value shows the "custom policy" badge; reset restores the default *(superseded: the slider moved into the timeline bar's header and the `⚙ Filter` dropdown was removed; a non-default value still re-queries and stamps `policyVersion +custom` (shown in the footer), but the standalone badge/reset button are gone)*
- [~] A forced-stale digest (or naturally stale data) shows the warning banner *(render path covered by `test/worker/staleness.test.ts`; not force-tested on prod to avoid corrupting prod KV; banner correctly absent on fresh data)*
- [x] Footer carries all active attribution (Open-Meteo, OpenStreetMap, map tiles) plus the MCP "add /mcp to your agent" hint and the policy version
- [x] No browser E2E added (deliberate, spec 07)

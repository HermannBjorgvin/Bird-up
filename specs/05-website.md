# 05 — Website

Status: accepted · Last updated: 2026-06-12

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Stack | Vite + React + TypeScript (create-vite `react-ts` template) | Owner decision 2026-06-12 (supersedes "no framework"): React, kept deliberately simple — small components, no state library, no router |
| Map | Leaflet + free OSM raster tiles | Lighter than MapLibre, no token; markers-on-a-map is the whole job |
| Data access | `/api/*` only — the same public endpoints agents could use | No privileged path; proves the API is sufficient |
| CSV parsing | Entirely client-side | The raw export (locations, dates) never leaves the browser |
| Persistence | localStorage `tjaldur:seen:v1` | No accounts by design ([00-product.md](00-product.md)) |
| Hosting | Built into `web/dist`, served as Worker Static Assets | Free, unlimited asset requests |

## Layout

```
┌────────────────────────────────────────────────┬──────────────────────┐
│                                                │  Min trip ◄─▶3d      │
│                                                │  Max drive ◄─▶ No lim │
│              Leaflet map of Iceland            │  ☐ Family-car only    │
│                                                │ ─────────────────────│
│   ● campsite markers, colored by window score  │  Recommended camps   │
│   ▲ bird markers (optional layer)              │  ▾ Vesturland · 77   │
│                                                │     Bjarteyjar…  77  │
├────────────────────────────────────────────────┴──────────────────────┤
│  Jun 13–20                                                              │
│  ▐░░▓▓██▓▓░░░░░░░░░░▌  ⟵grip handles brush a sub-range; white→green/day │
│  Jun13   Jun16   Jun19   Jun22   Jun25  Jun27   ⟵ date ticks            │
├───────────────────────────────────────┬───────────────────────────────┤
│                                        │  My birds 🐦 [⇧CSV]           │
├───────────────────────────────────────┴───────────────────────────────┤
│  stale-data banner (when dataAge.stale) · attribution footer          │
└───────────────────────────────────────────────────────────────────────┘
```

### Map

- Campsite markers colored by their score within the selected date range (continuous scale green→grey; tier in the popup). Sites are **clustered** (leaflet.markercluster) into per-area counts that split on zoom; each cluster bubble tints to the best score inside it. Markers are divIcon dots: a filled, score-coloured dot where the site has a qualifying window, a small **hollow ring** where it has none (so "no window here" no longer reads as "bad weather here"). Popup: name, **lucide** facility icons, the quality line (`date-range · {tier} N/100`), a daily strip that stacks vertically (icon-labelled tMax/precip/gusts — no horizontal scrollbar), booking link (`bookingUrl`), "accepts Camping Card" badge.
- Bird layer (toggle, off by default): markers for recent observations near recommended campsites; **unseen-this-year species visually emphasized**, already-seen dimmed; notable/rare flagged. Popup: common + scientific name, last seen date, location name, eBird link.
- Selecting a placename in the side panel zooms/dims the map to that area's campsites; selecting a single campsite focuses that one marker. Selecting again clears.

### Side panel

Recommended campsites grouped under their **placename anchor** (the `region`, [regions.ts](../../src/core/regions.ts)) — areas close enough to share weather are shown together rather than as separate window cards. A two-level tree: each placename (best-scoring area first) lists its campsites (best-scoring site first), and each site row shows that site's single best window (`date-range · peak-temp · {tier} N/100`, where peak-temp is the range of daily highs e.g. "13–18°C", and the quality is the core `Window['tier']` word plus the score anchored to 100 — never re-bucketed from the score in the web layer). The **weak tail is hidden by default**: only sites whose window tier is `good`/`excellent` show, falling back to the top `MIN_VISIBLE` (8) by score when too few qualify (a cool fortnight is never empty); a "show all N" toggle reveals the rest, and the header reads "N of M". Purely a presentation fold over `Recommendation.windows`; no contract change (each `Window` already carries its `region` and `tier`, each `WindowCampsite` its own `score`).

### Date range — timeline bar (below the map)

A full-width horizontal bar that **always paints the whole forecast horizon** as a per-day heatmap of **green at a score-driven alpha** over the bar's theme-aware background (white in light mode, dark in dark mode — so no bright patches on the dark bar): each day's intensity is its best score across all weather windows (`max` of the per-day `DailyScore.score`; the background shows through where no window covers it), faded smoothly between days at full height. Absolute scale, fully green at score ≥ 40. The **date ticks are hidden on mobile** (they crowd a narrow bar); the range label still shows. **Date ticks** with labels run beneath the bar. Two day-snapped **brush handles** (thick, with a lucide `GripVertical` grab indicator) select a sub-range that filters the **map markers and the sidebar** client-side; the bar itself never shrinks. The selected range shows as the bar's header label. (The **minimum trip length** slider has moved out of the bar's header into the side-panel filters — see Controls.)

**Fetch model:** `/api/windows` scores every window over the full horizon and only *filters the returned list* by date, so a full-horizon response is a superset of any sub-range — the site fetches the whole horizon **once** and the brush filters in-browser (instant, and the bar keeps full data). The API is re-queried only when the `minDays` slider changes.

### Controls

- **Filters** (top of the side panel, `web/src/components/Filters.tsx` + `lib/filters.ts`), in display order:
  1. **Minimum trip length** (`minDays`): the only overridable scoring field ([02-scoring-policy.md](02-scoring-policy.md), 1–7). A non-default value goes into the API call's `thresholds`, the response `policyVersion` ends `+custom`, and changing it **re-queries** (debounced) — unlike the two below, which are client-side. The website invents no scoring of its own. (The soft-factor model `2026-06.3` has no hard caps to expose: warmth, wind and rain are continuous score factors, not user-set thresholds.)
  2. **Max drive from Reykjavík**: a slider (30-min steps, rightmost = "No limit") over `driveMinutesFromReykjavik` ([04-data-sources.md](04-data-sources.md)). A site of *unknown* drive distance is excluded once a cap is set (not guessed). Upper bound is the longest known drive.
  3. **Family-car accessible only**: a toggle that hides `offroad` highland/F-road sites.

  The drive + family-car filters are **client-side** — they never re-query, narrowing the **map markers and the sidebar together** (the timeline weather bar is left untouched). Each of those two only renders when the loaded campsite data carries its attribute (`filterCapabilities`), so neither is a dead no-op before the enriched refresh lands; min trip length is always shown.
- **My birds**: textarea for pasted species (one per line) + file input for `MyEBirdData.csv`. Shows the resulting count ("142 species seen in 2026") and a clear button.

## Seen-list handling

- CSV parsing per the contract in [04-data-sources.md](04-data-sources.md): current-year filter on `Date`, dedupe by `Scientific Name`, tolerate `Count: "X"`, ignore unknown columns. Implemented as a small dependency-free parser (TDD'd hard — see [07-testing.md](07-testing.md)); large files parsed incrementally to keep the UI responsive.
- Stored as `tjaldur:seen:v1` = `{ year: 2026, species: string[] }`. **Year rollover**: when `year != currentYear`, show "your list is from {year} — keep or clear?" rather than silently using stale data.
- Sent to the API via `POST /api/windows` body (`seen_species`) only when the bird layer is on.

## Data flow

1. Load → `GET /api/next-windows` (no birds) → render windows panel + colored campsites.
2. User adjusts dates/thresholds → `POST /api/windows` (debounced).
3. Bird layer on → re-request with `include_birds: true` + `seen_species` from localStorage.
4. `dataAge.stale` → banner; `warnings[]` (e.g. unmatched species names) → dismissable toast list.

## Footer

Attribution (all active sources per [04-data-sources.md](04-data-sources.md) + Leaflet/OSM tiles), link to the GitHub repo, link to the MCP endpoint with a one-line "add this to your agent" hint, and the policy version of the last response.

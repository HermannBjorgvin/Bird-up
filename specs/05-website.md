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
│                                                │  Next windows        │
│                                                │  ┌────────────────┐  │
│              Leaflet map of Iceland            │  │ Suðurland      │  │
│                                                │  │ Jun 18–21 · 78 │  │
│   ● campsite markers, colored by window score  │  │ excellent ·high│  │
│   ▲ bird markers (optional layer)              │  └────────────────┘  │
│                                                │  │ Vesturland …   │  │
├────────────────────────────────────────────────┤                      │
│  Date range ◄────────────►   Thresholds ⚙      │  My birds 🐦 [⇧CSV]  │
├────────────────────────────────────────────────┴──────────────────────┤
│  stale-data banner (when dataAge.stale) · attribution footer          │
└───────────────────────────────────────────────────────────────────────┘
```

### Map

- Campsite markers colored by their score within the selected date range (continuous scale green→grey; tier in the popup). Popup: name, facilities icons, daily strip (tMax/precip/gusts), booking link (`bookingUrl`), "accepts Camping Card" badge.
- Bird layer (toggle, off by default): markers for recent observations near recommended campsites; **unseen-this-year species visually emphasized**, already-seen dimmed; notable/rare flagged. Popup: common + scientific name, last seen date, location name, eBird link.
- Selecting a window in the side panel zooms/filters the map to it.

### Controls

- **Date range**: defaults to today → today+16; presets "next week" / "next 2 weeks".
- **Filter** (collapsible ⚙ panel): a single "minimum trip length (days)" slider — the only overridable field in [02-scoring-policy.md](02-scoring-policy.md) (`minDays`, 1–7) — plus a "reset to default" button. The override goes into the API call's `thresholds`; the website invents no scoring of its own. (The soft-factor model `2026-06.3` has no hard caps to expose: warmth, wind and rain are continuous score factors, not user-set thresholds.)
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

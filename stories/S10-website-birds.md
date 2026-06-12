# S10 — Website: my birds (CSV upload + bird layer)

**Epic:** birds · **Depends on:** S08, S09 · **Spec refs:** [05-website](../specs/05-website.md), [04-data-sources](../specs/04-data-sources.md) (CSV contract), [06 Slice 7](../specs/06-implementation-plan.md)

> As a birder, I want to give the site my eBird export once and have the map highlight this year's missing species near recommended campsites, so that I never cross-reference lists by hand.

## Description

Client-side ingestion of the seen list: a paste box (one species per line) and a `MyEBirdData.csv` file input, parsed **entirely in the browser** by a dependency-free parser; result stored in localStorage as `tjaldur:seen:v1 = { year, species[] }` with a year-rollover prompt. The bird layer toggle requests `include_birds` with the stored list via `POST /api/windows`; unseen species are visually emphasized, seen ones dimmed, notable flagged; unmatched-name warnings surface as a dismissable toast.

## Acceptance criteria

- [ ] CSV parser unit tests (the riskiest client code — written first) against a redacted real-format fixture: current-year filter on `Date`; `Count: "X"` tolerated; dedupe by `Scientific Name`; quoted fields containing commas; CRLF line endings; header-order independence; empty or garbage file → friendly error, no crash.
- [ ] localStorage round-trip test for the `tjaldur:seen:v1` schema; when stored `year ≠ currentYear` the UI offers keep-or-clear instead of silently using a stale list.
- [ ] The request builder sends only the species list — a test asserts the raw CSV content never appears in any request body.
- [ ] Paste input and CSV input produce the same normalized list shape; the UI shows the resulting count ("N species seen in {year}") and a clear button.
- [ ] Bird layer off → no `include_birds` in requests (default weather-only mode preserved); on → markers emphasize `unseenThisYear`, dim seen, badge notable; popups link to eBird.
- [ ] `warnings[]` from the API (unmatched names) render as a dismissable toast list.
- [ ] `web/CHECKLIST.md` extended with the bird-layer items and checked off against the deployed site.

## Demo

Upload your eBird export; the map highlights this year's lifers near recommended campsites.

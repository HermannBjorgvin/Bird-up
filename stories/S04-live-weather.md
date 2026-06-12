# S04 — Live forecasts via Open-Meteo

**Epic:** core value · **Depends on:** S03 · **Spec refs:** [04-data-sources](../specs/04-data-sources.md), [01-architecture](../specs/01-architecture.md), [06 Slice 2](../specs/06-implementation-plan.md)

> As a camper, I want window recommendations based on the live 16-day forecast, so that the answer reflects reality and stays current without me doing anything.

## Description

The Open-Meteo adapter (batched multi-point call, chunked ≤100 coordinates, digest math), the KV store adapter, and the steps of the 2-hourly `refresh-weather` workflow (read site list → one fetch+digest step per chunk, with retries → final step writes `wx:digest:v1`). The cron `schedules` for both bindings exist in `wrangler.jsonc` but are commented out: Cloudflare's API 403'd the field at S01 time (feature GA'd 2026-06-02, apparently not yet rolled out to this account — S01 notes); re-enabling them is part of this story. The read path switches from fixture to KV. Staleness handling lands. The campsite list is a hardcoded constant of ~10 real sites (Reykjavík, Þakgil, Húsafell, Akureyri, Mývatn, Egilsstaðir, Höfn, Skaftafell, Ísafjörður, Vestmannaeyjar). First production data lands here.

## Acceptance criteria

- [ ] Adapter contract test against a recorded multi-point Open-Meteo fixture: per-site splitting of the response array, units (°C, mm, km/h), `cloudMeanDaytimePct` = mean of hourly cloud cover over 09–21 UTC.
- [ ] Chunking test: 250 fake coordinates → 3 upstream calls, results reassembled in input order.
- [ ] Creating a `refresh-weather` instance in tests (`introspectWorkflowInstance` + the binding) completes and writes a `wx:digest:v1` blob matching the spec shape with a fresh `fetchedAt`; on persistent upstream failure the instance errors and the previous KV value is retained untouched.
- [ ] Staleness: digest aged >6h → `dataAge.stale: true` + warning; >24h → the stronger warning string; KV key missing entirely → 503 `STALE_DATA_UNAVAILABLE`.
- [ ] `/api/windows` responses are served from KV with **zero** weather subrequests at request time (assert via injected fetch fake).
- [ ] The `schedules` on both workflow bindings are uncommented and deploy cleanly (the S01-era API gate has lifted — if it still 403s, capture a fresh `cf-ray` from the failing PUT via `WRANGLER_LOG=debug WRANGLER_LOG_SANITIZE=false npx wrangler deploy` and escalate, before falling back to a temporary `triggers.crons` → `create()` bridge).
- [ ] Both workflows set explicit per-step `retries`/`timeout` so the worst-case instance lifetime stays under the 2 h cadence (spec 01 overlap caveat).
- [ ] Deployed; at least one **schedule-initiated** instance is evidenced (its `WorkflowEvent.schedule` is set / `wrangler workflows instances list` shows the cron trigger source — a manual `wrangler workflows trigger` does **not** satisfy this) and a real response after it shows live forecast dates; the instance's step history is visible via `wrangler workflows instances describe`.
- [ ] The per-step measured CPU time is recorded in this story's *Notes* section below; if a single fetch+digest step exceeds ~5 ms at 10 sites, shrink the chunk size (spec 01) before S06 scales to ~250 sites.

## Demo

The deployed Worker answers with live 16-day windows for 10 real campsites, refreshing every 2 hours.

## Notes

(per-step CPU measurement goes here at implementation time)

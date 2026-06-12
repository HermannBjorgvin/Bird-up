# S04 — Live forecasts via Open-Meteo

**Epic:** core value · **Depends on:** S03 · **Spec refs:** [04-data-sources](../specs/04-data-sources.md), [01-architecture](../specs/01-architecture.md), [06 Slice 2](../specs/06-implementation-plan.md)

> As a camper, I want window recommendations based on the live 16-day forecast, so that the answer reflects reality and stays current without me doing anything.

## Description

The Open-Meteo adapter (batched multi-point call, chunked ≤100 coordinates, digest math), the KV store adapter, and the 2-hourly `refresh-weather` cron writing `wx:digest:v1`. The read path switches from fixture to KV. Staleness handling lands. The campsite list is a hardcoded constant of ~10 real sites (Reykjavík, Þakgil, Húsafell, Akureyri, Mývatn, Egilsstaðir, Höfn, Skaftafell, Ísafjörður, Vestmannaeyjar). First production deploy happens here.

## Acceptance criteria

- [ ] Adapter contract test against a recorded multi-point Open-Meteo fixture: per-site splitting of the response array, units (°C, mm, km/h), `cloudMeanDaytimePct` = mean of hourly cloud cover over 09–21 UTC.
- [ ] Chunking test: 250 fake coordinates → 3 upstream calls, results reassembled in input order.
- [ ] Invoking the scheduled handler (vitest-pool-workers) writes a `wx:digest:v1` blob matching the spec shape with a fresh `fetchedAt`; on upstream failure the previous KV value is retained untouched.
- [ ] Staleness: digest aged >6h → `dataAge.stale: true` + warning; >24h → the stronger warning string; KV key missing entirely → 503 `STALE_DATA_UNAVAILABLE`.
- [ ] `/api/windows` responses are served from KV with **zero** weather subrequests at request time (assert via injected fetch fake).
- [ ] Deployed to `*.workers.dev` with the cron trigger active; a real response after the first cron run shows live forecast dates.
- [ ] The cron invocation's measured CPU time is recorded in this story's *Notes* section below (the spec-01 free-tier risk); if it exceeds ~5 ms at 10 sites, the mitigation plan in spec 01 is invoked before S06 scales to ~250 sites.

## Demo

The deployed Worker answers with live 16-day windows for 10 real campsites, refreshing every 2 hours.

## Notes

(cron CPU measurement goes here at implementation time)

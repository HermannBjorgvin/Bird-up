---
name: s01-review-open-risks
description: Review-findings ledger through S04 — gapped-digest window bug, horizon anchoring, step-name-drift live-fetch hole, S06 KV-site-list tripwire; resolved items listed
metadata:
  type: project
---

Tracking ledger for review findings. S01 (e911096), Workflows pivot (2f0bfc9), S02 (70d2fda), S03 (bcec49e), S04 (uncommitted, reviewed 2026-06-13) all reviewed. Verify current state before re-flagging.

Resolved / obsoleted (don't re-flag):

1. S02 peer conflict — resolved. 2. Cron-string drift — obsoleted by Workflows pivot. 3. /api SPA fallthrough — JSON 404 since S03.
4. **Schedules gate — RESOLVED at S04**: the S01 403 was a paywall (API error `10208 cron_requires_paid_plan`); owner upgraded to **Workers Paid ($5/mo) 2026-06-13**. Schedule-initiated instance evidenced (instance id = cron expr + fire ts, e.g. `58-59 0 * * *-1781312280000` — that id shape is the proof a manual trigger can't forge). Account is paid now: 30s CPU/step and higher limits apply, but specs still budget free-tier conservatively.
6. **Workflows determinism/overlap — addressed**: spec 01 now has the determinism rule + overlap caveat verbatim; S04 set explicit per-step retries/timeout (fetch step worst case ≈5.5 min ≪ 2h cadence); KV written only in the final step, fetchedAt stamped inside it.
10/11. **CORS + INTERNAL envelope — resolved at S04**: `restRoutes.use("*")` middleware sets ACAO `*` after next() (errors included, tested); handleWindows catch-all returns the INTERNAL JSON envelope. No router onError still, but only /health and the 404 route live outside handleWindows.

Still open:

5. **Spec 07 §3 stale pool snippet** — `exports.default.fetch(req, env, ctx)`; post-0.13 pool takes Request only. Watch S05+.
7. Write-hook `--max-warnings 0` vs repo gate `--max-warnings 4` — thrash risk once a file uses the max-lines budget.
8. ~~No build→deploy coupling~~ — resolved: `npm run deploy` chains check+build+deploy (in CLAUDE.md now).
9. ESLint baseline only covers ts/tsx.
12. `anomaly.baselineDays` dead policy knob (declared, never read) — out of S04 scope, still unwired.
13. Lead-time confidence anchored to digest index (`lead = index + 1` in core/scoring/windows.ts) — acknowledged in S04 story notes as accepted; interacts with null-day dropping (dropped leading days make confidence optimistic).

New at S04 review (2026-06-13):

14. **Gapped-digest window bridging (flagged must-fix)** — `digestOne` (adapters/openmeteo.ts) drops null days *anywhere*; `findWindows` (core/scoring/windows.ts) treats array adjacency as calendar adjacency, so a mid-series dropped day yields a Window bridging an unforecast day (`days` ≠ end−start+1, daily[] skips a date). Real risk: a trailing null day was observed live 2026-06-13 (horizon 15 not 16 right after midnight UTC — that trailing case was consciously accepted in story notes). Suggested fix: break runs on non-consecutive dates in findWindows. Check resolved before S05.
15. **Horizon anchored to `withDigest[0]`** (service.ts) — per-site null dropping means sites can disagree on horizon; validation depends on seed-list order; 400 message hardcodes "16-day". Should-fix, low stakes at 10 sites.
16. **Workflow tests' live-fetch hole** — refresh-weather.test.ts mocks the fetch step by name (`"fetch chunk 1/1"`); if the step name drifts, the real step runs and hits live Open-Meteo from tests (hard rule 4). Assertions would fail (10 sites ≠ 1) but only after a network call. Suggested: throwing `globalThis.fetch` guard like windows.test.ts uses.
17. **S06 tripwire**: refresh-weather computes chunks from compiled-in SEED_CAMPSITES *outside* steps — deterministic today, but when S06 loads the site list from KV, that read MUST move inside a step.do or replay breaks. Also step names embed chunk count ("fetch chunk i/n") — test mocks couple to them.

New at S06 review (2026-06-13):

18. **OSM fixture carries personal data** — test/fixtures/overpass/campsites-iceland.json has phone (147), contact:email (7), operator, addr:* tags verbatim. Read path is SAFE (recommend.ts maps only id/name/lat/lng/facilities/source/bookingUrl/campingCard → WindowCampsite; zod strips unknowns), but the raw fixture is committed to a public repo. record-fixtures.ts header claims "Nothing to scrub" — that claim is wrong for Overpass. Flagged should-fix: scrub on record, or document the decision to ship contributor contact data.
19. **OSM attribution string drift** — spec 04 mandates "Campsite data © OpenStreetMap contributors (ODbL)"; recommend.ts OSM_ATTRIBUTION (S03/S04, out of S06 scope) omits "(ODbL)". Pre-existing, not introduced by S06. Resolve before S07 locks the contract.
20. **Slug-collision stability assumption** — normalizeOverpass gives the *first-seen* element the bare slug, suffixes the rest with OSM id. Stable only because Overpass returns node-then-way ascending-id and OSM ids grow monotonically (new sites get higher ids, never steal the bare slug). Holds today; would break if upstream returns a different order. Acceptable, noted.
21. **assignRegion math sound for Iceland** — equirectangular with cos(lat) longitude scaling, no antimeridian/pole risk (Iceland 63–67°N, -13 to -24°E). z.enum(REGION_SLUGS) with `as [RegionSlug, ...RegionSlug[]]` cast is sound (REGIONS is non-empty const).
22. **S06 wiring not yet landed** (confirmed): SEED_CAMPSITES still the only read-path source; camp:sites:v1 unread; refresh-campsites is a noop. Tripwire #17 (move KV site-list read inside step.do) still live for the remaining slices.

Pool gotchas (verified): `introspectWorkflowInstance(binding, id)` awaited BEFORE `create({ id })`; `await using` clears instance state. No isolatedStorage post-0.13 — test/worker/vitest.config.ts uses `fileParallelism: false` because three files share `wx:digest:v1`; new worker test files touching that key must clean up after themselves.

Scoring context (S03): spec 02 multiplicative gates, version 2026-06.2; frozen scores pin **population** sd (÷n); spec 02 doesn't say ÷n explicitly (nit). Spec 03 pins the >24h warning string verbatim ("forecast data is over a day old; treat windows as indicative"); the >6h string is free text.

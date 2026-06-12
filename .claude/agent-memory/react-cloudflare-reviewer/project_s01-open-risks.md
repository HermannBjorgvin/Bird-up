---
name: s01-review-open-risks
description: Post-pivot ledger of scaffold review findings — /api 404 untracked, S04 schedules-gate verification gap, spec 07 stale fetch snippet, Workflows determinism rule missing
metadata:
  type: project
---

Tracking ledger for scaffold-era review findings. S01 scaffold (e911096) and the Workflows pivot (2f0bfc9) both reviewed 2026-06-12. Verify current state before re-flagging.

Resolved / obsoleted:

1. **S02 peer conflict** — ADDRESSED in 2f0bfc9: spec 08 now pins `@cloudflare/vite-plugin` 1.40.0 (peers wrangler ^4.98.0, verified installable under the owner's npm quarantine; later 1.40.x patches peer-require ^4.100). Re-verify at S02 install time.
2. **Cron-string drift** — OBSOLETED: the string-keyed dispatcher died in the Workflows pivot; cron strings now live only in wrangler.jsonc (commented out) + specs.

Still open (re-flagged in the 2f0bfc9 review):

3. **/api SPA fallthrough** — unknown `/api/*` still returns 200 index.html (`src/index.ts` notFound → ASSETS) and is now UNTRACKED: S03's criteria and spec 03's error table contain no JSON-404/NOT_FOUND. Re-flag at S03 review if no criterion appeared.
4. **Schedules API gate** — `schedules` commented out in wrangler.jsonc (Cloudflare API 403s the field for this account; feature GA'd 2026-06-02). S04 criterion re-enables, but criterion 19 accepts a manual `wrangler workflows trigger` as proof, which masks a never-firing schedule. At S04 review insist on evidence of a *schedule-initiated* instance (`WorkflowEvent` carries `schedule?`). Also: S04 says "escalate with the cf-ray per the S01 research notes" but S01 notes record no cf-ray — dead pointer.
5. **Spec 07 §3 stale pool API** — shows `exports.default.fetch(req, env, ctx)`; post-0.13 pool takes the Request only (spec 08 + S01 notes are correct). Watch for S03/S05 agents copying spec 07's snippet.
6. **Workflows determinism rule missing from spec 01** — nothing states "all side effects inside step.do; run() outside steps re-executes on wake and must be deterministic". Also unaddressed: overlapping instances (an old retrying instance can overwrite a fresher `wx:digest:v1`; last-write-wins on full blobs with honest `fetchedAt`, so low impact — suggested bounding step retries so instance lifetime < the 2h cadence in S04).

Pool gotchas verified against Cloudflare docs (2026-06): `introspectWorkflowInstance(binding, id)` must be awaited BEFORE `create({ id })`; `await using` / `dispose()` clears the instance's state, so fixed instance ids are safe across tests and watch re-runs.

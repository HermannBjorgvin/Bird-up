---
name: s01-review-open-risks
description: Review-findings ledger through S03 — S04 schedules-gate verification gap, spec 07 stale fetch snippet, S03 CORS/onError/dead-knob items, frozen-score context
metadata:
  type: project
---

Tracking ledger for scaffold-era review findings. S01 scaffold (e911096), the Workflows pivot (2f0bfc9), S02 (70d2fda — note: 775b893 was amended; the amend only ungitted a .playwright-mcp artifact) and S03 (scoring core + /api/windows) all reviewed 2026-06-12. Verify current state before re-flagging.

Resolved / obsoleted:

1. **S02 peer conflict** — RESOLVED, verified at S02: vite-plugin 1.40.0 + wrangler 4.98.0 + eslint 10.4.1 all installed, `npm ls` dedupes cleanly, lint exit 0.
2. **Cron-string drift** — OBSOLETED: the string-keyed dispatcher died in the Workflows pivot; cron strings now live only in wrangler.jsonc (commented out) + specs.
3. **/api SPA fallthrough** — RESOLVED at S03: spec 03 error table + S03 criterion added NOT_FOUND; `restRoutes.all("*")` returns the JSON 404 envelope, worker test covers it.

Still open (re-flagged in the 2f0bfc9 review):
4. **Schedules API gate** — `schedules` commented out in wrangler.jsonc (Cloudflare API 403s the field for this account; feature GA'd 2026-06-02). S04 criterion re-enables, but criterion 19 accepts a manual `wrangler workflows trigger` as proof, which masks a never-firing schedule. At S04 review insist on evidence of a *schedule-initiated* instance (`WorkflowEvent` carries `schedule?`). Also: S04 says "escalate with the cf-ray per the S01 research notes" but S01 notes record no cf-ray — dead pointer.
5. **Spec 07 §3 stale pool API** — shows `exports.default.fetch(req, env, ctx)`; post-0.13 pool takes the Request only (spec 08 + S01 notes are correct). S03's worker test used the correct one-arg form — didn't bite, but the spec snippet is still stale. Watch S05+.
6. **Workflows determinism rule missing from spec 01** — nothing states "all side effects inside step.do; run() outside steps re-executes on wake and must be deterministic". Also unaddressed: overlapping instances (an old retrying instance can overwrite a fresher `wx:digest:v1`; last-write-wins on full blobs with honest `fetchedAt`, so low impact — suggested bounding step retries so instance lifetime < the 2h cadence in S04).

New at S02 review (2026-06-12, flagged as 🟡 nits — check if addressed before re-flagging):

7. **Write-hook warning policy mismatch** — `.claude/settings.json` hook runs `eslint --max-warnings 0` per file while the repo gate is `--max-warnings 4` (budgeted max-lines-500). Once any file legitimately uses the budget, every Write/Edit to it exit-2s at the agent — thrash risk for delegated stories. Suggested: hook gates on errors only.
8. **No build→deploy coupling** — `npx wrangler deploy` serves whatever `dist/client` holds; stale-asset deploys are silent. Suggested a root `deploy` script chaining check+build+deploy. Watch at every website-touching story's deploy step.
9. **ESLint baseline only covers `**/*.{ts,tsx}`** — plain .js/.jsx files get max-lines only (js.configs.recommended is inside the ts/tsx block). Minor guardrail gap if agents ever write .js.

New at S03 review (2026-06-12, 🟡 — check before re-flagging at S04/S07):

10. **CORS only on the /api/windows success path** — spec 03 says ACAO `*` on *all* GETs; 400/404 envelopes and `/api/health` lack it, undermining the spec-01 "future-alerts door" (external pollers can't read errors). Suggested router-level middleware/hono cors.
11. **No `restRoutes.onError`** — non-InvalidParams errors rethrow into Hono's default plain-text 500, not spec 03's `INTERNAL` JSON envelope.
12. **`anomaly.baselineDays` is a dead policy knob** — declared in DEFAULT_POLICY + spec 02 config block but never read; `computeBaseline` always uses the whole digest. Misleading tunable; remove or wire it.
13. **Lead-time confidence is anchored to digest index, not request time** — fine while digest[0] = today (fixture), but once KV digests go stale (S04), day-1 lead = fetch day. Bounded by the 6h/24h staleness rules; revisit at S04.

Scoring model context (S03): spec 02 was rewritten to multiplicative gates (`100·warmth·gustFactor·precipFactor`), version 2026-06.2; frozen T2=86.67/T4=93.78/T8=86.67 verified by hand and they pin **population** sd (÷n) — sample sd would give T4≈93.10. Spec 02 doesn't say ÷n explicitly (flagged as nit).

Pool gotchas verified against Cloudflare docs (2026-06): `introspectWorkflowInstance(binding, id)` must be awaited BEFORE `create({ id })`; `await using` / `dispose()` clears the instance's state, so fixed instance ids are safe across tests and watch re-runs.

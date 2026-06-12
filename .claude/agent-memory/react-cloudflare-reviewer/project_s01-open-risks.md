---
name: s01-review-open-risks
description: Open risks flagged in the S01 scaffold review (e911096) — S02 wrangler/vite-plugin peer conflict, cron-string drift, /api SPA fallthrough
metadata:
  type: project
---

Risks flagged in the S01 scaffold review (commit e911096, reviewed 2026-06-12), accepted as-is at the time. Verify current state before re-flagging.

1. **S02 peer conflict**: spec 08 pins wrangler 4.98.0 (matches pool-workers 0.16.13's bundled miniflare) but also pins `@cloudflare/vite-plugin` 1.40.x whose peer range is wrangler ^4.100 — S02's install will hit ERESOLVE. **Why:** the owner's npm quarantine (`min-release-age=7` in ~/.npmrc) constrains which versions are installable. **How to apply:** when reviewing S02, check which side moved (older vite-plugin vs newer wrangler) and that spec 08's pin table was updated to match.
2. **Cron-string drift**: cron expressions are duplicated between `wrangler.jsonc` and `src/jobs/dispatch.ts`; an unmatched cron silently no-ops. Suggested a unit test asserting `triggers.crons` equals the dispatch constants.
3. **/api SPA fallthrough**: unknown `/api/*` paths hit `app.notFound -> ASSETS -> index.html` (200 HTML instead of 404 JSON). Spec 08's entry-point sketch sanctions the shape; fix expected in S03's REST story (JSON 404 inside restRoutes).

# Tjaldur — project context

Iceland camping weather-window planner: finds warm/calm/dry windows in the 16-day forecast, recommends campsites inside them, optionally overlays eBird species the user hasn't seen this year. One Cloudflare Worker (free tier) serving a public authless MCP server (`/mcp`), a REST API (`/api/*`) and a Leaflet map website (Static Assets). ~100–200 searches/day — **do not over-engineer**.

## Where everything is defined

- `specs/00…08` — the contract. **00** product/non-goals · **01** architecture, KV schema, `Recommendation` shape · **02** scoring policy · **03** MCP tools + REST · **04** data sources (Open-Meteo, tjalda.is/OSM, eBird) · **05** website · **06** implementation slices · **07** testing · **08** tech stack, version pins, deploy runbook.
- `stories/` — the work, in build order (S01–S12), each with acceptance criteria. `stories/README.md` is the index and sequencing map. Work story-by-story: tests from the acceptance criteria first, then implement, then check the boxes and fill the story's *Notes* if it asks for measurements.

## Hard rules

1. **`src/core/` stays pure** — no I/O, no platform types, policy passed explicitly. I/O lives in adapters behind the `ports/` interfaces (spec 01).
2. **Scoring changes are spec changes**: any behavior change to `core/scoring/` must update the canonical table in `specs/02-scoring-policy.md`, the transcribed tests, and bump `policyVersion` — in one commit. Never hardcode weather judgments outside the policy config.
3. **The zod `Recommendation` schema (`core/types.ts`) is the single source of truth** for MCP, REST and the website. Schema changes after S07 ships are breaking changes to a public contract.
4. **No live external APIs in tests.** Recorded fixtures in `test/fixtures/` only; record via `scripts/record-fixtures.ts` manually (spec 07).
5. **KV keys, the `tjaldur:seen:v1` localStorage key and `policyVersion` are versioned** — bump the suffix on shape changes, never migrate.
6. Every API response carries non-empty `attribution[]`; eBird's string verbatim (spec 04).
7. **tjalda.is launch gate**: the tjalda adapter must not fetch in production until the owner records clearance (story S12). The adapter, if built, is polite: weekly cadence, identifying User-Agent.
8. No user accounts, no server-side personal data, no analytics. Seen-bird lists arrive per-request and are never stored.
9. Secrets only via `wrangler secret put` / git-ignored `.dev.vars` — never in `wrangler.jsonc` or code.

## Toolchain gotchas (details in spec 08)

- vitest is pinned to 4.1.x for `@cloudflare/vitest-pool-workers`; the pool uses the **post-0.13 API**: `cloudflareTest()` Vite plugin, `import { env, exports } from "cloudflare:workers"` — `SELF`, `defineWorkersConfig` and `fetchMock` no longer exist. Most online tutorials show the old API; trust spec 08.
- MCP: `createMcpHandler` from `agents/mcp` wrapping an `McpServer`; zod **v4** (forced by `agents`).
- Two vitest projects (`test/unit` node, `test/worker` pool); project configs don't inherit root options.

## Commands

```sh
npm run dev      # vite dev — site + Worker + KV in workerd, HMR
npm test         # vitest run, both projects
npm run lint     # eslint . --max-warnings 4 (max-lines 500 is a warning — budgeted, not free)  [from S02]
npm run check    # tsc --noEmit && eslint && vitest run  — must be green before any deploy
npm run build    # vite build → dist/
npx wrangler deploy   # manual deploy — there is deliberately no CI/CD
```

Iceland is UTC year-round: all dates are plain UTC `YYYY-MM-DD`, no timezone math anywhere.

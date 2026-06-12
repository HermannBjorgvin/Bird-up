# 08 — Tech stack & deployment

Status: accepted · Last updated: 2026-06-12 · Versions verified against npm/Cloudflare docs on this date

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Config format | `wrangler.jsonc` | Officially recommended over TOML for new projects; some newer features are JSON-only |
| Dev loop | `@cloudflare/vite-plugin` (`vite dev` runs the Worker in real workerd with bindings + site HMR) | One dev command for site + API + MCP; reads `wrangler.jsonc` directly |
| Deploy | **Manual**: `npm run build && npx wrangler deploy` | No CI/CD by explicit decision; a hobby project's deploy is one command |
| Types | `wrangler types` → `worker-configuration.d.ts` | Preferred over `@cloudflare/workers-types`; generated from our own config |
| zod | v4 | Forced by `agents` peer dep (`^4.0.0`); MCP SDK now accepts `^3.25 \|\| ^4.0` |
| vitest | 4.1.x pinned | `@cloudflare/vitest-pool-workers` peer-requires `^4.1.0` exactly; this pairing historically lags — pin and upgrade deliberately |

## Version pins

| Package | Version | Notes |
|---|---|---|
| `wrangler` | 4.98.0 | Needs **Node ≥ 22**; keep matched to the version the vitest pool ships to avoid miniflare skew (0.16.13 ships 4.98.0) |
| `hono` | 4.12.x | Router |
| `agents` | 0.15.0 | `createMcpHandler` from **`agents/mcp`**; peer-requires zod 4 |
| `@modelcontextprotocol/sdk` | 1.29.0 | Install explicitly (also used by MCP tests as the client) |
| `zod` | 4.4.x | |
| `vite` | 8.0.x | React app in `web/` (create-vite `react-ts` template) |
| `react` + `react-dom` | 19.x | Template defaults, pinned exact at S02 scaffold time |
| `eslint` (+ template plugins) | 9.x flat config | From the `react-ts` template; see "Lint & agent guardrails" |
| `react-doctor` | latest at S02 | React-specific scanner (millionco); `doctor.config.ts` committed |
| `@cloudflare/vite-plugin` | 1.40.0 | Peers: vite ^6.1‖^7‖^8, wrangler ^4.98.0 — verified installable under the quarantine; later 1.40.x patches peer-require wrangler ^4.100 |
| `vitest` | 4.1.8 | |
| `@cloudflare/vitest-pool-workers` | 0.16.13 | **Post-0.13 API** — see warning below |
| `leaflet` + `@types/leaflet` | 1.9.4 / 1.9.x | Leaflet ships no types |
| `typescript` | 5.9.3 | `moduleResolution: "bundler"`, lib ES2022 + ESNext.Disposable (for `await using`), `noUncheckedIndexedAccess` |
| Node | 22 LTS (≥22.12) or 24 LTS | |

> **npm release quarantine.** The owner's `~/.npmrc` sets `min-release-age=7` (+ a `before` date pin): packages published in the last week don't install. Pin to versions at least a week old; if an exact pin here fails with `ETARGET`, fall back to the newest version inside the cutoff and update this table — don't loosen the quarantine.

> **⚠ vitest-pool-workers post-0.13 API.** Most tutorials online show the old API. The current one: configure via the `cloudflareTest()` Vite plugin (NOT `defineWorkersConfig`, removed); access bindings and the worker via `import { env, exports } from "cloudflare:workers"` (NOT `SELF` from `cloudflare:test`, removed); `fetchMock`/`isolatedStorage`/`singleWorker` are gone (we inject fetch fakes ourselves — [07-testing.md](07-testing.md)). Workflow testing: schedules never fire in tests — create instances through the binding and introspect: `await using instance = await introspectWorkflowInstance(env.REFRESH_WEATHER, id); await env.REFRESH_WEATHER.create({ id }); await instance.waitForStatus("complete")` (`introspectWorkflowInstance` from `cloudflare:test`; also `getOutput`, `waitForStepResult`, and `modify` for disabling sleeps/mocking steps). HTTP integration: `exports.default.fetch(new Request(…))` — it's a loopback service binding, so no `env`/`ctx` args (the runtime supplies them) and Requests serialize fine.

## wrangler.jsonc shape

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tjaldur",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-01",   // must stay ≤ the vitest pool's workerd build date
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },  // Workflows dashboard + structured logs
  "assets": {
    "directory": "./dist/client",                      // Vite build output
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/mcp", "/mcp/*"]   // everything else served as static assets, free
  },
  "kv_namespaces": [{ "binding": "KV", "id": "<NAMESPACE_ID>" }],
  "workflows": [
    { "name": "refresh-weather",   "binding": "REFRESH_WEATHER",   "class_name": "RefreshWeather",   "schedules": ["0 */2 * * *"] },
    { "name": "refresh-campsites", "binding": "REFRESH_CAMPSITES", "class_name": "RefreshCampsites", "schedules": ["0 3 * * 1"] }
  ],
  "routes": [{ "pattern": "tjaldur.9z.is", "custom_domain": true }],  // owner's project domain
  "vars": { "BASE_URL": "https://tjaldur.9z.is" }
}
```

> **Schedules gate (2026-06-12):** the Workflows API currently 403s any PUT whose body contains `schedules` for this account (feature GA'd 2026-06-02). The field is commented out in the live `wrangler.jsonc`; re-enabling it is an S04 acceptance criterion. Everything else about Workflows deploys and runs fine.

Secrets are never in config: `npx wrangler secret put EBIRD_API_KEY` for production, a git-ignored `.dev.vars` file locally. With array-form `run_worker_first`, static requests bypass the Worker entirely (and don't count against the request quota); the Hono `notFound → env.ASSETS.fetch` fallthrough is only a safety net.

## Entry point shape

```ts
// src/index.ts
const app = new Hono<{ Bindings: Env }>();
app.route("/api", restRoutes);                                   // delivery/rest.ts
app.all("/mcp", (c) =>
  createMcpHandler(buildMcpServer(c.env), { route: "/mcp" })(c.req.raw, c.env, c.executionCtx));
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;

// Workflow classes — Cloudflare instantiates these on their bindings' schedules
export { RefreshWeather } from "./workflows/refresh-weather";
export { RefreshCampsites } from "./workflows/refresh-campsites";
```

`buildMcpServer` constructs an `McpServer` (`@modelcontextprotocol/sdk/server/mcp.js`) and registers the two tools from [03-api.md](03-api.md) with zod input schemas; `createMcpHandler` gives stateless streamable HTTP per request — no Durable Objects.

## Test setup (two vitest projects)

```
vitest.config.ts                 # test.projects: [unit, worker]
test/unit/vitest.config.ts      # name "unit", plain node env — core/, web pure modules
test/worker/vitest.config.ts    # name "worker", plugins: [cloudflareTest({ wrangler: { configPath } })]
```

Project-level configs do not inherit root `test` options — each is configured fully. `npm test` = `vitest run` (both projects); `npm run check` = `tsc --noEmit && eslint . --max-warnings 4 && vitest run` (lint joins `check` when S02 lands it).

## Lint & agent guardrails (added 2026-06-12, land in S02)

Most stories after S02 will be delegated to agents; these are the deterministic rails they run on:

- **ESLint flat config at the repo root** — the `react-ts` template's config (typescript-eslint, react-hooks, react-refresh) scoped to `web/**`, plus repo-wide `max-lines: ["warn", { "max": 500 }]` (skip blank lines/comments). 500 lines is the owner's split-this-file signal for web apps.
- **`npm run lint`** = `eslint . --max-warnings 4` — warnings are budgeted, not free: a fifth file over 500 lines fails the gate. Part of `npm run check`.
- **`react-doctor`** — React-specific scanner: `npm run doctor` (one-shot scan, `--no-telemetry`), `doctor.config.ts` committed, agent integration via `npx react-doctor@latest install`. Not part of `check` (advisory; run per story that touches `web/`).
- **Write hook** — Claude Code `PostToolUse` hook in `.claude/settings.json` (checked in): every `Write`/`Edit` runs ESLint on the touched file, so agents get lint feedback at write time instead of at the `check` gate.

## Runbooks

**Dev:** `npx vite dev` — site with HMR, `/api/*` + `/mcp` + KV running in real workerd. Schedules never fire locally; run a workflow on demand against the deployed Worker with `npx wrangler workflows trigger refresh-weather`, inspect with `npx wrangler workflows instances describe refresh-weather <id>` (tests create instances directly via the binding).

**Deploy (manual, no CI/CD — deliberate):**

```sh
npm run check                 # typecheck + both test projects
npm run build                 # vite build → dist/
npx wrangler deploy           # workflows (+ schedules) + KV bindings + assets from wrangler.jsonc
npx wrangler tail             # optional: live logs
```

**One-time setup:** `wrangler login` · `wrangler kv namespace create KV` (paste id into config) · `wrangler secret put EBIRD_API_KEY` · `wrangler types` (regenerate after config changes; `worker-configuration.d.ts` is committed).

## Scaffolding order (stories S01–S02)

1. `git init` repo layout per [01-architecture.md](01-architecture.md) · `npm init` · install pins above.
2. `wrangler.jsonc` + `tsconfig.json` + `wrangler types`.
3. `src/index.ts` with Hono + `/api/health`; two skeleton Workflow classes in `src/workflows/`, schedules on their bindings.
4. vitest two-project setup; one unit test + worker tests (health route, KV round-trip, both workflow skeletons complete via `introspectWorkflowInstance`) green.
5. `web/` scaffolded with the Vite generator (`npm create vite@latest` → `react-ts`) + `@cloudflare/vite-plugin`; placeholder page; build feeds `assets.directory`; ESLint root config, `react-doctor`, and the write hook per "Lint & agent guardrails".
6. KV namespace, secrets, first `wrangler deploy`; verify `/api/health` and the placeholder page on `*.workers.dev`.

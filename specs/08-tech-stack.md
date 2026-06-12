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
| `wrangler` | 4.100.0 | Needs **Node ≥ 22**; keep matched to the version the vitest pool ships to avoid miniflare skew |
| `hono` | 4.12.x | Router |
| `agents` | 0.15.0 | `createMcpHandler` from **`agents/mcp`**; peer-requires zod 4 |
| `@modelcontextprotocol/sdk` | 1.29.0 | Install explicitly (also used by MCP tests as the client) |
| `zod` | 4.4.x | |
| `vite` | 8.0.x | Vanilla-ts app in `web/` |
| `@cloudflare/vite-plugin` | 1.40.x | Peers: vite ^6.1‖^7‖^8, wrangler ^4.100 |
| `vitest` | 4.1.x | |
| `@cloudflare/vitest-pool-workers` | 0.16.x | **Post-0.13 API** — see warning below |
| `leaflet` + `@types/leaflet` | 1.9.4 / 1.9.x | Leaflet ships no types |
| `typescript` | 5.x | `moduleResolution: "bundler"`, lib ES2022+ |
| Node | 22 LTS (≥22.12) or 24 LTS | |

> **⚠ vitest-pool-workers post-0.13 API.** Most tutorials online show the old API. The current one: configure via the `cloudflareTest()` Vite plugin (NOT `defineWorkersConfig`, removed); access bindings and the worker via `import { env, exports } from "cloudflare:workers"` (NOT `SELF` from `cloudflare:test`, removed); `fetchMock`/`isolatedStorage`/`singleWorker` are gone (we inject fetch fakes ourselves — [07-testing.md](07-testing.md)). Cron testing: `createScheduledController` + `createExecutionContext` from `cloudflare:test`, then `exports.default.scheduled(ctrl, env, ctx)`. HTTP integration: `exports.default.fetch(new Request(…), env, ctx)`.

## wrangler.jsonc shape

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tjaldur",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-12",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist/client",                      // Vite build output
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/mcp", "/mcp/*"]   // everything else served as static assets, free
  },
  "kv_namespaces": [{ "binding": "KV", "id": "<NAMESPACE_ID>" }],
  "triggers": { "crons": ["0 */2 * * *", "0 3 * * 1"] },  // weather 2h, campsites weekly
  "vars": { "BASE_URL": "https://tjaldur.<account>.workers.dev" }
}
```

Secrets are never in config: `npx wrangler secret put EBIRD_API_KEY` for production, a git-ignored `.dev.vars` file locally. With array-form `run_worker_first`, static requests bypass the Worker entirely (and don't count against the request quota); the Hono `notFound → env.ASSETS.fetch` fallthrough is only a safety net.

## Entry point shape

```ts
// src/index.ts
const app = new Hono<{ Bindings: Env }>();
app.route("/api", restRoutes);                                   // delivery/rest.ts
app.all("/mcp", (c) =>
  createMcpHandler(buildMcpServer(c.env), { route: "/mcp" })(c.req.raw, c.env, c.executionCtx));
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  scheduled: (ctrl, env, ctx) => dispatchCron(ctrl.cron, env, ctx),  // jobs/, keyed by cron expression
} satisfies ExportedHandler<Env>;
```

`buildMcpServer` constructs an `McpServer` (`@modelcontextprotocol/sdk/server/mcp.js`) and registers the two tools from [03-api.md](03-api.md) with zod input schemas; `createMcpHandler` gives stateless streamable HTTP per request — no Durable Objects.

## Test setup (two vitest projects)

```
vitest.config.ts                 # test.projects: [unit, worker]
test/unit/vitest.config.ts      # name "unit", plain node env — core/, web pure modules
test/worker/vitest.config.ts    # name "worker", plugins: [cloudflareTest({ wrangler: { configPath } })]
```

Project-level configs do not inherit root `test` options — each is configured fully. `npm test` = `vitest run` (both projects); `npm run check` = `tsc --noEmit && vitest run`.

## Runbooks

**Dev:** `npx vite dev` — site with HMR, `/api/*` + `/mcp` + KV running in real workerd. Cron testing locally: `npx wrangler dev --test-scheduled` (when not using vite dev).

**Deploy (manual, no CI/CD — deliberate):**

```sh
npm run check                 # typecheck + both test projects
npm run build                 # vite build → dist/
npx wrangler deploy           # crons + KV bindings + assets from wrangler.jsonc
npx wrangler tail             # optional: live logs
```

**One-time setup:** `wrangler login` · `wrangler kv namespace create KV` (paste id into config) · `wrangler secret put EBIRD_API_KEY` · `wrangler types` (regenerate after config changes; `worker-configuration.d.ts` is committed).

## Scaffolding order (stories S01–S02)

1. `git init` repo layout per [01-architecture.md](01-architecture.md) · `npm init` · install pins above.
2. `wrangler.jsonc` + `tsconfig.json` + `wrangler types`.
3. `src/index.ts` with Hono + `/api/health` + empty scheduled dispatcher.
4. vitest two-project setup; one unit test + one worker test (health route, KV round-trip) green.
5. `web/` Vite vanilla-ts app + `@cloudflare/vite-plugin`; placeholder page; build feeds `assets.directory`.
6. KV namespace, secrets, first `wrangler deploy`; verify `/api/health` and the placeholder page on `*.workers.dev`.

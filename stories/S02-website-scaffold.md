# S02 — Website scaffold: Vite app served as Static Assets

**Epic:** scaffolding · **Depends on:** S01 · **Spec refs:** [08-tech-stack](../specs/08-tech-stack.md), [05-website](../specs/05-website.md)

> As a developer, I want the website shell built by Vite and served free as Worker Static Assets, so that website stories (S08, S10) only add features, never plumbing.

## Description

A React + TypeScript Vite 8 app in `web/`, scaffolded with the Vite generator (`npm create vite@latest` → `react-ts` template) and wired through `@cloudflare/vite-plugin`, so `vite dev` serves the site with HMR **and** the Worker (API/MCP/KV) in real workerd in one command. `vite build` emits into the `assets.directory` consumed by `wrangler deploy`. The page itself is a placeholder: title, one-line pitch, attribution footer skeleton, and a fetch of `/api/health` rendered on screen (proving same-origin API access end-to-end).

This story also lands the lint & agent guardrails from [08-tech-stack](../specs/08-tech-stack.md): root ESLint flat config with the 500-line `max-lines` warning, react-doctor's rule set (via `eslint-plugin-react-doctor` — owner decision 2026-06-12, supersedes the standalone CLI), and the Claude Code write hook — in place before any story is delegated to agents.

## Acceptance criteria

- [x] `web/` contains the React app from the `react-ts` template (React 19, versions pinned exact); `npm run dev` (root script → `vite dev web`) serves the page and live `/api/health` from the Worker in one process; editing a component hot-reloads.
- [x] `npm run build` produces the client bundle where `wrangler.jsonc`'s `assets.directory` expects it; `wrangler deploy` after build serves the page at `/` on tjaldur.9z.is while `/api/*` still hits the Worker.
- [x] The placeholder page renders the project name, a one-line description, the attribution footer skeleton (sources per [04-data-sources.md](../specs/04-data-sources.md), to be completed in S08/S12), and the live `/api/health` result.
- [x] Leaflet + `@types/leaflet` installed and type-checking (no map yet — S08); the bundle builds with them imported behind a stub module to lock in the dependency early.
- [x] Static asset requests bypass the Worker (`run_worker_first` array verified: a static path is NOT logged by the Worker in `wrangler tail` while `/api/health` is).
- [x] ESLint flat config at the repo root: template rules scoped to `web/**`, repo-wide `max-lines` **warning** at 500 lines; `npm run lint` = `eslint . --max-warnings 4` and is part of `npm run check` (spec 08 "Lint & agent guardrails").
- [x] react-doctor's rule set active in the root ESLint config via `eslint-plugin-react-doctor` (pinned exact, `recommended` config scoped to `web/**`), so it runs in `lint`/`check`/the write hook; scaffold findings (if any) recorded in notes. *(Rewritten 2026-06-12 from the standalone-CLI criterion — owner decision; the CLI's dead-code/score scan stays available ad hoc via `npx react-doctor`.)*
- [x] Claude Code write hook in `.claude/settings.json` (checked in): `PostToolUse` on `Write`/`Edit` runs ESLint on the touched file; verified by writing a file with a deliberate lint violation and seeing the hook report it.
- [x] `web/CHECKLIST.md` created with its first entries (page loads at `/`, health shown, hot reload works) and checked off against the deployed site in story notes.

## Demo

One `vite dev` command runs site + API together locally; the deployed root URL shows the Tjaldur placeholder talking to its own API.

## Notes

Completed 2026-06-12. Deployed version `3187854a-3ab3-4007-830f-1f6dcbb52202`.

- **Scaffold**: create-vite 9.0.7 `react-ts` template into `web/`; its package.json/README/.gitignore/eslint config dissolved into the repo root (spec 01: single npm package, no workspaces). Template artwork replaced by the Tjaldur placeholder.
- **Pins** (newest inside the npm quarantine, all exact): react/react-dom 19.2.6, vite 8.0.14, @vitejs/plugin-react 6.0.2, @cloudflare/vite-plugin 1.40.0, eslint 10.4.1 (template ships 10.x now — spec 08 table said 9.x, updated), typescript-eslint 8.60.0, eslint-plugin-react-doctor 0.2.11, leaflet 1.9.4 + @types/leaflet 1.9.21, @types/node 24.12.4. TypeScript stays 5.9.3 (root pin) although the template wanted ~6.0.2 — one TS for the whole package.
- **Vite layout decision** (researched against the plugin's source + docs, recorded in spec 08): `index.html` stays in `web/`, root scripts run `vite dev web` / `vite build web`, `web/vite.config.ts` uses `cloudflare({ configPath: "../wrangler.jsonc" })` + `build.outDir: "../dist"` so the client lands in `dist/client`. Deploy remains plain `npx wrangler deploy` on the raw wrangler.jsonc; the plugin's `dist/tjaldur/` worker bundle and `web/.wrangler/` deploy redirect are unused artifacts (the zero-flag redirect flow requires index.html at the repo root).
- **react-doctor pivot**: owner asked for the linter-config integration mid-story; standalone CLI (0.2.11 — 0.5.x quarantined) replaced by `eslint-plugin-react-doctor` in the root config. The CLI's `install -y` had sprayed configs for six agents plus a git pre-commit hook gating on warnings; all removed (doctor rules are part of `lint` now, and the advisory-not-gate stance lives in `--max-warnings 4`).
- **Scaffold findings by the doctor rules**: 3 on the placeholder itself — `no-fetch-in-effect` on the health probe (kept, scoped inline disable with justification: one-shot probe, a data-fetching library is unwarranted) and 2× `design-no-em-dash-in-jsx-text` (fixed). An ad-hoc CLI full scan (`npx react-doctor@0.2.11 . --no-score --full`) additionally reported 3 `unused-file` dead-code warnings on `web/src/{App.tsx,main.tsx,map/leaflet-stub.ts}` — all false positives: the CLI's reachability starts at the repo-root package.json and can't see `web/index.html` as the entry point; all three files demonstrably ship in the built client bundle.
- **Write hook**: `PostToolUse` on `Write|Edit` in checked-in `.claude/settings.json`; jq extracts the path, `eslint --no-warn-ignored --max-warnings 0` on ts/tsx/js/jsx, violations exit 2 → fed back to the agent. Verified live: a deliberate `var unused` file produced the ESLint report in-conversation at write time.
- Web type-check is its own project (`tsc -b web`, DOM lib) joined into `npm run check`; template tsconfigs tightened with `strict` + `noUncheckedIndexedAccess`, tsbuildinfo redirected into root `node_modules/.tmp` (a `web/node_modules` would be a lie in a single-package repo).
- Owner waived the manual HMR check (template-default vite behavior).

- **Checklist run vs the deployed site (2026-06-12, real browser)**: page at https://tjaldur.9z.is/ renders title, pitch, "API health: ok" (live client-side fetch), the Open-Meteo + OSM attribution footer, and "Leaflet 1.9.4" (stub in the bundle). HMR entry waived by owner.
- **Static-bypass evidence**: with `wrangler tail` attached, requests to `/favicon.svg` and `/assets/index-*.js` produced **zero** tail events while `/api/health` produced one — `run_worker_first` confirmed working; asset traffic never touches the Worker.

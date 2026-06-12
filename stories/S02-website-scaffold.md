# S02 — Website scaffold: Vite app served as Static Assets

**Epic:** scaffolding · **Depends on:** S01 · **Spec refs:** [08-tech-stack](../specs/08-tech-stack.md), [05-website](../specs/05-website.md)

> As a developer, I want the website shell built by Vite and served free as Worker Static Assets, so that website stories (S08, S10) only add features, never plumbing.

## Description

A React + TypeScript Vite 8 app in `web/`, scaffolded with the Vite generator (`npm create vite@latest` → `react-ts` template) and wired through `@cloudflare/vite-plugin`, so `vite dev` serves the site with HMR **and** the Worker (API/MCP/KV) in real workerd in one command. `vite build` emits into the `assets.directory` consumed by `wrangler deploy`. The page itself is a placeholder: title, one-line pitch, attribution footer skeleton, and a fetch of `/api/health` rendered on screen (proving same-origin API access end-to-end).

This story also lands the lint & agent guardrails from [08-tech-stack](../specs/08-tech-stack.md): root ESLint flat config with the 500-line `max-lines` warning, `react-doctor`, and the Claude Code write hook — in place before any story is delegated to agents.

## Acceptance criteria

- [ ] `web/` contains the React app from the `react-ts` template (React 19, versions pinned exact); `npm run dev` (root script → `vite dev`) serves the page and live `/api/health` from the Worker in one process; editing a component hot-reloads.
- [ ] `npm run build` produces the client bundle where `wrangler.jsonc`'s `assets.directory` expects it; `wrangler deploy` after build serves the page at `/` on workers.dev while `/api/*` still hits the Worker.
- [ ] The placeholder page renders the project name, a one-line description, the attribution footer skeleton (sources per [04-data-sources.md](../specs/04-data-sources.md), to be completed in S08/S12), and the live `/api/health` result.
- [ ] Leaflet + `@types/leaflet` installed and type-checking (no map yet — S08); the bundle builds with them imported behind a stub module to lock in the dependency early.
- [ ] Static asset requests bypass the Worker (`run_worker_first` array verified: a static path is NOT logged by the Worker in `wrangler tail` while `/api/health` is).
- [ ] ESLint flat config at the repo root: template rules scoped to `web/**`, repo-wide `max-lines` **warning** at 500 lines; `npm run lint` = `eslint . --max-warnings 4` and is part of `npm run check` (spec 08 "Lint & agent guardrails").
- [ ] `react-doctor` set up: `doctor.config.ts` committed, `npm run doctor` script (with `--no-telemetry`), agent integration installed via `npx react-doctor@latest install`; scaffold scan findings (if any) recorded in notes.
- [ ] Claude Code write hook in `.claude/settings.json` (checked in): `PostToolUse` on `Write`/`Edit` runs ESLint on the touched file; verified by writing a file with a deliberate lint violation and seeing the hook report it.
- [ ] `web/CHECKLIST.md` created with its first entries (page loads at `/`, health shown, hot reload works) and checked off against the deployed site in story notes.

## Demo

One `vite dev` command runs site + API together locally; the deployed root URL shows the Tjaldur placeholder talking to its own API.

## Notes

(checklist run record goes here)

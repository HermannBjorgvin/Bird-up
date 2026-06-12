# S02 — Website scaffold: Vite app served as Static Assets

**Epic:** scaffolding · **Depends on:** S01 · **Spec refs:** [08-tech-stack](../specs/08-tech-stack.md), [05-website](../specs/05-website.md)

> As a developer, I want the website shell built by Vite and served free as Worker Static Assets, so that website stories (S08, S10) only add features, never plumbing.

## Description

A vanilla-TypeScript Vite 8 app in `web/` wired through `@cloudflare/vite-plugin`, so `vite dev` serves the site with HMR **and** the Worker (API/MCP/KV) in real workerd in one command. `vite build` emits into the `assets.directory` consumed by `wrangler deploy`. The page itself is a placeholder: title, one-line pitch, attribution footer skeleton, and a fetch of `/api/health` rendered on screen (proving same-origin API access end-to-end).

## Acceptance criteria

- [ ] `web/` contains the Vite vanilla-ts app; `npm run dev` (root script → `vite dev`) serves the page and live `/api/health` from the Worker in one process; editing page source hot-reloads.
- [ ] `npm run build` produces the client bundle where `wrangler.jsonc`'s `assets.directory` expects it; `wrangler deploy` after build serves the page at `/` on workers.dev while `/api/*` still hits the Worker.
- [ ] The placeholder page renders the project name, a one-line description, the attribution footer skeleton (sources per [04-data-sources.md](../specs/04-data-sources.md), to be completed in S08/S12), and the live `/api/health` result.
- [ ] Leaflet + `@types/leaflet` installed and type-checking (no map yet — S08); the bundle builds with them imported behind a stub module to lock in the dependency early.
- [ ] Static asset requests bypass the Worker (`run_worker_first` array verified: a static path is NOT logged by the Worker in `wrangler tail` while `/api/health` is).
- [ ] `web/CHECKLIST.md` created with its first entries (page loads at `/`, health shown, hot reload works) and checked off against the deployed site in story notes.

## Demo

One `vite dev` command runs site + API together locally; the deployed root URL shows the Tjaldur placeholder talking to its own API.

## Notes

(checklist run record goes here)

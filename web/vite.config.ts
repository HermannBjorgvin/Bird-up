import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// Run from the repo root as `vite dev web` / `vite build web` (root npm scripts).
// The cloudflare plugin runs the Worker (API + KV + Workflows) in workerd during
// dev and honors run_worker_first; configPath resolves relative to the vite root.
export default defineConfig({
  plugins: [react(), cloudflare({ configPath: '../wrangler.jsonc' })],
  build: {
    // Client assets land in <repo>/dist/client — the assets.directory that
    // `wrangler deploy` (run from the repo root, raw wrangler.jsonc) consumes.
    outDir: '../dist',
    emptyOutDir: true,
  },
})

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "../../wrangler.jsonc" },
    }),
  ],
  test: {
    name: "worker",
    include: ["**/*.test.ts"],
    // The post-0.13 pool has no isolatedStorage: files share one KV namespace, and most of these
    // tests seed/clear the same `wx:digest:v1` key — run files one at a time.
    fileParallelism: false,
  },
});

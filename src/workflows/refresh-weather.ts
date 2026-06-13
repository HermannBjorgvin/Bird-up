import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from "cloudflare:workers";
import { chunkSites, fetchDigests } from "../adapters/openmeteo";
import { KvStore } from "../adapters/kv-store";
import { WX_DIGEST_KEY } from "../adapters/kv-weather";
import { SEED_CAMPSITES } from "../adapters/seed-campsites";
import type { DailyDigest } from "../core/types";
import type { WeatherDigest } from "../ports/weather";

/**
 * Runs every 2 h (schedule on the binding in wrangler.jsonc): one fetch+digest step per
 * ≤100-coordinate Open-Meteo chunk, then a final step that overwrites `wx:digest:v1`. KV is
 * written only in the last step, so a failed instance never publishes partial data — the read
 * path keeps serving the previous digest and surfaces staleness (spec 01).
 *
 * Explicit retries/timeouts keep the worst-case instance lifetime far below the 2 h cadence
 * (spec 01 overlap caveat): 4 attempts × 30 s timeout + 30/60/120 s backoff ≈ 5.5 min per step.
 */
const FETCH_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "30 seconds", backoff: "exponential" },
  timeout: "30 seconds",
};
const WRITE_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "30 seconds",
};

export class RefreshWeather extends WorkflowEntrypoint<Env> {
  async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
    // Outside steps: pure + deterministic only (this re-executes on every replay). SEED_CAMPSITES is
    // compiled in, so chunking here is replay-safe. S06 NOTE: when the site list moves to KV, that
    // read MUST move inside a step.do — and the chunk count (hence the `fetch chunk i/n` step names
    // the tests mock by name) will change with it.
    const chunks = chunkSites(SEED_CAMPSITES.map(({ id, lat, lng }) => ({ id, lat, lng })));

    const parts: Record<string, DailyDigest[]>[] = [];
    for (const [i, chunk] of chunks.entries()) {
      parts.push(await step.do(`fetch chunk ${i + 1}/${chunks.length}`, FETCH_STEP, () => fetchDigests(chunk)));
    }

    return step.do(`write ${WX_DIGEST_KEY}`, WRITE_STEP, async () => {
      const blob: WeatherDigest = {
        fetchedAt: new Date().toISOString(),
        model: "best_match",
        sites: Object.assign({}, ...parts) as Record<string, DailyDigest[]>,
      };
      await new KvStore(this.env.KV).putJson(WX_DIGEST_KEY, blob);
      return { fetchedAt: blob.fetchedAt, sites: Object.keys(blob.sites).length };
    });
  }
}

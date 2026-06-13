import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from "cloudflare:workers";
import { CAMP_SITES_KEY } from "../adapters/kv-campsites";
import { chunkSites, fetchDigests } from "../adapters/openmeteo";
import { KvStore } from "../adapters/kv-store";
import { WX_DIGEST_KEY } from "../adapters/kv-weather";
import type { DailyDigest } from "../core/types";
import type { CampsiteBlob } from "../ports/campsites";
import type { WeatherDigest } from "../ports/weather";

/**
 * Runs every 2 h (schedule on the binding in wrangler.jsonc): read the campsite list from KV →
 * one fetch+digest step per ≤100-coordinate Open-Meteo chunk → a final step that overwrites
 * `wx:digest:v1`. KV is written only in the last step, so a failed instance never publishes partial
 * data — the read path keeps serving the previous digest and surfaces staleness (spec 01).
 *
 * Explicit retries/timeouts keep the worst-case instance lifetime far below the 2 h cadence
 * (spec 01 overlap caveat): 4 attempts × 30 s timeout + 30/60/120 s backoff ≈ 5.5 min per step.
 */
const READ_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "15 seconds",
};
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
    // The site list is a nondeterministic KV read, so it MUST live inside a step (replay
    // determinism, spec 01). Chunking from the step result *outside* steps is replay-safe: the step
    // replays its cached value, so the chunk count — hence the `fetch chunk i/n` step names the
    // tests mock — stays stable for a given instance.
    const sites = await step.do("read site list", READ_STEP, async () => {
      const blob = await new KvStore(this.env.KV).getJson<CampsiteBlob>(CAMP_SITES_KEY);
      return (blob?.sites ?? []).map(({ id, lat, lng }) => ({ id, lat, lng }));
    });
    if (sites.length === 0) throw new Error("camp:sites:v1 is empty — run refresh-campsites first");

    const chunks = chunkSites(sites);

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

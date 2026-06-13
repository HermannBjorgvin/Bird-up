import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from "cloudflare:workers";
import { CAMP_SITES_KEY } from "../adapters/kv-campsites";
import { KvStore } from "../adapters/kv-store";
import { OsmOverpassSource } from "../adapters/osm-overpass";
import { mergeOverrides, type CampsiteOverrides } from "../core/overrides";
import { mergeDriveTimes, type DriveTimes } from "../core/drive-times";
import type { CampsiteBlob } from "../ports/campsites";
import overridesJson from "../../data/campsite-overrides.json";
import driveTimesJson from "../../data/drive-times.json";

/**
 * Runs weekly (schedule on the binding in wrangler.jsonc): fetch + normalize the OSM campsite list,
 * then overwrite `camp:sites:v1`. KV is written only in the final step, so a failed instance never
 * publishes partial data — the read path keeps serving the previous list (spec 01).
 *
 * Overpass can be slow; the fetch step gets a generous timeout. Worst-case instance lifetime
 * (4 attempts × 60 s + 30/60/120 s backoff ≈ 8 min) stays far under the weekly cadence.
 */
const OVERRIDES = overridesJson as CampsiteOverrides;
const DRIVE_TIMES = driveTimesJson as DriveTimes;

const FETCH_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "30 seconds", backoff: "exponential" },
  timeout: "60 seconds",
};
const WRITE_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "30 seconds",
};

export class RefreshCampsites extends WorkflowEntrypoint<Env> {
  async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
    const sites = await step.do("fetch campsites (osm)", FETCH_STEP, () => new OsmOverpassSource().list());

    return step.do(`write ${CAMP_SITES_KEY}`, WRITE_STEP, async () => {
      const { sites: corrected, warnings } = mergeOverrides(sites, OVERRIDES);
      for (const w of warnings) console.warn(w);
      const merged = mergeDriveTimes(corrected, DRIVE_TIMES);
      const blob: CampsiteBlob = { fetchedAt: new Date().toISOString(), source: "osm", sites: merged };
      await new KvStore(this.env.KV).putJson(CAMP_SITES_KEY, blob);
      return { fetchedAt: blob.fetchedAt, sites: merged.length };
    });
  }
}

import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from "cloudflare:workers";

/** Runs weekly (schedule on the binding in wrangler.jsonc). Steps land in S06:
 *  run the active CampsiteSource adapter → normalize → overwrite `camp:sites:v1`. */
const NOOP_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "30 seconds", // explicit per-step bounds (spec 01 overlap caveat) even for the S06 placeholder
};

export class RefreshCampsites extends WorkflowEntrypoint<Env> {
  async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
    return step.do("noop", NOOP_STEP, async () => ({ ok: true }));
  }
}

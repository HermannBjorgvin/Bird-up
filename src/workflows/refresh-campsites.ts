import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

/** Runs weekly (schedule on the binding in wrangler.jsonc). Steps land in S06:
 *  run the active CampsiteSource adapter → normalize → overwrite `camp:sites:v1`. */
export class RefreshCampsites extends WorkflowEntrypoint<Env> {
  async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
    return step.do("noop", async () => ({ ok: true }));
  }
}

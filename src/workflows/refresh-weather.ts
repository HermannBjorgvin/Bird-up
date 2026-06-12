import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

/** Runs every 2 h (schedule on the binding in wrangler.jsonc). Steps land in S04:
 *  read site list → chunked Open-Meteo fetches → digest → overwrite `wx:digest:v1`. */
export class RefreshWeather extends WorkflowEntrypoint<Env> {
  async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
    return step.do("noop", async () => ({ ok: true }));
  }
}

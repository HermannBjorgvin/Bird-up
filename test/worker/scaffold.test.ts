import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../../src/index";
import { CRON_CAMPSITES, CRON_WEATHER } from "../../src/jobs/dispatch";

describe("worker scaffold", () => {
  it("GET /api/health returns { ok: true }", async () => {
    const res = await exports.default.fetch(new Request("https://tjaldur.test/api/health"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("KV binding round-trips", async () => {
    await env.KV.put("scaffold:probe", "ok");
    expect(await env.KV.get("scaffold:probe")).toBe("ok");
  });

  it("scheduled dispatcher runs for both cron expressions", async () => {
    for (const cron of [CRON_WEATHER, CRON_CAMPSITES]) {
      const ctrl = createScheduledController({
        scheduledTime: new Date("2026-06-12T00:00:00Z"),
        cron,
      });
      const ctx = createExecutionContext();
      // direct module call: ScheduledController can't serialize through the exports.default binding
      await worker.scheduled(ctrl, env, ctx);
      await waitOnExecutionContext(ctx);
    }
  });
});

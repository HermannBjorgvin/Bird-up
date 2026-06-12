import { introspectWorkflowInstance } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("worker scaffold", () => {
  it("GET /api/health returns { ok: true }", async () => {
    const res = await exports.default.fetch(new Request("https://tjaldur.test/api/health"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("KV binding round-trips", async () => {
    await env.KV.put("scaffold:probe", "ok");
    expect(await env.KV.get("scaffold:probe")).toBe("ok");
    // no isolatedStorage in the post-0.13 pool — tests clean up their own KV state
    await env.KV.delete("scaffold:probe");
  });

  it("refresh-weather workflow skeleton runs to completion", async () => {
    await using instance = await introspectWorkflowInstance(env.REFRESH_WEATHER, "test-wx-1");
    await env.REFRESH_WEATHER.create({ id: "test-wx-1" });

    await instance.waitForStatus("complete");
    expect(await instance.getOutput()).toEqual({ ok: true });
  });

  it("refresh-campsites workflow skeleton runs to completion", async () => {
    await using instance = await introspectWorkflowInstance(env.REFRESH_CAMPSITES, "test-camp-1");
    await env.REFRESH_CAMPSITES.create({ id: "test-camp-1" });

    await instance.waitForStatus("complete");
    expect(await instance.getOutput()).toEqual({ ok: true });
  });
});

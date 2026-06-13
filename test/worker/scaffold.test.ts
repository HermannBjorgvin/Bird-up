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
    try {
      expect(await env.KV.get("scaffold:probe")).toBe("ok");
    } finally {
      // no isolatedStorage in the post-0.13 pool — tests clean up their own KV state
      await env.KV.delete("scaffold:probe");
    }
  });

  // Both workflows grew real steps in S04/S06 — covered with mocked fetches in
  // refresh-weather.test.ts and campsites.test.ts.
});

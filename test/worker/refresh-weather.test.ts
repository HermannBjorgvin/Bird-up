import { introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIXTURE_DIGEST } from "../../src/adapters/fixture-weather";
import { WX_DIGEST_KEY } from "../../src/adapters/kv-weather";
import { DailyDigest } from "../../src/core/types";
import type { WeatherDigest } from "../../src/ports/weather";

/**
 * Workflow tests (spec 07): instances are created through the binding — schedules never fire in
 * tests. The fetch+digest step is mocked via the introspector (no live Open-Meteo, hard rule 4);
 * the final write step runs for real against test KV. The 10 seed sites fit one chunk, so the
 * step names are stable: "fetch chunk 1/1" → "write wx:digest:v1".
 */

// Tripwire: every step is mocked, so the workflow must make zero live calls. If a step-name rename
// ever makes a mock miss (S06 changes the chunk count), the real fetchDigests would hit Open-Meteo —
// throw loudly instead of reaching the network (hard rule 4: no live APIs in tests).
let realFetch: typeof fetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("unexpected subrequest in refresh-weather test");
  }) as typeof fetch;
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  await env.KV.delete(WX_DIGEST_KEY);
});

describe("refresh-weather workflow", () => {
  it("a completing instance overwrites wx:digest:v1 with a spec-shaped blob and fresh fetchedAt", async () => {
    await using instance = await introspectWorkflowInstance(env.REFRESH_WEATHER, "wx-success");
    await instance.modify(async (m) => {
      await m.mockStepResult({ name: "fetch chunk 1/1" }, FIXTURE_DIGEST.sites);
    });

    const before = Date.now();
    await env.REFRESH_WEATHER.create({ id: "wx-success" });
    await instance.waitForStatus("complete");

    expect(await instance.getOutput()).toEqual({ fetchedAt: expect.any(String), sites: 1 });

    const blob = (await env.KV.get(WX_DIGEST_KEY, "json")) as WeatherDigest | null;
    expect(blob).not.toBeNull();
    expect(blob!.model).toBe("best_match");
    expect(Date.parse(blob!.fetchedAt)).toBeGreaterThanOrEqual(before); // freshly stamped, inside the write step
    expect(Object.keys(blob!.sites)).toEqual(["reykjavik-eco"]);
    for (const day of blob!.sites["reykjavik-eco"]!) DailyDigest.parse(day);
  });

  it("on persistent upstream failure the instance errors and the previous KV value is untouched", async () => {
    const previous: WeatherDigest = { ...FIXTURE_DIGEST, fetchedAt: "2026-06-10T00:00:00Z" };
    await env.KV.put(WX_DIGEST_KEY, JSON.stringify(previous));

    await using instance = await introspectWorkflowInstance(env.REFRESH_WEATHER, "wx-fail");
    await instance.modify(async (m) => {
      await m.disableRetryDelays();
      await m.mockStepError({ name: "fetch chunk 1/1" }, new Error("Open-Meteo down")); // every attempt
    });

    await env.REFRESH_WEATHER.create({ id: "wx-fail" });
    await instance.waitForStatus("errored");
    expect((await instance.getError()).message).toContain("Open-Meteo down");

    expect(await env.KV.get(WX_DIGEST_KEY, "json")).toEqual(previous);
  });
});

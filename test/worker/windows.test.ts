import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Recommendation } from "../../src/core/types";

const ORIGIN = "https://tjaldur.test";
const RANGE = "start_date=2026-06-12&end_date=2026-06-27";

async function getWindows(query: string): Promise<Response> {
  return exports.default.fetch(new Request(`${ORIGIN}/api/windows?${query}`));
}

async function postWindows(body: unknown): Promise<Response> {
  return exports.default.fetch(
    new Request(`${ORIGIN}/api/windows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("GET/POST /api/windows (S03 integration)", () => {
  it("GET returns 200 and a body that parses against the Recommendation schema", async () => {
    const res = await getWindows(RANGE);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");

    const rec = Recommendation.parse(await res.json());
    expect(rec.attribution.length).toBeGreaterThan(0);
    expect(rec.policyVersion).toBe("2026-06.2");
    expect(rec.windows).toHaveLength(1);
    expect(rec.windows[0]!.tier).toBe("excellent");
    expect(rec.windows[0]!.start).toBe("2026-06-16");
    expect(rec.windows[0]!.campsites[0]!.name).toBe("Reykjavík Eco Campsite");
  });

  it("POST with a JSON body behaves identically to GET", async () => {
    const res = await postWindows({ start_date: "2026-06-12", end_date: "2026-06-27" });
    expect(res.status).toBe(200);
    const rec = Recommendation.parse(await res.json());
    expect(rec.windows.map((w) => w.id)).toEqual(["IS-1:2026-06-16:2026-06-18"]);
  });

  it("a valid thresholds override changes results and stamps policyVersion +custom", async () => {
    const res = await postWindows({
      start_date: "2026-06-12",
      end_date: "2026-06-27",
      thresholds: { hardFloor: { minPeakTempC: 14 } },
    });
    expect(res.status).toBe(200);
    const rec = Recommendation.parse(await res.json());
    expect(rec.policyVersion).toBe("2026-06.2+custom");
    expect(rec.windows.length).toBeGreaterThan(1); // floor lowered → more qualifying runs
  });

  it("an out-of-bounds override returns 400 INVALID_PARAMS", async () => {
    const res = await postWindows({
      start_date: "2026-06-12",
      end_date: "2026-06-27",
      thresholds: { hardFloor: { minPeakTempC: 50 } },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_PARAMS");
  });

  it("rejects missing, malformed, reversed, and beyond-horizon dates with 400 INVALID_PARAMS", async () => {
    const cases = [
      "end_date=2026-06-27", // missing start
      "start_date=nope&end_date=2026-06-27", // malformed
      "start_date=2026-06-20&end_date=2026-06-14", // reversed
      "start_date=2026-06-12&end_date=2026-06-28", // beyond the 16-day horizon
    ];
    for (const q of cases) {
      const res = await getWindows(q);
      expect(res.status, q).toBe(400);
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code, q).toBe("INVALID_PARAMS");
      expect(body.error.message.length, q).toBeGreaterThan(0);
    }
  });

  it("a non-object JSON body (e.g. 42) is rejected with 400 INVALID_PARAMS", async () => {
    const res = await exports.default.fetch(
      new Request(`${ORIGIN}/api/windows`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "42",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_PARAMS");
  });

  it("an unknown /api/* path returns the JSON 404 NOT_FOUND envelope, not the SPA shell", async () => {
    const res = await exports.default.fetch(new Request(`${ORIGIN}/api/does-not-exist`));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe("*"); // CORS on errors too (spec 03)
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("error responses still carry the CORS header", async () => {
    const res = await getWindows("start_date=bad&end_date=2026-06-27");
    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

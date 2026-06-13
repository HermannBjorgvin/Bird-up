import { describe, expect, it } from "vitest";
import {
  ApiError,
  buildWindowsRequest,
  fetchCampsites,
  fetchWindows,
} from "../../web/src/api/client";

/**
 * The website's API client (spec 05: only the public `/api/*` endpoints). Covers request
 * construction for the GET (no overrides) and POST (overrides) variants and the JSON error-envelope
 * unwrapping. No network: a fake `fetch` returns canned `Response`s.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("buildWindowsRequest", () => {
  it("uses GET with a query string when there are no overrides", () => {
    const req = buildWindowsRequest({ start_date: "2026-06-13", end_date: "2026-06-27" });
    expect(req.method).toBe("GET");
    expect(req.body).toBeNull();
    expect(req.url).toBe("/api/windows?start_date=2026-06-13&end_date=2026-06-27");
  });

  it("uses GET when a thresholds object is present but every field is empty (no-op override)", () => {
    const req = buildWindowsRequest({
      start_date: "2026-06-13",
      end_date: "2026-06-27",
      thresholds: { hardFloor: {}, precip: {}, gusts: {} },
    });
    expect(req.method).toBe("GET");
  });

  it("uses POST with a JSON body when any override field is set", () => {
    const req = buildWindowsRequest({
      start_date: "2026-06-13",
      end_date: "2026-06-27",
      thresholds: { hardFloor: { minPeakTempC: 14 } },
    });
    expect(req.method).toBe("POST");
    expect(req.url).toBe("/api/windows");
    expect(JSON.parse(req.body!)).toEqual({
      start_date: "2026-06-13",
      end_date: "2026-06-27",
      thresholds: { hardFloor: { minPeakTempC: 14 } },
    });
  });
});

describe("fetchWindows", () => {
  it("returns the parsed body on 200 and sends the content-type only for POST", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(jsonResponse({ policyVersion: "2026-06.2", windows: [] }));
    }) as unknown as typeof fetch;

    const get = await fetchWindows({ start_date: "2026-06-13", end_date: "2026-06-27" }, fakeFetch);
    expect(get.policyVersion).toBe("2026-06.2");
    expect(calls[0]!.init?.method).toBe("GET");
    expect(calls[0]!.init?.headers).toBeUndefined();

    await fetchWindows(
      { start_date: "2026-06-13", end_date: "2026-06-27", thresholds: { gusts: { hardMaxKmh: 50 } } },
      fakeFetch,
    );
    expect(calls[1]!.init?.method).toBe("POST");
    expect((calls[1]!.init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("throws an ApiError carrying the envelope's code, message and status on a non-2xx", async () => {
    const fakeFetch = (() =>
      Promise.resolve(
        jsonResponse({ error: { code: "INVALID_PARAMS", message: "end_date is beyond the forecast horizon" } }, 400),
      )) as unknown as typeof fetch;

    await expect(fetchWindows({ start_date: "2026-06-13", end_date: "2026-09-01" }, fakeFetch)).rejects.toMatchObject({
      name: "ApiError",
      code: "INVALID_PARAMS",
      status: 400,
    });
  });

  it("surfaces a 503 with no parseable body as a generic ApiError", async () => {
    const fakeFetch = (() => Promise.resolve(new Response("", { status: 503 }))) as unknown as typeof fetch;
    const err = await fetchWindows({ start_date: "2026-06-13", end_date: "2026-06-27" }, fakeFetch).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(503);
  });
});

describe("fetchCampsites", () => {
  it("returns the campsite list on 200", async () => {
    const fakeFetch = ((url: string) => {
      expect(url).toBe("/api/campsites");
      return Promise.resolve(jsonResponse({ fetchedAt: "x", source: "osm", count: 1, sites: [], attribution: ["a"] }));
    }) as unknown as typeof fetch;
    const list = await fetchCampsites(fakeFetch);
    expect(list.source).toBe("osm");
    expect(list.attribution).toEqual(["a"]);
  });

  it("throws an ApiError when the list is not populated yet (503)", async () => {
    const fakeFetch = (() =>
      Promise.resolve(jsonResponse({ error: { code: "STALE_DATA_UNAVAILABLE", message: "not yet" } }, 503))) as unknown as typeof fetch;
    await expect(fetchCampsites(fakeFetch)).rejects.toMatchObject({ code: "STALE_DATA_UNAVAILABLE", status: 503 });
  });
});

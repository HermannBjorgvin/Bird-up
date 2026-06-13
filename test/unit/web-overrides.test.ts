import { describe, expect, it } from "vitest";
import { THRESHOLD_DEFAULTS, toOverrides } from "../../web/src/lib/overrides";

/** Slider values → API `thresholds` (spec 05/02): only non-default fields are sent. */

describe("toOverrides", () => {
  it("returns undefined when every slider is at its default (stays a plain GET)", () => {
    expect(toOverrides(THRESHOLD_DEFAULTS)).toBeUndefined();
  });

  it("sends only the changed hardFloor fields", () => {
    expect(toOverrides({ ...THRESHOLD_DEFAULTS, minPeakTempC: 13 })).toEqual({ hardFloor: { minPeakTempC: 13 } });
    expect(toOverrides({ ...THRESHOLD_DEFAULTS, minDays: 3 })).toEqual({ hardFloor: { minDays: 3 } });
  });

  it("maps rain and gust sliders to their nested policy fields", () => {
    expect(toOverrides({ ...THRESHOLD_DEFAULTS, maxRainMm: 20 })).toEqual({ precip: { hardMaxMmDay: 20 } });
    expect(toOverrides({ ...THRESHOLD_DEFAULTS, maxGustsKmh: 90 })).toEqual({ gusts: { hardMaxKmh: 90 } });
  });

  it("combines multiple changed fields", () => {
    expect(toOverrides({ minPeakTempC: 13, minDays: 3, maxRainMm: 20, maxGustsKmh: 90 })).toEqual({
      hardFloor: { minPeakTempC: 13, minDays: 3 },
      precip: { hardMaxMmDay: 20 },
      gusts: { hardMaxKmh: 90 },
    });
  });
});

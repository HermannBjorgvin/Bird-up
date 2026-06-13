import { describe, expect, it } from "vitest";
import { THRESHOLD_DEFAULTS, toOverrides } from "../../web/src/lib/overrides";

/** Slider value → API `thresholds` (spec 05/02): only a non-default minDays is sent. */

describe("toOverrides", () => {
  it("returns undefined when minDays is at its default (stays a plain GET)", () => {
    expect(toOverrides(THRESHOLD_DEFAULTS)).toBeUndefined();
    expect(toOverrides({ minDays: 3 })).toBeUndefined();
  });

  it("sends minDays when it differs from the default", () => {
    expect(toOverrides({ minDays: 2 })).toEqual({ minDays: 2 });
    expect(toOverrides({ minDays: 5 })).toEqual({ minDays: 5 });
  });
});

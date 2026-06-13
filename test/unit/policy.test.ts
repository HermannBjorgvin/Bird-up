import { describe, expect, it } from "vitest";
import { InvalidParamsError } from "../../src/core/errors";
import { DEFAULT_POLICY, mergePolicy } from "../../src/core/scoring/policy";

describe("mergePolicy (specs/02 per-request overrides — minDays only)", () => {
  it("no override returns the base policy and base version", () => {
    expect(mergePolicy(DEFAULT_POLICY)).toEqual({ policy: DEFAULT_POLICY, version: DEFAULT_POLICY.version });
    expect(mergePolicy(DEFAULT_POLICY, {})).toEqual({ policy: DEFAULT_POLICY, version: DEFAULT_POLICY.version });
  });

  it("a valid minDays override changes the policy and suffixes the version with +custom", () => {
    const { policy, version } = mergePolicy(DEFAULT_POLICY, { minDays: 5 });
    expect(policy.minDays).toBe(5);
    expect(policy.warmth).toEqual(DEFAULT_POLICY.warmth); // everything else untouched
    expect(version).toBe(`${DEFAULT_POLICY.version}+custom`);
  });

  it("rejects out-of-bounds minDays (bounds 1–7)", () => {
    expect(() => mergePolicy(DEFAULT_POLICY, { minDays: 0 })).toThrow(InvalidParamsError);
    expect(() => mergePolicy(DEFAULT_POLICY, { minDays: 8 })).toThrow(InvalidParamsError);
    expect(() => mergePolicy(DEFAULT_POLICY, { minDays: 2.5 })).toThrow(InvalidParamsError); // must be an integer
  });

  it("rejects unknown keys (strict) — the old temp/rain/gust fields no longer exist", () => {
    expect(() => mergePolicy(DEFAULT_POLICY, { nope: 1 })).toThrow(InvalidParamsError);
    expect(() => mergePolicy(DEFAULT_POLICY, { hardFloor: { minPeakTempC: 14 } })).toThrow(InvalidParamsError);
    expect(() => mergePolicy(DEFAULT_POLICY, { precip: { hardMaxMmDay: 8 } })).toThrow(InvalidParamsError);
  });
});

import { describe, expect, it } from "vitest";
import { InvalidParamsError } from "../../src/core/errors";
import { DEFAULT_POLICY, mergePolicy } from "../../src/core/scoring/policy";

describe("mergePolicy (specs/02 per-request overrides)", () => {
  it("no override returns the base policy and base version", () => {
    expect(mergePolicy(DEFAULT_POLICY)).toEqual({ policy: DEFAULT_POLICY, version: DEFAULT_POLICY.version });
    expect(mergePolicy(DEFAULT_POLICY, {})).toEqual({ policy: DEFAULT_POLICY, version: DEFAULT_POLICY.version });
  });

  it("a no-op override (empty nested object) stays the base version", () => {
    expect(mergePolicy(DEFAULT_POLICY, { precip: {} }).version).toBe(DEFAULT_POLICY.version);
    expect(mergePolicy(DEFAULT_POLICY, { hardFloor: {} }).version).toBe(DEFAULT_POLICY.version);
  });

  it("a valid override changes the policy and suffixes the version with +custom", () => {
    const { policy, version } = mergePolicy(DEFAULT_POLICY, { hardFloor: { minDays: 3 } });
    expect(policy.hardFloor.minDays).toBe(3);
    expect(policy.hardFloor.minPeakTempC).toBe(DEFAULT_POLICY.hardFloor.minPeakTempC); // untouched
    expect(version).toBe(`${DEFAULT_POLICY.version}+custom`);
  });

  it("a partial weights override is merged onto the base blend", () => {
    const { policy } = mergePolicy(DEFAULT_POLICY, { weights: { tempAbsolute: 0.5 } });
    expect(policy.weights).toEqual({ tempAnomaly: DEFAULT_POLICY.weights.tempAnomaly, tempAbsolute: 0.5 });
  });

  it("rejects out-of-bounds minPeakTempC", () => {
    expect(() => mergePolicy(DEFAULT_POLICY, { hardFloor: { minPeakTempC: 50 } })).toThrow(InvalidParamsError);
    expect(() => mergePolicy(DEFAULT_POLICY, { hardFloor: { minPeakTempC: 4 } })).toThrow(InvalidParamsError);
  });

  it("rejects out-of-bounds minDays and unknown keys", () => {
    expect(() => mergePolicy(DEFAULT_POLICY, { hardFloor: { minDays: 0 } })).toThrow(InvalidParamsError);
    expect(() => mergePolicy(DEFAULT_POLICY, { nope: 1 })).toThrow(InvalidParamsError);
  });

  it("rejects contradictory cross-field overrides", () => {
    // excellent below the floor
    expect(() => mergePolicy(DEFAULT_POLICY, { hardFloor: { minPeakTempC: 25 }, excellentPeakTempC: 20 })).toThrow(
      InvalidParamsError,
    );
    // precip ideal ≥ hard
    expect(() => mergePolicy(DEFAULT_POLICY, { precip: { idealMaxMmDay: 9, hardMaxMmDay: 8 } })).toThrow(
      InvalidParamsError,
    );
    // gusts ideal ≥ hard
    expect(() => mergePolicy(DEFAULT_POLICY, { gusts: { idealMaxKmh: 70, hardMaxKmh: 65 } })).toThrow(
      InvalidParamsError,
    );
  });
});

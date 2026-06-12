import { describe, expect, it } from "vitest";
import { addDays } from "../../src/core/dates";
import { InvalidParamsError } from "../../src/core/errors";
import { DEFAULT_POLICY, mergePolicy } from "../../src/core/scoring/policy";
import { findWindows } from "../../src/core/scoring/windows";
import type { DailyDigest } from "../../src/core/types";

/**
 * The canonical behavior table T1–T12 from specs/02-scoring-policy.md, transcribed verbatim.
 * This table IS the contract: changing policy behavior means editing the spec table, these tests
 * and `DEFAULT_POLICY.version` in one commit (CLAUDE.md hard rule 2). The frozen scores for
 * T2/T4/T8 were pinned when these tests were first written (model: multiplicative gates, S03).
 */

const BASE = "2026-06-01";

interface DayInput {
  tMaxC: number;
  precipSumMm?: number;
  gustMaxKmh?: number;
}

/** Build a single-site digest from compact per-day inputs; dry/calm unless stated. */
function digest(days: DayInput[]): DailyDigest[] {
  return days.map((d, i) => ({
    date: addDays(BASE, i),
    tMaxC: d.tMaxC,
    tMinC: d.tMaxC - 5,
    precipSumMm: d.precipSumMm ?? 0,
    gustMaxKmh: d.gustMaxKmh ?? 10,
    windMaxKmh: d.gustMaxKmh ?? 10,
  }));
}

function flat(n: number, tMaxC: number, extra?: Partial<DayInput>): DayInput[] {
  return Array.from({ length: n }, () => ({ tMaxC, ...extra }));
}

describe("canonical table T1–T12 (specs/02)", () => {
  it("T1 — flat cool fortnight: no windows", () => {
    expect(findWindows(digest(flat(16, 15)), DEFAULT_POLICY)).toEqual([]);
  });

  it("T2 — owner's floor case: exactly 1 window, 2 days, tier ≥ good (score 86.67 frozen)", () => {
    const windows = findWindows(digest([...flat(2, 18), ...flat(14, 13)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.days).toBe(2);
    expect(["good", "excellent"]).toContain(windows[0]!.tier);
    expect(windows[0]!.score).toBeCloseTo(86.67, 1);
  });

  it("T3 — one hot day only: no windows (minDays unmet)", () => {
    expect(findWindows(digest([{ tMaxC: 21 }, ...flat(15, 14)]), DEFAULT_POLICY)).toEqual([]);
  });

  it("T4 — excellent: 1 window, tier excellent (score 93.78 frozen)", () => {
    const windows = findWindows(
      digest([{ tMaxC: 20 }, { tMaxC: 21 }, { tMaxC: 20 }, ...flat(13, 14)]),
      DEFAULT_POLICY,
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]!.tier).toBe("excellent");
    expect(windows[0]!.score).toBeCloseTo(93.78, 1);
  });

  it("T5 — warm but stormy: window exists, gust gate zeroes score, tier marginal", () => {
    const windows = findWindows(digest([...flat(3, 21, { gustMaxKmh: 70 }), ...flat(13, 14)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.tier).toBe("marginal");
    expect(windows[0]!.score).toBe(0);
  });

  it("T6 — warm but soaked: window exists, precip gate zeroes score, tier marginal", () => {
    const windows = findWindows(digest([...flat(2, 19, { precipSumMm: 10 }), ...flat(14, 14)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.tier).toBe("marginal");
    expect(windows[0]!.score).toBe(0);
  });

  it("T7 — uniformly warm: 1 window spanning horizon, mayExtend, confidence low", () => {
    const windows = findWindows(digest(flat(16, 19)), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.days).toBe(16);
    expect(windows[0]!.mayExtend).toBe(true);
    expect(windows[0]!.confidence).toBe("low");
  });

  it("T8 — relative spike, modest absolute: 1 window, tier good (score 86.67 frozen)", () => {
    const windows = findWindows(digest([...flat(3, 18), ...flat(13, 10)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.tier).toBe("good");
    expect(windows[0]!.score).toBeCloseTo(86.67, 1);
  });

  it("T9 — edge of horizon: window exists, confidence low, mayExtend", () => {
    const windows = findWindows(digest([...flat(14, 14), ...flat(2, 19)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.confidence).toBe("low");
    expect(windows[0]!.mayExtend).toBe(true);
  });

  it("T10 — lead-time confidence: days 2–3 high, 5–6 medium, 10–11 low", () => {
    const high = findWindows(digest([{ tMaxC: 14 }, ...flat(2, 19), ...flat(13, 14)]), DEFAULT_POLICY);
    const medium = findWindows(digest([...flat(4, 14), ...flat(2, 19), ...flat(10, 14)]), DEFAULT_POLICY);
    const low = findWindows(digest([...flat(9, 14), ...flat(2, 19), ...flat(5, 14)]), DEFAULT_POLICY);
    expect(high[0]!.confidence).toBe("high");
    expect(medium[0]!.confidence).toBe("medium");
    expect(low[0]!.confidence).toBe("low");
  });

  it("T11 — override floor: minPeakTempC 14 yields 1 horizon-spanning window, version +custom", () => {
    const { policy, version } = mergePolicy(DEFAULT_POLICY, { hardFloor: { minPeakTempC: 14 } });
    const windows = findWindows(digest(flat(16, 15)), policy);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.days).toBe(16);
    expect(version.endsWith("+custom")).toBe(true);
  });

  it("T12 — invalid override: minPeakTempC 50 → INVALID_PARAMS", () => {
    expect(() => mergePolicy(DEFAULT_POLICY, { hardFloor: { minPeakTempC: 50 } })).toThrow(InvalidParamsError);
  });
});

describe("findWindows edge cases (specs/02 + S03 criteria)", () => {
  it("empty digest yields no windows", () => {
    expect(findWindows([], DEFAULT_POLICY)).toEqual([]);
  });

  it("a run touching the horizon sets mayExtend: true", () => {
    const windows = findWindows(digest([...flat(13, 14), ...flat(3, 19)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.mayExtend).toBe(true);
  });

  it("an interior run does not set mayExtend", () => {
    const windows = findWindows(digest([...flat(5, 14), ...flat(3, 19), ...flat(8, 14)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.mayExtend).toBe(false);
  });

  it("two separate qualifying runs yield two windows", () => {
    const windows = findWindows(
      digest([...flat(2, 19), ...flat(3, 14), ...flat(2, 19), ...flat(9, 14)]),
      DEFAULT_POLICY,
    );
    expect(windows).toHaveLength(2);
    expect(windows[0]!.start).toBe(addDays(BASE, 0));
    expect(windows[1]!.start).toBe(addDays(BASE, 5));
  });

  it("a run shorter than minDays yields no window", () => {
    expect(findWindows(digest([{ tMaxC: 19 }, ...flat(15, 14)]), DEFAULT_POLICY)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { addDays } from "../../src/core/dates";
import { InvalidParamsError } from "../../src/core/errors";
import { DEFAULT_POLICY, mergePolicy } from "../../src/core/scoring/policy";
import { rainFactor, scoreDay, warmth, windFactor } from "../../src/core/scoring/score";
import { findWindows } from "../../src/core/scoring/windows";
import type { DailyDigest } from "../../src/core/types";

/**
 * The canonical behavior table T1–T11 from specs/02-scoring-policy.md, transcribed verbatim. This
 * table IS the contract: changing policy behavior means editing the spec table, these tests and
 * `DEFAULT_POLICY.version` in one commit (CLAUDE.md hard rule 2). Frozen scores were pinned from the
 * implementation when the soft-factor model (`2026-06.3`) was written.
 *
 * Soft model: warmth is absolute (0 at 12 °C, 1 at 23 °C, uncapped above); wind and rain are
 * exponential decays that never reach 0. A window is a run of days warm enough to score (tMaxC > 12)
 * of length ≥ minDays (3). So days at/below 12 °C are the segmentation boundary.
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

describe("day-score components (specs/02: every factor soft, no hard caps)", () => {
  it("warmth is absolute: 0 at zeroC, 1 at oneC, uncapped above", () => {
    expect(warmth(12, DEFAULT_POLICY)).toBe(0);
    expect(warmth(10, DEFAULT_POLICY)).toBe(0); // clamped at 0 below the zero point
    expect(warmth(23, DEFAULT_POLICY)).toBe(1);
    expect(warmth(17.5, DEFAULT_POLICY)).toBeCloseTo(0.5, 5);
    expect(warmth(28, DEFAULT_POLICY)).toBeCloseTo(1.4545, 3); // over 1: a hotter-than-ideal day
  });

  it("wind and rain only discount — they decay but never reach 0", () => {
    expect(windFactor(25, DEFAULT_POLICY)).toBe(1); // at/below calm, no penalty
    expect(windFactor(70, DEFAULT_POLICY)).toBeCloseTo(0.2231, 3);
    expect(windFactor(200, DEFAULT_POLICY)).toBeGreaterThan(0); // a gale still isn't disqualifying
    expect(rainFactor(0, DEFAULT_POLICY)).toBe(1);
    expect(rainFactor(10, DEFAULT_POLICY)).toBeCloseTo(0.1889, 3);
    expect(rainFactor(100, DEFAULT_POLICY)).toBeGreaterThan(0); // a deluge still isn't disqualifying
  });

  it("a hot calm dry day scores over 100", () => {
    const hot: DailyDigest = { date: BASE, tMaxC: 28, tMinC: 20, precipSumMm: 0, gustMaxKmh: 10, windMaxKmh: 10 };
    expect(scoreDay(hot, DEFAULT_POLICY)).toBeCloseTo(145.45, 1);
  });
});

describe("canonical table T1–T11 (specs/02)", () => {
  it("T1 — flat 15 °C, dry, calm: 1 window spanning the horizon, marginal (score 27.27)", () => {
    const windows = findWindows(digest(flat(16, 15)), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.days).toBe(16);
    expect(windows[0]!.tier).toBe("marginal");
    expect(windows[0]!.score).toBeCloseTo(27.27, 1);
  });

  it("T2 — flat 11 °C (at/below the warmth-zero point): no windows", () => {
    expect(findWindows(digest(flat(16, 11)), DEFAULT_POLICY)).toEqual([]);
  });

  it("T3 — 2 warm days among cold (≤12): no window (minDays unmet)", () => {
    expect(findWindows(digest([...flat(2, 21), ...flat(14, 10)]), DEFAULT_POLICY)).toEqual([]);
  });

  it("T4 — 4 days 21 °C, dry, calm, among cold: 1 window, excellent (score 81.82)", () => {
    const windows = findWindows(digest([...flat(4, 21), ...flat(12, 10)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.days).toBe(4);
    expect(windows[0]!.tier).toBe("excellent");
    expect(windows[0]!.score).toBeCloseTo(81.82, 1);
  });

  it("T5 — warm but stormy (gusts 70): window exists, NOT zeroed, marginal (score 18.26)", () => {
    const windows = findWindows(digest([...flat(4, 21, { gustMaxKmh: 70 }), ...flat(12, 10)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.tier).toBe("marginal");
    expect(windows[0]!.score).toBeCloseTo(18.26, 1);
  });

  it("T6 — warm but soaked (10 mm/day): window exists, NOT zeroed, marginal (score 12.02)", () => {
    const windows = findWindows(digest([...flat(4, 19, { precipSumMm: 10 }), ...flat(12, 10)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.tier).toBe("marginal");
    expect(windows[0]!.score).toBeCloseTo(12.02, 1);
  });

  it("T7 — flat 28 °C, dry, calm: scores over 100, excellent, spans horizon, mayExtend, confidence low", () => {
    const windows = findWindows(digest(flat(16, 28)), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.days).toBe(16);
    expect(windows[0]!.score).toBeCloseTo(145.45, 1);
    expect(windows[0]!.tier).toBe("excellent");
    expect(windows[0]!.mayExtend).toBe(true);
    expect(windows[0]!.confidence).toBe("low");
  });

  it("T8 — lead-time confidence: warm runs at days 2–4 high, 5–7 medium, 10–12 low", () => {
    const high = findWindows(digest([...flat(1, 10), ...flat(3, 19), ...flat(12, 10)]), DEFAULT_POLICY);
    const medium = findWindows(digest([...flat(4, 10), ...flat(3, 19), ...flat(9, 10)]), DEFAULT_POLICY);
    const low = findWindows(digest([...flat(9, 10), ...flat(3, 19), ...flat(4, 10)]), DEFAULT_POLICY);
    expect(high[0]!.confidence).toBe("high");
    expect(medium[0]!.confidence).toBe("medium");
    expect(low[0]!.confidence).toBe("low");
  });

  it("T9 — edge of horizon: 3 warm days at days 14–16, confidence low, mayExtend", () => {
    const windows = findWindows(digest([...flat(13, 10), ...flat(3, 19)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.confidence).toBe("low");
    expect(windows[0]!.mayExtend).toBe(true);
  });

  it("T10 — override minDays 2: the 2-day warm run of T3 now qualifies, version +custom", () => {
    const { policy, version } = mergePolicy(DEFAULT_POLICY, { minDays: 2 });
    const windows = findWindows(digest([...flat(2, 21), ...flat(14, 10)]), policy);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.days).toBe(2);
    expect(version.endsWith("+custom")).toBe(true);
  });

  it("T11 — invalid override: minDays 50 → INVALID_PARAMS", () => {
    expect(() => mergePolicy(DEFAULT_POLICY, { minDays: 50 })).toThrow(InvalidParamsError);
  });
});

describe("findWindows edge cases (specs/02 + S03 criteria)", () => {
  it("empty digest yields no windows", () => {
    expect(findWindows([], DEFAULT_POLICY)).toEqual([]);
  });

  it("a run touching the horizon sets mayExtend: true", () => {
    const windows = findWindows(digest([...flat(13, 10), ...flat(3, 19)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.mayExtend).toBe(true);
  });

  it("an interior run does not set mayExtend", () => {
    const windows = findWindows(digest([...flat(5, 10), ...flat(3, 19), ...flat(8, 10)]), DEFAULT_POLICY);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.mayExtend).toBe(false);
  });

  it("two separate qualifying runs (split by cold days) yield two windows", () => {
    const windows = findWindows(
      digest([...flat(3, 19), ...flat(3, 10), ...flat(3, 19), ...flat(7, 10)]),
      DEFAULT_POLICY,
    );
    expect(windows).toHaveLength(2);
    expect(windows[0]!.start).toBe(addDays(BASE, 0));
    expect(windows[1]!.start).toBe(addDays(BASE, 6));
  });

  it("a run shorter than minDays yields no window", () => {
    expect(findWindows(digest([...flat(2, 19), ...flat(14, 10)]), DEFAULT_POLICY)).toEqual([]);
  });

  it("a calendar gap (a dropped forecast day) ends the run — a window never spans the gap", () => {
    const day = (date: string, tMaxC: number): DailyDigest => ({
      date,
      tMaxC,
      tMinC: tMaxC - 5,
      precipSumMm: 0,
      gustMaxKmh: 10,
      windMaxKmh: 10,
    });
    // 06-04 is missing (upstream null the adapter dropped); without the calendar-gap break this
    // would be one bogus 6-day window bridging a day with no forecast.
    const windows = findWindows(
      [
        day("2026-06-01", 18),
        day("2026-06-02", 18),
        day("2026-06-03", 18),
        day("2026-06-05", 18),
        day("2026-06-06", 18),
        day("2026-06-07", 18),
      ],
      DEFAULT_POLICY,
    );
    expect(windows).toHaveLength(2);
    expect([windows[0]!.start, windows[0]!.end]).toEqual(["2026-06-01", "2026-06-03"]);
    expect([windows[1]!.start, windows[1]!.end]).toEqual(["2026-06-05", "2026-06-07"]);
    expect(windows.every((w) => w.days === 3)).toBe(true);
  });
});

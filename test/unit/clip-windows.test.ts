import { describe, expect, it } from "vitest";
import { clipWindowToRange, findWindows, type CoreWindow } from "../../src/core/scoring/windows";
import { DEFAULT_POLICY } from "../../src/core/scoring/policy";
import type { DailyDigest } from "../../src/core/types";

/**
 * Spec 02 "Per-request date range (clipping)". `findWindows` runs over the whole digest; the service
 * then clips each window to the caller's range. These transcribe the canonical clip cases. The base
 * digest is a 16-day warm-and-dry fortnight from 2026-06-12 (one window spanning the horizon).
 */
const HORIZON_START = "2026-06-12";

function digest(): DailyDigest[] {
  const days: DailyDigest[] = [];
  for (let i = 0; i < 16; i++) {
    const date = new Date(Date.parse(`${HORIZON_START}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    days.push({ date, tMaxC: 18, tMinC: 8, precipSumMm: 0, gustMaxKmh: 10, windMaxKmh: 10 });
  }
  return days;
}

function theWindow(): CoreWindow {
  const windows = findWindows(digest(), DEFAULT_POLICY);
  expect(windows).toHaveLength(1); // the whole horizon is one warm window
  return windows[0]!;
}

describe("clipWindowToRange", () => {
  it("TC1: a sub-range clips the window to its intersection and rescores over those days only", () => {
    const clipped = clipWindowToRange(theWindow(), "2026-06-15", "2026-06-18", HORIZON_START, DEFAULT_POLICY);
    expect(clipped).not.toBeNull();
    expect(clipped!.start).toBe("2026-06-15");
    expect(clipped!.end).toBe("2026-06-18");
    expect(clipped!.days).toBe(4);
    expect(clipped!.daily.map((d) => d.date)).toEqual(["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18"]);
    // Uniform days, so the clipped mean equals the per-day score (unchanged by clipping).
    expect(clipped!.score).toBeCloseTo(theWindow().score, 10);
  });

  it("TC2: a full-horizon range is a no-op (existing callers see no change)", () => {
    const w = theWindow();
    const clipped = clipWindowToRange(w, HORIZON_START, "2026-06-27", HORIZON_START, DEFAULT_POLICY);
    expect(clipped).not.toBeNull();
    expect(clipped!.start).toBe(w.start);
    expect(clipped!.end).toBe(w.end);
    expect(clipped!.days).toBe(w.days);
    expect(clipped!.score).toBeCloseTo(w.score, 10);
    expect(clipped!.mayExtend).toBe(w.mayExtend); // final day kept ⇒ mayExtend preserved
  });

  it("TC3: a range shorter than minDays relaxes the floor to the range length (min(minDays, range))", () => {
    // Default minDays is 3; a 2-day range would normally yield nothing. The clamp keeps the 2-day run.
    expect(DEFAULT_POLICY.minDays).toBe(3);
    const clipped = clipWindowToRange(theWindow(), "2026-06-15", "2026-06-16", HORIZON_START, DEFAULT_POLICY);
    expect(clipped).not.toBeNull();
    expect(clipped!.days).toBe(2);
  });

  it("TC4: a partial overlap shorter than minDays, inside a long-enough range, is dropped", () => {
    // Window is 16 days; the 5-day range only catches its first 2 days. range (5) ≥ minDays (3), so
    // the normal floor applies and the 2-day fragment is dropped — only short ranges relax the floor.
    const head = theWindow();
    const twoDay: CoreWindow = { ...head, daily: head.daily.slice(0, 2), start: head.daily[0]!.date, end: head.daily[1]!.date, days: 2 };
    const clipped = clipWindowToRange(twoDay, HORIZON_START, "2026-06-16", HORIZON_START, DEFAULT_POLICY);
    expect(clipped).toBeNull();
  });

  it("TC5: clipping away the final forecast day clears mayExtend", () => {
    // Trim the original window's tail: the clip no longer reaches the horizon edge.
    const clipped = clipWindowToRange(theWindow(), HORIZON_START, "2026-06-20", HORIZON_START, DEFAULT_POLICY);
    expect(clipped).not.toBeNull();
    expect(clipped!.end).toBe("2026-06-20");
    expect(clipped!.mayExtend).toBe(false);
  });

  it("TC6: a range with no overlap yields null", () => {
    expect(clipWindowToRange(theWindow(), "2026-07-01", "2026-07-05", HORIZON_START, DEFAULT_POLICY)).toBeNull();
  });

  it("recomputes lead-time confidence from the true horizon start, not the clip start", () => {
    // Days 10–12 are lead 10–12 from today (2026-06-12) ⇒ low, even though they start the clip.
    const clipped = clipWindowToRange(theWindow(), "2026-06-21", "2026-06-23", HORIZON_START, DEFAULT_POLICY);
    expect(clipped).not.toBeNull();
    expect(clipped!.confidence).toBe("low");
  });
});

import { describe, expect, it } from "vitest";
import { addDays, defaultRange, formatRange, presetRange, toIsoDate } from "../../web/src/lib/dates";

/** UTC-only date helpers for the range control (spec 05; Iceland is UTC, no timezone math). */

describe("toIsoDate / addDays", () => {
  it("takes the UTC calendar day regardless of clock time", () => {
    expect(toIsoDate(new Date("2026-06-13T23:30:00Z"))).toBe("2026-06-13");
  });

  it("adds days across a month boundary in UTC", () => {
    expect(addDays("2026-06-28", 5)).toBe("2026-07-03");
    expect(addDays("2026-06-13", 14)).toBe("2026-06-27");
  });
});

describe("defaultRange / presetRange", () => {
  it("defaults to today → today + 14 (the forecast horizon)", () => {
    expect(defaultRange(new Date("2026-06-13T05:00:00Z"))).toEqual({ start: "2026-06-13", end: "2026-06-27" });
  });

  it("presets cover one and two weeks from today", () => {
    const now = new Date("2026-06-13T05:00:00Z");
    expect(presetRange("week", now)).toEqual({ start: "2026-06-13", end: "2026-06-20" });
    expect(presetRange("two-weeks", now)).toEqual({ start: "2026-06-13", end: "2026-06-27" });
  });
});

describe("formatRange", () => {
  it("collapses a same-month range", () => {
    expect(formatRange("2026-06-18", "2026-06-21")).toBe("Jun 18–21");
  });

  it("spells out both months across a boundary", () => {
    expect(formatRange("2026-06-28", "2026-07-02")).toBe("Jun 28 – Jul 2");
  });

  it("renders a single day without a dash", () => {
    expect(formatRange("2026-06-18", "2026-06-18")).toBe("Jun 18");
  });
});

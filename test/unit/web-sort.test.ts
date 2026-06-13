import { describe, expect, it } from "vitest";
import { sortWindows } from "../../web/src/lib/sort";
import type { Window } from "../../src/core/types";

/** Side-panel order (spec 05): best score first, ties broken by soonest start. */

function win(id: string, score: number, start: string): Window {
  return {
    id,
    region: "vik",
    start,
    end: start,
    days: 2,
    score,
    tier: "good",
    confidence: "high",
    mayExtend: false,
    daily: [],
    campsites: [],
  };
}

describe("sortWindows", () => {
  it("orders by score descending, then by soonest start", () => {
    const out = sortWindows([
      win("c", 50, "2026-06-20"),
      win("a", 80, "2026-06-25"),
      win("b", 80, "2026-06-18"),
    ]);
    expect(out.map((w) => w.id)).toEqual(["b", "a", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = [win("a", 10, "2026-06-20"), win("b", 90, "2026-06-21")];
    const before = input.map((w) => w.id);
    sortWindows(input);
    expect(input.map((w) => w.id)).toEqual(before);
  });
});

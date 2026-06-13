import type { DailyDigest } from "../core/types";
import { addDays } from "../core/dates";
import type { WeatherDigest } from "../ports/weather";
import { REYKJAVIK_ECO } from "./seed-campsites";

/**
 * A checked-in 16-day digest with fixed dates and one clear window (20–21 °C, dry, calm on
 * 2026-06-16…18). Since S04 the read path serves KV; tests seed this blob into `wx:digest:v1`
 * (with a controlled `fetchedAt`) so HTTP and workflow assertions stay deterministic.
 */
const ANCHOR = "2026-06-12";

// [tMaxC, precipSumMm, gustMaxKmh] per day; tMin and windMax derived. 16 days from ANCHOR.
const PATTERN: [number, number, number][] = [
  [14, 0, 14], // 06-12
  [14, 0, 16], // 06-13
  [15, 0, 12], // 06-14
  [16, 0, 18], // 06-15
  [20, 0, 18], // 06-16  ← window
  [21, 0, 15], // 06-17  ← window
  [20, 0, 20], // 06-18  ← window
  [15, 0, 22], // 06-19
  [14, 3, 25], // 06-20
  [13, 5, 28], // 06-21
  [14, 1, 20], // 06-22
  [15, 0, 16], // 06-23
  [14, 0, 14], // 06-24
  [13, 0, 18], // 06-25
  [14, 0, 16], // 06-26
  [15, 0, 12], // 06-27
];

const digest: DailyDigest[] = PATTERN.map(([tMaxC, precipSumMm, gustMaxKmh], i) => ({
  date: addDays(ANCHOR, i),
  tMaxC,
  tMinC: tMaxC - 5,
  precipSumMm,
  gustMaxKmh,
  windMaxKmh: Math.round(gustMaxKmh * 0.6),
}));

export const FIXTURE_DIGEST: WeatherDigest = {
  fetchedAt: "2026-06-12T06:00:00Z",
  model: "best_match",
  sites: { [REYKJAVIK_ECO.id]: digest },
};

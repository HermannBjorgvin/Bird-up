import type { DailyDigest } from "../types";
import type { ScoringPolicy } from "./policy";

/** Per-site warmth baseline over the fetched horizon. `sd` floored at 1 °C (spec 02). */
export interface Baseline {
  mean: number;
  sd: number;
}

/** `ramp01(x, a → b)` = 0 below `a`, 1 above `b`, linear between. Degenerate `a ≥ b` → step at `a`. */
export function ramp01(x: number, a: number, b: number): number {
  if (b <= a) return x >= a ? 1 : 0;
  if (x <= a) return 0;
  if (x >= b) return 1;
  return (x - a) / (b - a);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Mean and (floored, population ÷n) standard deviation of `tMaxC` — "the surrounding ~2 weeks".
 * `anomaly.baselineDays` caps how many leading days of the horizon feed the baseline (16 = all).
 */
export function computeBaseline(digests: DailyDigest[], policy: ScoringPolicy): Baseline {
  const window = digests.slice(0, policy.anomaly.baselineDays);
  const n = window.length;
  if (n === 0) return { mean: 0, sd: 1 };
  const mean = window.reduce((s, d) => s + d.tMaxC, 0) / n;
  const variance = window.reduce((s, d) => s + (d.tMaxC - mean) ** 2, 0) / n;
  return { mean, sd: Math.max(1, Math.sqrt(variance)) };
}

/**
 * Score one forecast day 0–100 against the site's baseline (spec 02 "Day score").
 *
 * Warmth (relative anomaly blended with absolute, anomaly weighted higher) sets the ceiling, 0–1.
 * Wind and rain are multiplicative *gates*, each ramping 1→0 across ideal→hard: they discount
 * warmth rather than competing with it, so a gust ≥ hardMax or precip ≥ hardMax zeroes the day
 * "regardless of warmth" (spec 02). This is the model chosen at S03 over the original weighted sum.
 */
export function scoreDay(digest: DailyDigest, baseline: Baseline, policy: ScoringPolicy): number {
  const { weights: w, tempAbsolute, precip, gusts, anomaly } = policy;

  const zAnomaly = clamp((digest.tMaxC - baseline.mean) / baseline.sd, -anomaly.zClamp, anomaly.zClamp);
  const anomalyScore = (zAnomaly + anomaly.zClamp) / (2 * anomaly.zClamp); // 0–1
  const absScore = ramp01(digest.tMaxC, tempAbsolute.fullPenaltyC, tempAbsolute.noPenaltyC);
  const warmth = (w.tempAnomaly * anomalyScore + w.tempAbsolute * absScore) / (w.tempAnomaly + w.tempAbsolute);

  const gustFactor = 1 - ramp01(digest.gustMaxKmh, gusts.idealMaxKmh, gusts.hardMaxKmh);
  const precipFactor = 1 - ramp01(digest.precipSumMm, precip.idealMaxMmDay, precip.hardMaxMmDay);

  return 100 * warmth * gustFactor * precipFactor;
}
